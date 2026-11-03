// A small client for the official eBay Browse API (https://developer.ebay.com/api-docs/buy/browse/). Server only.
// - OAuth "client credentials" application token, cached in memory until shortly before it expires.
// - item_summary/search with the affiliate campaign header, so returned links carry the eBay Partner Network tag.
// Every call has a hard timeout and throws EbayError on any problem; callers decide what to show (nothing).

import { EBAY_MARKETPLACE, EBAY_SCOPE, ebayCategoryIds, type EbayConfig } from "./config";
import type { EbayItem } from "./types";

export const EBAY_TIMEOUT_MS = 3000;

export class EbayError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "EbayError";
  }
}

export type EbayDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

type Token = { value: string; expiresAt: number };
const tokens = new Map<string, Token>();
const inflight = new Map<string, Promise<string>>();

/** Forgets cached tokens. Used by tests. */
export function resetEbayTokenCache() {
  tokens.clear();
  inflight.clear();
}

function tokenKey(cfg: EbayConfig) {
  return `${cfg.env}:${cfg.clientId}`;
}

async function timedFetch(url: string, init: RequestInit, deps: EbayDeps): Promise<Response> {
  const f = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? EBAY_TIMEOUT_MS);
  try {
    return await f(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (e) {
    throw new EbayError(controller.signal.aborted ? "eBay request timed out" : `eBay request failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** An application access token. Refreshed a minute before it expires; concurrent callers share one request. */
export async function getAccessToken(cfg: EbayConfig, deps: EbayDeps = {}): Promise<string> {
  const now = (deps.now ?? Date.now)();
  const key = tokenKey(cfg);
  const cached = tokens.get(key);
  if (cached && cached.expiresAt - 60_000 > now) return cached.value;
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const res = await timedFetch(
      cfg.tokenUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: EBAY_SCOPE }).toString(),
      },
      deps
    );
    if (!res.ok) throw new EbayError(`eBay token request returned ${res.status}`, res.status);
    const body = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!body || typeof body.access_token !== "string" || !body.access_token) throw new EbayError("eBay token response had no access_token");
    const seconds = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 7200;
    tokens.set(key, { value: body.access_token, expiresAt: (deps.now ?? Date.now)() + seconds * 1000 });
    return body.access_token;
  })().finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

type RawSummary = {
  itemId?: unknown;
  title?: unknown;
  price?: { value?: unknown; currency?: unknown };
  image?: { imageUrl?: unknown };
  thumbnailImages?: { imageUrl?: unknown }[];
  condition?: unknown;
  itemWebUrl?: unknown;
  itemAffiliateWebUrl?: unknown;
  buyingOptions?: unknown;
};

const isEbayHost = (host: string) => host === "ebay.com" || host.endsWith(".ebay.com");

function safeUrl(v: unknown): URL | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** One Browse API item summary to an EbayItem, or null when it lacks what the page needs. */
export function normalizeSummary(raw: RawSummary): EbayItem | null {
  if (typeof raw.itemId !== "string" || typeof raw.title !== "string" || !raw.title.trim()) return null;
  if (raw.price?.currency !== "USD") return null;
  const dollars = typeof raw.price.value === "string" || typeof raw.price.value === "number" ? Number(raw.price.value) : NaN;
  const priceCents = Math.round(dollars * 100);
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;

  // The affiliate link carries the campaign; fall back to the plain link.
  const affiliate = safeUrl(raw.itemAffiliateWebUrl);
  const plain = safeUrl(raw.itemWebUrl);
  const link = affiliate && isEbayHost(affiliate.hostname) ? affiliate : plain && isEbayHost(plain.hostname) ? plain : null;
  if (!link) return null;

  const image = safeUrl(raw.thumbnailImages?.[0]?.imageUrl) ?? safeUrl(raw.image?.imageUrl);
  const options = Array.isArray(raw.buyingOptions) ? raw.buyingOptions.map(String) : [];
  return {
    id: raw.itemId,
    title: raw.title.trim(),
    priceCents,
    condition: typeof raw.condition === "string" && raw.condition ? raw.condition : null,
    // Only eBay's own image host is allowed by next/image (see next.config.ts).
    imageUrl: image && image.hostname === "i.ebayimg.com" ? image.toString() : null,
    url: link.toString(),
    affiliate: link === affiliate,
    auction: options.includes("AUCTION") && !options.includes("FIXED_PRICE"),
  };
}

export type SearchOptions = { q: string; limit?: number; categoryIds?: string };

/** Used listings matching the search text, normalized. Throws EbayError on any failure. */
export async function searchUsedItems(cfg: EbayConfig, opts: SearchOptions, deps: EbayDeps = {}): Promise<EbayItem[]> {
  const params = new URLSearchParams({
    q: opts.q,
    category_ids: opts.categoryIds ?? ebayCategoryIds(),
    filter: "conditions:{USED}",
    limit: String(opts.limit ?? 24),
  });
  const url = `${cfg.searchUrl}?${params}`;
  const call = async (token: string) =>
    timedFetch(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE,
          // Makes eBay return itemAffiliateWebUrl links tagged with our eBay Partner Network campaign.
          "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${cfg.campaignId}`,
        },
      },
      deps
    );

  let res = await call(await getAccessToken(cfg, deps));
  if (res.status === 401) {
    // The token was revoked early. Get a fresh one and try once more.
    tokens.delete(tokenKey(cfg));
    res = await call(await getAccessToken(cfg, deps));
  }
  if (!res.ok) throw new EbayError(`eBay search returned ${res.status}`, res.status);
  const body = (await res.json().catch(() => null)) as { itemSummaries?: unknown } | null;
  if (!body) throw new EbayError("eBay search response was not JSON");
  // No matches at all: eBay omits itemSummaries.
  if (body.itemSummaries === undefined) return [];
  if (!Array.isArray(body.itemSummaries)) throw new EbayError("eBay search response had no itemSummaries list");
  return body.itemSummaries.flatMap((s) => {
    const item = normalizeSummary(s as RawSummary);
    return item ? [item] : [];
  });
}
