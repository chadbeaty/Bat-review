// Bat speed engine: the physics half. Turns per-frame bat observations (battrack.ts) into the speed of the barrel's
// sweet spot. Separate from the exit-velocity engine on purpose: exit velo is a free projectile, bat speed is a rigid
// body rotating about moving hands.
//
// METRIC DEFINITION (keep this identical everywhere):
//   Bat speed = peak magnitude of the linear velocity of the point 6 inches from the barrel end ("sweet spot"),
//   over the frames from 100 ms before contact to 10 ms after it (or the 200 ms window around the fastest bat motion
//   when no contact was found). Also reported: the same quantity at contact.
//
// MODEL
//   The bat is rigid, of known length. Its handle end is held at the hands (body tracking), and through the last
//   ~150 ms before contact the barrel sweeps through a near-flat "swing plane". So in 3D:
//       tip(t)  = H(t) + Lh · ( cos ψ(t) e1 + sin ψ(t) e2 )
//       v_ss(t) = dH/dt + ω(t) · r_ss · ( -sin ψ e1 + cos ψ e2 )      (v_point = v_ref + ω × r)
//   with Lh the hands-to-tip length, r_ss = Lh − 6", ω = dψ/dt and (e1, e2) spanning the plane.
//   One camera sees each frame's bat as a 2D direction and length. Every frame shares the same plane, so the plane
//   (2 unknowns) and the camera distance (1 unknown, with a prior from the hitter's height) are fit across all frames
//   at once, then each frame gets its own ψ. This is what makes one camera enough: a bat pointing straight at the
//   lens is ambiguous on its own, but not once the plane is known from the frames around it.
//   The known bat length does double duty: it fixes the scale of ω·r (the term that dominates barrel speed) without
//   needing any other ruler.
//
// LIMITS (documented, not hidden)
//   - The plane assumption: real swings curve a little out of plane; carried as a 3% model error.
//   - A plane seen edge-on (camera level with a flat swing) can't be recovered: reported as unavailable with a fix.
//   - Hands depth is taken as constant over the window; their toward-camera speed is not measured.
//   - Mirror ambiguity (a plane and its reflection through the image plane look alike): both give the same speed in a
//     far-away camera, so the speed is unaffected; attack angle needs the phone's gravity sensor to resolve tilt.

import { localPoly } from "./localpoly";
import type { BatObs } from "./battrack";

export type BatCamera = { cx: number; cy: number; fPx: number; fRel: number };

export type BatSpeedInput = {
  obs: BatObs[];
  cam: BatCamera;
  /** Pixels per inch at the hitter (tracker pixels), from body tracking and height. null = fit from the bat alone. */
  pxPerIn: number | null;
  /** Relative uncertainty of pxPerIn. */
  pxPerInRel?: number;
  batLengthIn: number;
  /** Distance from the knob end to the middle of the hands, inches. */
  gripIn?: number;
  /** Sweet spot measured this far from the barrel end, inches. */
  sweetSpotFromTipIn?: number;
  /** Contact time (real ms), from the ball, the microphone or body tracking. */
  contactT?: number | null;
  /** Gravity direction in camera coordinates (x right, y down, z forward), from the phone's motion sensor. */
  gravity?: { x: number; y: number; z: number } | null;
};

export type BatSpeedOk = {
  ok: true;
  /** Peak sweet-spot speed, mph, and its ± (one standard deviation). */
  peakMph: number;
  pm: number;
  peakT: number;
  /** Sweet-spot speed at contact, when contact time is known. */
  atContactMph: number | null;
  /** Attack angle at contact (degrees, + = upward), only with a gravity reference. */
  attackDeg: number | null;
  /** Angle between the swing plane and the camera's view: near 0 = edge-on (bad), 90 = face-on. */
  planeViewDeg: number;
  residualPx: number;
  n: number;
  /** Fitted camera-to-hands distance, inches. */
  depthIn: number;
  scaleFrom: "body+bat" | "bat";
  confidence: number;
  series: { t: number; mph: number }[];
  /** Barrel tip and sweet spot in tracker pixels per frame, for the replay overlay. */
  path: { t: number; hx: number; hy: number; tx: number; ty: number; sx: number; sy: number }[];
};

export type BatSpeedFail = { ok: false; code: "few_frames" | "edge_on" | "poor_fit" | "implausible"; reason: string };
export type BatSpeedResult = BatSpeedOk | BatSpeedFail;

type V3 = [number, number, number];

const IN_S_PER_MPH = 17.6;

export function analyzeBatSpeed(input: BatSpeedInput): BatSpeedResult {
  const grip = input.gripIn ?? 4.5;
  const ssFromTip = input.sweetSpotFromTipIn ?? 6;
  const Lh = input.batLengthIn - grip;
  const rSS = Lh - ssFromTip;
  const cam = input.cam;

  // 1. Pick each frame's bat (the candidate that moves smoothly), then the window.
  let obs = selectTrack(input.obs).filter((o) => o.conf >= 0.2);
  if (obs.length < 10) return fail("few_frames", "The bat wasn't clear in enough frames. Film in brighter light with the whole bat in the picture.");
  let center = input.contactT ?? null;
  if (center === null) {
    // Fastest barrel-end motion in the picture.
    let best = -1;
    for (let i = 1; i < obs.length; i++) {
      const a = tipPx(obs[i - 1]);
      const b = tipPx(obs[i]);
      const v = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.5, obs[i].t - obs[i - 1].t);
      if (v > best) {
        best = v;
        center = obs[i].t;
      }
    }
  }
  const c = center as number;
  obs = obs.filter((o) => o.t >= c - 170 && o.t <= c + 25);
  if (obs.length < 10 || obs[obs.length - 1].t - obs[0].t < 50) {
    return fail("few_frames", "The bat was only clear for a few frames around contact. Film at 120 or 240 fps with the hitter fully in the shot.");
  }

  // 2. Camera distance prior.
  const Zprior = input.pxPerIn ? cam.fPx / input.pxPerIn : cam.fPx / (quantile(obs.map((o) => o.len), 0.9) / Lh);
  const priorRel = input.pxPerIn ? Math.max(0.03, input.pxPerInRel ?? 0.06) : 0.25;

  // 3. Fit plane (and distance) by search.
  const normals = hemisphere(320);
  type Cand = { cost: number; n: V3; Z: number };
  let best: Cand | null = null;
  const zMults = input.pxPerIn ? [0.88, 1, 1.13] : [0.6, 0.75, 0.9, 1.05, 1.25, 1.45];
  for (const zm of zMults) {
    const Z = Zprior * zm;
    const prior = (Math.log(zm) / priorRel) ** 2 * obs.length * 0.5;
    for (const n of normals) {
      const cost = planeCost(obs, cam, Z, Lh, n).cost + prior;
      if (!best || cost < best.cost) best = { cost, n, Z };
    }
  }
  // Local refinement of the normal and the distance.
  let step = 0.08;
  for (let round = 0; round < 5; round++) {
    const b0: Cand = best!;
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        for (const zm of [0.97, 1, 1.03]) {
          const n = perturb(b0.n, i * step, j * step);
          const Z = b0.Z * (round < 2 ? zm : 1 + (zm - 1) / 3);
          const prior = (Math.log(Z / Zprior) / priorRel) ** 2 * obs.length * 0.5;
          const cost = planeCost(obs, cam, Z, Lh, n).cost + prior;
          if (cost < best!.cost) best = { cost, n, Z };
        }
      }
    }
    step /= 2.5;
  }
  const fit = planeCost(obs, cam, best!.Z, Lh, best!.n);
  // Drop frames that disagree badly with the plane (tracking slips), then refit ψ only.
  const errs = fit.err;
  const medErr = quantile(errs, 0.5);
  const keep = obs.map((_, i) => errs[i] <= Math.max(4, medErr * 3.5));
  const obsK = obs.filter((_, i) => keep[i]);
  const psiK = fit.psi.filter((_, i) => keep[i]);
  if (obsK.length < 10) return fail("poor_fit", "The bat's position jumped around between frames. Keep other moving things out of the picture behind the hitter.");
  const residualPx = Math.sqrt(errs.filter((_, i) => keep[i]).reduce((s, e) => s + e * e, 0) / obsK.length);
  const Lpx = (cam.fPx * Lh) / best!.Z;
  if (residualPx > Math.max(6, 0.08 * Lpx)) {
    return fail("poor_fit", "The bat's motion didn't fit a clean swing. Make sure only one hitter is in the shot and the phone is still.");
  }

  // 4. Is the plane seen well enough?
  const { e1, e2 } = basis(best!.n);
  const planeViewDeg = (Math.asin(Math.min(1, Math.abs(best!.n[2]))) * 180) / Math.PI; // n·view axis: 90° = face-on
  const sv = singular2(e1[0], e2[0], e1[1], e2[1]);
  if (sv.min / sv.max < 0.14) {
    return fail(
      "edge_on",
      "From here the camera sees the swing edge-on, so the barrel's path can't be untangled. Raise the phone to chest height and tilt it slightly down, or move it a few steps toward the pitcher.",
    );
  }

  // 5. Smooth ψ(t) and the hands, differentiate.
  const ts = obsK.map((o) => o.t / 1000);
  const psi = unwrap(psiK);
  const dtMed = quantile(ts.slice(1).map((t, i) => t - ts[i]), 0.5);
  const fps = 1 / Math.max(1e-4, dtMed);
  const wts = obsK.map((o) => 0.3 + o.conf);
  const fPsi = localPoly(ts, psi, Math.max(0.011, 3.6 / fps), 3, wts);
  const Z = best!.Z;
  const HX = obsK.map((o) => ((o.hx - cam.cx) * Z) / cam.fPx);
  const HY = obsK.map((o) => ((o.hy - cam.cy) * Z) / cam.fPx);
  const fHx = localPoly(ts, HX, Math.max(0.022, 6 / fps), 2);
  const fHy = localPoly(ts, HY, Math.max(0.022, 6 / fps), 2);

  const series: { t: number; mph: number; v: V3; vh: number; omegaSe: number }[] = [];
  const path: BatSpeedOk["path"] = [];
  for (let i = 0; i < ts.length; i++) {
    const w = fPsi.dy[i];
    const p = fPsi.y[i];
    if (!Number.isFinite(w) || !Number.isFinite(p)) continue;
    const tang: V3 = add(scale(e1, -Math.sin(p)), scale(e2, Math.cos(p)));
    const vH: V3 = [fHx.dy[i] || 0, fHy.dy[i] || 0, 0];
    const v = add(vH, scale(tang, w * rSS));
    const sp = norm(v);
    series.push({ t: obsK[i].t, mph: sp / IN_S_PER_MPH, v, vh: Math.abs(dot(vH, v)) / Math.max(1e-6, sp), omegaSe: fPsi.dySe[i] || 0 });
    const u: V3 = add(scale(e1, Math.cos(p)), scale(e2, Math.sin(p)));
    const Hc: V3 = [fHx.y[i], fHy.y[i], Z];
    const tip = project(add(Hc, scale(u, Lh)), cam);
    const ss = project(add(Hc, scale(u, rSS)), cam);
    const hp = project(Hc, cam);
    path.push({ t: obsK[i].t, hx: hp.x, hy: hp.y, tx: tip.x, ty: tip.y, sx: ss.x, sy: ss.y });
  }
  if (series.length < 8) return fail("few_frames", "Not enough clean frames of the bat to measure its speed.");

  // 6. Peak in the definition window, ignoring the first and last two samples (fits are weakest at the edges).
  const tc = input.contactT ?? null;
  const lo = tc !== null ? tc - 100 : c - 100;
  const hi = tc !== null ? tc + 10 : c + 100;
  const inner = series.slice(2, -2).filter((s) => s.t >= lo && s.t <= hi);
  if (!inner.length) return fail("few_frames", "The bat wasn't tracked through the moment of contact.");
  let pk = inner[0];
  for (const s of inner) if (s.mph > pk.mph) pk = s;
  let atContact: number | null = null;
  let vAtContact: V3 | null = null;
  if (tc !== null) {
    const k = series.findIndex((s) => s.t >= tc);
    if (k > 0) {
      const a = series[k - 1];
      const b = series[k];
      const u = (tc - a.t) / Math.max(0.01, b.t - a.t);
      atContact = a.mph + (b.mph - a.mph) * u;
      vAtContact = add(scale(a.v, 1 - u), scale(b.v, u));
    }
  }

  if (pk.mph < 25 || pk.mph > 115) return fail("implausible", "The bat speed came out outside any real swing's range, so it was held back.");

  // 7. Uncertainty (about one standard deviation).
  const medFanDeg = (quantile(obsK.map((o) => o.fan), 0.5) * 180) / Math.PI;
  const scaleRel = input.pxPerIn ? priorRel : 0.12;
  const pmMph =
    Math.hypot(
      (pk.vh * scaleRel) / IN_S_PER_MPH, // the hands term scales with distance; ω·r doesn't (bat length is known)
      (pk.omegaSe * rSS) / IN_S_PER_MPH,
      pk.mph * 0.03, // out-of-plane motion
      pk.mph * cam.fRel * 0.15, // perspective error from an assumed lens
      (residualPx / Lpx) * pk.mph * 0.5,
      // Lower frame rates and heavy blur flatten the peak (the smoother can't follow it as closely).
      pk.mph * 0.03 * (240 / fps) ** 2 * (1 + Math.max(0, medFanDeg - 10) / 15),
    );

  // Same rule as exit velo: a reading whose ± is more than 15% of itself isn't shown.
  if (pmMph > 0.15 * pk.mph) {
    return fail(
      "poor_fit",
      "The bat wasn't tracked cleanly enough for a trustworthy speed. Film from the side at 240 fps in good light, with the whole bat in the picture.",
    );
  }

  let attackDeg: number | null = null;
  if (input.gravity && vAtContact) {
    const g = input.gravity;
    const gn = Math.hypot(g.x, g.y, g.z) || 1;
    const up = -dot(vAtContact, [g.x / gn, g.y / gn, g.z / gn]) / Math.max(1e-6, norm(vAtContact));
    attackDeg = (Math.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI;
  }

  const confidence = Math.max(
    0.15,
    Math.min(0.85, 1 - (pmMph / pk.mph) * 5) * Math.min(1, (sv.min / sv.max) / 0.3) * Math.min(1, obsK.length / 24),
  );
  return {
    ok: true,
    peakMph: pk.mph,
    pm: pmMph,
    peakT: pk.t,
    atContactMph: atContact,
    attackDeg,
    planeViewDeg,
    residualPx,
    n: obsK.length,
    depthIn: Z,
    scaleFrom: input.pxPerIn ? "body+bat" : "bat",
    confidence,
    series: series.map((s) => ({ t: s.t, mph: s.mph })),
    path,
  };
}

/**
 * Each frame can offer a few bat-like directions. The bat rotates smoothly (at most ~5,000°/s even for the fastest
 * swings), so pick one candidate per frame by dynamic programming: favor confident candidates, penalize jumps in
 * direction and length between neighboring frames.
 */
export function selectTrack(raw: BatObs[]): BatObs[] {
  const obs = [...raw].sort((a, b) => a.t - b.t);
  if (obs.length < 2) return obs;
  const opts = obs.map((o) => [{ phi: o.phi, len: o.len, fan: o.fan, conf: o.conf }, ...(o.alts ?? [])]);
  const cost: number[][] = [];
  const back: number[][] = [];
  const emit = (c: { conf: number }) => -2 * Math.log(Math.max(0.05, c.conf));
  cost.push(opts[0].map(emit));
  back.push(opts[0].map(() => -1));
  for (let i = 1; i < obs.length; i++) {
    const dt = Math.max(0.5, obs[i].t - obs[i - 1].t);
    const row: number[] = [];
    const brow: number[] = [];
    for (const c of opts[i]) {
      let best = Infinity;
      let arg = 0;
      opts[i - 1].forEach((p, j) => {
        const dphi = Math.abs(Math.atan2(Math.sin(c.phi - p.phi), Math.cos(c.phi - p.phi)));
        const rate = dphi / (dt / 1000); // rad/s
        const jump = rate > 90 ? 50 : (rate / 45) ** 2; // 45 rad/s ≈ 2,600°/s is an ordinary fast swing
        const dl = Math.abs(Math.log(c.len / p.len)) / (0.004 * dt + 0.08);
        const v = cost[i - 1][j] + jump + dl * dl * 0.5;
        if (v < best) {
          best = v;
          arg = j;
        }
      });
      row.push(best + emit(c));
      brow.push(arg);
    }
    cost.push(row);
    back.push(brow);
  }
  let k = cost[cost.length - 1].indexOf(Math.min(...cost[cost.length - 1]));
  const out: BatObs[] = new Array(obs.length);
  for (let i = obs.length - 1; i >= 0; i--) {
    const c = opts[i][k];
    out[i] = { ...obs[i], phi: c.phi, len: c.len, fan: c.fan, conf: c.conf, alts: undefined };
    k = back[i][k];
  }
  return out;
}

function fail(code: BatSpeedFail["code"], reason: string): BatSpeedFail {
  return { ok: false, code, reason };
}

function tipPx(o: BatObs) {
  return { x: o.hx + o.len * Math.cos(o.phi), y: o.hy + o.len * Math.sin(o.phi) };
}

/** Sum of robust per-frame errors for a plane, solving each frame's ψ. */
function planeCost(obs: BatObs[], cam: BatCamera, Z: number, Lh: number, n: V3): { cost: number; psi: number[]; err: number[] } {
  const { e1, e2 } = basis(n);
  const psi: number[] = [];
  const err: number[] = [];
  let cost = 0;
  for (const o of obs) {
    const Hc: V3 = [((o.hx - cam.cx) * Z) / cam.fPx, ((o.hy - cam.cy) * Z) / cam.fPx, Z];
    const e = (p: number) => frameErr(o, Hc, e1, e2, p, Lh, cam);
    let bp = 0;
    let be = Infinity;
    for (let k = 0; k < 24; k++) {
      const p = (k * Math.PI) / 12;
      const v = e(p);
      if (v < be) {
        be = v;
        bp = p;
      }
    }
    let h = Math.PI / 24;
    for (let r = 0; r < 7; r++) {
      const a = e(bp - h);
      const b = e(bp + h);
      if (a < be) {
        be = a;
        bp -= h;
      } else if (b < be) {
        be = b;
        bp += h;
      }
      h /= 2;
    }
    const ePx = Math.sqrt(be);
    psi.push(bp);
    err.push(ePx);
    const d = 4; // Huber threshold, pixels
    cost += (ePx <= d ? ePx * ePx : 2 * d * ePx - d * d) * (0.3 + o.conf);
  }
  return { cost, psi, err };
}

/** Squared pixel error between the observed bat (direction + length from the hands) and the model's. */
function frameErr(o: BatObs, Hc: V3, e1: V3, e2: V3, p: number, Lh: number, cam: BatCamera): number {
  const c = Math.cos(p);
  const s = Math.sin(p);
  const tip: V3 = [Hc[0] + Lh * (c * e1[0] + s * e2[0]), Hc[1] + Lh * (c * e1[1] + s * e2[1]), Hc[2] + Lh * (c * e1[2] + s * e2[2])];
  if (tip[2] < Hc[2] * 0.3) return 1e9;
  const tx = cam.cx + (cam.fPx * tip[0]) / tip[2];
  const ty = cam.cy + (cam.fPx * tip[1]) / tip[2];
  const mx = tx - o.hx;
  const my = ty - o.hy;
  const mLen = Math.hypot(mx, my);
  const mPhi = Math.atan2(my, mx);
  let dphi = mPhi - o.phi;
  dphi = Math.atan2(Math.sin(dphi), Math.cos(dphi));
  // Direction is measured far better than length (the barrel end blurs and fades): weight it more.
  const lat = Math.sin(dphi) * Math.max(o.len, mLen);
  const along = (Math.cos(dphi) * mLen - o.len) * 0.6;
  return lat * lat + along * along;
}

function project(p: V3, cam: BatCamera) {
  return { x: cam.cx + (cam.fPx * p[0]) / p[2], y: cam.cy + (cam.fPx * p[1]) / p[2] };
}

function basis(n: V3): { e1: V3; e2: V3 } {
  const a: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = normalize(cross(a, n));
  const e2 = cross(n, e1);
  return { e1, e2 };
}

/** Roughly even unit normals over a hemisphere (Fibonacci spiral). */
function hemisphere(count: number): V3[] {
  const out: V3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const z = 1 - (i + 0.5) / count; // 1 → 0
    const r = Math.sqrt(1 - z * z);
    const th = ga * i;
    out.push([r * Math.cos(th), r * Math.sin(th), z]);
  }
  return out;
}

function perturb(n: V3, a: number, b: number): V3 {
  const { e1, e2 } = basis(n);
  return normalize(add(n, add(scale(e1, a), scale(e2, b))));
}

function singular2(a: number, b: number, c: number, d: number) {
  // Singular values of [[a, b], [c, d]].
  const s1 = a * a + b * b + c * c + d * d;
  const det = Math.abs(a * d - b * c);
  const t = Math.sqrt(Math.max(0, s1 * s1 - 4 * det * det));
  return { max: Math.sqrt((s1 + t) / 2), min: Math.sqrt(Math.max(0, (s1 - t) / 2)) };
}

function unwrap(a: number[]): number[] {
  const out = [a[0]];
  for (let i = 1; i < a.length; i++) {
    let d = a[i] - a[i - 1];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    out.push(out[i - 1] + d);
  }
  return out;
}

function quantile(xs: number[], q: number) {
  const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: V3): V3 => scale(a, 1 / (norm(a) || 1));
