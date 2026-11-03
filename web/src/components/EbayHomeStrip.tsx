import Link from "next/link";
import { Suspense } from "react";
import type { BatSummary } from "@/lib/bats";
import { matchModelForBat } from "@/lib/catalog-match-data";
import { getEbayListings, isEbayEnabled } from "@/lib/ebay";
import { Disclosure, EbayCard, priceFrom } from "@/components/EbayElsewhere";

/** The most eBay lookups one home page render may make (each is cached for an hour, so most renders make none). */
export const HOME_EBAY_MODELS = 2;

/**
 * "Not on the fence yet? Elsewhere right now": a small strip for the home page while Gamer Bat has few listings of
 * its own. Shows used eBay listings for the first couple of models. Renders nothing unless eBay is configured and
 * has real, matching listings.
 */
export function EbayHomeStrip({ models }: { models: BatSummary[] }) {
  if (!isEbayEnabled() || models.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <EbayHomeStripLoaded models={models.slice(0, HOME_EBAY_MODELS)} />
    </Suspense>
  );
}

async function EbayHomeStripLoaded({ models }: { models: BatSummary[] }) {
  const groups = await Promise.all(
    models.map(async (bat) => {
      const model = await matchModelForBat(bat);
      return { bat, listings: await getEbayListings(model) };
    })
  );
  const shown = groups.filter((g): g is typeof g & { listings: NonNullable<typeof g.listings> } => g.listings !== null);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="ebay-home-heading" data-testid="ebay-home-strip" className="wrap pt-8 sm:pt-10">
      <div className="grid gap-4 border-2 border-dashed border-steel bg-surface/70 p-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="ebay-home-heading" className="display text-2xl font-bold sm:text-3xl">
            Not on the fence yet? Elsewhere right now
          </h2>
          <span className="label border-[1.5px] border-steel px-1.5 py-1 leading-none text-ink-soft">on eBay</span>
        </div>
        {shown.map(({ bat, listings }) => (
          <div key={bat.id} className="grid gap-2">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <Link href={bat.path} className="font-semibold underline">
                {bat.productName}
              </Link>
              <span className="font-mono text-sm">{priceFrom(listings)}</span>
            </p>
            <ul className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
              {listings.items.slice(0, 5).map((item) => (
                <li key={item.id} className="w-44 shrink-0 snap-start">
                  <EbayCard item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Disclosure anyAffiliate={shown.some((g) => g.listings.anyAffiliate)} />
      </div>
    </section>
  );
}
