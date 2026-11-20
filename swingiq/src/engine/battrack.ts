// Finds the bat in each high-frame-rate frame. Pure TypeScript (no browser APIs): frames come in as RGBA arrays.
//
// This is the pixel half of the bat-speed engine (the physics half is batspeed.ts). It is deliberately separate from
// the ball tracker in motion.ts: a ball is a small round blob in free flight, a bat is a long thin rigid body rotating
// about the hands. Different objects, different detectors.
//
// How it works, per frame:
// 1. "Moving now" mask: a pixel counts when it differs from the running background AND from the frame a few
//    milliseconds earlier. The second test removes the ghost a bat leaves where it rested in the stance, and
//    anything else that stopped moving.
// 2. From the hands (body tracking gives them; they're interpolated to every frame), cast rays every degree and
//    measure how much of each ray, from just past the hands out to the bat's expected length, is moving. Rays that
//    point back into the hitter's own arms and body are skipped.
// 3. The bat is the strongest ray. When the bat smears into a fan (motion blur), the weighted middle of the fan is
//    its position at mid-exposure. The barrel end is where the moving run along that ray stops.
//
// Upgrade path: a trained bat detector (see ml/) can hand this the bat's box or mask instead of the motion mask; the
// physics in batspeed.ts doesn't change.

export type P2 = { x: number; y: number };

export type BatHints = {
  /** Midpoint of the hands, tracker pixels. Without it the frame is skipped. */
  hands: P2 | null;
  /** Points on the hitter's body (shoulders, elbows, hips) whose directions from the hands are not the bat. */
  avoid?: P2[];
  /** Expected distance from the hands to the barrel end, pixels, when the bat is square to the camera. */
  expectLenPx?: number | null;
};

export type BatObs = {
  /** Real milliseconds. */
  t: number;
  /** Hands (pivot) in tracker pixels. */
  hx: number;
  hy: number;
  /** Bat direction from the hands, radians, image coordinates (y down). */
  phi: number;
  /** Hands to barrel end, pixels (shorter when the bat points toward or away from the camera). */
  len: number;
  /** Angular width of the moving fan, radians (motion blur + bat thickness). */
  fan: number;
  /** 0–1. */
  conf: number;
  /** Other bat-like directions in this frame (weaker peaks). The physics step picks the one that moves smoothly. */
  alts?: { phi: number; len: number; fan: number; conf: number }[];
};

export type BatTrackerOptions = {
  /** Background memory, real ms. */
  tauMs?: number;
  /** "Moved since" look-back, real ms. */
  lookbackMs?: number;
};

const N_ANG = 360;
const COS = Float32Array.from({ length: N_ANG }, (_, k) => Math.cos((k * 2 * Math.PI) / N_ANG));
const SIN = Float32Array.from({ length: N_ANG }, (_, k) => Math.sin((k * 2 * Math.PI) / N_ANG));

export class BatTracker {
  readonly w: number;
  readonly h: number;
  private bg: Float32Array;
  private ring: { t: number; y: Uint8Array }[] = [];
  private lastT = NaN;
  private n = 0;
  private opts: Required<BatTrackerOptions>;
  readonly obs: BatObs[] = [];

  constructor(w: number, h: number, opts: BatTrackerOptions = {}) {
    this.w = w;
    this.h = h;
    this.bg = new Float32Array(w * h);
    this.opts = { tauMs: opts.tauMs ?? 220, lookbackMs: opts.lookbackMs ?? 9 };
  }

  /** Adds a frame (RGBA, w×h, real ms). Returns the bat found in it, or null. */
  push(t: number, rgba: ArrayLike<number>, hints: BatHints): BatObs | null {
    const { w, h } = this;
    const N = w * h;
    const Y = new Uint8Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) Y[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    if (this.n === 0) {
      for (let i = 0; i < N; i++) this.bg[i] = Y[i];
      this.n = 1;
      this.lastT = t;
      this.ring.push({ t, y: Y });
      return null;
    }
    const dt = Math.max(0.1, t - this.lastT);
    this.lastT = t;
    const alpha = Math.min(0.5, Math.max(0.004, 1 - Math.exp(-dt / this.opts.tauMs)));
    this.n++;

    // The frame ~lookbackMs ago (at least two frames back, so slow parts of the bat still register).
    let ref = this.ring[0];
    for (let k = this.ring.length - 1; k >= 0; k--) {
      if (t - this.ring[k].t >= this.opts.lookbackMs) {
        ref = this.ring[k];
        break;
      }
    }
    if (this.ring.length >= 2 && ref === this.ring[this.ring.length - 1]) ref = this.ring[this.ring.length - 2];

    // Noise floor from a sparse sample.
    const hist = new Uint32Array(256);
    let samples = 0;
    for (let i = 0; i < N; i += 29) {
      hist[Math.min(255, Math.abs(Y[i] - this.bg[i]) | 0)]++;
      samples++;
    }
    const thr = Math.max(12, 3 * histMedian(hist, samples) + 8);
    const thrM = Math.max(8, thr * 0.6);

    let result: BatObs | null = null;
    if (hints.hands && this.n > 3) result = this.scan(t, Y, ref.y, thr, thrM, hints);

    // Background update (slower where something is moving).
    for (let i = 0; i < N; i++) {
      const d = Y[i] - this.bg[i];
      this.bg[i] += (Math.abs(d) > thr ? alpha * 0.2 : alpha) * d;
    }
    this.ring.push({ t, y: Y });
    while (this.ring.length > 8 && t - this.ring[1].t > this.opts.lookbackMs * 2) this.ring.shift();
    if (result) this.obs.push(result);
    return result;
  }

  private scan(t: number, Y: Uint8Array, P: Uint8Array, thr: number, thrM: number, hints: BatHints): BatObs | null {
    const { w, h } = this;
    const H = hints.hands!;
    const L = hints.expectLenPx && hints.expectLenPx > 10 ? hints.expectLenPx : Math.min(w, h) * 0.35;
    const r0 = Math.max(4, L * 0.17); // skip the hands and knob
    const r1 = L * 1.3;
    const gap = Math.max(3, L * 0.06);
    const fg = (x: number, y: number) => {
      const xi = x | 0;
      const yi = y | 0;
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return false;
      const i = yi * w + xi;
      return Math.abs(Y[i] - this.bg[i]) > thr && Math.abs(Y[i] - P[i]) > thrM;
    };

    // Directions toward the body are not the bat.
    const blocked = new Uint8Array(N_ANG);
    for (const a of hints.avoid ?? []) {
      const dx = a.x - H.x;
      const dy = a.y - H.y;
      const d = Math.hypot(dx, dy);
      if (d < r0 * 0.5) continue;
      const k0 = Math.round(((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * N_ANG);
      // Wider cone for body parts close to the hands (they cover more angle).
      const half = Math.min(28, Math.max(10, (Math.atan2(r0 * 0.9, d) * 180) / Math.PI));
      for (let k = -half; k <= half; k++) blocked[(k0 + Math.round(k) + N_ANG) % N_ANG] = 1;
    }

    const fill = new Float32Array(N_ANG);
    const rEnd = Math.min(r1, L);
    const steps = Math.max(6, Math.round(rEnd - r0));
    for (let k = 0; k < N_ANG; k++) {
      if (blocked[k]) continue;
      let c = 0;
      for (let s = 0; s < steps; s++) {
        const r = r0 + ((s + 0.5) * (rEnd - r0)) / steps;
        if (fg(H.x + r * COS[k], H.y + r * SIN[k])) c++;
      }
      fill[k] = c / steps;
    }
    // Light circular smoothing.
    const sm = new Float32Array(N_ANG);
    for (let k = 0; k < N_ANG; k++) {
      sm[k] = (fill[(k - 1 + N_ANG) % N_ANG] + 2 * fill[k] + fill[(k + 1) % N_ANG]) / 4;
    }
    const sorted = Array.from(sm).sort((a, b) => a - b);
    const med = sorted[N_ANG >> 1];
    // Up to three separate peaks (the bat, plus anything else bat-like such as a moving arm or body edge).
    const taken = new Uint8Array(N_ANG);
    const cands: { phi: number; len: number; fan: number; conf: number }[] = [];
    for (let pass = 0; pass < 3; pass++) {
      let kBest = -1;
      let best = 0;
      for (let k = 0; k < N_ANG; k++) {
        if (!taken[k] && sm[k] > best) {
          best = sm[k];
          kBest = k;
        }
      }
      if (kBest < 0 || best < 0.22) break;
      // The fan around the peak: contiguous angles above half the peak, weighted middle.
      let lo = kBest;
      let hi = kBest;
      while (hi - kBest < 40 && sm[(hi + 1) % N_ANG] >= best * 0.5) hi++;
      while (kBest - lo < 40 && sm[(lo - 1 + N_ANG) % N_ANG] >= best * 0.5) lo--;
      let sx = 0;
      let sy = 0;
      for (let k = lo; k <= hi; k++) {
        const kk = (k + N_ANG) % N_ANG;
        const wgt = sm[kk] * sm[kk];
        sx += wgt * COS[kk];
        sy += wgt * SIN[kk];
      }
      for (let k = lo - 12; k <= hi + 12; k++) taken[(k + N_ANG) % N_ANG] = 1;
      const phi = Math.atan2(sy, sx);
      const fan = ((hi - lo + 1) * 2 * Math.PI) / N_ANG;
      const len = this.tipAlong(H, phi, r0, r1, gap, fg);
      if (len === null) continue;
      // A moving thing that runs on well past the bat's length (a body edge, a leg) is probably not the bat.
      const overrun = len > L * 1.22 ? 0.5 : 1;
      cands.push({ phi, len, fan, conf: clamp01((best - med) / 0.45) * clamp01(best / 0.45) * overrun });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.conf - a.conf);
    const [top, ...alts] = cands;
    return { t, hx: H.x, hy: H.y, ...top, alts };
  }

  /** Barrel end: walk out along phi until the moving run stops (short gaps allowed), over a 3-ray bundle. */
  private tipAlong(H: P2, phi: number, r0: number, r1: number, gap: number, fg: (x: number, y: number) => boolean): number | null {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const px = -s;
    const py = c;
    let lastFg = -1;
    let run = 0;
    for (let r = r0; r <= r1; r += 0.5) {
      let hit = false;
      for (const o of [-1.5, 0, 1.5]) {
        if (fg(H.x + r * c + o * px, H.y + r * s + o * py)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        lastFg = r;
        run = 0;
      } else if (lastFg >= 0 && ++run * 0.5 > gap) break;
    }
    if (lastFg < r0 + 2) return null;
    return lastFg + 0.5;
  }

  /** Drops stored observations and background (for reuse between swings). */
  reset() {
    this.n = 0;
    this.ring = [];
    this.obs.length = 0;
  }
}

function histMedian(h: Uint32Array, n: number) {
  let c = 0;
  for (let i = 0; i < 256; i++) {
    c += h[i];
    if (c >= n / 2) return i;
  }
  return 0;
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
