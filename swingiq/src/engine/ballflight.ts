// Ball-flight physics for slow-motion video: turns tracked ball and barrel positions (pixels, seconds) into real
// speeds, with an honest error band. No browser APIs, so it is unit-tested directly.
//
// The key problem with one camera is scale: how many pixels is a foot, at the depth where the ball is? Two
// independent rulers are used and combined:
//  1. Gravity. A slow-pitch pitch is in free flight on a big arc, so its downward acceleration in pixels/s² is
//     g (32.17 ft/s²) times the pixels-per-foot at the pitch's depth, which is right over the plate where contact
//     happens. Air drag is modeled; unknown spin is carried in the error band.
//  2. The ball itself. A 12" softball is 3.82" across, so its width in pixels is a ruler at whatever depth it is.
// The batted ball's change in size frame to frame gives its motion toward or away from the camera, so pulled and
// opposite-field hits aren't undercounted.

export const G_FT_S2 = 32.174;
export const FT_S_TO_MPH = 3600 / 5280;

/** One tracked ball sighting. t in seconds (real time), x/y in pixels (y down), d = apparent diameter in pixels. */
export type TrackPoint = { t: number; x: number; y: number; d: number };

/** px per foot at a given depth, with a relative 1-sigma uncertainty (0.04 = ±4%). */
export type Scale = { pxPerFt: number; rel: number; source: string };

export type Camera = {
  /** Principal point (image center), pixels. */
  cx: number;
  cy: number;
  /** Focal length in pixels. Phones don't report it to a web page, so it is assumed from a typical field of view. */
  fPx: number;
  /** Relative uncertainty of fPx. */
  fRel: number;
};

export type Ball = { diamIn: number; massKg: number; cd: number };
export const SOFTBALL_12: Ball = { diamIn: 3.82, massKg: 0.184, cd: 0.45 };
export const SOFTBALL_11: Ball = { diamIn: 3.5, massKg: 0.17, cd: 0.45 };

/** A phone's main camera in video mode covers roughly 60–70° across. */
export function assumedCamera(width: number, height: number, hfovDeg = 65): Camera {
  return { cx: width / 2, cy: height / 2, fPx: width / 2 / Math.tan(((hfovDeg / 2) * Math.PI) / 180), fRel: 0.12 };
}

// ---------------------------------------------------------------- least squares

export type PolyFit = {
  /** Value, slope and curvature at t0: y ≈ c0 + c1·(t − t0) + c2·(t − t0)². */
  c0: number;
  c1: number;
  c2: number;
  /** Standard errors of the coefficients. */
  se0: number;
  se1: number;
  se2: number;
  rms: number;
  n: number;
};

/** Least-squares polynomial fit (degree 1 or 2) around t0, with standard errors from the residuals. */
export function polyFit(ts: number[], ys: number[], degree: 1 | 2, t0 = 0): PolyFit | null {
  const n = ts.length;
  const k = degree + 1;
  if (n < k + 1) return null;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const dt = ts[i] - t0;
    const row = degree === 2 ? [1, dt, dt * dt] : [1, dt];
    for (let r = 0; r < k; r++) {
      b[r] += row[r] * ys[i];
      for (let c = 0; c < k; c++) A[r][c] += row[r] * row[c];
    }
  }
  const inv = invert(A);
  if (!inv) return null;
  const coef = inv.map((r) => r.reduce((s, v, j) => s + v * b[j], 0));
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const dt = ts[i] - t0;
    const fit = coef[0] + coef[1] * dt + (degree === 2 ? coef[2] * dt * dt : 0);
    ss += (ys[i] - fit) ** 2;
  }
  const sigma2 = ss / Math.max(1, n - k);
  const se = inv.map((r, i) => Math.sqrt(Math.max(0, r[i] * sigma2)));
  return {
    c0: coef[0],
    c1: coef[1],
    c2: degree === 2 ? coef[2] : 0,
    se0: se[0],
    se1: se[1],
    se2: degree === 2 ? se[2] : 0,
    rms: Math.sqrt(ss / n),
    n,
  };
}

function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((r) => r.slice(n));
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------- the pitch

export type PitchFit = {
  n: number;
  t0: number;
  t1: number;
  /** Velocity at the last sighting, px/s. */
  vx: number;
  vy: number;
  /** Velocity at the middle of the track, px/s. */
  vxMid: number;
  vyMid: number;
  /** Acceleration, px/s². Positive ay = falling (image y points down). */
  ax: number;
  ay: number;
  seAy: number;
  /** Fit residual, pixels. */
  rmsPx: number;
  /** Median apparent diameter, pixels. */
  dMed: number;
  ds: number[];
  /** Where the fit puts the ball at time t. */
  at: (t: number) => { x: number; y: number };
};

/**
 * Drops sightings that don't belong: a size far off the track's typical size (the ball merged with the bat or a
 * shadow), then points far off a smooth curve.
 */
export function cleanTrack(pts: TrackPoint[], degree: 1 | 2): TrackPoint[] {
  const dMed = median(pts.map((p) => p.d).filter((d) => d > 0));
  let keep = dMed > 0 ? pts.filter((p) => !(p.d > 0) || Math.abs(p.d - dMed) <= 0.25 * dMed + 1) : [...pts];
  for (let iter = 0; iter < 3 && keep.length > degree + 4; iter++) {
    const ts = keep.map((p) => p.t);
    const t1 = ts[ts.length - 1];
    const fx = polyFit(ts, keep.map((p) => p.x), degree, t1);
    const fy = polyFit(ts, keep.map((p) => p.y), degree, t1);
    if (!fx || !fy) break;
    const res = keep.map((p) => {
      const dt = p.t - t1;
      return Math.hypot(p.x - (fx.c0 + fx.c1 * dt + fx.c2 * dt * dt), p.y - (fy.c0 + fy.c1 * dt + fy.c2 * dt * dt));
    });
    const sigma = Math.max(0.75, 1.4826 * median(res));
    let worst = -1;
    for (let i = 0; i < res.length; i++) if (res[i] > 4 * sigma && (worst < 0 || res[i] > res[worst])) worst = i;
    if (worst < 0) break;
    keep = keep.filter((_, i) => i !== worst);
  }
  return keep;
}

/** Fits a free-flight arc to the incoming pitch. Needs enough frames over enough time to see the curve. */
export function fitPitch(raw: TrackPoint[]): PitchFit | null {
  if (raw.length < 6) return null;
  const pts = cleanTrack(raw, 2);
  if (pts.length < 6) return null;
  const ts = pts.map((p) => p.t);
  const t0 = ts[0];
  const t1 = ts[ts.length - 1];
  if (t1 - t0 < 0.025) return null;
  const fx = polyFit(ts, pts.map((p) => p.x), 2, t1);
  const fy = polyFit(ts, pts.map((p) => p.y), 2, t1);
  if (!fx || !fy) return null;
  const tm = (t0 + t1) / 2 - t1;
  const ds = pts.map((p) => p.d).filter((d) => d > 0);
  return {
    n: pts.length,
    t0,
    t1,
    vx: fx.c1,
    vy: fy.c1,
    vxMid: fx.c1 + 2 * fx.c2 * tm,
    vyMid: fy.c1 + 2 * fy.c2 * tm,
    ax: 2 * fx.c2,
    ay: 2 * fy.c2,
    seAy: 2 * fy.se2,
    rmsPx: Math.hypot(fx.rms, fy.rms),
    dMed: median(ds),
    ds,
    at: (t) => {
      const dt = t - t1;
      return { x: fx.c0 + fx.c1 * dt + fx.c2 * dt * dt, y: fy.c0 + fy.c1 * dt + fy.c2 * dt * dt };
    },
  };
}

/** Air drag constant k (1/ft) so that drag deceleration = k·v² with v in ft/s. */
export function dragK(ball: Ball): number {
  const r = (ball.diamIn * 0.0254) / 2;
  const kM = (1.2 * ball.cd * Math.PI * r * r) / (2 * ball.massKg);
  return kM * 0.3048;
}

/** Pixels per foot over the plate, from the pitch's fall. */
export function gravityScale(p: PitchFit, ball: Ball): Scale | null {
  if (!(p.ay > 0) || p.n < 8) return null;
  const k = dragK(ball);
  const vPx = Math.hypot(p.vxMid, p.vyMid);
  const sinT = vPx > 0 ? p.vyMid / vPx : 0; // > 0 while the ball is coming down
  let s = p.ay / G_FT_S2;
  let drag = 0;
  for (let i = 0; i < 5; i++) {
    const vFt = vPx / s;
    drag = k * vFt * vFt;
    s = p.ay / (G_FT_S2 - drag * sinT);
  }
  const fitRel = p.seAy / p.ay;
  // Unknown spin (backspin floats, topspin drops) is the biggest unknown: about ±5% of g. Drag coefficient ±25%.
  const rel = Math.sqrt(fitRel * fitRel + 0.05 * 0.05 + ((0.25 * drag * Math.abs(sinT)) / G_FT_S2) ** 2);
  if (!Number.isFinite(s) || s <= 0 || fitRel > 0.4) return null;
  return { pxPerFt: s, rel, source: "gravity" };
}

/** Pixels per foot at the ball's depth, from the ball's own width. */
export function ballSizeScale(ds: number[], ball: Ball): Scale | null {
  const good = ds.filter((d) => d > 0);
  if (good.length < 3) return null;
  const med = median(good);
  const mad = median(good.map((d) => Math.abs(d - med))) * 1.4826;
  if (!(med > 3)) return null;
  // Edge blur and thresholding can shift the measured width by up to about a pixel.
  const rel = Math.sqrt((mad / Math.sqrt(good.length) / med) ** 2 + (0.9 / med) ** 2 + 0.025 ** 2);
  return { pxPerFt: med / (ball.diamIn / 12), rel, source: "ball size" };
}

/** Inverse-variance blend of independent rulers. If they disagree, the band widens. */
export function combineScales(list: (Scale | null)[]): (Scale & { agree: boolean; parts: Scale[] }) | null {
  const ss = list.filter((s): s is Scale => !!s && s.pxPerFt > 0 && s.rel > 0);
  if (!ss.length) return null;
  let wSum = 0;
  let m = 0;
  for (const s of ss) {
    const w = 1 / (s.rel * s.rel);
    wSum += w;
    m += w * Math.log(s.pxPerFt);
  }
  m /= wSum;
  let rel = 1 / Math.sqrt(wSum);
  let chi2 = 0;
  for (const s of ss) chi2 += (Math.log(s.pxPerFt) - m) ** 2 / (s.rel * s.rel);
  const agree = ss.length < 2 || chi2 < 6.6;
  if (ss.length > 1 && chi2 > ss.length - 1) rel *= Math.sqrt(chi2 / (ss.length - 1));
  return { pxPerFt: Math.exp(m), rel, source: ss.map((s) => s.source).join(" + "), agree, parts: ss };
}

/**
 * Was the slow-motion setting right? The pitch must fall at g. Measured with the ball as the ruler, a wrong time base
 * shows up as gravity off by the square of the error (8× slow-mo read as normal speed makes g look 64× too small).
 * Returns the factor to multiply the assumed slow-motion setting by (1 = it was right), or null if unsure.
 */
export function timeBaseCorrection(p: PitchFit, ballScale: Scale): number | null {
  // Only judge from a long, clean arc: a bad fit must never trigger a re-run.
  if (!(p.ay > 0) || p.n < 10 || p.seAy / p.ay > 0.2 || p.rmsPx > 0.25 * p.dMed + 1) return null;
  const gEst = p.ay / ballScale.pxPerFt;
  // Within 2.5× of real gravity, the setting is right (a wrong one is off by at least 4×).
  if (gEst > G_FT_S2 / 2.5 && gEst < G_FT_S2 * 2.5) return null;
  const r = Math.sqrt(G_FT_S2 / gEst);
  const options = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];
  let best = 1;
  let bestErr = Infinity;
  for (const o of options) {
    const e = Math.abs(Math.log(r / o));
    if (e < bestErr) {
      bestErr = e;
      best = o;
    }
  }
  return bestErr < Math.log(1.15) ? best : null;
}

export type PitchResult = { mph: number; pm: number; descentDeg: number };

/** Pitch speed and descent angle as it reaches the hitting zone. */
export function pitchMetrics(p: PitchFit, scale: Scale): PitchResult {
  const vPx = Math.hypot(p.vx, p.vy);
  const mph = (vPx / scale.pxPerFt) * FT_S_TO_MPH;
  return { mph, pm: mph * Math.max(scale.rel, 0.03), descentDeg: (Math.atan2(p.vy, Math.abs(p.vx)) * 180) / Math.PI };
}

// ---------------------------------------------------------------- the batted ball

export type BattedResult = {
  mph: number;
  /** ± (one standard deviation), mph. */
  pm: number;
  launchDeg: number;
  launchPm: number;
  /** Positive = moving away from the camera. From the side view that's the pull side. */
  sprayDeg: number;
  n: number;
  /** Whether the ball's change in size was used for motion toward/away from the camera. */
  depthUsed: boolean;
};

/**
 * Exit velocity and launch angle from the batted ball's first frames. `scale` and `dRef` describe the contact depth:
 * pixels per foot there and the ball's apparent width there. Depth changes come from the ball's width changing.
 */
export function exitVelocity(raw: TrackPoint[], scale: Scale, dRef: number, cam: Camera, tContact?: number, ball: Ball = SOFTBALL_12): BattedResult | null {
  const pts = raw.length >= 5 ? cleanTrack(raw, 1) : raw;
  if (pts.length < 3) return null;
  const t0 = pts[0].t;
  const ts = pts.map((p) => p.t - t0);
  // 1/width grows linearly with distance from the camera.
  let ratio: (t: number) => number = () => 1;
  let q1 = 0;
  let seQ1 = 0;
  let depthUsed = false;
  const withD = pts.filter((p) => p.d > 0);
  if (withD.length >= 4 && dRef > 0) {
    const fq = polyFit(
      withD.map((p) => p.t - t0),
      withD.map((p) => 1 / p.d),
      1,
      0,
    );
    if (fq && fq.c0 > 0) {
      const qMean = withD.reduce((s, p) => s + 1 / p.d, 0) / withD.length;
      // Trust it only if the widths are consistent (fit residual small next to the width itself).
      if (fq.rms / qMean < 0.12) {
        depthUsed = true;
        q1 = fq.c1;
        seQ1 = fq.se1;
        const q0 = fq.c0;
        ratio = (t) => dRef * (q0 + q1 * t);
      }
    }
  }
  const zC = cam.fPx / scale.pxPerFt; // feet from camera to the contact depth
  const X = pts.map((p, i) => ((p.x - cam.cx) / scale.pxPerFt) * ratio(ts[i]));
  const Y = pts.map((p, i) => ((p.y - cam.cy) / scale.pxPerFt) * ratio(ts[i]) - 0.5 * G_FT_S2 * ts[i] * ts[i]);
  const fx = polyFit(ts, X, 1);
  const fy = polyFit(ts, Y, 1);
  if (!fx || !fy) {
    // Exactly three points: no residuals to work with. Use end-to-end differences.
    if (pts.length !== 3) return null;
  }
  const span = ts[ts.length - 1] - ts[0];
  const vX = fx ? fx.c1 : (X[X.length - 1] - X[0]) / span;
  const vY = fy ? fy.c1 : (Y[Y.length - 1] - Y[0]) / span;
  const seX = fx ? fx.se1 : Math.abs(vX) * 0.05;
  const seY = fy ? fy.se1 : Math.abs(vY) * 0.05;
  // Motion toward/away from the camera comes from the ball's size changing, which is noisy over only a few frames.
  // Blend it with what's typical (most hits are within about 20° of straight across the picture) in proportion to
  // how sure it is, so a shaky size reading can't turn into a wild speed.
  let vZ = 0;
  let seZ = 0;
  if (depthUsed) {
    const raw = zC * dRef * q1;
    const seRaw = Math.hypot(raw * cam.fRel, zC * dRef * seQ1);
    const prior = 0.36 * Math.hypot(vX, vY);
    const w = (prior * prior) / (prior * prior + seRaw * seRaw);
    vZ = raw * w;
    seZ = Math.sqrt(w) * seRaw;
  }
  const vFit = Math.hypot(vX, vY, vZ);
  if (!(vFit > 0)) return null;
  // The fit is the average speed over the tracked frames; drag has already slowed the ball a little since contact.
  const tMid = t0 + (ts[0] + ts[ts.length - 1]) / 2;
  const since = tContact !== undefined ? Math.max(0, tMid - tContact) : 0;
  const v = vFit / Math.max(0.5, 1 - dragK(ball) * vFit * since);
  const vH = Math.hypot(vX, vZ);
  let var2 = (v * scale.rel) ** 2 + (vX * seX) ** 2 / (v * v) + (vY * seY) ** 2 / (v * v) + (vZ * seZ) ** 2 / (v * v);
  // Without the size cue, a ball hit 20° toward or away from the camera reads ~6% low: carry that in the band.
  if (!depthUsed) var2 += (v * 0.04) ** 2;
  const mph = v * FT_S_TO_MPH;
  const launch = Math.atan2(-vY, vH);
  const launchSe = Math.hypot(vH * seY, Math.abs(vY) * Math.hypot(seX, seZ)) / (v * v);
  return {
    mph,
    pm: Math.sqrt(var2) * FT_S_TO_MPH,
    launchDeg: (launch * 180) / Math.PI,
    launchPm: Math.max(1, (launchSe * 180) / Math.PI),
    sprayDeg: (Math.atan2(vZ, Math.abs(vX)) * 180) / Math.PI,
    n: pts.length,
    depthUsed,
  };
}

// ---------------------------------------------------------------- the bat

export type BatResult = { mph: number; pm: number; method: "collision" };

/**
 * Collision efficiency (eA) by bat certification. Batted-ball speed ≈ eA·pitch + (1 + eA)·bat speed for a sweet-spot
 * hit. A USA/ASA 98-mph bat with the lab's 25 + 85 mph test works out to eA ≈ 0.12; USSSA bats run hotter.
 */
export function collisionEfficiency(certification?: string): { eA: number; pm: number } {
  const c = (certification ?? "").toUpperCase();
  if (c.includes("USSSA")) return { eA: 0.17, pm: 0.04 };
  if (c.includes("SENIOR") || c.includes("SSUSA")) return { eA: 0.16, pm: 0.04 };
  if (c.includes("USA") || c.includes("ASA") || c.includes("ISA") || c.includes("NSA")) return { eA: 0.12, pm: 0.03 };
  return { eA: 0.14, pm: 0.05 };
}

/** Bat speed implied by exit velocity and pitch speed. Assumes a barrel hit, so it reads low on mishits. */
export function batSpeedFromCollision(evMph: number, evPm: number, pitchMph: number, eA: number, eAPm: number): BatResult {
  const mph = (evMph - eA * pitchMph) / (1 + eA);
  const dE = (pitchMph + evMph) / (1 + eA) ** 2;
  const pm = Math.hypot(evPm / (1 + eA), dE * eAPm);
  return { mph, pm, method: "collision" };
}
