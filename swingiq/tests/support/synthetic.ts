// Builds a synthetic, fully known swing as MediaPipe-style pose frames, so tests can check the analyzer's numbers
// against ground truth. Side view, right-handed hitter, pitcher to the right of the image.
import type { Landmark, PoseFrame, WorldLandmark } from "@/engine/types";

export type SynthOptions = {
  fps?: number;
  heightIn?: number;
  /** Front-foot stride toward the pitcher, inches. */
  strideIn?: number;
  /** How far the hands sink during the load, inches. */
  handDropIn?: number;
  /** Head drift toward the pitcher from stance to contact, inches. */
  headFwdIn?: number;
  /** Hip center position at contact, 0 = rear ankle, 1 = lead ankle. */
  weightAtContact?: number;
  /** Peak hand speed scale (1 = normal). */
  speed?: number;
  /** Pixel noise (standard deviation-ish). */
  jitterPx?: number;
  /** Skip the swing entirely (only stance + waggles). */
  noSwing?: boolean;
  /** Translate the whole body sideways (walking), inches per second. */
  walkInPerS?: number;
  /** Front-knee angle (2D, degrees) at foot plant and at contact. Default: 150 → 172 (firming up). */
  leadKneePlant?: number;
  leadKneeContact?: number;
  /** Hide the feet (low visibility on ankles/heels/toes). */
  hideFeet?: boolean;
  seed?: number;
};

export const GEOM = { width: 720, height: 1280 };

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

const ss = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Value moving from a to b between times t0 and t1 with a smooth start and stop. */
const move = (t: number, t0: number, t1: number, a: number, b: number) => a + (b - a) * ss((t - t0) / (t1 - t0));

export function synthSwing(o: SynthOptions = {}) {
  const fps = o.fps ?? 30;
  const H = o.heightIn ?? 70;
  const stride = o.strideIn ?? 8;
  const drop = o.handDropIn ?? 2;
  const headFwd = o.headFwdIn ?? 1;
  const wC = o.weightAtContact ?? 0.6;
  const sp = o.speed ?? 1;
  const jit = o.jitterPx ?? 0.8;
  const r = rng(o.seed ?? 7);

  // Scale: nose-to-ankles = 0.88 × height fills 880 px.
  const ppi = 880 / (0.88 * H);
  const groundY = 1180;
  const cx = 330;
  const toPx = (xIn: number, yIn: number) => ({ x: (cx + xIn * ppi) / GEOM.width, y: (groundY - yIn * ppi) / GEOM.height });

  const frames: PoseFrame[] = [];
  const t0 = -2200;
  const t1 = 1100;
  // Swing timing (ms, launch = 0). Faster swings compress the forward move.
  const fwdEnd = 220 / sp;
  for (let t = t0; t <= t1; t += 1000 / fps) {
    const walk = o.walkInPerS ? (o.walkInPerS * (t - t0)) / 1000 : 0;
    // Stance width 24 in.
    const rearAnkleX = -12 + walk;
    let leadAnkleX = 12 + walk;
    let leadLift = 0;
    if (!o.noSwing) {
      leadAnkleX = move(t, -520, -120, 12, 12 + stride) + walk;
      leadLift = t > -520 && t < -120 ? Math.sin(((t + 520) / 400) * Math.PI) * 2.5 : 0;
    }
    // Hip center: back 1 in during load, then forward to the weight target at contact.
    const span = leadAnkleX - rearAnkleX;
    const hipStance = 0 + walk;
    let hipX = hipStance;
    if (!o.noSwing) {
      hipX = move(t, -700, -200, hipStance, hipStance - 1);
      const target = rearAnkleX + wC * (12 + stride + 12);
      hipX = t > -200 ? move(t, -200, fwdEnd * 0.5, hipStance - 1, target) : hipX;
    }
    void span;
    // Hands: stance near the rear shoulder; load back 4 in and down `drop`; launch forward fast; finish high.
    let hx = -6 + walk;
    let hy = 52;
    if (o.noSwing) {
      // Gentle waggle.
      hx += Math.sin(t / 180) * 1.5;
      hy += Math.cos(t / 220) * 1;
    } else {
      hx = move(t, -700, -150, -6, -10) + walk;
      hy = move(t, -700, -150, 52, 52 - drop);
      if (t > 0) {
        hx = move(t, 0, fwdEnd, -10, 22) + walk;
        hy = move(t, 0, fwdEnd, 52 - drop, 47);
      }
      if (t > fwdEnd) {
        hx = move(t, fwdEnd, fwdEnd + 380, 22, 2) + walk;
        hy = move(t, fwdEnd, fwdEnd + 380, 47, 62);
      }
    }
    const headX = (o.noSwing ? 0 : move(t, -150, fwdEnd * 0.5, 0, headFwd)) + walk;

    // Front knee: bend so the hip–knee–ankle angle follows stance (170°) → plant (kneePlant) → contact (kneeContact).
    const kPlant = o.leadKneePlant ?? 150;
    const kContact = o.leadKneeContact ?? 172;
    const kneeDeg = o.noSwing ? 170 : t < -120 ? move(t, -600, -120, 170, kPlant) : move(t, -120, fwdEnd * 0.5, kPlant, kContact);
    const hipL: [number, number] = [hipX + 5, 36];
    const ankL: [number, number] = [leadAnkleX, leadLift];
    const dx = ankL[0] - hipL[0];
    const dy = ankL[1] - hipL[1];
    const d = Math.hypot(dx, dy);
    const half = (kneeDeg * Math.PI) / 360;
    const limb = d / (2 * Math.sin(half));
    const off = Math.sqrt(Math.max(0, limb * limb - (d / 2) ** 2));
    // Knee pushes toward the pitcher (+x), perpendicular to the hip–ankle line.
    const nx = -dy / d;
    const ny = dx / d;
    const sgn = nx >= 0 ? 1 : -1;
    const leadKnee: [number, number] = [(hipL[0] + ankL[0]) / 2 + sgn * nx * off, (hipL[1] + ankL[1]) / 2 + sgn * ny * off];
    const pts: Record<number, [number, number]> = {
      0: [headX + 1.5, 61.6],
      7: [headX - 1, 62],
      8: [headX - 1, 62],
      11: [hipX + 8 + (headX - walk) * 0.5, 56],
      12: [hipX - 8 + (headX - walk) * 0.5, 56],
      13: [(hipX + 8 + hx) / 2 + 2, 48],
      14: [(hipX - 8 + hx) / 2, 46],
      15: [hx + 0.6, hy],
      16: [hx - 0.6, hy - 1],
      23: [hipX + 5, 36],
      24: [hipX - 5, 36],
      25: leadKnee,
      26: [(hipX - 5 + rearAnkleX) / 2, 19],
      27: [leadAnkleX, leadLift],
      28: [rearAnkleX, 0],
      29: [leadAnkleX - 1.5, leadLift - 0.5],
      30: [rearAnkleX - 1.5, -0.5],
      31: [leadAnkleX + 4, leadLift - 0.8],
      32: [rearAnkleX + 4, -0.8],
    };
    const lm: Landmark[] = Array.from({ length: 33 }, (_, i) => {
      const p = pts[i] ?? pts[0];
      const q = toPx(p[0], p[1]);
      const feet = i >= 27;
      return { x: q.x + (r() * jit) / GEOM.width, y: q.y + (r() * jit) / GEOM.height, z: 0, v: feet && o.hideFeet ? 0.1 : 0.95 };
    });

    // World landmarks: hips and shoulders rotate (yaw). Hips open first, shoulders follow 50 ms later.
    const hipYaw = o.noSwing ? 0 : (move(t, -60, 140 / sp, 0, 70) * Math.PI) / 180;
    const shYaw = o.noSwing ? 0 : (move(t, 10, 170 / sp, -8, 85) * Math.PI) / 180;
    const seg = (half: number, yaw: number, y: number): [WorldLandmark, WorldLandmark] => [
      { x: half * Math.cos(yaw), y, z: half * Math.sin(yaw), v: 0.95 },
      { x: -half * Math.cos(yaw), y, z: -half * Math.sin(yaw), v: 0.95 },
    ];
    const world: WorldLandmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0.9 }));
    // Left (lead) is +x for a righty here.
    const [lh, rh] = seg(0.13, hipYaw, 0);
    const [ls, rs] = seg(0.2, shYaw, -0.5);
    world[23] = lh;
    world[24] = rh;
    world[11] = ls;
    world[12] = rs;
    frames.push({ t: Math.round((t - t0) * 10) / 10 + 10_000, lm, world });
  }
  // Launch time on the frames' clock.
  return { frames, launchT: 10_000 - t0, geom: GEOM, ppi };
}
