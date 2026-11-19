"use client";
import { useId } from "react";
import { useCountUp } from "./brand";

/**
 * The Gapper Score dial: a 270° arc open at the bottom, like the G in the logo. Fine ticks light up in lime to the
 * score, the sweep ends in the ball, and a steel-blue index marks the previous score. A null score shows an unlit dial.
 */
export function ArcScore({ score, size = 220, label = "Gapper Score", previous = null }: { score: number | null; size?: number; label?: string; previous?: number | null }) {
  const id = useId().replace(/:/g, "");
  const shown = useCountUp(score);
  const c = 100;
  const a0 = 135;
  const sweep = 270;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (r: number, deg: number) => ({ x: c + r * Math.cos(rad(deg)), y: c + r * Math.sin(rad(deg)) });
  const ang = (v: number) => a0 + (sweep * Math.max(0, Math.min(100, v))) / 100;
  const v = score === null ? null : Math.max(0, Math.min(100, score));
  const R = 78;
  const arc = (r: number, from: number, to: number) => {
    const p0 = pt(r, from);
    const p1 = pt(r, to);
    return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  };
  const ticks = Array.from({ length: 51 }, (_, i) => i * 2);
  const tip = v === null ? null : pt(R, ang(v));
  const prev = previous === null ? null : ang(previous);
  return (
    <div style={{ width: size }} className="relative" role="img" aria-label={score === null ? `${label}: not enough data` : `${label}: ${score} out of 100`}>
      <svg viewBox="0 0 200 200" className="block w-full overflow-visible">
        <defs>
          <radialGradient id={`${id}-face`} cx="100" cy="80" r="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#1f2c40" />
            <stop offset="1" stopColor="#141d2d" />
          </radialGradient>
          <radialGradient id={`${id}-glow`}>
            <stop offset="0" stopColor="#b7f34a" stopOpacity="0.4" />
            <stop offset="1" stopColor="#b7f34a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Dial face */}
        <circle cx={c} cy={c} r="97" fill={`url(#${id}-face)`} stroke="rgb(255 255 255 / 0.06)" />
        {/* Bezel ticks, lit up to the score */}
        {ticks.map((t) => {
          const major = t % 10 === 0;
          const deg = ang(t);
          const o = pt(93, deg);
          const i = pt(major ? 85 : 89, deg);
          const lit = v !== null && t <= v;
          return <line key={t} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke={lit ? "var(--color-optic)" : major ? "#46556d" : "#2e3c52"} strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />;
        })}
        {/* Sweep */}
        <path d={arc(R, a0, a0 + sweep)} fill="none" stroke="#26344a" strokeWidth="4" strokeLinecap="round" />
        {v !== null && v > 0 && (
          <path d={arc(R, a0, ang(v))} fill="none" stroke="var(--color-optic)" strokeWidth="4" strokeLinecap="round" pathLength={1000} className="draw" style={{ ["--len" as string]: 1000 }} />
        )}
        {/* Scale numerals: 50 at the crown, 0 and 100 under the two ends of the sweep. */}
        {[
          { n: 0, p: { x: pt(R, a0).x, y: pt(R, a0).y + 15 } },
          { n: 50, p: pt(65, 270) },
          { n: 100, p: { x: pt(R, a0 + sweep).x, y: pt(R, a0 + sweep).y + 15 } },
        ].map(({ n, p }) => (
          <text key={n} x={p.x} y={p.y + 3} textAnchor="middle" fontSize="7.5" fill="var(--color-chalk-3)" style={{ fontFamily: "var(--font-num)" }}>
            {n}
          </text>
        ))}
        {prev !== null && (
          <path d={`M${pt(99, prev).x},${pt(99, prev).y} L${pt(93.5, prev - 2.2).x},${pt(93.5, prev - 2.2).y} L${pt(93.5, prev + 2.2).x},${pt(93.5, prev + 2.2).y} Z`} fill="var(--color-clay)" />
        )}
        {tip && (
          <g>
            <circle cx={tip.x} cy={tip.y} r="14" fill={`url(#${id}-glow)`} />
            <circle cx={tip.x} cy={tip.y} r="5.5" fill="var(--color-optic)" stroke="#141d2d" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <div className="jumbo text-chalk" style={{ fontSize: size * 0.27 }}>
          {shown ?? "—"}
        </div>
        <div className="mt-2 max-w-[60%] text-center text-[11px] leading-tight text-chalk-3">{label}</div>
      </div>
    </div>
  );
}
