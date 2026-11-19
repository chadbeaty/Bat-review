"use client";
import { analyzeSwing } from "@/engine/analyzer";
import { SwingDetector, type DetectorState, type DetectorTick, type SwingWindow } from "@/engine/detector";
import { BONES, L } from "@/engine/geometry";
import { backgroundShift, evaluateSetup, luminance, personBox, type SetupCheck } from "@/engine/setup";
import { LandmarkSmoother } from "@/engine/smoothing";
import type { CameraView, Handedness, Landmark, MetricKey, MetricValue, PoseFrame, SwingAnalysis } from "@/engine/types";
import { ContactAudio } from "./audio";
import { encodeFrames, FrameBuffer } from "./framebuffer";
import { loadPose, toLandmarks, toWorld, type ModelQuality } from "./pose";

export type LiveOptions = {
  video: HTMLVideoElement;
  overlay: HTMLCanvasElement;
  view: CameraView;
  hand: Handedness;
  heightIn: number;
  micOn: boolean;
  quality: ModelQuality;
  facing: "environment" | "user";
  /** Recent swings' metrics, newest first, for comparison cues. */
  previous: () => Partial<Record<MetricKey, MetricValue>>[];
};

export type LiveTick = {
  state: DetectorState;
  speed: number;
  hasBody: boolean;
  checks: SetupCheck[];
  poseFps: number;
  cameraFps: number;
  delegate: "GPU" | "CPU" | null;
};

export type CapturedSwing = {
  window: SwingWindow;
  analysis: SwingAnalysis;
  pose: PoseFrame[];
  frameSize: { width: number; height: number };
  clip: Promise<{ t: number; blob: Blob }[]>;
};

type Handlers = {
  onTick?: (t: LiveTick) => void;
  onSwing?: (s: CapturedSwing) => void;
  onOnset?: () => void;
  onError?: (message: string) => void;
  onMicUnavailable?: () => void;
};

const HISTORY_MS = 4500;

export class LiveEngine {
  private stream: MediaStream | null = null;
  private detector: SwingDetector | null = null;
  private buffer = new FrameBuffer(HISTORY_MS);
  private history: PoseFrame[] = [];
  private smoother = new LandmarkSmoother();
  private audio: ContactAudio | null = null;
  private running = false;
  private paused = false;
  private lastTs = 0;
  private frameCount = 0;
  private fpsWindow: number[] = [];
  private thumb: HTMLCanvasElement | null = null;
  private prevThumb: Uint8ClampedArray | null = null;
  private shifts: number[] = [];
  private brightness: { mean: number; clipped: number } | null = null;
  private recentLm: (Landmark[] | null)[] = [];
  private lastTickAt = 0;
  private trail: { x: number; y: number }[] = [];
  private wakeLock: { release: () => Promise<void> } | null = null;
  private delegate: "GPU" | "CPU" | null = null;
  private landmarker: Awaited<ReturnType<typeof loadPose>>["landmarker"] | null = null;
  private startedAt = 0;
  private triedCpu = false;
  cameraFps = 0;
  micActive = false;
  /** Field-tuning readout (window.__swingiq): what the detector saw and why it rejected candidates. */
  debug = { frames: 0, bodies: 0, maxSpeed: 0, lastRejected: "", swings: 0, delegate: "" };
  /** How the video is fitted on screen; the overlay follows it. Setup uses "contain" so the whole frame (feet!) shows. */
  fit: "cover" | "contain" = "cover";
  /** Detection is on (after setup). During setup the camera, overlay and checks run, but swings aren't counted. */
  detecting = false;

  constructor(
    private opts: LiveOptions,
    private on: Handlers = {},
  ) {}

  async start() {
    const { video } = this.opts;
    const videoC: MediaTrackConstraints = {
      facingMode: { ideal: this.opts.facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
    };
    const audioC: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: videoC, audio: this.opts.micOn ? audioC : false });
    } catch (err) {
      if (this.opts.micOn) {
        // Maybe only the mic was refused. Try camera alone.
        this.stream = await navigator.mediaDevices.getUserMedia({ video: videoC, audio: false });
        this.on.onMicUnavailable?.();
      } else throw err;
    }
    const track = this.stream.getVideoTracks()[0];
    this.cameraFps = track.getSettings().frameRate ?? 30;
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    if (video.readyState < 2) await new Promise((r) => video.addEventListener("loadeddata", r, { once: true }));

    const pose = await loadPose(this.opts.quality);
    this.landmarker = pose.landmarker;
    this.delegate = pose.delegate;
    this.debug.delegate = pose.delegate;
    (window as unknown as { __swingiq?: unknown }).__swingiq = this.debug;

    this.detector = new SwingDetector({ width: video.videoWidth, height: video.videoHeight });
    this.buffer.configure(video.videoWidth, video.videoHeight);

    if (this.opts.micOn && this.stream.getAudioTracks().length) {
      this.audio = new ContactAudio();
      this.audio.onOnset = () => this.on.onOnset?.();
      this.micActive = await this.audio.start(this.stream).catch(() => false);
      if (!this.micActive) this.on.onMicUnavailable?.();
    }

    this.requestWakeLock();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.running = true;
    this.startedAt = performance.now();
    this.loop();
  }

  private onVisibility = () => {
    if (document.visibilityState === "visible" && this.running) this.requestWakeLock();
  };

  private async requestWakeLock() {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl) this.wakeLock = await wl.request("screen");
    } catch {
      /* not supported or denied: the session still works, the screen may dim */
    }
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.detector?.reset();
  }

  setDetecting(on: boolean) {
    this.detecting = on;
    if (!on) this.detector?.reset();
  }

  private loop = () => {
    if (!this.running) return;
    const v = this.opts.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { captureTime?: number; expectedDisplayTime?: number }) => void) => number;
    };
    if (v.requestVideoFrameCallback) {
      v.requestVideoFrameCallback((now, meta) => {
        this.process(meta.captureTime ?? now);
        this.loop();
      });
    } else {
      requestAnimationFrame((now) => {
        this.process(now);
        this.loop();
      });
    }
  };

  private process(rawT: number) {
    const { video } = this.opts;
    if (!this.landmarker || !this.detector || video.readyState < 2 || this.paused) return;
    // MediaPipe needs strictly increasing timestamps.
    const t = Math.max(rawT, this.lastTs + 1);
    this.lastTs = t;

    let lm: Landmark[] | null = null;
    let world: PoseFrame["world"] = null;
    try {
      const res = this.landmarker.detectForVideo(video, t);
      lm = toLandmarks(res.landmarks[0]);
      world = toWorld(res.worldLandmarks?.[0]);
    } catch (e) {
      this.on.onError?.(e instanceof Error ? e.message : "Tracking error");
      return;
    }
    const frame: PoseFrame = { t, lm, world };
    this.history.push(frame);
    while (this.history.length && t - this.history[0].t > HISTORY_MS) this.history.shift();
    this.buffer.push(t, video);

    this.fpsWindow.push(t);
    while (this.fpsWindow.length && t - this.fpsWindow[0] > 1500) this.fpsWindow.shift();

    this.maybeFallBackToCpu(t);
    this.recentLm.push(lm);
    if (this.recentLm.length > 20) this.recentLm.shift();
    if (this.frameCount++ % 4 === 0) this.sampleScene(lm);

    const tick: DetectorTick = this.detecting ? this.detector.push(frame) : { state: "idle", speed: 0 };
    this.debug.frames++;
    if (lm) this.debug.bodies++;
    if (tick.speed > this.debug.maxSpeed) this.debug.maxSpeed = Math.round(tick.speed * 10) / 10;
    if (tick.rejected) this.debug.lastRejected = tick.rejected;
    if (tick.swing) this.debug.swings++;
    this.draw(lm, t, tick.state);

    if (tick.swing) this.capture(tick.swing);

    if (t - this.lastTickAt > 120) {
      this.lastTickAt = t;
      this.on.onTick?.({
        state: tick.state,
        speed: tick.speed,
        hasBody: !!lm,
        checks: this.checks(),
        poseFps: this.poseFps(),
        cameraFps: this.cameraFps,
        delegate: this.delegate,
      });
    }
  }

  /**
   * Some GPUs (older Androids, software-rendered browsers) run the tracker slower than the CPU does. If tracking
   * is under 10 fps after three seconds on the GPU, switch to the CPU once and keep whichever is faster.
   */
  private maybeFallBackToCpu(t: number) {
    if (this.triedCpu || this.delegate !== "GPU" || t - this.startedAt < 3000) return;
    if (this.poseFps() >= 10) {
      this.triedCpu = true;
      return;
    }
    this.triedCpu = true;
    const gpu = this.landmarker;
    const gpuFps = this.poseFps();
    this.landmarker = null;
    loadPose(this.opts.quality, "CPU")
      .then((p) => {
        this.landmarker = p.landmarker;
        this.delegate = "CPU";
        this.debug.delegate = `CPU (GPU was ${gpuFps.toFixed(1)} fps)`;
        this.fpsWindow = [];
        this.detector?.reset();
      })
      .catch(() => {
        this.landmarker = gpu;
      });
  }

  private poseFps(): number {
    const w = this.fpsWindow;
    return w.length > 2 ? ((w.length - 1) * 1000) / (w[w.length - 1] - w[0]) : 0;
  }

  private checks(): SetupCheck[] {
    const v = this.opts.video;
    return evaluateSetup({
      view: this.opts.view,
      recent: this.recentLm,
      aspect: v.videoWidth / Math.max(1, v.videoHeight),
      brightness: this.brightness,
      shifts: this.shifts,
      cameraFps: this.cameraFps,
      poseFps: this.poseFps(),
    });
  }

  /** Tiny thumbnail for brightness and camera-shake checks. */
  private sampleScene(lm: Landmark[] | null) {
    const v = this.opts.video;
    const portrait = v.videoHeight > v.videoWidth;
    const w = portrait ? 27 : 48;
    const h = portrait ? 48 : 27;
    if (!this.thumb) {
      this.thumb = document.createElement("canvas");
      this.thumb.width = w;
      this.thumb.height = h;
    }
    const ctx = this.thumb.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    this.brightness = luminance(data);
    if (this.prevThumb) {
      this.shifts.push(backgroundShift(this.prevThumb, data, w, h, lm ? personBox(lm) : null));
      if (this.shifts.length > 30) this.shifts.shift();
    }
    this.prevThumb = new Uint8ClampedArray(data);
  }

  private capture(win: SwingWindow) {
    const frames = this.history.filter((f) => f.t >= win.clipStart && f.t <= win.clipEnd);
    // Contact happens right around peak hand speed. A sound far from that moment is another cage, a machine or a voice.
    const audioT = this.audio?.listener.contactIn(win.launch + 50, win.peak + 150) ?? null;
    const v = this.opts.video;
    const analysis = analyzeSwing(frames, win, {
      geom: { width: v.videoWidth, height: v.videoHeight },
      hand: this.opts.hand,
      view: this.opts.view,
      heightIn: this.opts.heightIn,
      cameraFps: this.cameraFps,
      audioContactT: audioT,
      micOn: this.micActive,
      previous: this.opts.previous(),
    });
    const canvases = this.buffer.detach(win.clipStart, win.clipEnd);
    this.on.onSwing?.({
      window: win,
      analysis,
      pose: frames,
      frameSize: { width: v.videoWidth, height: v.videoHeight },
      clip: encodeFrames(canvases),
    });
  }

  /** Skeleton overlay, mapped to the video's on-screen box (object-fit: cover). */
  private draw(lm: Landmark[] | null, t: number, state: DetectorState) {
    const c = this.opts.overlay;
    const v = this.opts.video;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth * dpr;
    const ch = c.clientHeight * dpr;
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, cw, ch);
    if (!lm) {
      this.smoother.reset();
      this.trail = [];
      return;
    }
    const s = this.fit === "cover" ? Math.max(cw / v.videoWidth, ch / v.videoHeight) : Math.min(cw / v.videoWidth, ch / v.videoHeight);
    const ox = (cw - v.videoWidth * s) / 2;
    const oy = (ch - v.videoHeight * s) / 2;
    const mirror = this.opts.facing === "user";
    const sm = this.smoother.smooth(lm, t);
    const P = (p: Landmark) => ({ x: (mirror ? 1 - p.x : p.x) * v.videoWidth * s + ox, y: p.y * v.videoHeight * s + oy });

    const hot = state === "armed" || state === "closing";
    ctx.lineCap = "round";
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    for (const [a, b] of BONES) {
      if (sm[a].v < 0.4 || sm[b].v < 0.4) continue;
      const pa = P(sm[a]);
      const pb = P(sm[b]);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    for (const i of [L.nose, L.leftShoulder, L.rightShoulder, L.leftElbow, L.rightElbow, L.leftHip, L.rightHip, L.leftKnee, L.rightKnee, L.leftAnkle, L.rightAnkle]) {
      if (sm[i].v < 0.4) continue;
      const p = P(sm[i]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Grip and its trail: lime marks what the detector is watching.
    const g = P({ x: (lm[L.leftWrist].x + lm[L.rightWrist].x) / 2, y: (lm[L.leftWrist].y + lm[L.rightWrist].y) / 2, z: 0, v: 1 });
    this.trail.push(g);
    if (this.trail.length > (hot ? 24 : 8)) this.trail.shift();
    ctx.strokeStyle = hot ? "rgba(183, 243, 74, 0.95)" : "rgba(183, 243, 74, 0.45)";
    ctx.lineWidth = (hot ? 5 : 3) * dpr;
    ctx.beginPath();
    this.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.fillStyle = "#B7F34A";
    ctx.beginPath();
    ctx.arc(g.x, g.y, (hot ? 9 : 6) * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  async stop() {
    this.running = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    await this.audio?.stop();
    this.buffer.clear();
    this.history = [];
    await this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }
}
