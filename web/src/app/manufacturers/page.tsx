import type { Metadata } from "next";
import Link from "next/link";
import { getManufacturers } from "@/lib/catalog";
import { getAllBats } from "@/lib/bats";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Manufacturers",
  description: "Slow-pitch softball equipment manufacturers in the catalog, with every bat model by year and line.",
  alternates: { canonical: "/manufacturers" },
};

export default async function ManufacturersPage() {
  const [manufacturers, bats] = await Promise.all([getManufacturers(), getAllBats()]);
  const counts = new Map<string, number>();
  for (const b of bats) counts.set(b.manufacturerSlug, (counts.get(b.manufacturerSlug) ?? 0) + 1);
  return (
    <div className="wrap grid gap-6 py-12">
      <div className="grid gap-2">
        <p className="eyebrow">Bat archive</p>
        <h1 className="display text-5xl font-bold">Manufacturers</h1>
        <p className="max-w-2xl text-ink-soft">
          Brands in the {brand.name} catalog. Each page lists the brand&apos;s bat models by year and line, with links to specs, prices and owner reports.
          Names identify products only; {brand.name} isn&apos;t affiliated with or endorsed by any manufacturer.
        </p>
        <p className="flex flex-wrap gap-x-5 text-sm font-semibold">
          <Link href="/price-guide" className="inline-flex min-h-11 items-center underline">
            Bat price guide
          </Link>
          <Link href="/account/watchlist" className="inline-flex min-h-11 items-center underline">
            Your watchlist
          </Link>
          <Link href="/compare" className="inline-flex min-h-11 items-center underline">
            Compare bats
          </Link>
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {manufacturers.map((m) => {
          const n = counts.get(m.slug) ?? 0;
          return (
            <li key={m.slug} id={m.slug} className="scroll-mt-28">
              <Link href={`/manufacturers/${m.slug}`} className="card grid h-full gap-1 p-4 no-underline hover:border-ink">
                <span className="font-semibold">{m.name}</span>
                <span className="text-xs text-ink-soft">{n ? `${n} bat ${n === 1 ? "model" : "models"}` : "No bat models in the catalog yet"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
