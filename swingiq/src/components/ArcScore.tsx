"use client";
import { useId } from "react";
import { useCountUp } from "./brand";

/**
 * The Gapper Score gauge: the outfield from the logo. Four blocks with three gaps sweep left to right and fill with
 * lime up to the score, the ball sits at the leading edge, and an alloy index marks the previous score. The number
 * sits under the arc in black italic. A null score shows the outfield unlit.
 */
export function ArcScore({ score, size = 220, label = "Gapper Score", previous = null }: { score: number | null; size?: number; label?: string; previous?: number | null }) {
  const id = useId().replace(/:/g, "");
  const shown = useCountUp(score);
  const cx = 100;
  const cy = 104;
  const a0 = 198;
  const a1 = 342;
  const gap = 4; // degrees between blocks
  const rIn = 66;
  const rOut = 92;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (r: number, deg: number) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))] as const;
  const f = (n: number) => n.toFixed(2);
  const ang = (v: number) => a0 + ((a1 - a0) * Math.max(0, Math.min(100, v))) / 100;
  const block = (from: number, to: number) => {
    const o0 = pt(rOut, from);
    const o1 = pt(rOut, to);
    const i1 = pt(rIn, to);
    const i0 = pt(rIn, from);
    return `M${f(o0[0])} ${f(o0[1])}A${rOut} ${rOut} 0 0 1 ${f(o1[0])} ${f(o1[1])}L${f(i1[0])} ${f(i1[1])}A${rIn} ${rIn} 0 0 0 ${f(i0[0])} ${f(i0[1])}Z`;
  };
  const span = (a1 - a0 - gap * 3) / 4;
  const blocks = [0, 1, 2, 3].map((i) => {
    const from = a0 + i * (span + gap);
    return { from, to: from + span };
  });
  const v = score === null ? null : Math.max(0, Math.min(100, score));
  const at = v === null ? null : ang(v);
  const prev = previous === null ? null : ang(previous);
  const ball = at === null ? null : pt((rIn + rOut) / 2, at);
  return (
    <div style={{ width: size }} className="relative" role="img" aria-label={score === null ? `${label}: not enough data` : `${label}: ${score} out of 100`}>
      <svg viewBox="0 2 200 154" className="block w-full overflow-visible">
        <defs>
          <linearGradient id={`${id}-blk`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b2f35" />
            <stop offset="1" stopColor="#1c1f23" />
          </linearGradient>
          <clipPath id={`${id}-fill`}>
            {at !== null && at > a0 && <path d={`M${cx} ${cy}L${f(pt(130, a0 - 2)[0])} ${f(pt(130, a0 - 2)[1])}A130 130 0 0 1 ${f(pt(130, at)[0])} ${f(pt(130, at)[1])}Z`} />}
          </clipPath>
          <radialGradient id={`${id}-glow`}>
            <stop offset="0" stopColor="#c4f135" stopOpacity="0.45" />
            <stop offset="1" stopColor="#c4f135" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Unlit outfield */}
        {blocks.map((b, i) => (
          <path key={i} d={block(b.from, b.to)} fill={`url(#${id}-blk)`} stroke="rgb(255 255 255 / 0.05)" />
        ))}
        {/* Lit to the score */}
        <g clipPath={`url(#${id}-fill)`} className="animate-fade">
          {blocks.map((b, i) => (
            <path key={i} d={block(b.from, b.to)} fill="var(--color-optic)" />
          ))}
        </g>
        {/* Ticks every 5 points around the outside, lit up to the score (the scoreboard ring). */}
        {Array.from({ length: 21 }, (_, i) => i * 5).map((n) => {
          const a = ang(n);
          const major = n % 25 === 0;
          const o = pt(rOut + (major ? 9 : 7), a);
          const i0 = pt(rOut + 4, a);
          return (
            <line
              key={n}
              x1={f(i0[0])}
              y1={f(i0[1])}
              x2={f(o[0])}
              y2={f(o[1])}
              stroke={v !== null && n <= v ? "var(--color-optic)" : "rgb(255 255 255 / 0.18)"}
              strokeOpacity={v !== null && n <= v ? 0.75 : 1}
              strokeWidth={major ? 1.4 : 0.9}
            />
          );
        })}
        {/* Scale: 0 and 100 under the two ends */}
        {[
          { n: 0, p: pt(rOut + 6, a0) },
          { n: 100, p: pt(rOut + 6, a1) },
        ].map(({ n, p }) => (
          <text key={n} x={p[0]} y={p[1] + 12} textAnchor="middle" fontSize="8" fill="var(--color-chalk-3)" style={{ fontFamily: "var(--font-num)" }}>
            {n}
          </text>
        ))}
        {prev !== null && (
          <path d={`M${f(pt(rOut + 3, prev)[0])} ${f(pt(rOut + 3, prev)[1])}L${f(pt(rOut + 10, prev - 2.6)[0])} ${f(pt(rOut + 10, prev - 2.6)[1])}L${f(pt(rOut + 10, prev + 2.6)[0])} ${f(pt(rOut + 10, prev + 2.6)[1])}Z`} fill="var(--color-clay)" />
        )}
        {ball && (
          <g className="land">
            <circle cx={ball[0]} cy={ball[1]} r="15" fill={`url(#${id}-glow)`} />
            <circle cx={ball[0]} cy={ball[1]} r="7.5" fill="var(--color-optic)" stroke="#0b0c0e" strokeWidth="3" />
          </g>
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-[6%] flex flex-col items-center">
        <div className="jumbo text-chalk" style={{ fontSize: size * 0.27 }}>
          {shown ?? "—"}
        </div>
        <div className="mt-1.5 max-w-[70%] text-center text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-chalk-3">{label}</div>
      </div>
    </div>
  );
}
