import { FEET, KEY_JOINTS, L, clamp, median, vis } from "./geometry";
import type { CameraView, Landmark } from "./types";

export type CheckStatus = "ok" | "warn" | "bad" | "pending";
export type SetupCheck = { id: "light" | "body" | "distance" | "angle" | "steady" | "fps"; label: string; status: CheckStatus; message: string };

/** Brightness of a small grayscale-able RGBA thumbnail (0–255). */
export function luminance(rgba: Uint8ClampedArray): { mean: number; clipped: number } {
  let sum = 0;
  let clipped = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const y = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    sum += y;
    if (y > 250) clipped++;
  }
  return { mean: sum / n, clipped: clipped / n };
}

/**
 * Mean absolute brightness change between two thumbnails, ignoring a box around the hitter (normalized coords).
 * A still camera shows almost no change in the background; a wobbling tripod changes everything.
 */
export function backgroundShift(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  w: number,
  h: number,
  personBox: { x0: number; y0: number; x1: number; y1: number } | null,
): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      const ny = y / h;
      if (personBox && nx >= personBox.x0 && nx <= personBox.x1 && ny >= personBox.y0 && ny <= personBox.y1) continue;
      const i = (y * w + x) * 4;
      const ya = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
      const yb = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
      sum += Math.abs(ya - yb);
      n++;
    }
  }
  return n ? sum / n : 0;
}

export function personBox(lm: Landmark[], pad = 0.08) {
  const pts = lm.filter((p) => p.v > 0.3);
  if (pts.length < 5) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x0: clamp(Math.min(...xs) - pad, 0, 1),
    y0: clamp(Math.min(...ys) - pad * 1.5, 0, 1),
    x1: clamp(Math.max(...xs) + pad, 0, 1),
    y1: clamp(Math.max(...ys) + pad, 0, 1),
  };
}

export type SetupInputs = {
  view: CameraView;
  /** Recent landmark sets (newest last), roughly the last second. */
  recent: (Landmark[] | null)[];
  /** Frame aspect: width / height. */
  aspect: number;
  brightness: { mean: number; clipped: number } | null;
  /** Recent background shift values (newest last). */
  shifts: number[];
  cameraFps: number;
  poseFps: number;
};

export function evaluateSetup(inp: SetupInputs): SetupCheck[] {
  const checks: SetupCheck[] = [];
  const seen = inp.recent.filter((l): l is Landmark[] => !!l);
  const present = seen.length / Math.max(1, inp.recent.length);
  const last = seen[seen.length - 1] ?? null;

  // Light
  if (!inp.brightness) checks.push({ id: "light", label: "Lighting", status: "pending", message: "Checking light…" });
  else if (inp.brightness.mean < 45)
    checks.push({ id: "light", label: "Lighting", status: "bad", message: "Too dark. Turn on the cage lights or face the phone away from shadows." });
  else if (inp.brightness.mean < 70)
    checks.push({ id: "light", label: "Lighting", status: "warn", message: "A bit dim. Fast hands may blur. More light helps." });
  else if (inp.brightness.clipped > 0.35)
    checks.push({ id: "light", label: "Lighting", status: "warn", message: "Bright glare behind you. Don't point the phone at the sun or a light." });
  else checks.push({ id: "light", label: "Lighting", status: "ok", message: "Good light." });

  // Body
  if (!last || present < 0.5) {
    checks.push({ id: "body", label: "Full body", status: "bad", message: "Step into the frame so the camera can see you." });
    checks.push({ id: "distance", label: "Distance", status: "pending", message: "Waiting for you…" });
    checks.push({ id: "angle", label: "Camera angle", status: "pending", message: "Waiting for you…" });
  } else {
    const upper = vis(last, KEY_JOINTS);
    const feet = vis(last, FEET);
    const inside = (i: number) => last[i].x > 0.01 && last[i].x < 0.99 && last[i].y > 0.01 && last[i].y < 0.99;
    const feetIn = inside(L.leftAnkle) && inside(L.rightAnkle);
    if (upper < 0.6) checks.push({ id: "body", label: "Full body", status: "bad", message: "The camera can't see your upper body clearly. Face the phone and clear the view." });
    else if (feet < 0.5 || !feetIn)
      checks.push({
        id: "body",
        label: "Full body",
        status: "bad",
        message: "Your feet are cut off. Legs and feet are half the swing: tilt the phone down or move it back until your shoes are in the picture.",
      });
    else checks.push({ id: "body", label: "Full body", status: "ok", message: "Head to toe in view." });

    // Distance: share of the frame height the hitter fills (nose to ankles).
    const tall = Math.abs((last[L.leftAnkle].y + last[L.rightAnkle].y) / 2 - last[L.nose].y);
    if (tall > 0.88) checks.push({ id: "distance", label: "Distance", status: "warn", message: "You're too close. Move the phone back a few feet so the bat stays in frame." });
    else if (tall < 0.35) checks.push({ id: "distance", label: "Distance", status: "warn", message: "You're far away. Move the phone closer for better tracking." });
    else checks.push({ id: "distance", label: "Distance", status: "ok", message: "Good distance." });

    // Angle: in side view the chest faces the phone, so shoulders look wide compared with the torso.
    const ratios = seen.map((lm) => {
      const sw = Math.hypot((lm[L.leftShoulder].x - lm[L.rightShoulder].x) * inp.aspect, lm[L.leftShoulder].y - lm[L.rightShoulder].y);
      const sx = ((lm[L.leftShoulder].x + lm[L.rightShoulder].x) / 2 - (lm[L.leftHip].x + lm[L.rightHip].x) / 2) * inp.aspect;
      const sy = (lm[L.leftShoulder].y + lm[L.rightShoulder].y) / 2 - (lm[L.leftHip].y + lm[L.rightHip].y) / 2;
      return sw / Math.max(1e-3, Math.hypot(sx, sy));
    });
    const r = median(ratios);
    const wantWide = inp.view === "side";
    if (wantWide && r < 0.4)
      checks.push({ id: "angle", label: "Camera angle", status: "warn", message: "Side view should face your chest. Move the phone so it's square to you, across the plate." });
    else if (!wantWide && r > 0.55)
      checks.push({
        id: "angle",
        label: "Camera angle",
        status: "warn",
        message: inp.view === "behind" ? "Behind view should be in line with the pitch, behind the plate. Move the phone toward the catcher's spot." : "Front view should be in line with the pitch, from the pitcher's side.",
      });
    else checks.push({ id: "angle", label: "Camera angle", status: "ok", message: "Angle matches the view you picked." });
  }

  // Steady
  if (inp.shifts.length < 5) checks.push({ id: "steady", label: "Steady phone", status: "pending", message: "Checking…" });
  else {
    const s = median(inp.shifts.slice(-15));
    if (s > 9) checks.push({ id: "steady", label: "Steady phone", status: "bad", message: "The phone is moving. Use a tripod or lean it on something solid." });
    else if (s > 5) checks.push({ id: "steady", label: "Steady phone", status: "warn", message: "A little camera shake. Make sure the tripod is tight." });
    else checks.push({ id: "steady", label: "Steady phone", status: "ok", message: "Rock steady." });
  }

  // Frame rate
  const fps = Math.min(inp.poseFps || 0, inp.cameraFps || 99);
  if (!inp.poseFps) checks.push({ id: "fps", label: "Tracking speed", status: "pending", message: "Measuring…" });
  else if (fps < 15)
    checks.push({ id: "fps", label: "Tracking speed", status: "bad", message: `Only ${Math.round(fps)} fps. Close other apps, or switch to Fast tracking in Profile.` });
  else if (fps < 24)
    checks.push({ id: "fps", label: "Tracking speed", status: "warn", message: `${Math.round(fps)} fps. Works, but timing numbers get rougher.` });
  else checks.push({ id: "fps", label: "Tracking speed", status: "ok", message: `${Math.round(fps)} fps tracking.` });

  return checks;
}

/** Ready to bat when nothing is bad and the body, distance and steadiness checks have passed. */
export function readyToBat(checks: SetupCheck[]): boolean {
  if (checks.some((c) => c.status === "bad" || c.status === "pending")) return false;
  return true;
}
