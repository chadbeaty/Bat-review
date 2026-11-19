import { L, clamp, dist, median, sides, smoothSeries, type P2 } from "./geometry";
import type { CameraView, FrameGeometry, Handedness, Landmark, PoseFrame } from "./types";

/**
 * Legs and feet: the engine of a slow-pitch swing.
 *
 * What we measure here follows what a single phone can actually support (see docs/research_notes):
 * - Front-foot events (leg lift, toe tap, stride start, foot plant) are the most reliable lower-body signals: about
 *   one to two frames of timing error. They're shown as times.
 * - Stride length is shown relative to leg length (and in inches using the player's height), side view only.
 * - Front-knee "block" is shown as the CHANGE in knee angle from foot plant to contact, not as an absolute angle,
 *   because single-camera knee angles carry roughly 8–15° of error in fast movements.
 * - Back-heel release and stride direction are events/qualitative, gated on visibility.
 * - Hip rotation in degrees and any rotation speed are NOT shown: even two-phone 240 fps systems miss pelvis speed by
 *   ~150°/s. Hips are reported only as "started before / with / after the hands".
 */

export type FootEpisode = {
  start: number;
  end: number;
  /** Highest lift of the front foot, in leg lengths. */
  maxLift: number;
  /** Largest sideways travel of the front foot, in leg lengths. */
  travel: number;
  kind: "tap" | "lift" | "stride";
};

export type LowerBodyResult = {
  available: boolean;
  /** Why the lower body couldn't be read, when not available. */
  reason?: string;
  feetVisibility: number;
  legLenPx: number;
  episodes: FootEpisode[];
  /** "No stride", "Toe tap", "Leg lift", "Two taps" etc. */
  timingStyle: string;
  strideStart: number | null;
  footPlant: number | null;
  /** Foot plant was found after launch (still striding when the hands went). */
  lateFoot: boolean;
  /** Stride along the pitch line, leg lengths (side view only). */
  strideLegs: number | null;
  /** How far the front foot (heel/ankle) kept moving between plant and contact, leg lengths ("happy feet"). */
  footSlideLegs: number | null;
  /** Ankle-to-ankle distance in the stance and at foot plant, leg lengths (side view only). */
  stanceWidthLegs: number | null;
  plantWidthLegs: number | null;
  /** Front-foot sideways landing vs. stance (behind/front views): + toward the plate (closed), − away (open/bucket). Leg lengths. */
  strideOffsetLegs: number | null;
  leadKneePlant: number | null;
  leadKneeContact: number | null;
  /** How the knee angle source was chosen. */
  kneeMethod: "2d" | "3d" | null;
  /** Rear heel came up, ms relative to contact (− = before contact). */
  rearHeelUpRel: number | null;
  rearHeelVisible: boolean;
  /** Hip rotation onset relative to hand launch, ms (− = hips first). */
  hipOnsetRel: number | null;
};

type Pt = { x: number; y: number; v: number };

const V_MOVE = 0.9; // leg lengths/s: the front foot is clearly moving
const V_STILL = 0.45; // leg lengths/s: the front foot has stopped
const LIFT_MOVE = 0.05; // leg lengths above the ground line counts as lifted

function angle(a: P2, b: P2, c: P2): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (!d) return NaN;
  return (Math.acos(clamp((v1.x * v2.x + v1.y * v2.y) / d, -1, 1)) * 180) / Math.PI;
}

function angle3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const d = Math.hypot(...v1) * Math.hypot(...v2);
  if (!d) return NaN;
  return (Math.acos(clamp((v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / d, -1, 1)) * 180) / Math.PI;
}

function nearest(ts: number[], t: number) {
  let best = 0;
  for (let i = 1; i < ts.length; i++) if (Math.abs(ts[i] - t) < Math.abs(ts[best] - t)) best = i;
  return best;
}

export function analyzeLowerBody(
  frames: (PoseFrame & { lm: Landmark[] })[],
  ctx: { geom: FrameGeometry; hand: Handedness; view: CameraView; launch: number; contact: number; loadedT: number; finish: number; fwd: number },
): LowerBodyResult {
  const { geom: g, hand, view } = ctx;
  const s = sides(hand);
  const leadHeel = hand === "R" ? L.leftHeel : L.rightHeel;
  const leadToe = hand === "R" ? L.leftToe : L.rightToe;
  const rearHeel = hand === "R" ? L.rightHeel : L.leftHeel;
  const leadKneeIdx = hand === "R" ? L.leftKnee : L.rightKnee;
  const px = (p: Landmark): Pt => ({ x: p.x * g.width, y: p.y * g.height, v: p.v });

  const empty = (reason: string, feetVisibility = 0): LowerBodyResult => ({
    available: false,
    reason,
    feetVisibility,
    legLenPx: 0,
    episodes: [],
    timingStyle: "",
    strideStart: null,
    footPlant: null,
    lateFoot: false,
    strideLegs: null,
    footSlideLegs: null,
    stanceWidthLegs: null,
    plantWidthLegs: null,
    strideOffsetLegs: null,
    leadKneePlant: null,
    leadKneeContact: null,
    kneeMethod: null,
    rearHeelUpRel: null,
    rearHeelVisible: false,
    hipOnsetRel: null,
  });

  if (frames.length < 8) return empty("Not enough frames.");
  const feetVis =
    frames.reduce((a, f) => a + (f.lm[s.leadAnkle].v + f.lm[s.rearAnkle].v + f.lm[leadHeel].v + f.lm[leadToe].v) / 4, 0) / frames.length;
  if (feetVis < 0.5) return empty("Your feet weren't visible. Move the phone back so you're in the picture head to toe.", feetVis);

  const ts = frames.map((f) => f.t);
  // Front foot: heel and ankle together (the heel is what plants; the toes keep pivoting open during the swing).
  const footRaw = frames.map((f) => {
    const h = f.lm[leadHeel];
    const a = f.lm[s.leadAnkle];
    if (h.v >= 0.5) return { x: ((h.x + a.x) / 2) * g.width, y: ((h.y + a.y) / 2) * g.height };
    return { x: a.x * g.width, y: a.y * g.height };
  });
  const fx = smoothSeries(footRaw.map((p) => p.x), 1);
  const fy = smoothSeries(footRaw.map((p) => p.y), 1);

  // Leg length (hip→knee→ankle), robust to knee bend.
  const legLens = frames.map((f) => {
    const hip = px(f.lm[s.leadHip]);
    const knee = px(f.lm[leadKneeIdx]);
    const ank = px(f.lm[s.leadAnkle]);
    return dist(hip, knee) + dist(knee, ank);
  });
  const legLen = median(legLens);
  if (!(legLen > 10)) return empty("Couldn't measure your legs.", feetVis);

  // Stance baseline: before the earliest movement, up to 400 ms.
  const stanceEnd = Math.min(ctx.launch - 500, ts[0] + 400);
  const stanceIdx = ts.map((t, i) => (t <= Math.max(stanceEnd, ts[0] + 150) ? i : -1)).filter((i) => i >= 0);
  const baseX = median(stanceIdx.map((i) => fx[i]));
  const groundY = median(stanceIdx.map((i) => fy[i]));

  const speed = ts.map((t, i) => {
    if (i === 0) return 0;
    const dt = (t - ts[i - 1]) / 1000;
    return dt > 0 ? Math.hypot(fx[i] - fx[i - 1], fy[i] - fy[i - 1]) / legLen / dt : 0;
  });
  const sp = smoothSeries(speed, 1);
  const lift = fy.map((y) => (groundY - y) / legLen);

  // Movement episodes of the front foot up to shortly after launch.
  const episodes: FootEpisode[] = [];
  let cur: { s: number; e: number } | null = null;
  const limit = ctx.launch + 250;
  for (let i = 0; i < ts.length && ts[i] <= limit; i++) {
    // From behind or in front, a foot landing nearer or farther from the lens also moves up or down in the picture,
    // so height above the stance line only counts in side view. Speed works in every view.
    const moving = sp[i] > V_MOVE || (view === "side" && lift[i] > LIFT_MOVE);
    if (moving) {
      if (!cur) cur = { s: i, e: i };
      else cur.e = i;
    } else if (cur && i - cur.e > 1) {
      pushEpisode(cur.s, cur.e);
      cur = null;
    }
  }
  if (cur) pushEpisode(cur.s, cur.e);

  function pushEpisode(si: number, ei: number) {
    let maxLift = 0;
    let travel = 0;
    for (let i = si; i <= ei; i++) {
      maxLift = Math.max(maxLift, lift[i]);
      travel = Math.max(travel, Math.abs(fx[i] - fx[si]) / legLen);
    }
    // Ignore jitter: a real foot move lasts a few frames and goes somewhere.
    if (ts[ei] - ts[si] < 50 && maxLift < 0.08 && travel < 0.08) return;
    const kind: FootEpisode["kind"] = maxLift >= 0.15 ? "lift" : travel >= 0.12 ? "stride" : "tap";
    // Merge with the previous one when they're nearly touching.
    const prev = episodes[episodes.length - 1];
    if (prev && ts[si] - prev.end < 70) {
      prev.end = ts[ei];
      prev.maxLift = Math.max(prev.maxLift, maxLift);
      prev.travel = Math.max(prev.travel, travel);
      prev.kind = prev.maxLift >= 0.15 ? "lift" : prev.travel >= 0.12 ? "stride" : "tap";
      return;
    }
    episodes.push({ start: ts[si], end: ts[ei], maxLift, travel, kind });
  }

  // The stride that matters is the last foot move that began before launch.
  const before = episodes.filter((e) => e.start < ctx.launch);
  const last = before[before.length - 1] ?? null;
  let strideStart: number | null = null;
  let footPlant: number | null = null;
  if (last) {
    strideStart = last.start;
    // Plant: after the move starts, the foot slows below V_STILL for two frames. Interpolate the crossing.
    const i0 = nearest(ts, last.start);
    for (let i = i0 + 1; i < ts.length - 1; i++) {
      if (ts[i] > ctx.contact + 150) break;
      if (sp[i] < V_STILL && sp[i + 1] < V_STILL && (view !== "side" || lift[i] < 0.06) && ts[i] - last.start >= 50) {
        const a = sp[i - 1];
        const b = sp[i];
        const f = a > b ? clamp((a - V_STILL) / (a - b), 0, 1) : 0;
        footPlant = Math.round(ts[i - 1] + f * (ts[i] - ts[i - 1]));
        break;
      }
    }
  }
  const lateFoot = footPlant !== null && footPlant > ctx.launch;

  const counts = { tap: before.filter((e) => e.kind === "tap").length, lift: before.filter((e) => e.kind === "lift").length, stride: before.filter((e) => e.kind === "stride").length };
  let timingStyle: string;
  if (!before.length) timingStyle = "No stride";
  else if (counts.lift >= 2) timingStyle = "Two leg lifts";
  else if (counts.lift === 1) timingStyle = counts.tap ? "Toe tap + leg lift" : "Leg lift";
  else if (counts.tap >= 2) timingStyle = "Two toe taps";
  else if (counts.tap === 1 && counts.stride) timingStyle = "Toe tap + stride";
  else if (counts.tap === 1) timingStyle = "Toe tap";
  else timingStyle = "Stride";

  // Stride length (side view: the pitch line runs across the picture).
  const iPlant = footPlant !== null ? nearest(ts, footPlant) : null;
  let strideLegs: number | null = null;
  let strideOffsetLegs: number | null = null;
  if (iPlant !== null && strideStart !== null) {
    if (view === "side") strideLegs = Math.max(0, ((fx[iPlant] - baseX) * ctx.fwd) / legLen);
    else {
      // Behind (catcher's view): the plate is to a righty's right in the picture; from the front it's mirrored.
      const plateDir = view === "behind" ? (hand === "R" ? 1 : -1) : hand === "R" ? -1 : 1;
      strideOffsetLegs = ((fx[iPlant] - baseX) * plateDir) / legLen;
    }
  } else if (!before.length && view === "side") strideLegs = 0;

  // Happy feet: the heel/ankle should stay put after plant (the toes may pivot open, which we don't count).
  const iContactL = nearest(ts, ctx.contact);
  let footSlideLegs: number | null = null;
  if (iPlant !== null && iContactL > iPlant) {
    let maxD = 0;
    for (let i = iPlant; i <= iContactL; i++) maxD = Math.max(maxD, Math.hypot(fx[i] - fx[iPlant], fy[i] - fy[iPlant]) / legLen);
    footSlideLegs = maxD;
  }

  // Base width (side view): ankle to ankle along the pitch line, in the stance and at plant.
  const ankleGap = (i: number) => Math.abs(frames[i].lm[s.leadAnkle].x - frames[i].lm[s.rearAnkle].x) * g.width / legLen;
  const stanceWidthLegs = view === "side" ? median(stanceIdx.map(ankleGap)) : null;
  const plantWidthLegs = view === "side" && iPlant !== null ? ankleGap(iPlant) : null;

  // Front knee: in profile views (behind/front) the knee bends across the picture, so 2D works. Facing the chest,
  // the knee bends toward the lens, so use the model's 3D estimate instead (rougher).
  const kneeAt = (t: number): { a: number; method: "2d" | "3d" } | null => {
    const i = nearest(ts, t);
    const f = frames[i];
    const w = f.world;
    if (view === "side" && w && w.length >= 29) {
      const a = angle3(w[s.leadHip], w[leadKneeIdx], w[s.leadAnkle]);
      if (Number.isFinite(a)) return { a, method: "3d" };
    }
    // Average three frames around t.
    const as: number[] = [];
    for (let j = Math.max(0, i - 1); j <= Math.min(frames.length - 1, i + 1); j++) {
      const l = frames[j].lm;
      if (l[s.leadHip].v < 0.5 || l[leadKneeIdx].v < 0.5 || l[s.leadAnkle].v < 0.5) continue;
      as.push(angle(px(l[s.leadHip]), px(l[leadKneeIdx]), px(l[s.leadAnkle])));
    }
    return as.length ? { a: median(as), method: "2d" } : null;
  };
  const kP = footPlant !== null ? kneeAt(footPlant) : null;
  const kC = kneeAt(ctx.contact);

  // Back heel: rises above its stance line as the back foot turns over.
  // Only from the side: from behind or in front the back foot is the far foot and often hidden.
  const rhVis = frames.filter((f) => f.lm[rearHeel].v >= 0.5).length / frames.length;
  let rearHeelUpRel: number | null = null;
  if (rhVis >= 0.7 && view === "side") {
    const hy = smoothSeries(frames.map((f) => f.lm[rearHeel].y * g.height), 1);
    const hBase = median(stanceIdx.map((i) => hy[i]));
    for (let i = nearest(ts, ctx.launch - 250); i < ts.length - 1; i++) {
      if ((hBase - hy[i]) / legLen > 0.05 && (hBase - hy[i + 1]) / legLen > 0.05) {
        rearHeelUpRel = Math.round(ts[i] - ctx.contact);
        break;
      }
    }
  }

  // Hips: when did the hip line start turning, compared with the hands? Onset only, never degrees or speed.
  let hipOnsetRel: number | null = null;
  const hipSig = frames.map((f) => {
    const w = f.world;
    if (w && w.length >= 25) return (Math.atan2(w[s.leadHip].z - w[s.rearHip].z, w[s.leadHip].x - w[s.rearHip].x) * 180) / Math.PI;
    return NaN;
  });
  if (hipSig.filter(Number.isFinite).length > frames.length * 0.8) {
    const hs = smoothSeries(hipSig, 1);
    const i0 = nearest(ts, ctx.loadedT);
    const i1 = nearest(ts, ctx.finish);
    const total = hs[i1] - hs[i0];
    if (Math.abs(total) > 20) {
      for (let i = i0; i <= i1; i++) {
        if ((hs[i] - hs[i0]) / total > 0.15) {
          hipOnsetRel = Math.round(ts[i] - ctx.launch);
          break;
        }
      }
    }
  }

  return {
    available: true,
    feetVisibility: feetVis,
    legLenPx: legLen,
    episodes,
    timingStyle,
    strideStart,
    footPlant,
    lateFoot,
    strideLegs,
    footSlideLegs,
    stanceWidthLegs,
    plantWidthLegs,
    strideOffsetLegs,
    leadKneePlant: kP?.a ?? null,
    leadKneeContact: kC?.a ?? null,
    kneeMethod: kC?.method ?? null,
    rearHeelUpRel,
    rearHeelVisible: rhVis >= 0.7,
    hipOnsetRel,
  };
}
