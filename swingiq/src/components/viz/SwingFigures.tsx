"use client";
import { BONES, L } from "@/engine/geometry";
import type { Handedness, Landmark, PoseFrame, SwingPhases } from "@/engine/types";

/*
  Pictures of the swing drawn straight from Gapper's tracking (the 33 body points saved with every swing). Nothing here
  invents a number: each drawing shows tracked points, and anything the camera couldn't see is simply not drawn.
  - Strobe: the swing as a multi-exposure, ghosted frames from load to contact, the hands' path as a lime light trail.
  - PoseThumb: one moment of the swing, cropped to the hitter (the phase strip under the replay).
  - BalanceTrace: the head and hip-center path from stance to finish over the feet at landing.
  - FrontLegBlock: the front leg at foot down (ghost) and at contact (lime).
  - PathTrail: the hands' path as a light trail, plus the tracked barrel on high-speed clips.
*/

export type Size = { width: number; height: number };
type Box = { x: number; y: number; w: number; h: number };
type BatPoint = { t: number; hx: number; hy: number; tx: number; ty: number; sx: number; sy: number };

const MIN_V = 0.35;
const FRONT_LEG = { R: [L.leftHip, L.leftKnee, L.leftAnkle, L.leftHeel, L.leftToe], L: [L.rightHip, L.rightKnee, L.rightAnkle, L.rightHeel, L.rightToe] } as const;

/** Nearest pose frame with body points to time t (within 80 ms), or null. */
export function poseAt(pose: PoseFrame[], t: number): Landmark[] | null {
  if (!pose.length) return null;
  let lo = 0;
  let hi = pose.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pose[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  for (const i of [lo, lo - 1, lo + 1, lo - 2, lo + 2]) {
    const f = pose[i];
    if (f?.lm && Math.abs(f.t - t) < 80) return f.lm;
  }
  return null;
}

/** A box around every visible point in these frames, in pixels of the clip, padded and grown to the given aspect. */
function fitBox(frames: (Landmark[] | null)[], size: Size, aspect: number, pad = 0.14): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const lm of frames) {
    if (!lm) continue;
    for (const p of lm) {
      if (p.v < MIN_V) continue;
      const x = p.x * size.width;
      const y = p.y * size.height;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (!Number.isFinite(x0)) return null;
  let w = x1 - x0;
  let h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  w *= 1 + pad * 2;
  h *= 1 + pad * 2;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const px = (p: Landmark, s: Size) => [p.x * s.width, p.y * s.height] as const;
const seen = (lm: Landmark[], i: number) => !!lm[i] && lm[i].v >= MIN_V;

/** One tracked body: bones, a head ring, the front leg in lime when asked. */
function Body({
  lm,
  size,
  scale,
  hand,
  stroke = "#ffffff",
  opacity = 1,
  lime = true,
  joints = true,
  className,
  style,
}: {
  lm: Landmark[];
  size: Size;
  scale: number;
  hand: Handedness;
  stroke?: string;
  opacity?: number;
  lime?: boolean;
  joints?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const front = new Set<number>(FRONT_LEG[hand]);
  const w = 2.4 * scale;
  const lines = BONES.filter(([a, b]) => seen(lm, a) && seen(lm, b));
  const nose = seen(lm, L.nose) ? px(lm[L.nose], size) : null;
  const ears = seen(lm, L.leftEar) && seen(lm, L.rightEar) ? Math.hypot((lm[L.leftEar].x - lm[L.rightEar].x) * size.width, (lm[L.leftEar].y - lm[L.rightEar].y) * size.height) : 0;
  return (
    <g opacity={opacity} className={className} style={style} strokeLinecap="round" strokeLinejoin="round">
      {lines.map(([a, b]) => {
        const p = px(lm[a], size);
        const q = px(lm[b], size);
        const isFront = lime && front.has(a) && front.has(b);
        return <line key={`${a}-${b}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={isFront ? "var(--color-optic)" : stroke} strokeWidth={isFront ? w * 1.35 : w} />;
      })}
      {nose && <circle cx={nose[0]} cy={nose[1]} r={Math.max(ears * 0.7, 7 * scale)} fill="none" stroke={stroke} strokeWidth={w} />}
      {joints &&
        [L.leftShoulder, L.rightShoulder, L.leftElbow, L.rightElbow, L.leftHip, L.rightHip, L.leftKnee, L.rightKnee, L.leftAnkle, L.rightAnkle]
          .filter((i) => seen(lm, i))
          .map((i) => {
            const p = px(lm[i], size);
            return <circle key={i} cx={p[0]} cy={p[1]} r={w * 0.85} fill={lime && front.has(i) ? "var(--color-optic)" : stroke} />;
          })}
    </g>
  );
}

function grip(lm: Landmark[], size: Size) {
  if (!seen(lm, L.leftWrist) || !seen(lm, L.rightWrist)) return null;
  const a = px(lm[L.leftWrist], size);
  const b = px(lm[L.rightWrist], size);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
}

/** The moments of the swing worth seeing, in order, each with the time it happened. */
export function phaseMoments(p: SwingPhases): { key: string; label: string; t: number }[] {
  return [
    { key: "stance", label: "Stance", t: p.stanceStart },
    p.loadStart !== null ? { key: "load", label: "Load", t: p.loadStart } : null,
    p.strideStart !== null ? { key: "stride", label: "Stride", t: p.strideStart } : null,
    p.footPlant !== null ? { key: "plant", label: "Foot down", t: p.footPlant } : null,
    { key: "launch", label: "Launch", t: p.launch },
    { key: "contact", label: "Contact", t: p.contact },
    { key: "finish", label: "Finish", t: p.finish },
  ].filter((m): m is { key: string; label: string; t: number } => !!m);
}

/**
 * The swing as a strobe photo: one ghost per phase from load to contact, brighter toward contact, the contact frame in
 * full white with the front leg in lime, the hands' path burned in as a lime light trail, and a ring where the front
 * heel landed.
 */
export function Strobe({
  pose,
  phases,
  size,
  hand,
  handPath,
  aspect = 4 / 5,
  animate = true,
  className = "",
  label,
}: {
  pose: PoseFrame[];
  phases: SwingPhases;
  size: Size;
  hand: Handedness;
  handPath: { t: number; x: number; y: number }[];
  aspect?: number;
  animate?: boolean;
  className?: string;
  label?: string;
}) {
  const moments = phaseMoments(phases).filter((m) => m.key !== "stance" && m.key !== "finish");
  const frames = moments.map((m) => ({ ...m, lm: poseAt(pose, m.t) })).filter((m): m is typeof m & { lm: Landmark[] } => !!m.lm);
  const contact = poseAt(pose, phases.contact);
  const finish = poseAt(pose, phases.finish);
  const box = fitBox([...frames.map((f) => f.lm), finish], size, aspect, 0.12);
  if (!box || !frames.length) return null;
  const scale = box.h / 300;
  const trail = handPath.filter((p) => p.t >= (phases.loadStart ?? phases.launch - 600) && p.t <= phases.contact + 40);
  const d = trail.map((p, i) => `${i ? "L" : "M"}${(p.x * size.width).toFixed(1)} ${(p.y * size.height).toFixed(1)}`).join("");
  const heel = phases.footPlant !== null ? poseAt(pose, phases.footPlant) : null;
  const heelIdx = hand === "R" ? L.leftHeel : L.rightHeel;
  const heelPt = heel && seen(heel, heelIdx) ? px(heel[heelIdx], size) : null;
  const ghosts = frames.filter((f) => f.key !== "contact");
  return (
    <svg
      viewBox={`${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`}
      className={`block ${className}`}
      role="img"
      aria-label={label ?? `Your swing as a strobe: ${frames.map((f) => f.label).join(", ")}, with the hands' path in lime.`}
    >
      {/* Ground under the feet at contact */}
      {contact && seen(contact, L.leftAnkle) && seen(contact, L.rightAnkle) && (
        <line
          x1={box.x + box.w * 0.06}
          x2={box.x + box.w * 0.94}
          y1={Math.max(contact[L.leftAnkle].y, contact[L.rightAnkle].y) * size.height + 6 * scale}
          y2={Math.max(contact[L.leftAnkle].y, contact[L.rightAnkle].y) * size.height + 6 * scale}
          stroke="rgb(255 255 255 / 0.1)"
          strokeWidth={1.2 * scale}
        />
      )}
      {ghosts.map((f, i) => {
        const o = 0.16 + (0.34 * (i + 1)) / Math.max(1, ghosts.length);
        return (
          <Body
            key={f.key}
            lm={f.lm}
            size={size}
            scale={scale}
            hand={hand}
            stroke="#d6dce2"
            opacity={o}
            lime={false}
            joints={false}
            className={animate ? "flash" : undefined}
            style={animate ? ({ animationDelay: `${i * 110}ms`, "--o": o } as React.CSSProperties) : undefined}
          />
        );
      })}
      {d && (
        <path
          d={d}
          fill="none"
          stroke="var(--color-optic)"
          strokeWidth={3.2 * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1000}
          className={`trail ${animate ? "draw-slow" : ""}`}
          style={animate ? ({ "--len": 1000, animationDelay: `${ghosts.length * 110}ms` } as React.CSSProperties) : undefined}
        />
      )}
      {heelPt && <circle cx={heelPt[0]} cy={heelPt[1]} r={11 * scale} fill="none" stroke="var(--color-optic)" strokeWidth={1.8 * scale} opacity="0.8" />}
      {contact && (
        <Body
          lm={contact}
          size={size}
          scale={scale}
          hand={hand}
          className={animate ? "flash" : undefined}
          style={animate ? { animationDelay: `${ghosts.length * 110 + 120}ms` } : undefined}
        />
      )}
      {contact &&
        (() => {
          const g = grip(contact, size);
          return g ? <circle cx={g[0]} cy={g[1]} r={5 * scale} fill="var(--color-optic)" className="trail" /> : null;
        })()}
    </svg>
  );
}

/** One moment of the swing, cropped to a shared box so every thumbnail in a strip lines up. */
export function stripBox(pose: PoseFrame[], times: number[], size: Size, aspect: number) {
  return fitBox(
    times.map((t) => poseAt(pose, t)),
    size,
    aspect,
    0.08,
  );
}

export function PoseThumb({ lm, box, size, hand, active }: { lm: Landmark[] | null; box: Box | null; size: Size; hand: Handedness; active?: boolean }) {
  if (!box) return <svg viewBox="0 0 40 50" className="block h-full w-full" aria-hidden="true" />;
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="block h-full w-full" aria-hidden="true">
      {lm ? <Body lm={lm} size={size} scale={box.h / 120} hand={hand} stroke={active ? "#ffffff" : "#aab1b8"} lime={!!active} joints={false} /> : null}
    </svg>
  );
}

/**
 * Balance: where the head and the middle of the hips travel from stance to finish, drawn over the feet at landing.
 * The Balance score reads exactly this (head and hips over the base, no stumbling).
 */
export function BalanceTrace({ pose, phases, size, hand }: { pose: PoseFrame[]; phases: SwingPhases; size: Size; hand: Handedness }) {
  const span = pose.filter((f) => f.lm && f.t >= phases.stanceStart && f.t <= phases.finish);
  if (span.length < 4) return null;
  const head: [number, number][] = [];
  const hips: [number, number][] = [];
  for (const f of span) {
    const lm = f.lm!;
    if (seen(lm, L.nose)) head.push([...px(lm[L.nose], size)] as [number, number]);
    if (seen(lm, L.leftHip) && seen(lm, L.rightHip)) {
      const a = px(lm[L.leftHip], size);
      const b = px(lm[L.rightHip], size);
      hips.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
  }
  const base = poseAt(pose, phases.footPlant ?? phases.contact);
  const contact = poseAt(pose, phases.contact);
  const box = fitBox([poseAt(pose, phases.stanceStart), contact, poseAt(pose, phases.finish)], size, 1.15, 0.1);
  if (!box || head.length < 3) return null;
  const s = box.h / 200;
  const line = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  const feet = base && seen(base, L.leftAnkle) && seen(base, L.rightAnkle) ? [px(base[L.leftAnkle], size), px(base[L.rightAnkle], size)] : null;
  const groundY = feet ? Math.max(feet[0][1], feet[1][1]) + 8 * s : null;
  const end = (pts: [number, number][]) => pts[pts.length - 1];
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="block w-full" role="img" aria-label="Your head and hip path from stance to finish, over your feet at landing.">
      {contact && <Body lm={contact} size={size} scale={s} hand={hand} stroke="#ffffff" opacity={0.16} lime={false} joints={false} />}
      {feet && groundY !== null && (
        <g>
          <line x1={Math.min(feet[0][0], feet[1][0]) - 18 * s} x2={Math.max(feet[0][0], feet[1][0]) + 18 * s} y1={groundY} y2={groundY} stroke="var(--color-clay)" strokeOpacity="0.55" strokeWidth={2 * s} />
          {feet.map((f, i) => (
            <rect key={i} x={f[0] - 9 * s} y={groundY - 3 * s} width={18 * s} height={6 * s} rx={3 * s} fill="var(--color-clay)" />
          ))}
          {/* the center of the base, straight up */}
          <line x1={(feet[0][0] + feet[1][0]) / 2} x2={(feet[0][0] + feet[1][0]) / 2} y1={groundY} y2={box.y + box.h * 0.04} stroke="rgb(255 255 255 / 0.12)" strokeDasharray={`${3 * s} ${5 * s}`} strokeWidth={1.2 * s} />
        </g>
      )}
      <path d={line(hips)} fill="none" stroke="var(--color-chalk-2)" strokeWidth={2.4 * s} strokeLinecap="round" strokeLinejoin="round" />
      <path d={line(head)} fill="none" stroke="var(--color-optic)" strokeWidth={2.8 * s} strokeLinecap="round" strokeLinejoin="round" className="trail" />
      <circle cx={head[0][0]} cy={head[0][1]} r={4 * s} fill="none" stroke="var(--color-optic)" strokeWidth={1.6 * s} />
      <circle cx={end(head)[0]} cy={end(head)[1]} r={5 * s} fill="var(--color-optic)" />
      {hips.length > 0 && <circle cx={end(hips)[0]} cy={end(hips)[1]} r={4.5 * s} fill="var(--color-chalk-2)" />}
      <text x={end(head)[0] + 9 * s} y={end(head)[1] + 4 * s} fontSize={12 * s} fill="var(--color-optic)" fontWeight="700" paintOrder="stroke" stroke="#0e0f11" strokeWidth={3.5 * s}>Head</text>
      {hips.length > 0 && <text x={end(hips)[0] + 9 * s} y={end(hips)[1] + 4 * s} fontSize={12 * s} fill="var(--color-chalk-2)" fontWeight="700" paintOrder="stroke" stroke="#0e0f11" strokeWidth={3.5 * s}>Hips</text>}
      {feet && groundY !== null && <text x={Math.max(feet[0][0], feet[1][0]) + 22 * s} y={groundY + 4 * s} fontSize={11 * s} fill="var(--color-clay)">Base</text>}
    </svg>
  );
}

/** The front leg at foot down (ghost) and at contact (lime): firming up gives the hips something to turn against. */
export function FrontLegBlock({ pose, phases, size, hand }: { pose: PoseFrame[]; phases: SwingPhases; size: Size; hand: Handedness }) {
  if (phases.footPlant === null) return null;
  const at = poseAt(pose, phases.footPlant);
  const hit = poseAt(pose, phases.contact);
  const [h, k, a] = FRONT_LEG[hand];
  if (!at || !hit || ![h, k, a].every((i) => seen(at, i) && seen(hit, i))) return null;
  const box = fitBox([at, hit], size, 1.15, 0.1);
  if (!box) return null;
  const s = box.h / 200;
  const leg = (lm: Landmark[]) => [h, k, a].map((i) => px(lm[i], size).map((v) => v.toFixed(1)).join(" ")).join(" L");
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="block w-full" role="img" aria-label="Your front leg at foot down, faint, and at contact, in lime.">
      <Body lm={hit} size={size} scale={s} hand={hand} stroke="#ffffff" opacity={0.18} lime={false} joints={false} />
      <path d={`M${leg(at)}`} fill="none" stroke="#d6dce2" strokeOpacity="0.45" strokeWidth={4 * s} strokeDasharray={`${5 * s} ${5 * s}`} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${leg(hit)}`} fill="none" stroke="var(--color-optic)" strokeWidth={5 * s} strokeLinecap="round" strokeLinejoin="round" className="trail" />
      {[h, k, a].map((i) => {
        const p = px(hit[i], size);
        return <circle key={i} cx={p[0]} cy={p[1]} r={4.5 * s} fill="var(--color-optic)" />;
      })}
    </svg>
  );
}

/**
 * Bat path: the hands' path from load through contact as a light trail, launch and contact marked, over the hitter at
 * contact. On a high-speed clip the tracked barrel is drawn too (every few frames, in alloy, sweet spot in lime).
 */
export function PathTrail({
  pose,
  phases,
  size,
  hand,
  handPath,
  batPath,
}: {
  pose: PoseFrame[];
  phases: SwingPhases;
  size: Size;
  hand: Handedness;
  handPath: { t: number; x: number; y: number }[];
  batPath?: BatPoint[];
}) {
  const from = phases.loadStart ?? phases.launch - 600;
  const raw = handPath.filter((p) => p.t >= from && p.t <= phases.finish);
  const pts = raw.map((p, i) => {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[Math.min(raw.length - 1, i + 1)];
    return { t: p.t, x: (a.x + p.x + b.x) / 3, y: (a.y + p.y + b.y) / 3 };
  });
  const contact = poseAt(pose, phases.contact);
  if (pts.length < 3 || !contact) return null;
  const bats = (batPath ?? []).filter((b) => b.t >= phases.launch - 40 && b.t <= phases.contact + 60);
  const batFrames = bats.map((b) => [
    { x: b.hx, y: b.hy, z: 0, v: 1 },
    { x: b.tx, y: b.ty, z: 0, v: 1 },
  ]);
  const upper = [L.nose, L.leftShoulder, L.rightShoulder, L.leftElbow, L.rightElbow, L.leftWrist, L.rightWrist, L.leftHip, L.rightHip];
  const focus = [...upper.map((i) => contact[i]), ...pts.map((p) => ({ x: p.x, y: p.y, z: 0, v: 1 }))];
  const box = fitBox([focus, ...batFrames], size, 1.15, 0.22);
  if (!box) return null;
  const s = box.h / 200;
  const P = (p: { x: number; y: number }) => [p.x * size.width, p.y * size.height] as const;
  const before = pts.filter((p) => p.t <= phases.contact);
  const after = pts.filter((p) => p.t >= phases.contact);
  const line = (xs: { x: number; y: number }[]) => xs.map((p, i) => `${i ? "L" : "M"}${P(p)[0].toFixed(1)} ${P(p)[1].toFixed(1)}`).join("");
  const near = (t: number) => pts.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), pts[0]);
  const launch = P(near(phases.launch));
  const hit = P(near(phases.contact));
  const step = Math.max(1, Math.round(bats.length / 7));
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="block w-full" role="img" aria-label={`Your hands' path from the load through contact${bats.length ? ", with the tracked barrel" : ""}.`}>
      <Body lm={contact} size={size} scale={s} hand={hand} stroke="#ffffff" opacity={0.18} lime={false} joints={false} />
      {bats
        .filter((_, i) => i % step === 0)
        .map((b, i) => (
          <line key={i} x1={b.hx * size.width} y1={b.hy * size.height} x2={b.tx * size.width} y2={b.ty * size.height} stroke="var(--color-clay)" strokeOpacity={0.25 + (0.5 * i) / 7} strokeWidth={2.4 * s} strokeLinecap="round" />
        ))}
      {bats.length > 1 && (
        <path d={bats.map((b, i) => `${i ? "L" : "M"}${(b.sx * size.width).toFixed(1)} ${(b.sy * size.height).toFixed(1)}`).join("")} fill="none" stroke="var(--color-clay)" strokeWidth={1.6 * s} strokeDasharray={`${4 * s} ${3 * s}`} />
      )}
      {after.length > 1 && <path d={line(after)} fill="none" stroke="var(--color-optic)" strokeOpacity="0.3" strokeWidth={2.4 * s} strokeLinecap="round" />}
      <path d={line(before)} fill="none" stroke="var(--color-optic)" strokeWidth={3.4 * s} strokeLinecap="round" strokeLinejoin="round" className="trail" />
      <circle cx={launch[0]} cy={launch[1]} r={4.5 * s} fill="var(--color-night)" stroke="#ffffff" strokeWidth={1.8 * s} />
      <text x={launch[0] - 8 * s} y={launch[1] - 8 * s} textAnchor="end" fontSize={11.5 * s} fill="var(--color-chalk-2)" fontWeight="700" paintOrder="stroke" stroke="#0e0f11" strokeWidth={3.5 * s}>Launch</text>
      <circle cx={hit[0]} cy={hit[1]} r={6 * s} fill="var(--color-optic)" />
      <text x={hit[0] + 9 * s} y={hit[1] + 14 * s} fontSize={11.5 * s} fill="var(--color-optic)" fontWeight="700" paintOrder="stroke" stroke="#0e0f11" strokeWidth={3.5 * s}>Contact</text>
    </svg>
  );
}
