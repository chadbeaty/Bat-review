// Finds the ball in slow-motion frames. Pure TypeScript (no browser APIs): frames come in as RGBA pixel arrays.
//
// The camera sits still on a stand, so anything that differs from the recent background is moving. A softball is a
// small, round, fast mover; the batter is a big one. Each frame becomes a list of moving blobs; ball-sized round blobs
// are linked frame to frame into tracks; the pitch and the batted ball are the two tracks that meet at the bat.

import { cleanTrack, fitPitch } from "./ballflight";

export type Blob = {
  area: number;
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Widths along the blob's long and short axes from its moments, pixels (a disk of diameter D gives D for both). */
  major: number;
  minor: number;
  /** Pixel extent straight across the short axis: a motion-blurred ball's true diameter. */
  width: number;
  /** Mean and peak difference from the background, 0–255. */
  contrast: number;
  peak: number;
};

export type MotionFrame = {
  t: number;
  w: number;
  h: number;
  /** The difference that counted as "moving" in this frame. */
  thr: number;
  blobs: Blob[];
};

export type MotionOptions = {
  /** How quickly the background forgets, in real milliseconds. */
  tauMs?: number;
  /** How much history to keep, in real milliseconds. */
  keepMs?: number;
  /** Ignore specks smaller than this many pixels. */
  minArea?: number;
};

/** Per-frame motion finder with a running background. Feed frames in time order; times in real milliseconds. */
export class MotionTracker {
  readonly w: number;
  readonly h: number;
  private bgY: Float32Array;
  private bgB: Float32Array;
  /** Typical frame-to-frame wobble of each pixel's background (fine edges shimmer under compression). */
  private devY: Float32Array;
  private devB: Float32Array;
  private curY: Uint8Array;
  private curB: Uint8Array;
  private lastT = NaN;
  private n = 0;
  private buf: MotionFrame[] = [];
  private opts: Required<MotionOptions>;

  constructor(w: number, h: number, opts: MotionOptions = {}) {
    this.w = w;
    this.h = h;
    this.bgY = new Float32Array(w * h);
    this.bgB = new Float32Array(w * h);
    this.devY = new Float32Array(w * h).fill(2);
    this.devB = new Float32Array(w * h).fill(2);
    this.curY = new Uint8Array(w * h);
    this.curB = new Uint8Array(w * h);
    this.opts = { tauMs: opts.tauMs ?? 150, keepMs: opts.keepMs ?? 5000, minArea: opts.minArea ?? 5 };
  }

  /** Adds one frame (RGBA, w×h). Returns that frame's moving blobs, or null while the background is warming up. */
  push(t: number, rgba: ArrayLike<number>): MotionFrame | null {
    const { w, h } = this;
    const N = w * h;
    const Y = this.curY;
    const B = this.curB;
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      Y[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
      B[i] = rgba[j + 2];
    }
    if (this.n === 0) {
      for (let i = 0; i < N; i++) {
        this.bgY[i] = Y[i];
        this.bgB[i] = B[i];
      }
      this.n = 1;
      this.lastT = t;
      return null;
    }
    const dt = Math.max(0.1, t - this.lastT);
    this.lastT = t;
    const alpha = Math.min(0.5, Math.max(0.005, 1 - Math.exp(-dt / this.opts.tauMs)));
    const warm = this.n >= 4;
    this.n++;

    // Noise floor from a sparse sample, so the threshold adapts to grain and compression.
    const hy = new Uint32Array(256);
    const hb = new Uint32Array(256);
    let samples = 0;
    for (let i = 0; i < N; i += 23) {
      hy[Math.min(255, Math.abs(Y[i] - this.bgY[i]) | 0)]++;
      hb[Math.min(255, Math.abs(B[i] - this.bgB[i]) | 0)]++;
      samples++;
    }
    const tY = Math.max(14, 3 * histMedian(hy, samples) + 8);
    const tB = Math.max(16, 3 * histMedian(hb, samples) + 10);

    // Moving pixels as horizontal runs (row, x0, x1 exclusive), merging 1-pixel gaps.
    const runs: number[] = [];
    const runSum: number[] = [];
    const runMax: number[] = [];
    for (let y = 0; y < h; y++) {
      let x0 = -1;
      let gap = 0;
      let sum = 0;
      let mx = 0;
      let lastFg = -1;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const dy = Math.abs(Y[i] - this.bgY[i]);
        const db = Math.abs(B[i] - this.bgB[i]);
        // A pixel that always shimmers (a fence wire, a light pole) needs a bigger change to count as moving.
        const fg = dy > Math.max(tY, 3.5 * this.devY[i] + 6) || db > Math.max(tB, 3.5 * this.devB[i] + 6);
        if (fg) {
          if (x0 < 0) x0 = x;
          gap = 0;
          lastFg = x;
          const dd = Math.max(dy, db);
          sum += dd;
          if (dd > mx) mx = dd;
          this.bgY[i] += alpha * 0.25 * (Y[i] - this.bgY[i]);
          this.bgB[i] += alpha * 0.25 * (B[i] - this.bgB[i]);
        } else {
          if (x0 >= 0 && ++gap > 1) {
            runs.push(y, x0, lastFg + 1);
            runSum.push(sum);
            runMax.push(mx);
            x0 = -1;
            sum = 0;
            mx = 0;
          }
          this.bgY[i] += alpha * (Y[i] - this.bgY[i]);
          this.bgB[i] += alpha * (B[i] - this.bgB[i]);
          this.devY[i] += alpha * (dy - this.devY[i]);
          this.devB[i] += alpha * (db - this.devB[i]);
        }
      }
      if (x0 >= 0) {
        runs.push(y, x0, lastFg + 1);
        runSum.push(sum);
        runMax.push(mx);
      }
    }
    if (!warm) return null;
    // A frame where much of the picture "moved" is a camera bump or exposure jump: skip it.
    const nRuns = runs.length / 3;
    let fgPx = 0;
    for (let r = 0; r < nRuns; r++) fgPx += runs[r * 3 + 2] - runs[r * 3 + 1];
    const frame: MotionFrame = { t, w, h, thr: Math.min(tY, tB), blobs: fgPx > N * 0.35 ? [] : blobsFromRuns(runs, runSum, this.opts.minArea, runMax) };
    this.buf.push(frame);
    while (this.buf.length && t - this.buf[0].t > this.opts.keepMs) this.buf.shift();
    return frame;
  }

  frames(t0 = -Infinity, t1 = Infinity): MotionFrame[] {
    return this.buf.filter((f) => f.t >= t0 && f.t <= t1);
  }
}

function histMedian(hist: Uint32Array, total: number): number {
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc * 2 >= total) return i;
  }
  return 255;
}

/** Connected moving regions from runs (8-connected), with shape statistics. */
export function blobsFromRuns(runs: number[], runSum: number[], minArea: number, runMax?: number[]): Blob[] {
  const n = runs.length / 3;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  // Runs are in row order; compare each row with the one above.
  let prevStart = 0;
  let prevEnd = 0;
  let i = 0;
  while (i < n) {
    const y = runs[i * 3];
    let j = i;
    while (j < n && runs[j * 3] === y) j++;
    if (prevEnd > prevStart && runs[prevStart * 3] === y - 1) {
      let p = prevStart;
      for (let c = i; c < j; c++) {
        const cx0 = runs[c * 3 + 1];
        const cx1 = runs[c * 3 + 2];
        while (p < prevEnd && runs[p * 3 + 2] < cx0) p++;
        for (let q = p; q < prevEnd && runs[q * 3 + 1] <= cx1; q++) {
          const ra = find(c);
          const rb = find(q);
          if (ra !== rb) parent[ra] = rb;
        }
      }
    }
    prevStart = i;
    prevEnd = j;
    i = j;
  }
  type Acc = { a: number; sx: number; sy: number; sxx: number; syy: number; sxy: number; minX: number; maxX: number; minY: number; maxY: number; d: number; pk: number };
  const acc = new Map<number, Acc>();
  for (let r = 0; r < n; r++) {
    const root = find(r);
    const y = runs[r * 3] + 0.5;
    const x0 = runs[r * 3 + 1];
    const x1 = runs[r * 3 + 2];
    const len = x1 - x0;
    // Pixel centers are at x + 0.5.
    const sx = len * ((x0 + x1) / 2);
    // Σ(x + 0.5)² over the run, plus each pixel's own spread (1/12) so a sampled disk matches a real one.
    const sxx = sumSq(x1) - sumSq(x0) + sx - 0.25 * len + len / 12;
    let s = acc.get(root);
    if (!s) {
      s = { a: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, minX: x0, maxX: x1, minY: y, maxY: y, d: 0, pk: 0 };
      acc.set(root, s);
    }
    s.a += len;
    s.sx += sx;
    s.sy += len * y;
    s.sxx += sxx;
    s.syy += len * y * y + len / 12;
    s.sxy += y * sx;
    s.minX = Math.min(s.minX, x0);
    s.maxX = Math.max(s.maxX, x1);
    s.minY = Math.min(s.minY, y);
    s.maxY = Math.max(s.maxY, y);
    s.d += runSum[r];
    if (runMax && runMax[r] > s.pk) s.pk = runMax[r];
  }
  const out = new Map<number, Blob & { nx: number; ny: number; lo: number; hi: number }>();
  for (const [root, s] of acc) {
    if (s.a < minArea) continue;
    const cx = s.sx / s.a;
    const cy = s.sy / s.a;
    const vxx = s.sxx / s.a - cx * cx;
    const vyy = s.syy / s.a - cy * cy;
    const vxy = s.sxy / s.a - cx * cy;
    const tr = (vxx + vyy) / 2;
    const disc = Math.sqrt(Math.max(0, ((vxx - vyy) / 2) ** 2 + vxy * vxy));
    // Short-axis direction: eigenvector of the smaller eigenvalue.
    const lMin = tr - disc;
    let nx = vxy;
    let ny = lMin - vxx;
    if (Math.abs(nx) + Math.abs(ny) < 1e-9) {
      nx = vxx <= vyy ? 1 : 0;
      ny = vxx <= vyy ? 0 : 1;
    }
    const nn = Math.hypot(nx, ny);
    out.set(root, {
      area: s.a,
      cx,
      cy,
      minX: s.minX,
      maxX: s.maxX,
      minY: s.minY - 0.5,
      maxY: s.maxY + 0.5,
      major: 4 * Math.sqrt(Math.max(0, tr + disc)),
      minor: 4 * Math.sqrt(Math.max(0, lMin)),
      width: 0,
      contrast: s.d / s.a,
      peak: s.pk || s.d / s.a,
      nx: nx / nn,
      ny: ny / nn,
      lo: Infinity,
      hi: -Infinity,
    });
  }
  // Extent across the short axis (runs are straight, so their ends bound it).
  for (let r = 0; r < n; r++) {
    const b = out.get(find(r));
    if (!b) continue;
    const y = runs[r * 3] + 0.5 - b.cy;
    const xa = runs[r * 3 + 1] + 0.5 - b.cx;
    const xb = runs[r * 3 + 2] - 0.5 - b.cx;
    const sa = xa * b.nx + y * b.ny;
    const sb = xb * b.nx + y * b.ny;
    b.lo = Math.min(b.lo, sa, sb);
    b.hi = Math.max(b.hi, sa, sb);
  }
  const res: Blob[] = [];
  for (const b of out.values()) {
    res.push({
      area: b.area,
      cx: b.cx,
      cy: b.cy,
      minX: b.minX,
      maxX: b.maxX,
      minY: b.minY,
      maxY: b.maxY,
      major: b.major,
      minor: b.minor,
      width: b.hi - b.lo + 1,
      contrast: b.contrast,
      peak: b.peak,
    });
  }
  return res;
}

/** Sum of (x + 0.5)² for x in [0, m): pixel-center second moment helper. */
function sumSq(m: number): number {
  // Σ_{x<m} x² = (m−1)m(2m−1)/6; the +x and +0.25 terms of (x+0.5)² are added by the caller.
  return ((m - 1) * m * (2 * m - 1)) / 6;
}

// ---------------------------------------------------------------- ball tracks

export type BallObs = { t: number; x: number; y: number; d: number; area: number };
export type Track = { obs: BallObs[] };

/** Ball-sized, roughly round blobs (a fast ball smears into a short streak, so some stretch is allowed). */
export function ballCandidates(f: MotionFrame, dMin: number, dMax: number): BallObs[] {
  const out: BallObs[] = [];
  for (const b of f.blobs) {
    if (b.minor < dMin || b.minor > dMax) continue;
    if (b.major > b.minor * 5) continue;
    const fill = b.area / ((Math.PI / 4) * b.major * b.minor);
    if (fill < 0.6) continue;
    // Cut off by the edge of the picture: position and size would both be wrong.
    if (b.minX <= 1 || b.minY <= 1 || b.maxX >= f.w - 1 || b.maxY >= f.h - 1) continue;
    out.push({ t: f.t, x: b.cx, y: b.cy, d: ballWidth(b, f.thr), area: b.area });
  }
  return out;
}

/**
 * The ball's true diameter from its mask. A soft edge counts as "moving" wherever its share of the ball's contrast
 * beats the threshold, so a high-contrast ball's mask spills about half an edge-width past the real edge on each side
 * (and a faint ball's falls short). Corrected using the ball's peak contrast against the frame's threshold.
 */
export function ballWidth(b: Blob, thr: number, edgePx = 1.2): number {
  const w = Math.min(b.width, b.minor * 1.2);
  const spill = Math.max(-0.4, Math.min(0.45, 0.5 - thr / Math.max(1, b.peak))) * edgePx;
  return Math.max(1, w - 2 * spill);
}

/**
 * Links ball candidates frame to frame. `vMaxPx` is the fastest plausible ball, pixels per second (times are in
 * real milliseconds on the frames, seconds on the output's speed math).
 */
export function buildTracks(frames: MotionFrame[], dMin: number, dMax: number, vMaxPx: number): Track[] {
  const active: Track[] = [];
  const done: Track[] = [];
  let lastDt = 0;
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    if (k > 0) lastDt = f.t - frames[k - 1].t;
    const cands = ballCandidates(f, dMin, dMax);
    // Retire tracks that have gone quiet. An established track coasts longer: the ball can pass behind a pole or
    // blend into a fence wire for a few frames.
    for (let a = active.length - 1; a >= 0; a--) {
      const o = active[a].obs;
      const quiet = f.t - o[o.length - 1].t;
      if (quiet > (o.length >= 5 ? Math.max(10 * lastDt, 30) : Math.max(4 * lastDt, 12))) done.push(...active.splice(a, 1));
    }
    const pairs: { a: number; c: number; cost: number }[] = [];
    for (let a = 0; a < active.length; a++) {
      const o = active[a].obs;
      const last = o[o.length - 1];
      const dT = (f.t - last.t) / 1000;
      const dAvg = o.reduce((s, p) => s + p.d, 0) / o.length;
      let px = last.x;
      let py = last.y;
      let gate: number;
      if (o.length >= 2) {
        const prev = o[o.length - 2];
        const pdt = (last.t - prev.t) / 1000;
        const vx = (last.x - prev.x) / pdt;
        const vy = (last.y - prev.y) / pdt;
        px += vx * dT;
        py += vy * dT;
        gate = 1.2 * dAvg + 0.35 * Math.hypot(vx, vy) * dT;
      } else {
        gate = vMaxPx * dT + dAvg;
      }
      for (let c = 0; c < cands.length; c++) {
        const cd = cands[c];
        // Size can change (blur, depth) but not jump: tighter once the track has settled.
        if (Math.abs(cd.d - dAvg) > (o.length >= 5 ? 0.3 : 0.6) * dAvg + 2) continue;
        const dist = Math.hypot(cd.x - px, cd.y - py);
        if (dist <= gate) pairs.push({ a, c, cost: dist / gate + (o.length >= 2 ? 0 : 0.5) });
      }
    }
    pairs.sort((p, q) => p.cost - q.cost);
    const usedA = new Set<number>();
    const usedC = new Set<number>();
    for (const p of pairs) {
      if (usedA.has(p.a) || usedC.has(p.c)) continue;
      usedA.add(p.a);
      usedC.add(p.c);
      active[p.a].obs.push(cands[p.c]);
    }
    for (let c = 0; c < cands.length; c++) if (!usedC.has(c)) active.push({ obs: [cands[c]] });
  }
  return [...done, ...active].filter((t) => t.obs.length >= 3);
}

export type TrackSummary = {
  track: Track;
  n: number;
  t0: number;
  t1: number;
  /** Average velocity, px/s. */
  vx: number;
  vy: number;
  speed: number;
  /** Straight-line distance from first to last sighting, in ball widths. */
  travel: number;
  /** Quadratic-fit residual relative to ball width (smooth flight is small). */
  roughness: number;
  dAvg: number;
};

export function summarize(track: Track): TrackSummary {
  const o = track.obs;
  const t0 = o[0].t;
  const ts = o.map((p) => (p.t - t0) / 1000);
  const dAvg = o.reduce((s, p) => s + p.d, 0) / o.length;
  const lin = (vals: number[]) => {
    const n = vals.length;
    const mt = ts.reduce((s, v) => s + v, 0) / n;
    const mv = vals.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (ts[i] - mt) * (vals[i] - mv);
      den += (ts[i] - mt) ** 2;
    }
    return den > 0 ? num / den : 0;
  };
  const vx = lin(o.map((p) => p.x));
  const vy = lin(o.map((p) => p.y));
  let rough = 0;
  if (o.length >= 4) {
    rough = (quadResidual(ts, o.map((p) => p.x)) + quadResidual(ts, o.map((p) => p.y))) / Math.max(1, dAvg);
  }
  const travel = Math.hypot(o[o.length - 1].x - o[0].x, o[o.length - 1].y - o[0].y) / Math.max(1, dAvg);
  return { track, n: o.length, t0, t1: o[o.length - 1].t, vx, vy, speed: Math.hypot(vx, vy), travel, roughness: rough, dAvg };
}

function quadResidual(ts: number[], ys: number[]): number {
  // RMS residual of a quadratic fit, via normal equations.
  const n = ts.length;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const t = ts[i];
    const t2 = t * t;
    s0 += 1; s1 += t; s2 += t2; s3 += t2 * t; s4 += t2 * t2;
    b0 += ys[i]; b1 += t * ys[i]; b2 += t2 * ys[i];
  }
  const M = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]];
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-18) return 0;
  const col = (k: number) => M.map((r, i) => r.map((v, j) => (j === k ? [b0, b1, b2][i] : v)));
  const c = [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - (c[0] + c[1] * ts[i] + c[2] * ts[i] * ts[i])) ** 2;
  return Math.sqrt(ss / n);
}

export type Hit = {
  pitch: BallObs[] | null;
  batted: BallObs[] | null;
  /** Bat-ball contact, from where the two tracks meet. Time in real ms. */
  contact: { t: number; x: number; y: number } | null;
};

/**
 * Picks the pitch and the batted ball: two smooth tracks, the second leaving faster in the opposite direction from
 * where the first was heading, meeting at one point. `hintT` (real ms) is when body tracking thinks contact was.
 */
/** The same track without sightings that don't fit it (ball merged with the bat for a frame, etc.). */
export function cleanObs(track: Track): Track {
  if (track.obs.length < 5) return track;
  const pts = track.obs.map((o) => ({ t: o.t / 1000, x: o.x, y: o.y, d: o.d, o }));
  const kept = cleanTrack(pts, track.obs.length >= 8 ? 2 : 1) as typeof pts;
  return { obs: kept.map((k) => k.o) };
}

export function findHit(tracks: Track[], hintT: number | null): Hit {
  const sums = tracks.map((t) => summarize(cleanObs(t))).filter((s) => s.n < 4 || s.roughness < 0.35);
  let best: { score: number; hit: Hit } | null = null;
  const pitches = sums.filter(isPitch);
  const outs = sums.filter((s) => s.travel >= 2.5);
  for (const p of pitches) {
    for (const b of outs) {
      if (b === p) continue;
      if (Math.abs(b.track.obs[0].d - p.dAvg) > 0.45 * p.dAvg) continue;
      const gap = b.t0 - p.t1;
      if (gap < 0 || gap > 45) continue;
      if (p.vx * b.vx >= 0 && Math.abs(p.vx) > 0.2 * p.speed) continue;
      if (b.speed < p.speed) continue;
      // Where do they meet? Pitch extrapolated forward along its arc, batted ball back in a line.
      const pl = p.track.obs[p.n - 1];
      const bf = b.track.obs[0];
      const arc = fitPitch(p.track.obs.map((o) => ({ t: o.t / 1000, x: o.x, y: o.y, d: o.d })));
      const pitchAt = (t: number) =>
        arc ? arc.at(t / 1000) : { x: pl.x + (p.vx * (t - pl.t)) / 1000, y: pl.y + (p.vy * (t - pl.t)) / 1000 };
      let bestD = Infinity;
      let bestT = pl.t;
      for (let t = pl.t; t <= bf.t; t += Math.max(0.25, (bf.t - pl.t) / 20)) {
        const { x: px, y: py } = pitchAt(t);
        const bx = bf.x + (b.vx * (t - bf.t)) / 1000;
        const by = bf.y + (b.vy * (t - bf.t)) / 1000;
        const d = Math.hypot(px - bx, py - by);
        if (d < bestD) {
          bestD = d;
          bestT = t;
        }
      }
      const dScale = (p.dAvg + b.dAvg) / 2;
      if (bestD > 2.5 * dScale) continue;
      const near = hintT === null ? 0 : Math.abs(bestT - hintT) / 60;
      const score = p.n + b.n - near - bestD / dScale;
      if (!best || score > best.score) {
        const { x: cx, y: cy } = pitchAt(bestT);
        best = { score, hit: { pitch: p.track.obs, batted: b.track.obs, contact: { t: bestT, x: cx, y: cy } } };
      }
    }
  }
  if (best) return best.hit;
  // No pairing: a lone pitch (swing and miss, or the batted ball left the frame at once).
  const lone = pitches
    .filter((p) => hintT === null || Math.abs(p.t1 - hintT) < 200)
    .sort((a, b) => b.n - a.n)[0];
  return { pitch: lone ? lone.track.obs : null, batted: null, contact: null };
}

/** A pitch actually travels (several ball widths) and is coming down. */
function isPitch(s: TrackSummary): boolean {
  return s.n >= 6 && s.travel >= 4 && s.vy > 0 && s.roughness < 0.35;
}

/** The best pitch-like track anywhere in these frames (for checking the slow-motion setting). */
export function longestSmoothTrack(tracks: Track[], minN = 8): BallObs[] | null {
  const s = tracks
    .map(summarize)
    .filter((t) => t.n >= minN && t.roughness < 0.3 && isPitch(t))
    .sort((a, b) => b.n - a.n)[0];
  return s ? s.track.obs : null;
}
