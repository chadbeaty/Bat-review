import type { Metadata } from "next";
import Link from "next/link";
import { getAllBats, getBatSettings, getMarketSummaries } from "@/lib/bats";
import { normalizeThresholds } from "@/lib/price-stats";
import { formatRange } from "@/lib/bat-display";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Bat price guide",
  description: "Every slow-pitch bat model with current asking prices from live listings and verified sold prices from completed sales, kept strictly separate.",
  alternates: { canonical: "/price-guide" },
};

type Search = { q?: string; brand?: string; year?: string; stamp?: string };

export default async function PriceGuidePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [bats, market, settings] = await Promise.all([getAllBats(), getMarketSummaries(), getBatSettings()]);
  const t = normalizeThresholds(settings.minSales, settings.fullSales);

  const brands = [...new Map(bats.map((b) => [b.manufacturerSlug, b.manufacturerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const years = [...new Set(bats.map((b) => b.modelYear).filter((y): y is number => y != null))].sort((a, b) => b - a);
  const stamps = [...new Set(bats.flatMap((b) => b.stamps))].sort();

  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const words = q.split(/\s+/).filter(Boolean);
  const filtered = bats.filter((b) => {
    if (sp.brand && b.manufacturerSlug !== sp.brand) return false;
    if (sp.year && String(b.modelYear) !== sp.year) return false;
    if (sp.stamp && !b.stamps.includes(sp.stamp)) return false;
    const hay = `${b.productName} ${b.manufacturerName} ${b.productLineName ?? ""} ${b.stamps.join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  return (
    <div className="wrap grid gap-8 py-12">
      <div className="grid gap-3">
        <p className="eyebrow">Bat database</p>
        <h1 className="display text-5xl font-bold">Bat price guide</h1>
        <p className="max-w-2xl text-ink-soft">
          Every bat model in the catalog with what it&apos;s listed for today and what it has actually sold for here. Pick a model for its full price page.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-3" aria-label="How the price guide works">
        <div className="card grid content-start gap-2 p-5">
          <h2 className="font-semibold">Asking prices</h2>
          <p className="text-sm text-ink-soft">
            The current asking-price range comes from live listings for the exact model, year and stamp. It&apos;s what sellers want, not what bats sell for.
          </p>
        </div>
        <div className="card grid content-start gap-2 p-5">
          <h2 className="font-semibold">Sold prices</h2>
          <p className="text-sm text-ink-soft">
            Only completed, verified orders on {brand.name} count. We never mix sold prices with asking prices or estimate a price we don&apos;t have.
          </p>
        </div>
        <div className="card grid content-start gap-2 p-5" data-testid="thresholds">
          <h2 className="font-semibold">When we show a number</h2>
          <p className="text-sm text-ink-soft">
            Under {t.minSales} verified sales: &quot;Not enough verified sales yet&quot;. {t.minSales} to {t.fullSales - 1}: an indicative range with a
            small-sample warning. {t.fullSales} or more: the actual average completed sale price and the range.
          </p>
        </div>
      </section>

      <form method="get" className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search" aria-label="Filter bat models">
        <label className="field text-sm">
          Search models
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="e.g. Freak Maxload" maxLength={80} />
        </label>
        <label className="field text-sm">
          Brand
          <select name="brand" defaultValue={sp.brand ?? ""} className="input">
            <option value="">All brands</option>
            {brands.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field text-sm">
          Year
          <select name="year" defaultValue={sp.year ?? ""} className="input">
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="field text-sm">
          Stamp
          <select name="stamp" defaultValue={sp.stamp ?? ""} className="input">
            <option value="">All stamps</option>
            {stamps.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary">Filter</button>
          <Link href="/price-guide" className="btn btn-outline">
            Reset
          </Link>
        </div>
      </form>

      <p className="text-sm text-ink-soft" aria-live="polite" data-testid="result-count">
        {filtered.length} {filtered.length === 1 ? "model" : "models"}
      </p>

      {filtered.length === 0 ? (
        <p className="text-ink-soft">No models match those filters.</p>
      ) : (
        <ul className="grid gap-2" data-testid="price-guide-list">
          {filtered.map((b) => {
            const m = market.get(b.id);
            const sales = m?.verifiedSales ?? 0;
            return (
              <li key={b.id}>
                <Link href={b.path} className="card grid gap-2 p-4 no-underline hover:border-ink md:grid-cols-[2fr_1fr_1.4fr_1.4fr] md:items-center">
                  <span className="grid gap-1">
                    <span className="text-xs font-medium text-ink-soft">
                      {b.manufacturerName} · {b.modelYear}
                    </span>
                    <span className="font-semibold">{b.modelName}</span>
                    <span className="flex flex-wrap gap-1">
                      {b.stamps.map((s) => (
                        <span key={s} className="rounded-sm border border-ink px-1.5 py-0.5 font-mono text-[0.68rem] tracking-wider">
                          {s}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="block text-xs text-ink-soft">Active listings</span>
                    {m?.activeListings ?? 0}
                  </span>
                  <span className="text-sm">
                    <span className="block text-xs text-ink-soft">Current asking-price range</span>
                    {m?.askingMinCents != null && m.askingMaxCents != null ? formatRange(m.askingMinCents, m.askingMaxCents) : "None listed"}
                  </span>
                  <span className="text-sm">
                    <span className="block text-xs text-ink-soft">Number of verified sales</span>
                    {sales}
                    {sales < t.minSales ? <span className="text-ink-soft"> · Not enough verified sales yet</span> : sales < t.fullSales ? <span className="text-ink-soft"> · small sample</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
