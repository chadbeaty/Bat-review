"use client";
import { useState } from "react";
import type { HitDirection, HitType, Handedness } from "@/engine/types";

type Tagged = { direction?: HitDirection; type?: HitType; ev?: number | null };

/**
 * Spray chart from the hits the player tagged (a cage net stops the ball, so landing spots can't be tracked from one
 * phone). Wedge heat = share of tagged hits; each tagged ball is a dot placed by direction and hit type (grounders short,
 * liners mid, fly balls deep). Dots with a measured exit velocity glow. Pull is left field for a righty.
 */
export function SprayChart({ tags, hand }: { tags: Tagged[]; hand: Handedness }) {
  const [hover, setHover] = useState<HitDirection | null>(null);
  const inPlay = tags.filter((t) => t.direction && t.type !== "miss" && t.type !== "foul");
  const total = inPlay.length;
  const count = (d: HitDirection) => inPlay.filter((t) => t.direction === d).length;
  const byType = (d: HitDirection) => {
    const xs = inPlay.filter((t) => t.direction === d);
    const n = (k: HitType) => xs.filter((t) => t.type === k).length;
    return { grounder: n("grounder"), liner: n("liner"), fly: n("fly"), popup: n("popup") };
  };
  const home = { x: 160, y: 206 };
  const R = 176;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (r: number, deg: number) => ({ x: home.x + r * Math.cos(rad(deg)), y: home.y + r * Math.sin(rad(deg)) });
  const left: HitDirection = hand === "R" ? "pull" : "oppo";
  const right: HitDirection = hand === "R" ? "oppo" : "pull";
  const zones: { d: HitDirection; a0: number; a1: number }[] = [
    { d: left, a0: -135, a1: -105 },
    { d: "center", a0: -105, a1: -75 },
    { d: right, a0: -75, a1: -45 },
  ];
  const wedge = (r: number, a0: number, a1: number) => {
    const p0 = pt(r, a0);
    const p1 = pt(r, a1);
    return `M${home.x},${home.y} L${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r},${r} 0 0 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)} Z`;
  };
  const depth: Record<string, number> = { grounder: 0.3, popup: 0.22, liner: 0.6, fly: 0.86 };
  const label = { pull: "Pull", center: "Middle", oppo: "Oppo" };
  // Deterministic jitter so dots don't stack.
  const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

  return (
    <div>
      <svg viewBox="0 0 320 214" className="mx-auto w-full max-w-md" role="img" aria-label={`Spray chart: ${zones.map((z) => `${label[z.d]} ${count(z.d)}`).join(", ")} of ${total} tagged hits`}>
        <path d={wedge(R * 0.42, -135, -45)} fill="var(--color-clay)" fillOpacity="0.07" />
        {zones.map((z) => {
          const share = total ? count(z.d) / total : 0;
          const mid = (z.a0 + z.a1) / 2;
          const lp = pt(R * 0.97, mid);
          return (
            <g key={z.d} onPointerEnter={() => setHover(z.d)} onPointerLeave={() => setHover(null)} onPointerDown={() => setHover(z.d)}>
              <path d={wedge(R, z.a0, z.a1)} fill="var(--color-optic)" fillOpacity={0.04 + share * 0.3} stroke="var(--color-night)" strokeWidth="2" />
              <text x={lp.x} y={lp.y + 16} textAnchor="middle" fontSize="13" fill="var(--color-chalk)" fontWeight="700">
                {total ? `${Math.round(share * 100)}%` : "—"}
              </text>
              <text x={lp.x} y={lp.y + 30} textAnchor="middle" fontSize="10.5" fill="var(--color-chalk-2)">
                {label[z.d]}
              </text>
            </g>
          );
        })}
        <path d={`M${pt(R, -135).x},${pt(R, -135).y} L${home.x},${home.y} L${pt(R, -45).x},${pt(R, -45).y}`} fill="none" stroke="var(--color-chalk-3)" strokeWidth="1.2" />
        <path d={`M${pt(R, -135).x},${pt(R, -135).y} A${R},${R} 0 0 1 ${pt(R, -45).x},${pt(R, -45).y}`} fill="none" stroke="var(--color-line-2)" strokeWidth="1.5" />
        <path d={`M${home.x},${home.y} l30,-30 l-30,-30 l-30,30 z`} fill="none" stroke="var(--color-line-2)" strokeWidth="1" />
        {inPlay.map((t, i) => {
          const z = zones.find((q) => q.d === t.direction)!;
          const ang = z.a0 + 4 + jitter(i) * (z.a1 - z.a0 - 8);
          const r = R * ((depth[t.type ?? "liner"] ?? 0.6) + (jitter(i + 7) - 0.5) * 0.1);
          const p = pt(r, ang);
          const lit = t.ev != null;
          return <circle key={i} cx={p.x} cy={p.y} r={lit ? 4 : 3} fill={lit ? "var(--color-optic)" : "var(--color-chalk-2)"} stroke="var(--color-night)" strokeWidth="1.5" />;
        })}
        <path d={`M${home.x - 6},${home.y - 3} h12 v3 l-6,4 l-6,-4 z`} fill="var(--color-chalk-2)" />
      </svg>
      <p className="mt-1 min-h-5 text-center text-[13px] text-chalk-2" aria-live="polite">
        {hover
          ? (() => {
              const b = byType(hover);
              return `${label[hover]}: ${count(hover)} hits · ${b.liner} liners, ${b.grounder} grounders, ${b.fly} fly balls, ${b.popup} pop-ups`;
            })()
          : total
            ? `${total} tagged hits in play. Tap a wedge for the breakdown.`
            : "Tag swings (grounder, liner… and pull, middle, oppo) on any swing's page to fill this in."}
      </p>
    </div>
  );
}
