// Renders a slow-motion hit with known physics: a pitch arcing in (gravity, drag, optional spin lift), contact, and
// the batted ball leaving at a chosen exit velocity, launch angle and spray angle. Includes motion blur, sensor
// noise, a moving "batter" and a bat that sweeps through the ball, so the tracker is tested against clutter.
import { G_FT_S2, SOFTBALL_12, assumedCamera, dragK, type Camera } from "@/engine/ballflight";

export type SynthOpts = {
  w?: number;
  h?: number;
  fps?: number;
  hfovDeg?: number;
  evMph: number;
  launchDeg: number;
  /** Positive = away from the camera. */
  sprayDeg: number;
  pitchMph?: number;
  descentDeg?: number;
  /** Contact point, feet, camera coordinates (X right, Y down, Z away from camera). */
  contact?: { X: number; Y: number; Z: number };
  /** Exposure as a fraction of the frame interval. */
  shutter?: number;
  /** Spin lift on the pitch as a fraction of g (positive = backspin float). */
  liftG?: number;
  noise?: number;
  /** +1: the batted ball goes to the right of the picture. */
  dir?: 1 | -1;
  clutter?: boolean;
  durationS?: number;
  contactAtS?: number;
  /** Multiply output timestamps (simulates a wrong slow-motion setting). */
  timeScale?: number;
};

export type SynthClip = {
  frames: { t: number; rgba: Uint8ClampedArray }[];
  cam: Camera;
  w: number;
  h: number;
  contactT: number;
  /** Pitch speed and descent at contact, from the simulation. */
  truth: { pitchMph: number; descentDeg: number; evMph: number; launchDeg: number };
};

type V3 = { x: number; y: number; z: number };
const MPH = 5280 / 3600;

function accel(v: V3, k: number, liftG: number): V3 {
  const sp = Math.hypot(v.x, v.y, v.z);
  const a = { x: -k * sp * v.x, y: G_FT_S2 - k * sp * v.y, z: -k * sp * v.z };
  if (liftG) {
    const vxy = Math.hypot(v.x, v.y) || 1;
    let nx = v.y / vxy;
    let ny = -v.x / vxy;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    a.x += liftG * G_FT_S2 * nx;
    a.y += liftG * G_FT_S2 * ny;
  }
  return a;
}

/** Simulates positions on a fine time grid. Backward from contact for the pitch, forward for the batted ball. */
function simulate(p0: V3, v0: V3, seconds: number, step: number, k: number, liftG: number): { t: number; p: V3 }[] {
  const out: { t: number; p: V3 }[] = [{ t: 0, p: { ...p0 } }];
  let p = { ...p0 };
  let v = { ...v0 };
  const n = Math.ceil(Math.abs(seconds) / Math.abs(step));
  for (let i = 1; i <= n; i++) {
    // Midpoint method.
    const a1 = accel(v, k, liftG);
    const vm = { x: v.x + (a1.x * step) / 2, y: v.y + (a1.y * step) / 2, z: v.z + (a1.z * step) / 2 };
    const a2 = accel(vm, k, liftG);
    p = { x: p.x + vm.x * step, y: p.y + vm.y * step, z: p.z + vm.z * step };
    v = { x: v.x + a2.x * step, y: v.y + a2.y * step, z: v.z + a2.z * step };
    out.push({ t: i * step, p: { ...p } });
  }
  return out;
}

function sampleAt(path: { t: number; p: V3 }[], t: number): V3 {
  // path t is monotonic in |t|
  const step = path[1].t - path[0].t;
  const f = t / step;
  const i = Math.max(0, Math.min(path.length - 2, Math.floor(f)));
  const u = Math.min(1, Math.max(0, f - i));
  const a = path[i].p;
  const b = path[i + 1].p;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** The ball's 3D position over time (seconds, contact at tc), plus a projector, for drawing onto any frames. */
export function ballPath(o: SynthOpts & { w: number; h: number }) {
  const cam = assumedCamera(o.w, o.h, o.hfovDeg ?? 65);
  const dir = o.dir ?? 1;
  const c0 = o.contact ?? { X: 0.6 * dir, Y: 0.9, Z: 9 };
  const C: V3 = { x: c0.X, y: c0.Y, z: c0.Z };
  const k = dragK(SOFTBALL_12);
  const R = SOFTBALL_12.diamIn / 24;
  const vp = (o.pitchMph ?? 25) * MPH;
  const descent = ((o.descentDeg ?? 32) * Math.PI) / 180;
  const tc = o.contactAtS ?? 0.3;
  const step = 1 / 20000;
  const pitch = simulate(C, { x: -dir * vp * Math.cos(descent), y: vp * Math.sin(descent), z: 0 }, -Math.min(tc, 0.6), -step, k, o.liftG ?? 0);
  const ev = o.evMph * MPH;
  const L = (o.launchDeg * Math.PI) / 180;
  const S = (o.sprayDeg * Math.PI) / 180;
  const batted = simulate(C, { x: dir * ev * Math.cos(L) * Math.cos(S), y: -ev * Math.sin(L), z: ev * Math.sin(S) }, 0.4, step, k, 0);
  const at = (t: number): V3 | null => {
    const d = t - tc;
    if (d < -0.6 || d > 0.4) return null;
    return d < 0 ? sampleAt(pitch, d) : sampleAt(batted, d);
  };
  const proj = (p: V3) => ({ x: cam.cx + (cam.fPx * p.x) / p.z, y: cam.cy + (cam.fPx * p.y) / p.z, r: (cam.fPx * R) / p.z });
  return { cam, at, proj, tc };
}

/** Draws the motion-blurred ball for the frame starting at time t onto an RGBA image. */
export function drawBall(img: Uint8ClampedArray, w: number, h: number, path: ReturnType<typeof ballPath>, t: number, fps: number, shutter = 0.25, color = [235, 238, 70]) {
  if (!path.at(t)) return;
  drawBlurred(img, w, h, 10, (s) => {
    const p = path.at(t + (s * shutter) / fps) ?? path.at(t)!;
    const q = path.proj(p);
    return { kind: "disk", x0: q.x, y0: q.y, x1: q.x, y1: q.y, r: q.r };
  }, color);
}

export function renderHit(o: SynthOpts): SynthClip {
  const w = o.w ?? 960;
  const h = o.h ?? 540;
  const fps = o.fps ?? 240;
  const cam = assumedCamera(w, h, o.hfovDeg ?? 65);
  const dir = o.dir ?? 1;
  const c0 = o.contact ?? { X: 0.6 * dir, Y: 0.9, Z: 9 };
  const C: V3 = { x: c0.X, y: c0.Y, z: c0.Z };
  const k = dragK(SOFTBALL_12);
  const R = SOFTBALL_12.diamIn / 24; // radius, ft
  const pitchMph = o.pitchMph ?? 25;
  const descent = ((o.descentDeg ?? 32) * Math.PI) / 180;
  const vp = pitchMph * MPH;
  const tc = o.contactAtS ?? 0.3;
  const dur = o.durationS ?? 0.42;
  const step = 1 / 20000;
  // At contact the pitch is heading toward the catcher (-dir in x) and dropping; integrate backward in time from there.
  const pitch = simulate(C, { x: -dir * vp * Math.cos(descent), y: vp * Math.sin(descent), z: 0 }, -tc, -step, k, o.liftG ?? 0);
  const ev = o.evMph * MPH;
  const L = (o.launchDeg * Math.PI) / 180;
  const S = (o.sprayDeg * Math.PI) / 180;
  const batted = simulate(C, { x: dir * ev * Math.cos(L) * Math.cos(S), y: -ev * Math.sin(L), z: ev * Math.sin(S) }, dur - tc, step, k, 0);
  const ballAt = (t: number): V3 => (t < tc ? sampleAt(pitch, t - tc) : sampleAt(batted, t - tc));

  // Static background: soft texture, a fence line, a darker ground.
  const bg = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ground = y > h * 0.72;
      const base = ground ? 95 : 140;
      const tex = 18 * Math.sin(x / 37) * Math.cos(y / 23) + 8 * Math.sin((x + 2 * y) / 9);
      const fence = !ground && Math.abs((y % 60) - 30) < 2 ? -30 : 0;
      const v = base + tex + fence + (y / h) * 20;
      bg[i] = v * (ground ? 0.85 : 1);
      bg[i + 1] = v * (ground ? 1.0 : 1);
      bg[i + 2] = v * (ground ? 0.7 : 1.05);
      bg[i + 3] = 255;
    }
  }

  const rand = rng(12345);
  const noise = o.noise ?? 3;
  const shutter = o.shutter ?? 0.25;
  const frames: SynthClip["frames"] = [];
  const nFrames = Math.round(dur * fps);
  const proj = (p: V3) => ({ x: cam.cx + (cam.fPx * p.x) / p.z, y: cam.cy + (cam.fPx * p.y) / p.z, r: (cam.fPx * R) / p.z });
  const cProj = proj(C);
  for (let fi = 0; fi < nFrames; fi++) {
    const t = fi / fps;
    const img = new Uint8ClampedArray(bg);
    // Batter: a big block behind the contact point that sways a little.
    if (o.clutter !== false) {
      const sway = Math.sin(t * 9) * 6 + (t > tc - 0.08 ? (t - (tc - 0.08)) * 400 * dir : 0);
      const bx0 = Math.round(cProj.x - dir * 330 + sway - 60);
      const by0 = Math.round(cProj.y - 260);
      fillRect(img, w, h, bx0, by0, 120, 420, [150, 105, 90]);
    }
    // Bat: a thick bar swinging through the contact point around the hands.
    if (o.clutter !== false && t > tc - 0.05 && t < tc + 0.04) {
      const piv = { x: cProj.x - dir * 70, y: cProj.y - 90 };
      const Lb = Math.hypot(cProj.x - piv.x, cProj.y - piv.y) + 25;
      const phiC = Math.atan2(cProj.y - piv.y, cProj.x - piv.x);
      const omega = -dir * 45 * Math.sign(Math.sin(phiC) || 1);
      drawBlurred(img, w, h, 6, (s) => {
        const tt = t + (s * shutter) / fps;
        const phi = phiC + omega * (tt - tc);
        return { kind: "bar", x0: piv.x, y0: piv.y, x1: piv.x + Lb * Math.cos(phi), y1: piv.y + Lb * Math.sin(phi), r: 7 };
      }, [55, 55, 60]);
    }
    // Ball, motion-blurred over the exposure.
    drawBlurred(img, w, h, 10, (s) => {
      const p = ballAt(t + (s * shutter) / fps);
      const q = proj(p);
      return { kind: "disk", x0: q.x, y0: q.y, x1: q.x, y1: q.y, r: q.r };
    }, [235, 238, 70]);
    if (noise > 0) {
      for (let i = 0; i < img.length; i += 4) {
        const n = (rand() + rand() - 1) * noise * 1.7;
        img[i] += n;
        img[i + 1] += n;
        img[i + 2] += n;
      }
    }
    frames.push({ t: t * 1000 * (o.timeScale ?? 1), rgba: img });
  }
  // Truth at contact.
  const pv = sampleAt(pitch, -1 / fps / 4);
  const pc = sampleAt(pitch, 0);
  const dx = pc.x - pv.x;
  const dy = pc.y - pv.y;
  return {
    frames,
    cam,
    w,
    h,
    contactT: tc * 1000 * (o.timeScale ?? 1),
    truth: { pitchMph, descentDeg: (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI, evMph: o.evMph, launchDeg: o.launchDeg },
  };
}

function fillRect(img: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, rw: number, rh: number, c: number[]) {
  for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x++) {
      const i = (y * w + x) * 4;
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
    }
  }
}

type Shape = { kind: "disk" | "bar"; x0: number; y0: number; x1: number; y1: number; r: number };

/** Averages a shape's coverage over sub-exposure samples (motion blur) and blends its color in. */
function drawBlurred(img: Uint8ClampedArray, w: number, h: number, samples: number, at: (s: number) => Shape, color: number[]) {
  const shapes = Array.from({ length: samples }, (_, i) => at((i + 0.5) / samples));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.x0 - s.r, s.x1 - s.r);
    maxX = Math.max(maxX, s.x0 + s.r, s.x1 + s.r);
    minY = Math.min(minY, s.y0 - s.r, s.y1 - s.r);
    maxY = Math.max(maxY, s.y0 + s.r, s.y1 + s.r);
  }
  const x0 = Math.max(0, Math.floor(minX) - 1);
  const x1 = Math.min(w - 1, Math.ceil(maxX) + 1);
  const y0 = Math.max(0, Math.floor(minY) - 1);
  const y1 = Math.min(h - 1, Math.ceil(maxY) + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let cov = 0;
      for (const s of shapes) {
        let d: number;
        if (s.kind === "disk") d = Math.hypot(px - s.x0, py - s.y0);
        else d = segDist(px, py, s.x0, s.y0, s.x1, s.y1);
        cov += Math.min(1, Math.max(0, s.r - d + 0.5));
      }
      cov /= samples;
      if (cov <= 0) continue;
      const i = (y * w + x) * 4;
      img[i] = img[i] * (1 - cov) + color[0] * cov;
      img[i + 1] = img[i + 1] * (1 - cov) + color[1] * cov;
      img[i + 2] = img[i + 2] * (1 - cov) + color[2] * cov;
    }
  }
}

function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - (x0 + u * dx), py - (y0 + u * dy));
}
