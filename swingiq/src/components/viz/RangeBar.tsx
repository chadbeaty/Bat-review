/**
 * One measured speed on a scale: the reading, its ± band, and the player's own average and best as tick marks.
 * The scale comes from their own history when there is one, so the comparison is always to themselves.
 */
export function RangeBar({
  value,
  pm,
  avg,
  best,
  domain,
  unit,
  label,
}: {
  value: number;
  pm?: number;
  avg?: number | null;
  best?: number | null;
  domain: [number, number];
  unit: string;
  label: string;
}) {
  const [lo, hi] = domain;
  const p = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const bandL = pm ? Math.max(lo, value - pm) : value;
  const bandR = pm ? Math.min(hi, value + pm) : value;
  return (
    <div role="img" aria-label={`${label}: ${Math.round(value)} ${unit}${pm ? ` ± ${Math.round(pm)}` : ""}${avg != null ? `, your average ${Math.round(avg)}` : ""}${best != null ? `, your best ${Math.round(best)}` : ""}`}>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-night-4" />
        {pm ? (
          <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-optic/25 ring-1 ring-optic/40" style={{ left: p(bandL), width: `calc(${p(bandR)} - ${p(bandL)})` }} />
        ) : null}
        {avg != null && <div className="absolute top-0.5 h-5 w-px bg-chalk-3" style={{ left: p(avg) }} />}
        {best != null && <div className="absolute top-0.5 h-5 w-0.5 bg-clay" style={{ left: p(best) }} />}
        <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-night bg-optic shadow-[0_0_12px_rgb(183_243_74/0.22)]" style={{ left: p(value) }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-chalk-3">
        <span>{lo}</span>
        <span className="flex gap-3">
          {avg != null && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-px bg-chalk-3" aria-hidden="true" />
              avg {Math.round(avg)}
            </span>
          )}
          {best != null && (
            <span className="flex items-center gap-1 text-clay">
              <span className="inline-block h-2.5 w-0.5 bg-clay" aria-hidden="true" />
              best {Math.round(best)}
            </span>
          )}
        </span>
        <span>{hi}</span>
      </div>
    </div>
  );
}

/** A scale that fits a value and the player's history with some breathing room, snapped to 5s. */
export function speedDomain(values: number[], fallback: [number, number]): [number, number] {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return fallback;
  const lo = Math.floor((Math.min(...xs) - 8) / 5) * 5;
  const hi = Math.ceil((Math.max(...xs) + 8) / 5) * 5;
  return [Math.max(0, Math.min(lo, fallback[0] + 20)), Math.max(hi, lo + 20)];
}
