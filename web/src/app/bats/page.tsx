import type { Metadata } from "next";
import Link from "next/link";
import { BrowsePage } from "@/components/shop/BrowsePage";
import { browseTitle, readBrowseQuery } from "@/lib/browse";
import { getCategoryDetail, getFacets } from "@/lib/listings";
import { parseSearchParams, searchHref } from "@/lib/search";
import { batWeights } from "@/data/reference";

const DESCRIPTION = "Every used slow-pitch bat for sale, with filters for brand, model, year, weight, stamp, weighting, condition, price and seller rating.";

export async function generateMetadata({ searchParams }: PageProps<"/bats">): Promise<Metadata> {
  const query = parseSearchParams(await searchParams);
  return { title: browseTitle("Used slow-pitch bats", query), description: DESCRIPTION, alternates: { canonical: "/bats" } };
}

export default async function BatsPage({ searchParams }: PageProps<"/bats">) {
  const query = readBrowseQuery("/bats", await searchParams);
  const [category, facets] = await Promise.all([getCategoryDetail("bats"), getFacets("bats")]);
  // The common weights always show; any other weight appears once someone lists one.
  const weights = [...new Set([...batWeights, ...(facets.weight ?? []).map((f) => Number(f.value))])].sort((a, b) => a - b);

  return (
    <BrowsePage
      path="/bats"
      query={query}
      variant="bats"
      category={category ?? undefined}
      eyebrow="The bat marketplace"
      title="Slow-pitch bats"
      intro="Used USSSA, USA (ASA), NSA, ISA and senior bats. Filter by brand, model, year, weight, stamp and weighting. Every listing answers the same damage questions."
      extra={
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <nav aria-label="Browse by weight" className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Browse by weight:</span>
            {weights.map((w) => {
              const active = query.weights.length === 1 && query.weights[0] === w;
              return (
                <Link
                  key={w}
                  href={searchHref("/bats", query, { weights: active ? [] : [w] })}
                  aria-current={active ? "true" : undefined}
                  className={`rounded-full border px-3.5 py-1.5 font-mono text-sm ${active ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface hover:border-ink"}`}
                >
                  {w} oz
                </Link>
              );
            })}
          </nav>
          <p className="text-sm">
            <Link href="/price-guide" className="font-semibold underline">
              Bat price guide
            </Link>
          </p>
        </div>
      }
    />
  );
}
