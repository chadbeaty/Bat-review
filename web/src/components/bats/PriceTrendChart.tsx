import { formatPrice } from "@/lib/format";
import type { SaleRecord, TrendPoint } from "@/lib/price-stats";

// Verified sold prices over time, drawn to scale: one dot per verified sale and a line through each month's
// average. Hand-written SVG; hovering a mark shows its value, and a table below gives the same numbers as text.

const W = 640;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 32, left: 64 };

const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 864e5);

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

export function PriceTrendChart({ sales, trend, showAverages }: { sales: SaleRecord[]; trend: TrendPoint[]; showAverages: boolean }) {
  const verified = sales.filter((s) => s.verified);
  if (!verified.length) return null;
  const days = verified.map((s) => dayNumber(s.saleDate));
  const prices = verified.map((s) => s.priceCents);
  const ticks = niceTicks(Math.min(...prices), Math.max(...prices));
  const yMin = Math.min(ticks[0], ...prices);
  const yMax = Math.max(ticks[ticks.length - 1], ...prices);
  const dMin = Math.min(...days);
  const dMax = Math.max(...days);
  const x = (d: number) => (dMax === dMin ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((d - dMin) / (dMax - dMin)) * (W - PAD.left - PAD.right));
  const y = (c: number) => (yMax === yMin ? (PAD.top + H - PAD.bottom) / 2 : H - PAD.bottom - ((c - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom));
  const monthX = (m: string) => x(dayNumber(`${m}-15`));
  const line = trend.map((p, i) => `${i ? "L" : "M"}${monthX(p.month).toFixed(1)},${y(p.averageCents).toFixed(1)}`).join(" ");
  const first = verified.map((s) => s.saleDate).sort()[0];
  const last = verified.map((s) => s.saleDate).sort().at(-1)!;

  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Verified sold prices from ${first} to ${last}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--brand-line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="var(--brand-ink-soft)">
              {formatPrice(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 8} fontSize={12} fill="var(--brand-ink-soft)">
          {first}
        </text>
        {last !== first && (
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={12} fill="var(--brand-ink-soft)">
            {last}
          </text>
        )}
        {showAverages && trend.length > 1 && <path d={line} fill="none" stroke="var(--brand-ink)" strokeWidth={2} strokeLinejoin="round" />}
        {verified.map((s, i) => (
          <g key={i}>
            <circle cx={x(days[i])} cy={y(s.priceCents)} r={12} fill="transparent">
              <title>{`${s.saleDate}: ${formatPrice(s.priceCents)}${s.weightOz ? `, ${s.weightOz} oz` : ""}${s.conditionScore ? `, condition ${s.conditionScore}/10` : ""}`}</title>
            </circle>
            <circle cx={x(days[i])} cy={y(s.priceCents)} r={4.5} fill="var(--brand-accent)" stroke="var(--brand-ink)" strokeWidth={1.5} pointerEvents="none" />
          </g>
        ))}
      </svg>
      <figcaption className="text-xs text-ink-soft">
        Each dot is one verified sale on this site{showAverages && trend.length > 1 ? "; the line joins each month's average" : ""}. Asking prices are not included.
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-ink-soft">
              <th className="py-1 font-medium">Month</th>
              <th className="py-1 font-medium">Verified sales</th>
              {showAverages && <th className="py-1 font-medium">Average</th>}
              <th className="py-1 font-medium">Range</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((p) => (
              <tr key={p.month} className="border-t border-line">
                <td className="py-1 font-mono">{p.month}</td>
                <td className="py-1">{p.count}</td>
                {showAverages && <td className="py-1">{formatPrice(p.averageCents)}</td>}
                <td className="py-1">{p.minCents === p.maxCents ? formatPrice(p.minCents) : `${formatPrice(p.minCents)} – ${formatPrice(p.maxCents)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
