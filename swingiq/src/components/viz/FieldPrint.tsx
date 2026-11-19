"use client";
import { useState } from "react";
import type { ScoreCategoryKey } from "@/engine/types";
import { CATEGORY_KEYS, CATEGORY_SHORT, type CategorySummary } from "@/lib/insights";

/**
 * Field Print: a hitter's six score categories drawn as wedges in the shape of a softball field. Each wedge reaches as
 * far out as its score (the fence is 100). A silver outline shows the block before, for comparison. A category that
 * was never measured is a dashed, empty wedge: never a fake zero.
 */
export function FieldPrint({
  now,
  before,
  size = 340,
  title = "Field Print",
  caption,
}: {
  now: CategorySummary;
  before?: CategorySummary | null;
  size?: number;
  title?: string;
  caption?: React.ReactNode;
}) {
  const [sel, setSel] = useState<ScoreCategoryKey | null>(null);
  const W = 360;
  const H = 240;
  const home = { x: 180, y: 226 };
  const R = 166;
  const a0 = -135;
  const step = 90 / CATEGORY_KEYS.length;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (r: number, deg: number) => ({ x: home.x + r * Math.cos(rad(deg)), y: home.y + r * Math.sin(rad(deg)) });
  const wedge = (r: number, d0: number, d1: number) => {
    const p0 = pt(r, d0);
    const p1 = pt(r, d1);
    return `M${home.x},${home.y} L${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r},${r} 0 0 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)} Z`;
  };
  const arc = (r: number) => {
    const p0 = pt(r, a0);
    const p1 = pt(r, a0 + 90);
    return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r},${r} 0 0 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  };
  const rOf = (score: number) => Math.max(6, (R * Math.max(0, Math.min(100, score))) / 100);
  const measured = CATEGORY_KEYS.filter((k) => now[k].avg !== null);
  const s = sel ? now[sel] : null;
  const b = sel && before ? before[sel] : null;

  return (
    <figure>
      <figcaption className="sr-only">
        {title}: {CATEGORY_KEYS.map((k) => `${CATEGORY_SHORT[k]} ${now[k].avg === null ? "not measured" : Math.round(now[k].avg!)}`).join(", ")}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: size }} className="mx-auto block w-full select-none" aria-hidden="true">
        <defs>
          <radialGradient id="fp-fill" cx={home.x} cy={home.y} r={R} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--color-optic)" stopOpacity="0.08" />
            <stop offset="1" stopColor="var(--color-optic)" stopOpacity="0.26" />
          </radialGradient>
        </defs>
        {/* Infield dirt and diamond */}
        <path d={wedge(R * 0.36, a0, a0 + 90)} fill="var(--color-clay)" fillOpacity="0.06" />
        <path d={`M${home.x},${home.y} l26,-26 l-26,-26 l-26,26 z`} fill="none" stroke="var(--color-line-2)" strokeWidth="1" />
        {/* Distance arcs: 25 / 50 / 75, fence at 100 */}
        {[0.25, 0.5, 0.75].map((f) => (
          <path key={f} d={arc(R * f)} fill="none" stroke="var(--color-line)" strokeWidth="1" strokeDasharray="2 4" />
        ))}
        <path d={arc(R)} fill="none" stroke="var(--color-line-2)" strokeWidth="1.5" />
        <line x1={home.x} y1={home.y} x2={pt(R, a0).x} y2={pt(R, a0).y} stroke="var(--color-chalk-3)" strokeWidth="1.2" />
        <line x1={home.x} y1={home.y} x2={pt(R, a0 + 90).x} y2={pt(R, a0 + 90).y} stroke="var(--color-chalk-3)" strokeWidth="1.2" />
        {CATEGORY_KEYS.map((k, i) => {
          const d0 = a0 + i * step;
          const d1 = d0 + step;
          const v = now[k].avg;
          const pv = before?.[k]?.avg ?? null;
          const on = sel === k;
          const mid = d0 + step / 2;
          const lp = pt(R + 9, mid);
          const left = mid < -90;
          return (
            <g key={k} onPointerDown={() => setSel(on ? null : k)} className="cursor-pointer">
              {/* hit area */}
              <path d={wedge(R + 4, d0, d1)} fill="transparent" />
              {v === null ? (
                <path d={wedge(R * 0.92, d0 + 1, d1 - 1)} fill="none" stroke="var(--color-line-2)" strokeWidth="1" strokeDasharray="3 4" />
              ) : (
                <path
                  d={wedge(rOf(v), d0 + 0.8, d1 - 0.8)}
                  fill={on ? "var(--color-optic)" : "url(#fp-fill)"}
                  fillOpacity={on ? 0.55 : 1}
                  stroke="var(--color-optic)"
                  strokeWidth={on ? 2 : 1.2}
                  style={{ transition: "fill-opacity .2s" }}
                />
              )}
              {pv !== null && (
                <path
                  d={`M${pt(rOf(pv), d0 + 0.8).x.toFixed(1)},${pt(rOf(pv), d0 + 0.8).y.toFixed(1)} A${rOf(pv)},${rOf(pv)} 0 0 1 ${pt(rOf(pv), d1 - 0.8).x.toFixed(1)},${pt(rOf(pv), d1 - 0.8).y.toFixed(1)}`}
                  fill="none"
                  stroke="var(--color-clay)"
                  strokeWidth="2"
                />
              )}
              <text
                x={lp.x}
                y={lp.y}
                transform={`rotate(${left ? mid + 180 : mid} ${lp.x} ${lp.y})`}
                textAnchor={left ? "end" : "start"}
                dominantBaseline="middle"
                fontSize="10.5"
                fill={on ? "var(--color-optic)" : v === null ? "var(--color-chalk-3)" : "var(--color-chalk-2)"}
                fontWeight={on ? 700 : 400}
              >
                {CATEGORY_SHORT[k]}
              </text>
            </g>
          );
        })}
        {/* Plate */}
        <path d={`M${home.x - 7},${home.y - 4} h14 v4 l-7,5 l-7,-5 z`} fill="var(--color-chalk-2)" />
      </svg>
      <div className="mt-2 min-h-[3.25rem] text-center" aria-live="polite">
        {s ? (
          <div>
            <div className="head text-[15px] text-chalk">{CATEGORY_SHORT[sel!]}</div>
            <div className="mt-0.5 text-[13px] text-chalk-2">
              {s.avg === null ? (
                "Not measured yet. Side view measures the most."
              ) : (
                <>
                  <span className="num text-[18px] text-optic">{Math.round(s.avg)}</span> average over {s.n} {s.n === 1 ? "swing" : "swings"}
                  {b && b.avg !== null && (
                    <>
                      {" · "}
                      <span className="text-clay">{Math.round(b.avg)} before</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-chalk-3">
            {measured.length ? (caption ?? "Tap a wedge. The fence is 100.") : "Record a few swings and your print fills in."}
          </p>
        )}
      </div>
    </figure>
  );
}
