import "server-only";
import { readFileSync } from "node:fs";
import { unstable_cache } from "next/cache";
import type { MatchModel } from "@/lib/catalog-match";
import { ebayCategoryIds, getEbayConfig } from "./config";
import { normalizeSummary, searchUsedItems } from "./client";
import { buildEbayQuery } from "./relevance";
import { shapeListings, type EbayModelListings } from "./shape";
import type { EbayItem } from "./types";

export { isEbayEnabled } from "./config";
export type { EbayItem } from "./types";
export type { EbayModelListings } from "./shape";

/** How long one model's eBay results are reused. eBay's API License asks for reasonably fresh data and the Browse API is rate limited. */
export const EBAY_REVALIDATE_SECONDS = 3600;
// The cache holds eBay's answer for one search text; which titles are really the model is decided afterwards, per model.
const cachedSearch = unstable_cache(
  async (q: string, categoryIds: string): Promise<EbayItem[]> => {
    const cfg = getEbayConfig();
    if (!cfg) return [];
    return searchUsedItems(cfg, { q, categoryIds });
  },
  ["ebay-used-search-v1"],
  { revalidate: EBAY_REVALIDATE_SECONDS, tags: ["ebay"] }
);

// After a failure, don't retry the same search for a minute, so an eBay outage can't slow every page by the timeout.
const failedUntil = new Map<string, number>();
const FAILURE_BACKOFF_MS = 60_000;

/**
 * Test and screenshot tooling only: under `next dev` (never in a production build, where NODE_ENV is "production"
 * and this branch is removed), EBAY_MOCK_FILE can point at a JSON file shaped like a Browse API search response.
 */
function mockItems(): EbayItem[] | null {
  if (process.env.NODE_ENV !== "development" || !process.env.EBAY_MOCK_FILE) return null;
  try {
    const body = JSON.parse(readFileSync(process.env.EBAY_MOCK_FILE, "utf8")) as { itemSummaries?: unknown[] };
    return (body.itemSummaries ?? []).flatMap((s) => {
      const item = normalizeSummary(s as Parameters<typeof normalizeSummary>[0]);
      return item ? [item] : [];
    });
  } catch {
    return null;
  }
}

/**
 * Used eBay listings for a catalog model, or null when eBay isn't configured, the call fails or times out, or
 * nothing returned is really that model. Never throws; failures are logged on the server. Nothing is stored.
 */
export async function getEbayListings(model: MatchModel): Promise<EbayModelListings | null> {
  if (!getEbayConfig()) return null;
  const q = buildEbayQuery(model);
  try {
    const mock = mockItems();
    if (mock) return shapeListings(mock, model);
    if ((failedUntil.get(q) ?? 0) > Date.now()) return null;
    const raw = await cachedSearch(q, ebayCategoryIds());
    return shapeListings(raw, model);
  } catch (e) {
    failedUntil.set(q, Date.now() + FAILURE_BACKOFF_MS);
    console.error(`[ebay] search failed for "${q}":`, e instanceof Error ? e.message : e);
    return null;
  }
}
