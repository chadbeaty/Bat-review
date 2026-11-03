import { LIFE_MAX, LIFE_ZONES, lifeSummary, markerPercent, zoneFor } from "@/lib/life-meter";

const TICKS = [0, 500, 1000, 1500, 2000, 2500, 3000];

/**
 * Break-in / prime / late-life track with a marker at the seller's reported hit count. The zones are typical
 * guidance, not measurements of this bat. Built for the ink band on the listing page.
 */
export function LifeMeter({ hits }: { hits: number | null }) {
  const pct = hits == null ? null : markerPercent(hits);
  const zone = hits == null ? null : LIFE_ZONES.find((z) => z.key === zoneFor(hits))!;
  return (
    <section aria-labelledby="life-heading" className="grid gap-2.5" data-testid="life-meter">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="life-heading" className="label text-[#9fb0b8]">
          Life meter
        </h2>
        <p className="font-mono text-xs text-[#d3dadc]">{hits == null ? "Seller didn't give a hit count" : `Seller reports about ${hits.toLocaleString("en-US")} hits`}</p>
      </div>
      <div
        role="meter"
        aria-label="Life meter"
        aria-valuemin={0}
        aria-valuemax={LIFE_MAX}
        aria-valuenow={hits ?? undefined}
        aria-valuetext={lifeSummary(hits)}
        className={`relative mt-6 flex h-11 border border-[#3a4651] ${hits == null ? "opacity-60" : ""}`}
      >
        {LIFE_ZONES.map((z) => (
          <div key={z.key} className={`zone-${z.key === "break-in" ? 1 : z.key === "prime" ? 2 : 3} flex items-end overflow-hidden px-1.5 pb-1 font-mono text-[0.625rem] font-semibold uppercase tracking-wider`} style={{ flex: `0 0 ${((z.to - z.from) / LIFE_MAX) * 100}%` }}>
            {z.key !== "break-in" && <span>{z.label}</span>}
          </div>
        ))}
        {pct != null && (
          <div className="absolute -top-3 -bottom-3 w-[3px] bg-accent" style={{ left: `${pct}%`, transform: pct > 98 ? "translateX(-3px)" : undefined }}>
            <span
              className="absolute bottom-full whitespace-nowrap bg-accent px-1.5 py-[3px] font-mono text-[0.6875rem] font-bold text-ink"
              style={pct > 80 ? { right: 0 } : pct < 12 ? { left: 0 } : { left: "50%", transform: "translateX(-50%)" }}
            >
              {hits === 0 ? "New · 0 hits" : `~${hits!.toLocaleString("en-US")} hits`}
              {zone ? ` · ${zone.label.toLowerCase()}` : ""}
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-between font-mono text-[0.6875rem] text-[#9fb0b8]" aria-hidden="true">
        {TICKS.map((t) => (
          <span key={t}>{t === 3000 ? "3,000+" : t.toLocaleString("en-US")}</span>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[0.6875rem] text-[#b9c4c9]">
        {LIFE_ZONES.map((z) => (
          <li key={z.key}>
            <span className={`zone-${z.key === "break-in" ? 1 : z.key === "prime" ? 2 : 3} mr-1.5 inline-block h-2.5 w-2.5 border border-[#3a4651] align-[-1px]`} aria-hidden="true" />
            {z.label}: {z.key === "break-in" ? "first 150 to 200 hits" : z.key === "prime" ? `to about ${z.to.toLocaleString("en-US")}` : `${z.from.toLocaleString("en-US")}+`}
          </li>
        ))}
      </ul>
      <p className="max-w-[70ch] text-[0.8125rem] text-[#9fb0b8]">
        Typical guidance, not a measurement of this bat: composite bats are usually broken in over the first 150 to 200 hits (alloy bats don&apos;t need it), and how long the prime lasts varies a lot by model and hitter. The hit count is the seller&apos;s own rough number.
      </p>
    </section>
  );
}
