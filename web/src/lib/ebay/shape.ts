import type { MatchModel } from "@/lib/catalog-match";
import { filterRelevant } from "./relevance";
import type { EbayItem } from "./types";

/** The most listings shown for one model. */
export const EBAY_MAX_ITEMS = 12;

export type EbayModelListings = {
  items: EbayItem[];
  count: number;
  fromCents: number;
  /** At least one link carries our eBay Partner Network campaign. */
  anyAffiliate: boolean;
};

/** Shapes raw eBay results into what the page shows. Null when nothing matches the model. */
export function shapeListings(items: EbayItem[], model: MatchModel): EbayModelListings | null {
  const relevant = filterRelevant(items, model).slice(0, EBAY_MAX_ITEMS);
  if (relevant.length === 0) return null;
  return {
    items: relevant,
    count: relevant.length,
    fromCents: Math.min(...relevant.map((i) => i.priceCents)),
    anyAffiliate: relevant.some((i) => i.affiliate),
  };
}
