import { L, clamp, dist, frameHasBody, hands, hipCenter, median, px, torso, vis, type P2 } from "./geometry";
import type { FrameGeometry, PoseFrame } from "./types";

/**
 * Real-time swing detector.
 *
 * It follows the grip (midpoint of both wrists) and measures its speed in torso lengths per second, a unit that
 * doesn't change with how far the phone is from the hitter. A swing is a short burst of very fast hands that travel a
 * long way sideways while the hitter stays in the box. Waggles, bat taps, stretching and walking don't qualify, and
 * neither does swinging your arms from a chair or the couch: when the legs are clearly in view, the hitter has to be
 * standing. (It never sees the bat, so a standing dry swing still counts. That's a real drill.)
 */

export type DetectorConfig = {
  /** Hand speed (torso lengths/s) that arms the detector. */
  startSpeed: number;
  /** Hand speed below which the fast part of the swing is over. */
  endSpeed: number;
  /** Peak hand speed a real swing must reach. */
  peakSpeed: number;
  minDurationMs: number;
  maxDurationMs: number;
  /** Minimum total hand travel, in torso lengths. */
  minTravel: number;
  /** Minimum sideways hand travel, in torso lengths (rejects overhead stretches). */
  minHorizontalTravel: number;
  /** Hips moving more than this (torso lengths) during the burst means walking, not swinging. */
  maxHipTravel: number;
  /**
   * Hip-to-ankle height (torso lengths) a standing hitter clears. Real hitters measure 1.35–1.5 (feet together or in a
   * wide stance); seated, the shins hang straight down and the hips sit near knee height, about 0.9.
   */
  minStandingLegs: number;
  /** Time kept after the fast part ends, for the follow-through. */
  postRollMs: number;
  /** Time kept before launch, for stance and load. */
  preRollMs: number;
  /** Ignore new swings for this long after one is accepted. */
  cooldownMs: number;
  /** Pose gaps longer than this reset the detector. */
  maxGapMs: number;
};

export const DEFAULT_DETECTOR: DetectorConfig = {
  startSpeed: 3.2,
  endSpeed: 2.2,
  peakSpeed: 6.5,
  minDurationMs: 90,
  maxDurationMs: 1000,
  minTravel: 1.1,
  minHorizontalTravel: 0.6,
  maxHipTravel: 1.2,
  minStandingLegs: 1.15,
  postRollMs: 550,
  preRollMs: 1700,
  cooldownMs: 1000,
  maxGapMs: 300,
};

export type SwingWindow = {
  /** When hands started the fast forward move (ms). */
  launch: number;
  /** When hand speed peaked (ms). */
  peak: number;
  /** When the fast part ended (ms). */
  end: number;
  /** Clip bounds including pre- and post-roll (ms). */
  clipStart: number;
  clipEnd: number;
  peakSpeed: number;
  travel: number;
};

export type DetectorState = "idle" | "armed" | "closing" | "cooldown";

export type DetectorTick = {
  state: DetectorState;
  /** Current smoothed hand speed in torso lengths/s (0 when no body). */
  speed: number;
  /** A swing that just finished its post-roll, ready to analyze. */
  swing?: SwingWindow;
  /** A candidate that was rejected, with the reason (useful while tuning, shown in debug). */
  rejected?: string;
};

/** legs: hip-to-ankle height in torso lengths, only when the knees and ankles are clearly tracked (else null). */
type Sample = { t: number; p: P2; hip: P2; speed: number; scale: number; legs: number | null };

/** Knees and ankles must be this clearly tracked to judge standing vs sitting. Out of frame, the tracker guesses them. */
const LEGS_VISIBLE = 0.7;
const LEG_JOINTS = [L.leftKnee, L.rightKnee, L.leftAnkle, L.rightAnkle] as const;

export class SwingDetector {
  private cfg: DetectorConfig;
  private samples: Sample[] = [];
  private scales: number[] = [];
  private state: DetectorState = "idle";
  private candidateStart = -1;
  private peak = { t: 0, speed: 0 };
  private endT = 0;
  private pending: SwingWindow | null = null;
  private cooldownUntil = 0;
  private lastT = -Infinity;

  constructor(
    private geom: FrameGeometry,
    cfg: Partial<DetectorConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_DETECTOR, ...cfg };
  }

  get config() {
    return this.cfg;
  }

  setGeometry(g: FrameGeometry) {
    this.geom = g;
    this.reset();
  }

  reset() {
    this.samples = [];
    this.state = "idle";
    this.pending = null;
    this.candidateStart = -1;
  }

  push(frame: PoseFrame): DetectorTick {
    const { t } = frame;
    if (t - this.lastT > this.cfg.maxGapMs && this.state !== "cooldown" && this.state !== "closing") {
      // Lost the body for too long. Whatever was in progress can't be trusted.
      this.samples = [];
      if (this.state !== "idle") this.state = "idle";
      this.pending = null;
    }

    if (!frameHasBody(frame, 0.45)) {
      return this.finishTick(t, 0);
    }
    this.lastT = t;

    const lm = frame.lm;
    const s = torso(lm, this.geom);
    if (s > 4) {
      this.scales.push(s);
      if (this.scales.length > 45) this.scales.shift();
    }
    const scale = median(this.scales) || s || 1;
    const p = hands(lm, this.geom);
    const hip = hipCenter(lm, this.geom);

    // Light smoothing of the grip position (3-sample average) before differentiating.
    const prev = this.samples.slice(-2);
    const ps = prev.length === 2 ? { x: (prev[0].p.x + prev[1].p.x + p.x) / 3, y: (prev[0].p.y + prev[1].p.y + p.y) / 3 } : p;
    const last = this.samples[this.samples.length - 1];
    let speed = 0;
    if (last) {
      const lastSmoothed = this.smoothedAt(this.samples.length - 1);
      const dt = (t - last.t) / 1000;
      if (dt > 0) speed = dist(ps, lastSmoothed) / scale / dt;
    }
    const ankleY = (px(lm[L.leftAnkle], this.geom).y + px(lm[L.rightAnkle], this.geom).y) / 2;
    const legs = vis(lm, LEG_JOINTS) >= LEGS_VISIBLE ? (ankleY - hip.y) / scale : null;
    this.samples.push({ t, p, hip, speed, scale, legs });
    // Keep enough history for the pre-roll plus the longest swing.
    const keep = this.cfg.preRollMs + this.cfg.maxDurationMs + this.cfg.postRollMs + 500;
    while (this.samples.length && t - this.samples[0].t > keep) this.samples.shift();

    return this.step(t, speed);
  }

  private smoothedAt(i: number): P2 {
    const a = this.samples[Math.max(0, i - 2)];
    const b = this.samples[Math.max(0, i - 1)];
    const c = this.samples[i];
    if (i < 2) return c.p;
    return { x: (a.p.x + b.p.x + c.p.x) / 3, y: (a.p.y + b.p.y + c.p.y) / 3 };
  }

  private step(t: number, speed: number): DetectorTick {
    const c = this.cfg;
    switch (this.state) {
      case "cooldown":
        if (t >= this.cooldownUntil) this.state = "idle";
        break;
      case "idle":
        if (speed >= c.startSpeed) {
          this.state = "armed";
          this.candidateStart = this.findLaunch(t);
          this.peak = { t, speed };
        }
        break;
      case "armed":
        if (speed > this.peak.speed) this.peak = { t, speed };
        if (speed < c.endSpeed) {
          this.endT = t;
          const verdict = this.judge();
          if (typeof verdict === "string") {
            this.state = "idle";
            return { state: this.state, speed, rejected: verdict };
          }
          this.pending = verdict;
          this.state = "closing";
        } else if (t - this.candidateStart > c.maxDurationMs) {
          // Fast motion that never stops (running, a long stretch). Not a swing.
          this.state = "cooldown";
          this.cooldownUntil = t + 400;
          return { state: this.state, speed, rejected: "too long" };
        }
        break;
      case "closing":
        if (this.pending && t >= this.pending.clipEnd) {
          const swing = this.pending;
          this.pending = null;
          this.state = "cooldown";
          this.cooldownUntil = t + c.cooldownMs;
          return { state: this.state, speed, swing };
        }
        break;
    }
    return { state: this.state, speed };
  }

  private finishTick(t: number, speed: number): DetectorTick {
    // Even without a body in this frame, a swing waiting on its post-roll can still be released.
    if (this.state === "closing" && this.pending && t >= this.pending.clipEnd) {
      const swing = this.pending;
      this.pending = null;
      this.state = "cooldown";
      this.cooldownUntil = t + this.cfg.cooldownMs;
      return { state: this.state, speed, swing };
    }
    if (this.state === "cooldown" && t >= this.cooldownUntil) this.state = "idle";
    return { state: this.state, speed };
  }

  /** Walks back from the arming moment to where the hands were last nearly still: that's launch. */
  private findLaunch(t: number): number {
    const quiet = this.cfg.endSpeed * 0.6;
    for (let i = this.samples.length - 2; i >= 0; i--) {
      if (this.samples[i].speed <= quiet || t - this.samples[i].t > 400) return this.samples[i].t;
    }
    return this.samples[0]?.t ?? t;
  }

  private judge(): SwingWindow | string {
    const c = this.cfg;
    const start = this.candidateStart;
    const end = this.endT;
    const win = this.samples.filter((s) => s.t >= start && s.t <= end);
    if (win.length < 3) return "too few frames";
    const duration = end - start;
    if (this.peak.speed < c.peakSpeed) return `too slow (${this.peak.speed.toFixed(1)})`;
    if (duration < c.minDurationMs) return "too short";
    if (duration > c.maxDurationMs) return "too long";
    const scale = median(win.map((s) => s.scale));
    let travel = 0;
    for (let i = 1; i < win.length; i++) travel += dist(win[i].p, win[i - 1].p);
    travel /= scale;
    const xs = win.map((s) => s.p.x);
    const horizontal = (Math.max(...xs) - Math.min(...xs)) / scale;
    const hipTravel = dist(win[0].hip, win[win.length - 1].hip) / scale;
    if (travel < c.minTravel) return `short path (${travel.toFixed(2)})`;
    if (horizontal < c.minHorizontalTravel) return "no sideways motion";
    if (hipTravel > c.maxHipTravel) return "body moving (walking?)";
    // Sitting: judged from the stance and the swing, and only when the legs were clearly in view for most of it.
    const around = this.samples.filter((s) => s.t >= start - 1200 && s.t <= end);
    const legs = around.map((s) => s.legs).filter((v): v is number => v !== null);
    if (legs.length >= 5 && legs.length >= around.length * 0.6 && median(legs) < c.minStandingLegs) return "sitting";
    return {
      launch: start,
      peak: this.peak.t,
      end,
      clipStart: start - c.preRollMs,
      clipEnd: end + c.postRollMs,
      peakSpeed: this.peak.speed,
      travel,
    };
  }
}

/** Runs the detector over a recorded pose sequence (tests, re-analysis). */
export function detectSwings(frames: PoseFrame[], geom: FrameGeometry, cfg: Partial<DetectorConfig> = {}) {
  const d = new SwingDetector(geom, cfg);
  const swings: SwingWindow[] = [];
  const rejected: string[] = [];
  for (const f of frames) {
    const tick = d.push(f);
    if (tick.swing) swings.push(tick.swing);
    if (tick.rejected) rejected.push(tick.rejected);
  }
  // Flush a swing that ended right at the end of the recording.
  const lastT = frames[frames.length - 1]?.t ?? 0;
  const tail = d.push({ t: lastT + d.config.postRollMs + 50, lm: null });
  if (tail.swing) swings.push(tail.swing);
  return { swings, rejected };
}

export const speedForMeter = (speed: number, cfg = DEFAULT_DETECTOR) => clamp(speed / (cfg.peakSpeed * 1.6), 0, 1);
