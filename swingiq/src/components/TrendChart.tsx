"use client";
import { useId, useMemo, useState } from "react";

export type TrendPoint = { x: number; y: number; label: string; lo?: number | null; hi?: number | null; n?: number };

/**
 * One metric over sessions. A soft range band shows each session's spread (worst to best swing) when given; the line is
 * the session average. Crosshair + tooltip on touch, drawn in on first view, and a table for screen readers.
 */
export function TrendChart({
  points,
  unit,
  decimals = 0,
  title,
  lowerIsBetter = false,
  color = "var(--color-optic)",
}: {
  points: TrendPoint[];
  unit: string;
  decimals?: number;
  title: string;
  lowerIsBetter?: boolean;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");
  const W = 360;
  const H = 190;
  const pad = { l: 34, r: 12, t: 16, b: 26 };

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const ys = points.flatMap((p) => [p.y, p.lo ?? p.y, p.hi ?? p.y]);
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    if (hi - lo < 1e-6) {
      lo -= 1;
      hi += 1;
    }
    const span = hi - lo;
    lo -= span * 0.18;
    hi += span * 0.18;
    const sx = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
    const sy = (y: number) => pad.t + (1 - (y - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const ticks = [0.15, 0.5, 0.85].map((f) => lo + f * (hi - lo));
    return { sx, sy, ticks };
  }, [points, pad.l, pad.r, pad.t, pad.b]);

  if (!geo) return null;
  if (points.length < 2) {
    return (
      <div>
        <p className="head text-[15px] text-chalk">{title}</p>
        <p className="mt-2 text-[14px] text-chalk-2">
          One session so far: <span className="num text-xl text-chalk">{points[0].y.toFixed(decimals)}</span> {unit}. The line starts after your next session.
        </p>
      </div>
    );
  }
  const { sx, sy, ticks } = geo;
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const area = `${d} L${sx(points.length - 1).toFixed(1)},${H - pad.b} L${sx(0).toFixed(1)},${H - pad.b} Z`;
  const hasBand = points.some((p) => p.lo != null && p.hi != null);
  const band = hasBand
    ? `${points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.hi ?? p.y).toFixed(1)}`).join(" ")} ${points
        .map((p, i) => `L${sx(points.length - 1 - i).toFixed(1)},${sy(points[points.length - 1 - i].lo ?? points[points.length - 1 - i].y).toFixed(1)}`)
        .join(" ")} Z`
    : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(sx(i) - x) < Math.abs(sx(best) - x)) best = i;
    setHover(best);
  }

  const h = hover !== null ? points[hover] : null;
  const delta = points[points.length - 1].y - points[0].y;
  const improving = Math.abs(delta) > 0 ? (lowerIsBetter ? delta < 0 : delta > 0) : null;

  return (
    <figure aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="mb-2 flex items-baseline justify-between gap-3">
        <span className="head text-[15px] text-chalk">{title}</span>
        {improving !== null && points.length > 2 && (
          <span className={`text-[13px] ${improving ? "text-optic" : "text-chalk-3"}`}>
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta).toFixed(decimals)} {unit} since first
          </span>
        )}
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-a`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.16" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-line)" strokeWidth="1" strokeDasharray={i === 1 ? undefined : "2 4"} />
              <text x={pad.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--color-chalk-3)">
                {t.toFixed(decimals)}
              </text>
            </g>
          ))}
          {band && <path d={band} fill={color} fillOpacity="0.09" />}
          <path d={area} fill={`url(#${id}-a)`} />
          <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" pathLength={1000} className="draw" style={{ ["--len" as string]: 1000 }} />
          {points.map((p, i) => (
            <circle key={i} cx={sx(i)} cy={sy(p.y)} r={hover === i ? 6 : 3.5} fill={color} stroke="var(--color-night-2)" strokeWidth="2" />
          ))}
          {h && hover !== null && <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-chalk-3)" strokeWidth="1" strokeDasharray="3 3" />}
          <text x={pad.l} y={H - 8} fontSize="10.5" fill="var(--color-chalk-3)">{points[0].label}</text>
          <text x={W - pad.r} y={H - 8} fontSize="10.5" textAnchor="end" fill="var(--color-chalk-3)">{points[points.length - 1].label}</text>
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line-2 bg-night-3 px-2.5 py-1.5 text-xs shadow-2xl"
            style={{ left: `${Math.min(85, Math.max(15, (sx(hover) / W) * 100))}%`, top: -6 }}
          >
            <div className="text-chalk-3">
              {h.label}
              {h.n ? ` · ${h.n} swings` : ""}
            </div>
            <div className="num text-base text-chalk">
              {h.y.toFixed(decimals)} <span className="font-sans text-xs font-normal text-chalk-3">{unit}</span>
            </div>
            {h.lo != null && h.hi != null && h.hi !== h.lo && (
              <div className="text-[11px] text-chalk-3">
                range {h.lo.toFixed(decimals)}–{h.hi.toFixed(decimals)}
              </div>
            )}
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
