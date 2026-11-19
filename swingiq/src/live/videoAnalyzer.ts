"use client";
import { analyzeSwing } from "@/engine/analyzer";
import { SOFTBALL_12, assumedCamera, type Ball } from "@/engine/ballflight";
import { ContactListener } from "@/engine/contact";
import { SwingDetector, type SwingWindow } from "@/engine/detector";
import { NOSE_TO_ANKLE_FRACTION, frameHasBody, median, noseToAnkles } from "@/engine/geometry";
import { MotionTracker } from "@/engine/motion";
import { analyzeSpeeds, checkTimeBase } from "@/engine/speeds";
import type { CameraView, Handedness, MetricKey, MetricValue, PoseFrame, SwingAnalysis } from "@/engine/types";
import { encodeFrames, FrameBuffer } from "./framebuffer";
import { loadPose, toLandmarks, toWorld, type ModelQuality } from "./pose";

/**
 * Analyzes a recorded or uploaded video after the fact. Unlike live mode, it can take its time: it slows playback
 * down until the pose tracker keeps up with EVERY frame, so timing comes from the full frame rate of the recording
 * (iPhone slow-motion included). The same detector and analyzer as live mode run on top, so a swing measured from a
 * video and a swing measured live mean the same thing; each is labeled with where it came from.
 */
export type VideoSwing = {
  window: SwingWindow;
  analysis: SwingAnalysis;
  pose: PoseFrame[];
  frameSize: { width: number; height: number };
  clip: { t: number; blob: Blob }[];
};

export type VideoAnalysisResult = {
  swings: VideoSwing[];
  /** Real-time frames per second of the recording (after slow-motion correction). */
  fps: number;
  /** Share of the recording's frames the tracker processed. */
  coverage: number;
  durationS: number;
  heardAudio: boolean;
  truncated: boolean;
  /**
   * If the pitch's fall shows the slow-motion setting was wrong: the factor to multiply it by (8 = it was really
   * 8× slower than chosen). The caller should re-run with the corrected setting.
   */
  timeBaseFix: number | null;
  /** Field-tuning readout. */
  debug: {
    frames: number;
    maxSpeed: number;
    rejected: string[];
    delegate: string;
    playbackRate: number;
    motionPx?: string;
    speeds?: unknown[];
  };
};

export type VideoAnalysisOptions = {
  file: File;
  view: CameraView;
  hand: Handedness;
  heightIn: number;
  quality: ModelQuality;
  /** 1 = real speed. 4 or 8 for slow-motion recordings played back slowed. */
  slowMo: number;
  previous: () => Partial<Record<MetricKey, MetricValue>>[];
  onProgress?: (fraction: number, stage: string) => void;
  signal?: AbortSignal;
  /** An on-screen video element to play the recording in (so the player can watch it being analyzed). */
  videoEl?: HTMLVideoElement | null;
  /** The ball in use (12" or 11"), for turning its size into a ruler. */
  ball?: Ball;
  /** The bat's certification, for bat speed from exit velocity. */
  certification?: string;
};

export const MAX_VIDEO_SECONDS = 90;

export class VideoFormatError extends Error {}

/** Bat-ball contact from the recording's own sound, when the browser can decode it. Times in real ms. */
async function contactFromAudio(file: File, slowMo: number): Promise<ContactListener | null> {
  if (slowMo !== 1) return null; // slow-motion exports stretch or drop the sound
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    await ctx.close().catch(() => {});
    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const listener = new ContactListener();
    // Same processing as the live worklet: ~2 kHz high-pass, RMS per 128-sample block.
    const rc = 1 / (2 * Math.PI * 2000);
    const a = rc / (rc + 1 / sr);
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i + 128 <= data.length; i += 128) {
      let sum = 0;
      for (let j = i; j < i + 128; j++) {
        const y = a * (prevOut + data[j] - prevIn);
        prevIn = data[j];
        prevOut = y;
        sum += y * y;
      }
      listener.push((i / sr) * 1000, Math.sqrt(sum / 128));
    }
    return listener;
  } catch {
    return null;
  }
}

export async function analyzeVideo(o: VideoAnalysisOptions): Promise<VideoAnalysisResult> {
  const progress = o.onProgress ?? (() => {});
  progress(0, "Opening your video…");
  const url = URL.createObjectURL(o.file);
  // Browsers only hand out frames for videos that are on the page, so a hidden helper is attached when none is given.
  const own = !o.videoEl;
  const video = o.videoEl ?? document.createElement("video");
  if (own) {
    video.setAttribute("aria-hidden", "true");
    video.style.cssText = "position:fixed;left:0;top:0;width:4px;height:4px;opacity:0.01;pointer-events:none;";
    document.body.appendChild(video);
  }
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new VideoFormatError("This browser can't read that video."));
      setTimeout(() => reject(new VideoFormatError("The video took too long to open.")), 20000);
    });
    if (!video.videoWidth || !video.videoHeight) throw new VideoFormatError("This browser can't read that video.");
    const durationS = Number.isFinite(video.duration) ? video.duration : 0;
    const limitS = Math.min(durationS || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS);

    progress(0.02, "Loading body tracking…");
    const [pose, audio] = await Promise.all([loadPose(o.quality), contactFromAudio(o.file, o.slowMo)]);
    let landmarker = pose.landmarker;
    let delegate = pose.delegate;
    let triedCpu = false;
    const geom = { width: video.videoWidth, height: video.videoHeight };
    const detector = new SwingDetector(geom);
    // Ball tracking runs on a smaller copy of each frame: big enough to size the ball, small enough to keep up.
    const tw = Math.min(960, geom.width);
    const th = Math.round((geom.height * tw) / geom.width);
    const motion = new MotionTracker(tw, th, { keepMs: 6000 });
    const mCanvas = document.createElement("canvas");
    mCanvas.width = tw;
    mCanvas.height = th;
    const mCtx = mCanvas.getContext("2d", { willReadFrequently: true });
    const ball = o.ball ?? SOFTBALL_12;
    const cam = assumedCamera(tw, th);
    const tbVotes = new Map<number, number>();
    let lastTbCheck = 0;
    const speedDebug: unknown[] = [];
    const bodyPxPerIn = (frames: PoseFrame[]) => {
      const hs = frames.filter((f) => frameHasBody(f)).map((f) => noseToAnkles(f.lm!, geom));
      const h = median(hs);
      return h > 0 ? (h / (o.heightIn * NOSE_TO_ANKLE_FRACTION)) * (tw / geom.width) : null;
    };
    const buffer = new FrameBuffer(4500);
    buffer.configure(geom.width, geom.height);
    const history: PoseFrame[] = [];
    const swings: VideoSwing[] = [];
    const pending: Promise<void>[] = [];
    const tsBase = performance.now();
    let lastTs = 0;
    let lastMedia = -1;
    let frames = 0;
    let lastBufferT = -Infinity;
    const mediaGaps: number[] = [];
    let poseMsTotal = 0;
    let timed = 0;
    let maxSpeed = 0;
    const rejected: string[] = [];

    const capture = (win: SwingWindow) => {
      const clipFrames = history.filter((f) => f.t >= win.clipStart && f.t <= win.clipEnd);
      const audioT = audio?.contactIn(win.launch + 50, win.peak + 150) ?? null;
      const fpsReal = mediaGaps.length ? 1000 / (srcGap(mediaGaps) / o.slowMo) : 30;
      const analysis = analyzeSwing(clipFrames, win, {
        geom,
        hand: o.hand,
        view: o.view,
        heightIn: o.heightIn,
        cameraFps: fpsReal,
        audioContactT: audioT,
        micOn: !!audio,
        previous: [...swings.map((s) => s.analysis.metrics).reverse(), ...o.previous()],
      });
      // Ball speeds from the same frames (slow motion only; otherwise each says why not).
      try {
        const sp = analyzeSpeeds(motion.frames(win.clipStart, win.clipEnd), {
          bodyPxPerIn: bodyPxPerIn(clipFrames),
          ball,
          cam,
          certification: o.certification,
          hintT: analysis.phases.contact,
          fps: fpsReal,
          frameHeight: th,
        });
        Object.assign(analysis.metrics, sp.metrics);
        if (sp.timeBase !== null) tbVotes.set(sp.timeBase, (tbVotes.get(sp.timeBase) ?? 0) + 2);
        speedDebug.push({ t: Math.round(win.peak), ...sp.debug, timeBase: sp.timeBase });
      } catch (e) {
        speedDebug.push({ error: String(e) });
      }
      const canvases = buffer.detach(win.clipStart, win.clipEnd);
      const entry: VideoSwing = { window: win, analysis, pose: clipFrames, frameSize: geom, clip: [] };
      swings.push(entry);
      pending.push(encodeFrames(canvases).then((c) => void (entry.clip = c)));
    };

    // Body tracking doesn't need more than ~60 frames per real second; the ball does. On high-frame-rate video the
    // pose model runs on every Nth frame and the (much cheaper) ball tracker runs on every frame.
    let poseStride = 1;
    // Browsers won't play slower than 1/16 speed (Chrome throws below 0.0625).
    const minRate = () => 0.0625;
    let procMsTotal = 0;
    let procCount = 0;
    const processFrame = (mediaTime: number) => {
      if (mediaTime <= lastMedia) return;
      if (lastMedia >= 0) mediaGaps.push((mediaTime - lastMedia) * 1000);
      if (mediaGaps.length > 120) mediaGaps.shift();
      lastMedia = mediaTime;
      const tStart = performance.now();
      const tReal = (mediaTime * 1000) / o.slowMo;
      // Grab the picture for ball tracking first, before anything slow: the video keeps playing (slowly) while we
      // work, and at 240 fps even one frame of drift between a picture and its timestamp wrecks a speed.
      if (mCtx) {
        mCtx.drawImage(video, 0, 0, tw, th);
        motion.push(tReal, mCtx.getImageData(0, 0, tw, th).data);
      }
      // Clip frames: up to ~60 per real second, whatever the recording's frame rate, to keep memory in check.
      if (tReal - lastBufferT >= 1000 / 60 - 0.5) {
        buffer.push(tReal, video);
        lastBufferT = tReal;
      }
      // Every ~2 s of video, check the slow-motion setting against any clean ball flight (needs no swing).
      if (mCtx && mediaTime - lastTbCheck > 2) {
        lastTbCheck = mediaTime;
        const tb = checkTimeBase(motion.frames(tReal - 4000, tReal), { bodyPxPerIn: bodyPxPerIn(history.slice(-60)), ball, frameHeight: th });
        if (tb !== null) tbVotes.set(tb, (tbVotes.get(tb) ?? 0) + 1);
      }
      // How often to run body tracking: re-checked as the true frame interval becomes clear.
      if (frames % 30 === 4 && mediaGaps.length >= 3) poseStride = Math.max(1, Math.round(((1000 / srcGap(mediaGaps)) * o.slowMo) / 60));
      const runPose = frames < 4 || frames % poseStride === 0;
      frames++;
      let frame: PoseFrame | null = null;
      if (runPose) {
        const ts = Math.max(tsBase + mediaTime * 1000, lastTs + 1);
        lastTs = ts;
        const t0 = performance.now();
        const res = landmarker.detectForVideo(video, ts);
        poseMsTotal += performance.now() - t0;
        timed++;
        frame = { t: tReal, lm: toLandmarks(res.landmarks[0]), world: toWorld(res.worldLandmarks?.[0]) };
        history.push(frame);
        while (history.length && tReal - history[0].t > 4500) history.shift();
      }
      if (frame) {
        const tick = detector.push(frame);
        if (tick.speed > maxSpeed) maxSpeed = tick.speed;
        if (tick.rejected) rejected.push(`${Math.round(tReal)}:${tick.rejected}`);
        if (tick.swing) capture(tick.swing);
      }
      procMsTotal += performance.now() - tStart;
      procCount++;
      progress(0.05 + 0.9 * Math.min(1, mediaTime / Math.max(0.1, limitS)), "Tracking your body and the ball frame by frame…");
    };

    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
    };

    if (v.requestVideoFrameCallback) {
      // Play slowed down so the tracker sees every frame, adjusting the speed to how fast this phone tracks.
      video.playbackRate = 0.125;
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.pause();
          resolve();
        };
        const onFrame = (_now: number, meta: { mediaTime: number }) => {
          if (done) return;
          if (o.signal?.aborted) {
            done = true;
            video.pause();
            reject(new DOMException("Cancelled", "AbortError"));
            return;
          }
          try {
            processFrame(meta.mediaTime);
          } catch (e) {
            done = true;
            reject(e);
            return;
          }
          if (timed === 6 && mediaGaps.length > 3) {
            const poseMs = poseMsTotal / timed;
            // A slow GPU (older Androids, software rendering) can track slower than the CPU. Switch once.
            if (delegate === "GPU" && poseMs > 90 && !triedCpu) {
              triedCpu = true;
              video.pause();
              loadPose(o.quality, "CPU")
                .then((p) => {
                  landmarker = p.landmarker;
                  delegate = p.delegate;
                })
                .catch(() => {})
                .finally(() => {
                  poseMsTotal = 0;
                  timed = 0;
                  video.play().catch(reject);
                  v.requestVideoFrameCallback!(onFrame);
                });
              return;
            }
            const srcFps = 1000 / srcGap(mediaGaps);
            // Cost per frame once body tracking runs on every Nth frame only.
            const perFrame = Math.max(1, (procMsTotal / Math.max(1, procCount) - poseMs) + poseMs / poseStride);
            video.playbackRate = clamp(((1000 / perFrame) * 0.7) / srcFps, minRate(), 1);
          }
          // Keep adjusting: slow down whenever frames are being skipped, speed back up when it's comfortably keeping up.
          if (timed > 6 && frames % 15 === 0 && mediaGaps.length > 15) {
            const gap = srcGap(mediaGaps);
            const recent = mediaGaps.slice(-15);
            const missed = recent.filter((g) => g > gap * 1.5).length;
            if (missed >= 2) video.playbackRate = Math.max(minRate(), video.playbackRate * 0.65);
            else if (missed === 0 && video.playbackRate < 1) video.playbackRate = Math.min(1, video.playbackRate * 1.1);
          }
          if (meta.mediaTime >= limitS) return finish();
          v.requestVideoFrameCallback!(onFrame);
        };
        v.requestVideoFrameCallback!(onFrame);
        video.onended = finish;
        video.play().catch(reject);
      });
    } else {
      // Older browsers: step through the video by seeking.
      const step = 1 / 30;
      for (let t = 0; t < limitS; t += step) {
        if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        video.currentTime = t;
        await new Promise((r) => (video.onseeked = r));
        processFrame(t);
      }
    }

    // Release a swing that ended right at the end of the video.
    const tail = detector.push({ t: (lastMedia * 1000) / o.slowMo + detector.config.postRollMs + 50, lm: null });
    if (tail.swing) capture(tail.swing);

    progress(0.97, swings.length ? `Found ${swings.length} ${swings.length === 1 ? "swing" : "swings"}. Saving…` : "Finishing…");
    await Promise.all(pending);
    buffer.clear();
    const expected = lastMedia > 0 && mediaGaps.length ? lastMedia / (srcGap(mediaGaps) / 1000) : frames;
    // A wrong slow-motion setting needs at least two independent votes (or one from a full swing analysis).
    let timeBaseFix: number | null = null;
    for (const [f, votes] of tbVotes) if (votes >= 2 && (timeBaseFix === null || votes > (tbVotes.get(timeBaseFix) ?? 0))) timeBaseFix = f;
    return {
      swings,
      fps: mediaGaps.length ? 1000 / (srcGap(mediaGaps) / o.slowMo) : 30,
      coverage: expected ? Math.min(1, frames / expected) : 1,
      durationS,
      heardAudio: !!audio,
      truncated: durationS > MAX_VIDEO_SECONDS,
      timeBaseFix,
      debug: {
        frames,
        maxSpeed: Math.round(maxSpeed * 10) / 10,
        rejected: rejected.slice(-8),
        delegate,
        playbackRate: video.playbackRate,
        motionPx: `${tw}x${th} pose every ${poseStride}`,
        speeds: speedDebug,
      },
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    if (own) video.remove();
  }
}

/** The recording's true frame interval: the short gaps between frames (long gaps are frames the tracker missed). */
function srcGap(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length * 0.1)] : NaN;
}
function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
