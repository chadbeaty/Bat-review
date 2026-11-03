import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import type { MatchModel } from "@/lib/catalog-match";
import { getEbayListings, isEbayEnabled } from "@/lib/ebay";
import type { EbayItem } from "@/lib/ebay/types";
import type { EbayModelListings } from "@/lib/ebay/shape";
import { formatPrice } from "@/lib/format";
import { priceCheck, stampCheck, type PassportCheck } from "@/lib/passport";
import type { SaleRecord } from "@/lib/price-stats";
import { SourceLabel } from "@/components/listing/SourceLabel";
import { BatIcon } from "@/components/icons";

// "Elsewhere right now": live eBay listings for a catalog model, shown below Gamer Bat's own listings. It is
// deliberately a different material from the Gamer Bat cards: dashed steel outline, no yellow price tag (yellow is
// for Gamer Bat money), plain monospace prices, and a label saying where every listing comes from.

/** What Gamer Bat knows about the model, shown beside the eBay listings so buyers can compare. */
export type PassportCompare = {
  stamp: PassportCheck;
  price: PassportCheck;
  /** Link to the model's page (when the section is on a listing page). */
  modelHref?: string;
};

/** Builds the stamp and price-history lines from catalog data already loaded by the page. */
export function passportCompareFromCatalog(p: {
  stamps: string[];
  certificationStatus: string | null;
  certificationVerifiedAt?: string | null;
  certificationSource: string | null;
  sales: SaleRecord[];
  minSales: number;
  modelHref?: string;
}): PassportCompare {
  return {
    stamp: stampCheck({ associations: p.stamps, status: p.certificationStatus, verifiedAt: p.certificationVerifiedAt ?? null, source: p.certificationSource }),
    price: priceCheck(p.sales, { minSales: p.minSales }),
    modelHref: p.modelHref,
  };
}

/** The section, fetching its own data. Renders nothing when eBay is off, fails, or has no listing for this exact model. */
export function EbayElsewhere({ model, compare, headingId = "ebay-heading" }: { model: MatchModel; compare?: PassportCompare; headingId?: string }) {
  if (!isEbayEnabled()) return null;
  return (
    <Suspense fallback={null}>
      <EbayElsewhereLoaded model={model} compare={compare} headingId={headingId} />
    </Suspense>
  );
}

async function EbayElsewhereLoaded({ model, compare, headingId }: { model: MatchModel; compare?: PassportCompare; headingId: string }) {
  const listings = await getEbayListings(model);
  if (!listings) return null;
  return <EbayElsewhereView listings={listings} modelLabel={`${model.brand} ${model.modelName}`} compare={compare} headingId={headingId} />;
}

export function priceFrom(l: Pick<EbayModelListings, "count" | "fromCents">): string {
  return `${l.count} used on eBay from ${formatPrice(l.fromCents)}`;
}

/** Pure view of already-fetched listings. Exported for tests and for the home page strip. */
export function EbayElsewhereView({ listings, modelLabel, compare, headingId }: { listings: EbayModelListings; modelLabel: string; compare?: PassportCompare; headingId: string }) {
  return (
    <section
      aria-labelledby={headingId}
      data-testid="ebay-elsewhere"
      className="grid gap-4 border-2 border-dashed border-steel bg-surface/70 p-3 sm:p-5"
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={headingId} className="display text-2xl font-bold sm:text-3xl">
            Elsewhere right now
          </h2>
          <span className="label border-[1.5px] border-steel px-1.5 py-1 leading-none text-ink-soft">on eBay</span>
        </div>
        <p className="font-mono text-sm font-semibold" data-testid="ebay-summary">
          {priceFrom(listings)}
        </p>
        <p className="max-w-2xl text-sm text-ink-soft">
          Gamer Bat listings come first. These are separate listings for the {modelLabel}, sold by other people on eBay. They are not part of Gamer Bat&apos;s
          Bat Passport or buyer protection.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <ul className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible xl:grid-cols-4" aria-label={`eBay listings for the ${modelLabel}`}>
          {listings.items.map((item) => (
            <li key={item.id} className="w-44 shrink-0 snap-start lg:w-auto">
              <EbayCard item={item} />
            </li>
          ))}
        </ul>
        {compare && <PassportCompareCard compare={compare} />}
      </div>

      <Disclosure anyAffiliate={listings.anyAffiliate} />
    </section>
  );
}

export function EbayCard({ item }: { item: EbayItem }) {
  return (
    <article className="grid h-full grid-rows-[auto_1fr] border-[1.5px] border-steel bg-surface" data-testid="ebay-card">
      <div className="relative aspect-square border-b-[1.5px] border-dashed border-steel bg-paper">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt="" fill sizes="(min-width: 1024px) 160px, 176px" className="object-contain" />
        ) : (
          <div className="grid h-full place-items-center text-ink-soft" aria-hidden="true">
            <BatIcon size={44} />
          </div>
        )}
        <span className="label absolute left-1.5 top-1.5 border-[1.5px] border-steel bg-surface px-1 py-0.5 !text-[0.5625rem] leading-none text-ink-soft">eBay</span>
      </div>
      <div className="grid content-start gap-1.5 p-2.5">
        <p className="font-mono text-base font-bold" aria-label={item.auction ? `Current bid ${formatPrice(item.priceCents)}` : `Price ${formatPrice(item.priceCents)}`}>
          {formatPrice(item.priceCents)}
          {item.auction && <span className="ml-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-soft">bid</span>}
        </p>
        <p className="line-clamp-3 text-[0.8125rem] leading-snug">{item.title}</p>
        {item.condition && <p className="text-xs text-ink-soft">{item.condition}</p>}
        <a
          href={item.url}
          target="_blank"
          rel="sponsored noopener"
          className="mt-1 inline-flex min-h-11 items-center justify-center gap-1 border-[1.5px] border-steel px-2 py-1.5 text-sm font-semibold text-ink no-underline hover:border-ink hover:bg-ink hover:text-surface"
        >
          View on eBay <span aria-hidden="true">↗</span>
          <span className="sr-only">(opens eBay in a new tab)</span>
        </a>
      </div>
    </article>
  );
}

function PassportCompareCard({ compare }: { compare: PassportCompare }) {
  return (
    <aside className="card grid gap-3 p-3.5" aria-label="What Gamer Bat knows about this model" data-testid="ebay-compare">
      <div className="grid gap-0.5">
        <p className="label text-ink-soft">On Gamer Bat</p>
        <p className="font-semibold">This model&apos;s Passport</p>
      </div>
      {[compare.stamp, compare.price].map((c) => (
        <div key={c.key} className="grid gap-1 border-t-2 border-dashed border-steel pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{c.title}</span>
            <SourceLabel source={c.source} />
          </div>
          <p className="text-sm">{c.headline}</p>
          {c.detail && <p className="text-xs text-ink-soft">{c.detail}</p>}
        </div>
      ))}
      <p className="border-t-2 border-dashed border-steel pt-2.5 text-xs text-ink-soft">
        eBay listings don&apos;t come with a Bat Passport. For any of them, check the stamp in the photos and ask about cracks and rattles.
      </p>
      {compare.modelHref && (
        <Link href={compare.modelHref} className="text-sm font-semibold underline">
          Prices for this model
        </Link>
      )}
    </aside>
  );
}

export function Disclosure({ anyAffiliate }: { anyAffiliate: boolean }) {
  return (
    <div className="grid gap-1 text-xs text-ink-soft" data-testid="ebay-disclosure">
      <p>
        Listings from eBay.{" "}
        {anyAffiliate && "Gamer Bat may earn a commission if you buy through these links. "}
        Prices and availability are set on eBay.
      </p>
      <p>eBay is a trademark of eBay Inc. Listing titles, prices and photos are provided by eBay; Gamer Bat is not affiliated with or endorsed by eBay.</p>
    </div>
  );
}
