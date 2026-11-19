import type { FrameGeometry, Handedness, Landmark, PoseFrame, WorldLandmark } from "./types";

/** MediaPipe Pose landmark indices. */
export const L = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftToe: 31,
  rightToe: 32,
} as const;

/** Bones drawn in the skeleton overlay. */
export const BONES: [number, number][] = [
  [L.leftShoulder, L.rightShoulder],
  [L.leftShoulder, L.leftElbow],
  [L.leftElbow, L.leftWrist],
  [L.rightShoulder, L.rightElbow],
  [L.rightElbow, L.rightWrist],
  [L.leftShoulder, L.leftHip],
  [L.rightShoulder, L.rightHip],
  [L.leftHip, L.rightHip],
  [L.leftHip, L.leftKnee],
  [L.leftKnee, L.leftAnkle],
  [L.rightHip, L.rightKnee],
  [L.rightKnee, L.rightAnkle],
  [L.leftAnkle, L.leftHeel],
  [L.leftHeel, L.leftToe],
  [L.leftAnkle, L.leftToe],
  [L.rightAnkle, L.rightHeel],
  [L.rightHeel, L.rightToe],
  [L.rightAnkle, L.rightToe],
];

export const KEY_JOINTS = [
  L.nose,
  L.leftShoulder,
  L.rightShoulder,
  L.leftElbow,
  L.rightElbow,
  L.leftWrist,
  L.rightWrist,
  L.leftHip,
  L.rightHip,
] as const;

export const FEET = [L.leftAnkle, L.rightAnkle, L.leftHeel, L.rightHeel] as const;

export type P2 = { x: number; y: number };

/** Lead (front) and rear sides. A right-handed hitter's lead side is their left. */
export function sides(hand: Handedness) {
  const lead = hand === "R" ? "left" : "right";
  const rear = hand === "R" ? "right" : "left";
  return {
    leadShoulder: L[`${lead}Shoulder`],
    rearShoulder: L[`${rear}Shoulder`],
    leadHip: L[`${lead}Hip`],
    rearHip: L[`${rear}Hip`],
    leadAnkle: L[`${lead}Ankle`],
    rearAnkle: L[`${rear}Ankle`],
    leadWrist: L[`${lead}Wrist`],
    rearWrist: L[`${rear}Wrist`],
  };
}

/** Image landmark → pixel space, so x and y distances are comparable regardless of aspect ratio. */
export function px(lm: Landmark, g: FrameGeometry): P2 {
  return { x: lm.x * g.width, y: lm.y * g.height };
}

export function mid(a: P2, b: P2): P2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function dist(a: P2, b: P2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function vis(lm: Landmark[], idx: readonly number[]): number {
  let s = 0;
  for (const i of idx) s += lm[i]?.v ?? 0;
  return s / idx.length;
}

/** Midpoint of both wrists in pixels: both hands are on the bat, so this tracks the grip. */
export function hands(lm: Landmark[], g: FrameGeometry): P2 {
  return mid(px(lm[L.leftWrist], g), px(lm[L.rightWrist], g));
}

export function hipCenter(lm: Landmark[], g: FrameGeometry): P2 {
  return mid(px(lm[L.leftHip], g), px(lm[L.rightHip], g));
}

export function shoulderCenter(lm: Landmark[], g: FrameGeometry): P2 {
  return mid(px(lm[L.leftShoulder], g), px(lm[L.rightShoulder], g));
}

/** Torso length in pixels (shoulder center to hip center). The scale unit for speeds: it doesn't change with distance. */
export function torso(lm: Landmark[], g: FrameGeometry): number {
  return dist(shoulderCenter(lm, g), hipCenter(lm, g));
}

/** Pixel height from the nose to the ankles' midpoint. About 0.88 of standing height for adults. */
export function noseToAnkles(lm: Landmark[], g: FrameGeometry): number {
  const ankles = mid(px(lm[L.leftAnkle], g), px(lm[L.rightAnkle], g));
  return Math.abs(ankles.y - px(lm[L.nose], g).y);
}
export const NOSE_TO_ANKLE_FRACTION = 0.88;

/**
 * Yaw (rotation around the vertical axis) of the line from point a to point b, from 3D world landmarks, in degrees.
 * 0° = the line runs straight across the camera's view.
 */
export function yawDeg(a: WorldLandmark, b: WorldLandmark): number {
  return (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI;
}

/** Smallest signed difference between two angles in degrees (-180..180]. */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/** Unwraps a series of angles so it doesn't jump at ±180°. */
export function unwrap(angles: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < angles.length; i++) {
    out.push(i === 0 ? angles[0] : out[i - 1] + angleDiff(angles[i], angles[i - 1]));
  }
  return out;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/** Centered moving average over a numeric series (ignores NaN). */
export function smoothSeries(xs: number[], radius: number): number[] {
  return xs.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(xs.length - 1, i + radius); j++) {
      if (!Number.isNaN(xs[j])) {
        s += xs[j];
        n++;
      }
    }
    return n ? s / n : NaN;
  });
}

export function frameHasBody(f: PoseFrame, minVis = 0.5): f is PoseFrame & { lm: Landmark[] } {
  return !!f.lm && vis(f.lm, KEY_JOINTS) >= minVis;
}
