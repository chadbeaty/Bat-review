import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAllBats, getBatSettings, getMarketSummaries, getMaturityMap, type BatSummary } from "@/lib/bats";
import { batCompareFields, type ComparableBat } from "@/lib/bat-display";
import { MAX_COMPARE, compareHref, compareRows, differenceCount, parseCompareSlugs } from "@/lib/compare";

export const metadata: Metadata = {
  title: "Compare bats",
  description: "Compare up to three slow-pitch bat models side by side: stamps, weights, weighting, barrel, construction, warranty and market data.",
  alternates: { canonical: "/compare" },
};

type Search = { models?: string | string[]; add?: string };

export default async function ComparePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [bats, market, maturity, settings] = await Promise.all([getAllBats(), getMarketSummaries(), getMaturityMap(), getBatSettings()]);
  const bySlug = new Map(bats.map((b) => [b.slug, b]));

  const requested = parseCompareSlugs([...(Array.isArray(sp.models) ? sp.models : [sp.models ?? ""]), sp.add ?? ""].join(","));
  const selected = requested.map((s) => bySlug.get(s)).filter((b): b is BatSummary => Boolean(b));
  const unknown = requested.filter((s) => !bySlug.has(s));
  const slugs = selected.map((b) => b.slug);
  // The picker submits ?models=…&add=…; settle on one shareable ?models= URL.
  if (sp.add !== undefined) redirect(compareHref(slugs));

  const items: ComparableBat[] = selected.map((b) => {
    const m = market.get(b.id);
    return {
      slug: b.slug,
      manufacturer: b.manufacturerName,
      modelName: b.modelName,
      modelYear: b.modelYear,
      stamps: b.stamps,
      weights: b.weights,
      weightingType: b.weightingType,
      endloadOz: b.endloadOz,
      barrelLengthInches: b.barrelLengthInches,
      barrelDiameterInches: b.barrelDiameterInches,
      lengthInches: b.lengthInches,
      constructionType: b.constructionType,
      material: b.material,
      warranty: b.warrantySummary,
      maturity: maturity.get(b.id)?.maturity ?? null,
      activeListings: m?.activeListings ?? 0,
      askingMinCents: m?.askingMinCents ?? null,
      askingMaxCents: m?.askingMaxCents ?? null,
      verifiedSales: m?.verifiedSales ?? 0,
    };
  });
  const rows = compareRows(items, batCompareFields({ windowDays: settings.windowDays, threshold: settings.earlyThreshold }));
  const diffs = differenceCount(rows);
  const available = bats.filter((b) => !slugs.includes(b.slug));

  return (
    <div className="wrap grid gap-8 py-12">
      <div className="grid gap-3">
        <p className="eyebrow">Bat database</p>
        <h1 className="display text-5xl font-bold">Compare bats</h1>
        <p className="max-w-2xl text-ink-soft">
          Pick two or three models to see their listed specs and market data side by side. Rows that differ are highlighted. We compare facts we hold, not
          performance: no bat here is ranked or scored.
        </p>
      </div>

      {unknown.length > 0 && (
        <p role="alert" className="text-sm text-danger">
          We couldn&apos;t find {unknown.join(", ")} in the catalog.
        </p>
      )}

      <div className="grid gap-3">
        <ul className="flex flex-wrap gap-2" aria-label="Selected models">
          {selected.map((b) => (
            <li key={b.slug} className="card flex items-center gap-3 px-3 py-2">
              <Link href={b.path} className="font-semibold underline">
                {b.productName}
              </Link>
              <Link href={compareHref(slugs.filter((s) => s !== b.slug))} className="text-sm text-ink-soft underline" aria-label={`Remove ${b.productName}`}>
                Remove
              </Link>
            </li>
          ))}
        </ul>
        {selected.length < MAX_COMPARE ? (
          <form method="get" action="/compare" className="flex flex-col gap-2 sm:flex-row sm:items-end" aria-label="Add a model">
            {slugs.length > 0 && <input type="hidden" name="models" value={slugs.join(",")} />}
            <label className="field text-sm sm:min-w-80">
              Add a model
              <select name="add" className="input" required defaultValue="">
                <option value="" disabled>
                  Choose a bat…
                </option>
                {available.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.productName} ({b.stamps.join("/")})
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary">Add to comparison</button>
          </form>
        ) : (
          <p className="text-sm text-ink-soft">You&apos;re comparing the maximum of {MAX_COMPARE} models. Remove one to add another.</p>
        )}
      </div>

      {selected.length >= 2 ? (
        <section className="grid gap-3" aria-labelledby="comparison-heading">
          <h2 id="comparison-heading" className="text-lg font-semibold">
            {diffs} {diffs === 1 ? "difference" : "differences"} in what we know
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm" data-testid="compare-table">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-3 font-medium text-ink-soft">
                    <span className="sr-only">Field</span>
                  </th>
                  {selected.map((b) => (
                    <th key={b.slug} scope="col" className="p-3 font-semibold">
                      <Link href={b.path} className="underline">
                        {b.productName}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} data-differs={r.differs ? "true" : "false"} className={`border-b border-line last:border-0 ${r.differs ? "bg-accent/25" : ""}`}>
                    <th scope="row" className="p-3 font-medium">
                      {r.label}
                      {r.differs && <span className="ml-2 rounded-sm bg-ink px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-surface">Differs</span>}
                    </th>
                    {r.values.map((v, i) => (
                      <td key={i} className="p-3">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-soft">
            Specs are unverified retailer and manufacturer listing data; &quot;Not listed&quot; values aren&apos;t counted as differences. Asking ranges come
            from live listings and are separate from verified sales.
          </p>
        </section>
      ) : (
        <p className="text-ink-soft">{selected.length === 1 ? "Add one more model to compare." : "Add two models to start comparing."}</p>
      )}
    </div>
  );
}
