// Exit velocity, launch angle, pitch speed and bat speed from a slow-motion clip's motion frames.
// Every number carries a ± band and a confidence; anything the clip can't support comes back unavailable with a reason.
import {
  FT_S_TO_MPH,
  ballSizeScale,
  batSpeedFromCollision,
  collisionEfficiency,
  combineScales,
  exitVelocity,
  fitPitch,
  gravityScale,
  median,
  pitchMetrics,
  timeBaseCorrection,
  type Ball,
  type Camera,
  type Scale,
  type TrackPoint,
} from "./ballflight";
import { buildTracks, findHit, longestSmoothTrack, type BallObs, type MotionFrame } from "./motion";
import type { BatSpeedResult } from "./batspeed";
import type { MetricKey, MetricValue } from "./types";

export type SpeedContext = {
  /** Body scale at the batter (pixels per inch, motion-frame pixels), if body tracking found one. */
  bodyPxPerIn: number | null;
  ball: Ball;
  cam: Camera;
  /** Bat certification text, for the bat's collision efficiency. */
  certification?: string;
  /** Contact time from body tracking (real ms). */
  hintT: number | null;
  /** Real frames per second of the recording. */
  fps: number;
  frameHeight: number;
};

export type SpeedResult = {
  metrics: Partial<Record<MetricKey, MetricValue>>;
  /** If the pitch's fall says the slow-motion setting was wrong: the factor to multiply it by. */
  timeBase: number | null;
  /** Contact found from the ball itself (real ms). */
  contactT: number | null;
  debug: {
    tracks: number;
    pitchN: number;
    battedN: number;
    scale?: { pxPerFt: number; rel: number; source: string; parts: string[] };
    ev?: { depthUsed: boolean; sprayDeg: number };
  };
};

const SPEED_MIN_FPS = 100;

function toPoints(obs: BallObs[]): TrackPoint[] {
  return obs.map((o) => ({ t: o.t / 1000, x: o.x, y: o.y, d: o.d }));
}

function unavailable(key: MetricKey, reason: string): MetricValue {
  return { key, source: "unavailable", value: null, confidence: 0, reason };
}

function confFrom(pm: number, value: number, cap: number): number {
  const rel = value > 0 ? pm / value : 1;
  return Math.max(0.15, Math.min(cap, 1 - rel * 4));
}

/** Expected ball width range in pixels: the ball is over the plate, a bit closer to the camera than the batter. */
export function ballSizeRange(ctx: Pick<SpeedContext, "bodyPxPerIn" | "ball" | "frameHeight">): { dMin: number; dMax: number } {
  if (ctx.bodyPxPerIn && ctx.bodyPxPerIn > 0) {
    const d = ctx.bodyPxPerIn * ctx.ball.diamIn;
    return { dMin: Math.max(3, d * 0.6), dMax: d * 2.4 };
  }
  return { dMin: 4, dMax: ctx.frameHeight / 6 };
}

export function analyzeSpeeds(frames: MotionFrame[], ctx: SpeedContext): SpeedResult {
  const m: SpeedResult["metrics"] = {};
  const debug: SpeedResult["debug"] = { tracks: 0, pitchN: 0, battedN: 0 };
  const { dMin, dMax } = ballSizeRange(ctx);
  const vMaxPx = 200 * (dMax / (ctx.ball.diamIn / 12)); // 136 mph at the closest plausible depth
  const tracks = buildTracks(frames, dMin, dMax, vMaxPx);
  debug.tracks = tracks.length;
  const hit = findHit(tracks, ctx.hintT);
  debug.pitchN = hit.pitch?.length ?? 0;
  debug.battedN = hit.batted?.length ?? 0;

  const pitchPts = hit.pitch ? toPoints(hit.pitch) : null;
  const pitch = pitchPts ? fitPitch(pitchPts) : null;
  const bScale = pitch ? ballSizeScale(pitch.ds, ctx.ball) : null;

  // Was the slow-motion setting right? Only the pitch can tell.
  let timeBase: number | null = null;
  if (pitch && bScale) {
    const tb = timeBaseCorrection(pitch, bScale);
    if (tb !== null && tb !== 1) timeBase = tb;
  }
  const result = (): SpeedResult => ({ metrics: m, timeBase, contactT: hit.contact?.t ?? null, debug });

  if (ctx.fps < SPEED_MIN_FPS) {
    const why = "Film in slo-mo to measure this: at normal speed the ball crosses the picture in a frame or two.";
    m.exitVelocity = unavailable("exitVelocity", why);
    m.launchAngle = unavailable("launchAngle", why);
    m.batSpeed = unavailable("batSpeed", why);
    return result();
  }
  if (timeBase !== null) {
    const why = "The slow-motion setting didn't match the video, so speeds were held back.";
    m.exitVelocity = unavailable("exitVelocity", why);
    m.launchAngle = unavailable("launchAngle", why);
    m.batSpeed = unavailable("batSpeed", why);
    return result();
  }

  // Scale over the plate: gravity on the pitch + the ball's size.
  let scale: (Scale & { agree?: boolean; parts?: Scale[] }) | null = null;
  let dRef = 0;
  if (pitch) {
    scale = combineScales([gravityScale(pitch, ctx.ball), bScale]);
    dRef = pitch.dMed;
  } else if (hit.batted) {
    const first = hit.batted.slice(0, 4).map((o) => o.d);
    scale = ballSizeScale(first, ctx.ball);
    dRef = median(first);
  }
  if (scale) debug.scale = { pxPerFt: scale.pxPerFt, rel: scale.rel, source: scale.source, parts: (scale.parts ?? [scale]).map((p) => `${p.source} ${p.pxPerFt.toFixed(1)}±${(p.rel * 100).toFixed(1)}%`) };
  const twoRulers = (scale?.parts?.length ?? 1) >= 2 && scale?.agree !== false;
  const cap = twoRulers ? 0.85 : 0.6;

  let pitchMph: number | null = null;
  if (pitch && scale) {
    const pr = pitchMetrics(pitch, scale);
    if (pr.mph > 5 && pr.mph < 60) {
      pitchMph = pr.mph;
      m.pitchSpeed = {
        key: "pitchSpeed",
        source: "cv_estimated",
        value: round1(pr.mph),
        confidence: confFrom(pr.pm, pr.mph, cap),
        plusMinus: round1(Math.max(0.5, pr.pm)),
        reason: "Tracked from the pitch's last frames before the plate.",
      };
      m.descentAngle = {
        key: "descentAngle",
        source: "cv_estimated",
        value: Math.round(pr.descentDeg),
        confidence: Math.min(cap, pitch.n >= 12 ? 0.8 : 0.6),
        plusMinus: 2,
        reason: "How steeply the pitch was dropping as it reached you.",
      };
    }
  }

  if (!hit.batted) {
    const why = hit.pitch
      ? "Found the pitch but not the ball off the bat. Leave a few feet of room in front of the plate in the shot."
      : "Couldn't find the ball. Use bright light, keep the phone still, and keep the plate and a few feet in front of it in the shot.";
    m.exitVelocity = unavailable("exitVelocity", why);
    m.launchAngle = unavailable("launchAngle", why);
    m.batSpeed = unavailable("batSpeed", why);
    return result();
  }
  if (!scale) {
    const why = "Couldn't size the ball well enough to turn pixels into feet.";
    m.exitVelocity = unavailable("exitVelocity", why);
    m.launchAngle = unavailable("launchAngle", why);
    m.batSpeed = unavailable("batSpeed", why);
    return result();
  }
  const ev = exitVelocity(toPoints(hit.batted), scale, dRef, ctx.cam, hit.contact ? hit.contact.t / 1000 : undefined, ctx.ball);
  if (!ev || ev.mph < 10 || ev.mph > 140) {
    const why = "The ball off the bat wasn't tracked cleanly enough.";
    m.exitVelocity = unavailable("exitVelocity", why);
    m.launchAngle = unavailable("launchAngle", why);
    m.batSpeed = unavailable("batSpeed", why);
    return result();
  }
  debug.ev = { depthUsed: ev.depthUsed, sprayDeg: Math.round(ev.sprayDeg) };
  if (ev.n < 5 || ev.pm > 0.15 * ev.mph) {
    const why = `The ball off the bat was only clear in ${ev.n} frames, too few for a trustworthy speed. Brighter light and a steadier phone help.`;
    m.exitVelocity = unavailable("exitVelocity", why);
    m.launchAngle = unavailable("launchAngle", why);
    m.batSpeed = unavailable("batSpeed", why);
    return result();
  }
  const evCap = Math.min(cap, ev.n >= 5 ? 0.9 : 0.7);
  m.exitVelocity = {
    key: "exitVelocity",
    source: "cv_estimated",
    value: round1(ev.mph),
    confidence: confFrom(ev.pm, ev.mph, evCap),
    plusMinus: round1(Math.max(1, ev.pm)),
    method: "ball tracking",
    reason: `Ball speed right off the bat, from ball tracking over ${ev.n} frames. Scale from ${scale.source === "gravity + ball size" ? "the pitch's fall and the ball's size" : scale.source}.`,
  };
  m.launchAngle = {
    key: "launchAngle",
    source: "cv_estimated",
    value: Math.round(ev.launchDeg),
    confidence: Math.min(evCap, ev.launchPm < 3 ? 0.85 : 0.6),
    plusMinus: Math.round(Math.max(1, ev.launchPm)),
    method: "ball tracking",
    reason: "Angle of the ball off the bat, from the same frames.",
  };
  const e = collisionEfficiency(ctx.certification);
  const pMph = pitchMph ?? 25;
  const pPm = pitchMph === null ? 5 : 1;
  const bat = batSpeedFromCollision(ev.mph, ev.pm, pMph, e.eA, e.pm);
  const batPm = Math.hypot(bat.pm, (e.eA / (1 + e.eA)) * pPm);
  m.batSpeed = {
    key: "batSpeed",
    source: "cv_estimated",
    value: round1(bat.mph),
    confidence: Math.min(0.6, confFrom(batPm, bat.mph, 0.6)),
    plusMinus: round1(Math.max(1.5, batPm)),
    method: "from exit velo",
    reason: "Worked out from exit velo and pitch speed, assuming you hit it on the sweet spot. Reads low on a mishit.",
  };
  return result();
}

/**
 * Checks the slow-motion setting against any clean ball flight in the clip (no swing needed). Returns the factor to
 * multiply the setting by, or null when it looks right or there's no clean flight to judge by.
 */
export function checkTimeBase(frames: MotionFrame[], ctx: Pick<SpeedContext, "bodyPxPerIn" | "ball" | "frameHeight">): number | null {
  const { dMin, dMax } = ballSizeRange(ctx);
  const tracks = buildTracks(frames, dMin, dMax, 200 * (dMax / (ctx.ball.diamIn / 12)) * 8);
  const best = longestSmoothTrack(tracks, 8);
  if (!best) return null;
  const p = fitPitch(toPoints(best));
  if (!p) return null;
  const b = ballSizeScale(p.ds, ctx.ball);
  if (!b) return null;
  const tb = timeBaseCorrection(p, b);
  return tb !== null && tb !== 1 ? tb : null;
}

/**
 * Puts the bat-speed engine's result (barrel tracking) into the metrics. Barrel tracking measures the bat itself, so it
 * replaces the exit-velo formula whenever it worked; the formula stays as a cross-check in the explanation. When
 * barrel tracking couldn't measure, the formula's number (if any) stays, and its explanation says why.
 */
export function mergeBatSpeed(metrics: Partial<Record<MetricKey, MetricValue>>, bat: BatSpeedResult | null, batLengthKnown: boolean): void {
  if (!bat) return;
  const derived = metrics.batSpeed && metrics.batSpeed.source !== "unavailable" && metrics.batSpeed.value !== null ? metrics.batSpeed : null;
  if (bat.ok) {
    const cross = derived ? ` Cross-check from exit velo: ${Math.round(derived.value!)} mph.` : "";
    const lenNote = batLengthKnown ? "" : " Assumed a 34-inch bat: add your bat on the Bats page for a sharper number.";
    metrics.batSpeed = {
      key: "batSpeed",
      source: "cv_estimated",
      value: round1(bat.peakMph),
      confidence: batLengthKnown ? bat.confidence : Math.min(0.5, bat.confidence),
      plusMinus: round1(Math.max(1.5, batLengthKnown ? bat.pm : Math.hypot(bat.pm, bat.peakMph * 0.03))),
      method: "barrel tracking",
      reason: `Peak speed of the sweet spot (6 inches from the end of the barrel), tracked from the bat itself over ${bat.n} frames.${cross}${lenNote}`,
    };
    if (bat.attackDeg !== null) {
      metrics.attackAngle = {
        key: "attackAngle",
        source: "cv_estimated",
        value: Math.round(bat.attackDeg),
        confidence: Math.min(0.6, bat.confidence),
        plusMinus: 5,
        method: "barrel tracking",
        reason: "Direction the barrel was traveling at contact, up or down, from barrel tracking and the phone's level.",
      };
    }
    return;
  }
  if (derived) {
    metrics.batSpeed = { ...derived, reason: `${derived.reason} Barrel tracking didn't work on this one: ${bat.reason}` };
  } else if (!metrics.batSpeed || metrics.batSpeed.source === "unavailable") {
    metrics.batSpeed = { key: "batSpeed", source: "unavailable", value: null, confidence: 0, reason: bat.reason };
  }
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

export { FT_S_TO_MPH };
