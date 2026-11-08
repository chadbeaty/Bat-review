import { decodeEntities, getJson, getText, robotsAllows, type FetchLike } from "@/lib/connectors/http";

// Manual URL submissions. Each platform is read only through what it publicly permits:
// - YouTube: the official Data API (or oEmbed without a key)            → see youtube.ts
// - TikTok: the public oEmbed endpoint. It now returns only the video id and an embed player (no caption,
//   author or counts), so the owner's notes supply the description.
// - Instagram: Meta's oEmbed needs an approved app token, so links are stored with the owner's notes.
// - Marketplaces whose terms forbid automated access (Amazon, AliExpress, Temu, Walmart, eBay, TikTok Shop):
//   stored as evidence links only, never fetched.
// - Other product pages (e.g. a Shopify store): one polite fetch on request, only if robots.txt allows,
//   reading the page's own title/description/image/price metadata.

export type Platform = "youtube" | "tiktok" | "instagram" | "reddit" | "marketplace" | "web";

const MARKETPLACES = ["amazon.", "aliexpress.", "temu.com", "walmart.com", "ebay.", "shop.tiktok.com", "etsy.com", "alibaba.com"];

export function detectPlatform(raw: string): { platform: Platform; url: URL } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (host === "youtu.be" || host.endsWith("youtube.com")) return { platform: "youtube", url };
  if (host === "shop.tiktok.com") return { platform: "marketplace", url };
  if (host.endsWith("tiktok.com")) return { platform: "tiktok", url };
  if (host.endsWith("instagram.com")) return { platform: "instagram", url };
  if (host.endsWith("reddit.com") || host === "redd.it") return { platform: "reddit", url };
  if (MARKETPLACES.some((m) => host.includes(m))) return { platform: "marketplace", url };
  if (isPrivateHost(host)) return null;
  return { platform: "web", url };
}

/** Blocks requests to local or internal addresses (SSRF protection for user-supplied URLs). */
export function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return host.startsWith("[") || host.includes(":");
}

export function tiktokVideoId(url: URL): string | null {
  const m = url.pathname.match(/\/video\/(\d{8,25})/) ?? url.pathname.match(/\/photo\/(\d{8,25})/);
  return m ? m[1] : null;
}

export type TiktokOembed = { embed_product_id?: string; title?: string; author_name?: string; author_url?: string; thumbnail_url?: string; html?: string };

export async function fetchTiktokOembed(url: string, f: FetchLike = fetch): Promise<TiktokOembed | null> {
  try {
    return await getJson<TiktokOembed>(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { fetch: f, retries: 1 });
  } catch {
    return null;
  }
}

export type PageMeta = { title: string | null; description: string | null; image: string | null; price: number | null; currency: string | null; siteName: string | null };

export function parsePageMeta(html: string): PageMeta {
  const meta = (prop: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    const m = html.match(re) ?? html.match(re2);
    return m ? decodeEntities(m[1]).trim() || null : null;
  };
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let price: number | null = null;
  let currency: string | null = null;
  const priceMeta = meta("product:price:amount") ?? meta("og:price:amount");
  if (priceMeta && Number.isFinite(Number(priceMeta))) {
    price = Number(priceMeta);
    currency = meta("product:price:currency") ?? meta("og:price:currency");
  } else {
    for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const found = findOffer(JSON.parse(block[1]));
        if (found) {
          price = found.price;
          currency = found.currency;
          break;
        }
      } catch {
        // Ignore malformed JSON-LD.
      }
    }
  }
  return {
    title: meta("og:title") ?? (titleTag ? decodeEntities(titleTag[1]).trim() : null),
    description: meta("og:description") ?? meta("description"),
    image: meta("og:image"),
    price,
    currency,
    siteName: meta("og:site_name"),
  };
}

function findOffer(node: unknown): { price: number; currency: string | null } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findOffer(n);
      if (r) return r;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  if (o.offers) {
    const offers = Array.isArray(o.offers) ? o.offers : [o.offers];
    for (const off of offers as Record<string, unknown>[]) {
      const p = Number(off?.price ?? off?.lowPrice);
      if (Number.isFinite(p) && p > 0) return { price: p, currency: typeof off.priceCurrency === "string" ? off.priceCurrency : null };
    }
  }
  if (o["@graph"]) return findOffer(o["@graph"]);
  return null;
}

/** One polite fetch of a product page the owner submitted, honouring robots.txt. */
export async function fetchProductPage(url: URL, f: FetchLike = fetch): Promise<{ ok: true; meta: PageMeta } | { ok: false; reason: string }> {
  if (isPrivateHost(url.hostname)) return { ok: false, reason: "That address is not a public website." };
  try {
    const robots = await getText(`${url.origin}/robots.txt`, { fetch: f, timeoutMs: 8000, retries: 0 }).catch(() => "");
    if (robots && !robotsAllows(robots, url.pathname + url.search)) return { ok: false, reason: "The site's robots.txt does not allow automated access to this page, so it was stored as a link only." };
    const html = await getText(url.toString(), { fetch: f, retries: 1, headers: { Accept: "text/html" } });
    return { ok: true, meta: parsePageMeta(html) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Could not read the page." };
  }
}
