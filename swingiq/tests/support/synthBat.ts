// Renders a high-frame-rate swing with a fully known 3D bat: hands moving, the bat rotating through a tilted swing
// plane, motion blur over the exposure, a hitter's torso and arms, a textured background and sensor noise. Ground truth
// is the sweet spot's real 3D speed, so the bat-speed engine can be scored against it.
import { assumedCamera } from "@/engine/ballflight";
import type { BatHints } from "@/engine/battrack";
import { drawBlurred, fillRect } from "./synth";

type V3 = [number, number, number];

export type SynthBatOpts = {
  w?: number;
  h?: number;
  fps?: number;
  hfovDeg?: number;
  /** Peak angular speed of the bat, rad/s. */
  omegaPk?: number;
  /** Peak hand speed, mph. */
  handMph?: number;
  /** Bat angle below horizontal at contact (degrees), pointing across the plate toward the camera. */
  batDownDeg?: number;
  /** Direction of the barrel's travel at contact, degrees above horizontal (attack angle). */
  attackDeg?: number;
  /** Camera tilted down by this much (phone at chest height looking down at the hitter). */
  camPitchDeg?: number;
  /** Turn the whole swing about the vertical axis (camera moved toward the pitcher). */
  yawDeg?: number;
  /** Camera to hands, inches. */
  depthIn?: number;
  batLengthIn?: number;
  shutter?: number;
  noise?: number;
  /** Hands-hint jitter (pose error), pixels. */
  handJitterPx?: number;
  /** Simulate dropped frames: drop each frame with this probability. */
  dropRate?: number;
  seed?: number;
  /** +1: pitcher to the right of the picture. */
  dir?: 1 | -1;
};

export type SynthBatClip = {
  frames: { t: number; rgba: Uint8ClampedArray; hints: BatHints }[];
  cam: ReturnType<typeof assumedCamera>;
  w: number;
  h: number;
  contactT: number;
  pxPerIn: number;
  truth: { peakMph: number; atContactMph: number; attackDeg: number };
  batLengthIn: number;
};

const GRIP = 4.5;
const SS = 6;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000003) / 1000003;
  };
}

export function renderSwing(o: SynthBatOpts = {}): SynthBatClip {
  const w = o.w ?? 960;
  const h = o.h ?? 540;
  const fps = o.fps ?? 240;
  const cam = assumedCamera(w, h, o.hfovDeg ?? 65);
  const dir = o.dir ?? 1;
  const L = o.batLengthIn ?? 34;
  const Lh = L - GRIP;
  const rSS = Lh - SS;
  const Z0 = o.depthIn ?? 150;
  const omegaPk = o.omegaPk ?? 46;
  const handPk = ((o.handMph ?? 18) * 5280 * 12) / 3600;
  const tc = 0.3;
  const rad = Math.PI / 180;
  const pitch = (o.camPitchDeg ?? 15) * rad;
  const yaw = (o.yawDeg ?? 0) * rad;

  // World (before camera tilt): x toward the pitcher (dir), y down, z away from the camera.
  const down = (o.batDownDeg ?? 30) * rad;
  const att = (o.attackDeg ?? 8) * rad;
  const u0: V3 = [0, Math.sin(down), -Math.cos(down)]; // bat at contact: across the plate toward the camera, tipped down
  let t0v: V3 = [dir * Math.cos(att), -Math.sin(att), 0]; // barrel travel at contact
  // Make the travel direction exactly perpendicular to the bat.
  t0v = norm3(sub(t0v, scale(u0, dot(t0v, u0))));
  const toCam = (p: V3): V3 => {
    // Yaw about the vertical, then pitch the camera down (scene rotates up).
    const x1 = p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw);
    const z1 = -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw);
    const y1 = p[1];
    const y2 = y1 * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y1 * Math.sin(pitch) + z1 * Math.cos(pitch);
    return [x1, y2, z2];
  };
  const e1 = toCam(u0);
  const e2 = toCam(t0v);
  const gravity = toCam([0, 1, 0]);

  // Angular profile: a bump peaking just before contact. ψ(tc) = 0.
  const sig = 0.055;
  const tPk = tc - 0.012;
  const omega = (t: number) => omegaPk * Math.exp(-(((t - tPk) / sig) ** 2));
  const fine = 1 / 20000;
  const psiAt = (t: number) => {
    // ∫_tc^t ω
    const n = Math.max(1, Math.round(Math.abs(t - tc) / fine));
    const dt = (t - tc) / n;
    let s = 0;
    for (let i = 0; i < n; i++) s += omega(tc + (i + 0.5) * dt) * dt;
    return s;
  };
  // Hands: move toward the pitcher and a little toward the camera, peaking ~70 ms before contact.
  const hDir = norm3(toCam([dir, 0.15, -0.35]));
  const vHand = (t: number) => handPk * Math.exp(-(((t - (tc - 0.07)) / 0.06) ** 2));
  const Hc0 = toCam([-dir * 6, 0, 0]);
  const Hstart: V3 = [Hc0[0], Hc0[1] - 4, Hc0[2] + Z0];
  const handAt = (t: number): V3 => {
    const n = Math.max(1, Math.round(Math.abs(t - tc) / fine));
    const dt = (t - tc) / n;
    let s = 0;
    for (let i = 0; i < n; i++) s += vHand(tc + (i + 0.5) * dt) * dt;
    return add(Hstart, scale(hDir, s));
  };
  const uAt = (t: number): V3 => {
    const p = psiAt(t);
    return add(scale(e1, Math.cos(p)), scale(e2, Math.sin(p)));
  };
  const ssAt = (t: number): V3 => add(handAt(t), scale(uAt(t), rSS));
  const speedAt = (t: number) => {
    const d = 1e-4;
    return norm(sub(ssAt(t + d), ssAt(t - d))) / (2 * d) / 17.6;
  };
  let peak = 0;
  for (let t = tc - 0.1; t <= tc + 0.01; t += 0.0005) peak = Math.max(peak, speedAt(t));
  const vC = sub(ssAt(tc + 1e-4), ssAt(tc - 1e-4));
  const attackTruth = (Math.asin(-dot(norm3(vC), gravity)) * 180) / Math.PI;

  const proj = (p: V3) => ({ x: cam.cx + (cam.fPx * p[0]) / p[2], y: cam.cy + (cam.fPx * p[1]) / p[2] });
  const pxPerIn = cam.fPx / Z0;

  // Static background.
  const bg = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ground = y > h * 0.78;
      const v = (ground ? 92 : 138) + 16 * Math.sin(x / 31) * Math.cos(y / 19) + 7 * Math.sin((x + 2 * y) / 7);
      bg[i] = v;
      bg[i + 1] = v * (ground ? 1.08 : 1);
      bg[i + 2] = v * (ground ? 0.75 : 1.04);
      bg[i + 3] = 255;
    }
  }
  const rand = rng(o.seed ?? 99);
  const noise = o.noise ?? 3;
  const shutter = o.shutter ?? 0.25;
  const jit = o.handJitterPx ?? 1.5;
  const frames: SynthBatClip["frames"] = [];
  const tStart = tc - 0.32;
  const tEnd = tc + 0.06;
  for (let fi = 0; ; fi++) {
    const t = tStart + fi / fps;
    if (t > tEnd) break;
    if (o.dropRate && fi > 3 && rand() < o.dropRate) continue;
    const img = new Uint8ClampedArray(bg);
    // Torso behind the hands (away from the pitcher), shoulders above.
    // The body drifts toward the pitcher and turns (its front edge moves), far slower than the bat.
    const sway = Math.sin(t * 7) * 3 + (t - tStart) * 60 * dir;
    const H0p = proj(handAt(tStart));
    const torsoX = H0p.x - dir * 0.55 * pxPerIn * 12 + sway;
    const shoulder = { x: torsoX + dir * 0.2 * pxPerIn * 12, y: H0p.y - 0.9 * pxPerIn * 12 };
        fillRect(img, w, h, Math.round(torsoX - pxPerIn * 7), Math.round(shoulder.y - pxPerIn * 2), Math.round(pxPerIn * 14), Math.round(pxPerIn * 34), [120, 70, 60]);
    // Arms: shoulder to hands.
    drawBlurred(img, w, h, 4, (s) => {
      const hh = proj(handAt(t + (s * shutter) / fps));
      return { kind: "bar", x0: shoulder.x, y0: shoulder.y, x1: hh.x, y1: hh.y, r: pxPerIn * 1.8 };
    }, [175, 130, 110]);
    // Bat: handle and barrel, each blurred over the exposure.
    const seg = (a: number, b: number, rIn: number, color: number[]) =>
      drawBlurred(img, w, h, 10, (s) => {
        const tt = t + (s * shutter) / fps;
        const Hh = handAt(tt);
        const u = uAt(tt);
        const p0 = proj(add(Hh, scale(u, a)));
        const p1 = proj(add(Hh, scale(u, b)));
        const zMid = Hh[2] + u[2] * (a + b) / 2;
        return { kind: "bar", x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, r: (cam.fPx * rIn) / zMid };
      }, color);
    seg(-GRIP, Lh * 0.45, 0.55, [40, 40, 46]);
    seg(Lh * 0.45, Lh, 1.12, [30, 32, 38]);
    if (noise > 0) {
      for (let i = 0; i < img.length; i += 4) {
        const n = (rand() + rand() - 1) * noise * 1.7;
        img[i] += n;
        img[i + 1] += n;
        img[i + 2] += n;
      }
    }
    // Hands hint at mid-exposure (what body tracking would report), with pose error.
    const Hm = proj(handAt(t + shutter / fps / 2));
    frames.push({
      t: t * 1000,
      rgba: img,
      hints: {
        hands: { x: Hm.x + (rand() - 0.5) * 2 * jit, y: Hm.y + (rand() - 0.5) * 2 * jit },
        avoid: [shoulder],
        expectLenPx: pxPerIn * Lh,
      },
    });
  }
  return {
    frames,
    cam,
    w,
    h,
    contactT: tc * 1000,
    pxPerIn,
    truth: { peakMph: peak, atContactMph: speedAt(tc), attackDeg: attackTruth },
    batLengthIn: L,
  };
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: V3): V3 => scale(a, 1 / (norm(a) || 1));
