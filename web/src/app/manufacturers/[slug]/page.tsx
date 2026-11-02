import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BatMiniCard } from "@/components/bats/BatMiniCard";
import { getManufacturerDetail, getMarketSummaries, type BatSummary } from "@/lib/bats";
import { brand } from "@/config/brand";

const load = cache(async (slug: string) => getManufacturerDetail(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const m = await load((await params).slug);
  if (!m) return { title: "Manufacturer not found" };
  const title = `${m.name} slow-pitch bats`;
  const description = `Every ${m.name} slow-pitch bat model in the ${brand.name} catalog by year and line, with listed specs, used listings and price guide pages.`;
  return { title, description, alternates: { canonical: `/manufacturers/${m.slug}` }, openGraph: { title, description, url: `/manufacturers/${m.slug}` } };
}

export default async function ManufacturerPage({ params }: { params: Promise<{ slug: string }> }) {
  const m = await load((await params).slug);
  if (!m) notFound();
  const market = await getMarketSummaries();

  const years = [...new Set(m.bats.map((b) => b.modelYear ?? 0))].sort((a, b) => b - a);
  const lineNotes = new Map(m.lines.map((l) => [l.name, l.notes]));

  return (
    <div className="wrap grid gap-10 py-12">
      <div className="grid gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
          <Link href="/manufacturers" className="underline">
            Manufacturers
          </Link>{" "}
          / {m.name}
        </nav>
        <h1 className="display text-5xl font-bold">{m.name}</h1>
        <p className="max-w-2xl text-ink-soft">
          {m.bats.length} slow-pitch bat {m.bats.length === 1 ? "model" : "models"} in the catalog. Specs come from retailer and manufacturer listings and
          aren&apos;t verified yet. {brand.name} isn&apos;t affiliated with {m.name}.
        </p>
        <p className="text-sm" data-testid="warranty">
          <span className="font-semibold">Warranty: </span>
          {m.warrantySummary ?? "Warranty terms not on file."}
          {m.warrantySummary && m.warrantySource && <span className="text-ink-soft"> ({m.warrantySource})</span>}
        </p>
        {m.websiteUrl && (
          <p className="text-sm">
            <a href={m.websiteUrl} rel="nofollow noopener" target="_blank" className="underline">
              Manufacturer website
            </a>
          </p>
        )}
      </div>

      {m.bats.length === 0 ? (
        <p className="text-ink-soft">No {m.name} bats are in the catalog yet.</p>
      ) : (
        years.map((year) => {
          const inYear = m.bats.filter((b) => (b.modelYear ?? 0) === year);
          const lines = groupByLine(inYear);
          return (
            <section key={year} className="grid gap-5" aria-labelledby={`year-${year}`}>
              <h2 id={`year-${year}`} className="display text-3xl font-bold">
                {year || "Year not listed"}
              </h2>
              {lines.map(([line, bats]) => (
                <div key={line} className="grid gap-3">
                  <div className="grid gap-1">
                    <h3 className="text-lg font-semibold">{line}</h3>
                    {lineNotes.get(line)?.[0] && <p className="max-w-2xl text-sm text-ink-soft">{lineNotes.get(line)![0]}</p>}
                  </div>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {bats.map((b) => {
                      const s = market.get(b.id);
                      return (
                        <li key={b.id}>
                          <BatMiniCard bat={b} extra={<span className="text-xs text-ink-soft">{s?.activeListings ? `${s.activeListings} for sale` : "None for sale right now"}</span>} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}

function groupByLine(bats: BatSummary[]): [string, BatSummary[]][] {
  const map = new Map<string, BatSummary[]>();
  for (const b of bats) {
    const key = b.productLineName ?? "Other models";
    map.set(key, [...(map.get(key) ?? []), b]);
  }
  return [...map.entries()].sort((a, b) => (a[0] === "Other models" ? 1 : b[0] === "Other models" ? -1 : a[0].localeCompare(b[0])));
}
