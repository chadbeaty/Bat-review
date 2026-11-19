"use client";
import { useId, useMemo, useState } from "react";

export type TrendPoint = { x: number; y: number; label: string };

/**
 * Single-series trend line (one metric over sessions). One series, so no legend: the title names it.
 * 2px line, 8px markers, recessive grid, crosshair + tooltip on hover/touch, and a table for screen readers.
 */
export function TrendChart({ points, unit, decimals = 0, title, lowerIsBetter = false }: { points: TrendPoint[]; unit: string; decimals?: number; title: string; lowerIsBetter?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  // Sized close to a phone's width so labels render at real size.
  const W = 360;
  const H = 180;
  const pad = { l: 36, r: 10, t: 14, b: 24 };

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const ys = points.map((p) => p.y);
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    if (hi - lo < 1e-6) {
      lo -= 1;
      hi += 1;
    }
    const span = hi - lo;
    lo -= span * 0.15;
    hi += span * 0.15;
    const sx = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
    const sy = (y: number) => pad.t + (1 - (y - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const ticks = [0, 0.5, 1].map((f) => lo + f * (hi - lo));
    return { sx, sy, ticks };
  }, [points, pad.l, pad.r, pad.t, pad.b]);

  if (!geo) return null;
  if (points.length < 2) {
    return (
      <div>
        <p className="text-[15px] font-bold text-chalk">{title}</p>
        <p className="mt-2 text-[14px] text-chalk-2">
          One session so far: <span className="num text-xl text-chalk">{points[0].y.toFixed(decimals)}</span> {unit}. The trend line starts after your next session.
        </p>
      </div>
    );
  }
  const { sx, sy, ticks } = geo;
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(sx(i) - x) < Math.abs(sx(best) - x)) best = i;
    setHover(best);
  }

  const h = hover !== null ? points[hover] : null;
  const first = points[0].y;
  const lastY = points[points.length - 1].y;
  const delta = lastY - first;
  const improving = points.length > 1 && Math.abs(delta) > 0 ? (lowerIsBetter ? delta < 0 : delta > 0) : null;

  return (
    <figure aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold text-chalk">{title}</span>
        {improving !== null && points.length > 2 && (
          <span className={`text-[13px] ${improving ? "text-optic" : "text-chalk-3"}`}>
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta).toFixed(decimals)} {unit} since first session
          </span>
        )}
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          aria-hidden="true"
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-line)" strokeWidth="1" />
              <text x={pad.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-chalk-3)">
                {t.toFixed(decimals)}
              </text>
            </g>
          ))}
          <path d={d} fill="none" stroke="var(--color-optic)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle key={i} cx={sx(i)} cy={sy(p.y)} r={hover === i ? 6 : 4} fill="var(--color-optic)" stroke="var(--color-night-2)" strokeWidth="2" />
          ))}
          {h && hover !== null && <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-chalk-3)" strokeWidth="1" strokeDasharray="3 3" />}
          <text x={pad.l} y={H - 8} fontSize="11" fill="var(--color-chalk-3)">{points[0].label}</text>
          {points.length > 1 && (
            <text x={W - pad.r} y={H - 8} fontSize="11" textAnchor="end" fill="var(--color-chalk-3)">{points[points.length - 1].label}</text>
          )}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-night-3 px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${(sx(hover) / W) * 100}%`, top: 0 }}
          >
            <div className="text-chalk-3">{h.label}</div>
            <div className="num text-base text-chalk">
              {h.y.toFixed(decimals)} <span className="font-sans text-xs font-normal text-chalk-3">{unit}</span>
            </div>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr><th>Session</th><th>{unit}</th></tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}><td>{p.label}</td><td>{p.y.toFixed(decimals)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
