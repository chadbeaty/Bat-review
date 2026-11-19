"use client";
import { useState } from "react";
import type { HitDirection, HitType, Handedness } from "@/engine/types";

type Tagged = { direction?: HitDirection; type?: HitType };

/**
 * Spray chart from the hits the player tagged (a cage net stops the ball, so landing spots can't be tracked from one
 * phone). Each field wedge's fill strength is its share of tagged hits: one hue, light to strong.
 * Pull is left field for a righty and right field for a lefty.
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
  // Field wedges, left to right as seen from home plate.
  const left: HitDirection = hand === "R" ? "pull" : "oppo";
  const right: HitDirection = hand === "R" ? "oppo" : "pull";
  const wedges: { d: HitDirection; path: string; lx: number; ly: number }[] = [
    { d: left, path: "M150,190 L22,62 A181,181 0 0 1 104,18 Z", lx: 70, ly: 70 },
    { d: "center", path: "M150,190 L104,18 A181,181 0 0 1 196,18 Z", lx: 150, ly: 50 },
    { d: right, path: "M150,190 L196,18 A181,181 0 0 1 278,62 Z", lx: 230, ly: 70 },
  ];
  const label = { pull: "Pull", center: "Middle", oppo: "Oppo" };

  return (
    <div>
      <svg viewBox="0 0 300 200" className="w-full max-w-md" role="img" aria-label={`Spray chart: ${wedges.map((w) => `${label[w.d]} ${count(w.d)}`).join(", ")} of ${total} tagged hits`}>
        {wedges.map((w) => {
          const share = total ? count(w.d) / total : 0;
          return (
            <g key={w.d} onPointerEnter={() => setHover(w.d)} onPointerLeave={() => setHover(null)} onPointerDown={() => setHover(w.d)}>
              <path d={w.path} fill="var(--color-optic)" fillOpacity={0.08 + share * 0.72} stroke="var(--color-night)" strokeWidth="2" />
              <text x={w.lx} y={w.ly} textAnchor="middle" fontSize="13" fill={share > 0.45 ? "var(--color-optic-ink)" : "var(--color-chalk)"} fontWeight="700">
                {total ? `${Math.round(share * 100)}%` : "—"}
              </text>
              <text x={w.lx} y={w.ly + 15} textAnchor="middle" fontSize="11" fill={share > 0.45 ? "var(--color-optic-ink)" : "var(--color-chalk-2)"}>
                {label[w.d]}
              </text>
            </g>
          );
        })}
        {/* Infield diamond */}
        <path d="M150,190 L190,150 L150,110 L110,150 Z" fill="none" stroke="var(--color-chalk-3)" strokeWidth="1.5" />
      </svg>
      <p className="mt-1 min-h-5 text-[13px] text-chalk-2" aria-live="polite">
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
