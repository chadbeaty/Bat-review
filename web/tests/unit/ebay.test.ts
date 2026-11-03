import { beforeEach, describe, expect, it, vi } from "vitest";
import { EBAY_DEFAULT_CATEGORY_IDS, getEbayConfig } from "@/lib/ebay/config";
import { EbayError, getAccessToken, normalizeSummary, resetEbayTokenCache, searchUsedItems } from "@/lib/ebay/client";
import { buildEbayQuery, isRelevantTitle, judgeTitle } from "@/lib/ebay/relevance";
import { shapeListings } from "@/lib/ebay/shape";
import { integrationStatus } from "@/lib/env";
import type { MatchModel } from "@/lib/catalog-match";

// No test here touches the network: every call goes through a mocked fetch.

const ENV = { EBAY_CLIENT_ID: "client-id", EBAY_CLIENT_SECRET: "client-secret", EBAY_CAMPAIGN_ID: "5338000000" };
const cfg = getEbayConfig(ENV)!;

const freakBlack: MatchModel = {
  id: "p1",
  brand: "Miken",
  modelName: "Freak Black Maxload",
  year: 2026,
  stamps: ["USSSA"],
  lineName: "Freak",
  aliases: ["freak", "super freak", "freak black", "freak whiteout", "freak30", "freak12"],
};
const freak30: MatchModel = { ...freakBlack, id: "p2", modelName: "Freak30 2-Piece Maxload" };
const tantrumUsa: MatchModel = { id: "p3", brand: "Easton", modelName: "Tantrum 2-Piece 12.75\" Loaded", year: 2025, stamps: ["USA"], lineName: "Tantrum", aliases: ["tantrum", "motherload tantrum", "tantrum gold"] };
const bedlamXl: MatchModel = { id: "p4", brand: "Worth", modelName: "Bedlam XL", year: 2026, stamps: ["USSSA"], lineName: "Bedlam", aliases: ["bedlam"] };
const kp23: MatchModel = { id: "p5", brand: "Miken", modelName: "KP23 2-Piece 12.5\" Maxload", year: 2026, stamps: ["USSSA"], lineName: "KP23", aliases: ["kp23", "kp 23", "kyle pearson"] };
const mercy: MatchModel = { id: "p6", brand: "DeMarini", modelName: "Merciless", year: 2027, stamps: ["USA"], lineName: "Mercy / Merciless", aliases: ["mercy", "merciless"] };

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

const summary = (over: Record<string, unknown> = {}) => ({
  itemId: "v1|123|0",
  title: "Miken Freak Black Maxload 34/27 USSSA",
  price: { value: "149.99", currency: "USD" },
  condition: "Pre-Owned",
  image: { imageUrl: "https://i.ebayimg.com/images/g/abc/s-l225.jpg" },
  itemWebUrl: "https://www.ebay.com/itm/123",
  itemAffiliateWebUrl: "https://www.ebay.com/itm/123?mkcid=1&campid=5338000000",
  buyingOptions: ["FIXED_PRICE"],
  ...over,
});

beforeEach(() => resetEbayTokenCache());

describe("configuration", () => {
  it("is off unless client id, secret and campaign id are all set", () => {
    expect(getEbayConfig({})).toBeNull();
    expect(getEbayConfig({ EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "b" })).toBeNull();
    expect(getEbayConfig({ EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "b", EBAY_CAMPAIGN_ID: " " })).toBeNull();
    expect(getEbayConfig(ENV)).not.toBeNull();
  });
  it("uses production hosts by default and sandbox hosts when asked", () => {
    expect(cfg.env).toBe("production");
    expect(cfg.tokenUrl).toBe("https://api.ebay.com/identity/v1/oauth2/token");
    expect(cfg.searchUrl).toBe("https://api.ebay.com/buy/browse/v1/item_summary/search");
    const sb = getEbayConfig({ ...ENV, EBAY_ENV: "sandbox" })!;
    expect(sb.tokenUrl).toBe("https://api.sandbox.ebay.com/identity/v1/oauth2/token");
    expect(sb.searchUrl).toBe("https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search");
  });
  it("shows up on the admin setup list as unconfigured until all three variables exist", () => {
    const row = (env: Record<string, string>) => integrationStatus(env).find((i) => i.id === "ebay");
    expect(row({})?.configured).toBe(false);
    expect(row(ENV)?.configured).toBe(true);
    expect(row(ENV)?.vars).toEqual(["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_CAMPAIGN_ID"]);
  });
});

describe("OAuth token", () => {
  it("asks for a client-credentials token with the basic-auth keyset and the public scope", async () => {
    const f = vi.fn(async () => json({ access_token: "tok-1", expires_in: 7200 }));
    const token = await getAccessToken(cfg, { fetch: f as unknown as typeof fetch });
    expect(token).toBe("tok-1");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.ebay.com/identity/v1/oauth2/token");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("scope")).toBe("https://api.ebay.com/oauth/api_scope");
  });
  it("reuses the token until a minute before it expires, then fetches a new one", async () => {
    let clock = 1_000_000;
    let n = 0;
    const f = vi.fn(async () => json({ access_token: `tok-${++n}`, expires_in: 7200 }));
    const deps = { fetch: f as unknown as typeof fetch, now: () => clock };
    expect(await getAccessToken(cfg, deps)).toBe("tok-1");
    clock += 3600 * 1000;
    expect(await getAccessToken(cfg, deps)).toBe("tok-1");
    expect(f).toHaveBeenCalledTimes(1);
    clock += (3600 - 30) * 1000; // inside the last minute
    expect(await getAccessToken(cfg, deps)).toBe("tok-2");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("shares one request between simultaneous callers", async () => {
    const f = vi.fn(async () => json({ access_token: "tok", expires_in: 7200 }));
    const deps = { fetch: f as unknown as typeof fetch };
    await Promise.all([getAccessToken(cfg, deps), getAccessToken(cfg, deps), getAccessToken(cfg, deps)]);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("throws a clear error when eBay refuses the keyset", async () => {
    const f = vi.fn(async () => json({ error: "invalid_client" }, { status: 401 }));
    await expect(getAccessToken(cfg, { fetch: f as unknown as typeof fetch })).rejects.toThrow(EbayError);
  });
});

describe("Browse API search", () => {
  function api(search: (url: string, init: RequestInit) => Response | Promise<Response>) {
    return vi.fn(async (url: string, init: RequestInit) => (url.includes("/identity/") ? json({ access_token: "tok", expires_in: 7200 }) : search(url, init))) as unknown as typeof fetch;
  }

  it("sends the query, the softball-bat category, the used filter and the affiliate campaign header", async () => {
    const f = api(() => json({ total: 1, itemSummaries: [summary()] }));
    const items = await searchUsedItems(cfg, { q: "Miken Freak Black Maxload slowpitch" }, { fetch: f });
    const call = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => String(c[0]).includes("item_summary"))!;
    const url = new URL(call[0] as string);
    expect(url.origin + url.pathname).toBe("https://api.ebay.com/buy/browse/v1/item_summary/search");
    expect(url.searchParams.get("q")).toBe("Miken Freak Black Maxload slowpitch");
    expect(url.searchParams.get("category_ids")).toBe(EBAY_DEFAULT_CATEGORY_IDS);
    expect(url.searchParams.get("filter")).toBe("conditions:{USED}");
    expect(Number(url.searchParams.get("limit"))).toBeGreaterThanOrEqual(12);
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["X-EBAY-C-ENDUSERCTX"]).toBe("affiliateCampaignId=5338000000");
    expect(headers["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_US");
    expect(items).toHaveLength(1);
  });

  it("prefers the affiliate link and falls back to the plain item link", () => {
    expect(normalizeSummary(summary())!.url).toBe("https://www.ebay.com/itm/123?mkcid=1&campid=5338000000");
    expect(normalizeSummary(summary())!.affiliate).toBe(true);
    const plain = normalizeSummary(summary({ itemAffiliateWebUrl: undefined }))!;
    expect(plain.url).toBe("https://www.ebay.com/itm/123");
    expect(plain.affiliate).toBe(false);
  });

  it("drops listings with unusable data: other currencies, odd hosts, no price", () => {
    expect(normalizeSummary(summary({ price: { value: "100", currency: "GBP" } }))).toBeNull();
    expect(normalizeSummary(summary({ price: { value: "free", currency: "USD" } }))).toBeNull();
    expect(normalizeSummary(summary({ itemAffiliateWebUrl: "https://evil.example/x", itemWebUrl: "https://evil.example/y" }))).toBeNull();
    expect(normalizeSummary(summary({ itemAffiliateWebUrl: "javascript:alert(1)", itemWebUrl: "https://www.ebay.com/itm/9" }))!.url).toBe("https://www.ebay.com/itm/9");
    expect(normalizeSummary(summary({ title: "  " }))).toBeNull();
  });

  it("keeps only eBay's own image host and turns dollars into cents", () => {
    const ok = normalizeSummary(summary())!;
    expect(ok.priceCents).toBe(14999);
    expect(ok.imageUrl).toBe("https://i.ebayimg.com/images/g/abc/s-l225.jpg");
    expect(normalizeSummary(summary({ image: { imageUrl: "https://tracker.example/pixel.jpg" } }))!.imageUrl).toBeNull();
    expect(normalizeSummary(summary({ buyingOptions: ["AUCTION"] }))!.auction).toBe(true);
    expect(normalizeSummary(summary({ buyingOptions: ["AUCTION", "FIXED_PRICE"] }))!.auction).toBe(false);
  });

  it("returns an empty list when eBay finds nothing", async () => {
    const f = api(() => json({ total: 0 }));
    expect(await searchUsedItems(cfg, { q: "nothing" }, { fetch: f })).toEqual([]);
  });

  it("throws on server errors, bad bodies and network failures (callers then render nothing)", async () => {
    await expect(searchUsedItems(cfg, { q: "x" }, { fetch: api(() => json({}, { status: 500 })) })).rejects.toThrow(/500/);
    await expect(searchUsedItems(cfg, { q: "x" }, { fetch: api(() => new Response("<html>", { status: 200 })) })).rejects.toThrow(EbayError);
    await expect(searchUsedItems(cfg, { q: "x" }, { fetch: api(() => json({ itemSummaries: "nope" })) })).rejects.toThrow(EbayError);
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(searchUsedItems(cfg, { q: "x" }, { fetch: down })).rejects.toThrow(/failed/);
  });

  it("gives up after the timeout", async () => {
    const slow = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    await expect(getAccessToken(cfg, { fetch: slow, timeoutMs: 20 })).rejects.toThrow(/timed out/);
  });

  it("retries once with a fresh token when eBay says the token is no longer valid", async () => {
    let tokens = 0;
    let searches = 0;
    const f = vi.fn(async (url: string) => {
      if (url.includes("/identity/")) return json({ access_token: `tok-${++tokens}`, expires_in: 7200 });
      searches++;
      return searches === 1 ? json({}, { status: 401 }) : json({ itemSummaries: [summary()] });
    }) as unknown as typeof fetch;
    const items = await searchUsedItems(cfg, { q: "x" }, { fetch: f });
    expect(items).toHaveLength(1);
    expect(tokens).toBe(2);
  });
});

describe("search text", () => {
  it("is brand, line, name words and slowpitch", () => {
    expect(buildEbayQuery(freakBlack)).toBe("Miken Freak Black Maxload slowpitch");
    expect(buildEbayQuery(bedlamXl)).toBe("Worth Bedlam XL slowpitch");
    expect(buildEbayQuery(tantrumUsa)).toBe("Easton Tantrum Loaded slowpitch");
  });
  it("leaves out words eBay titles spell differently", () => {
    expect(buildEbayQuery(freak30)).toBe("Miken Freak Maxload slowpitch");
  });
});

describe("relevance filter: realistic eBay titles", () => {
  const yes = (title: string, m: MatchModel) => expect(judgeTitle(title, m), title).toMatchObject({ ok: true });
  const no = (title: string, m: MatchModel, why?: RegExp) => {
    const v = judgeTitle(title, m);
    expect(v.ok, title).toBe(false);
    if (why) expect(v.reason, title).toMatch(why);
  };

  it("accepts the same model written the ways sellers write it", () => {
    yes("Miken Freak Black Maxload 34/27 USSSA Slowpitch Softball Bat", freakBlack);
    yes("MIKEN FREAK BLACK MAX LOAD SLOW PITCH SOFTBALL BAT 34\" 27oz", freakBlack);
    yes("2026 Miken Freak Black Maxload USSSA 34/26 bat", freakBlack);
    yes("Freak Black Maxload 34/27 - great shape!", freakBlack);
    yes("Miken Freak 30 2-Piece Maxload 34/28 USSSA", freak30);
    yes("Miken Freak30 Max Load 2pc 34 inch", freak30);
    yes("Easton Tantrum 2 Piece Loaded USA/ASA 34/27 Slowpitch", tantrumUsa);
    yes("Easton Tantrum 12.75\" Loaded 34/26 ASA Slowpitch Softball Bat", tantrumUsa);
    yes("Worth Bedlam XL USSSA 34/27", bedlamXl);
    yes("Miken KP 23 Maxload 2pc 34/27 USSSA", kp23);
    yes("Miken KP23 Kyle Pearson Maxload slow pitch bat", kp23);
    yes("DeMarini Merciless USA ASA slowpitch bat 34/27", mercy);
  });

  it("accepts a bat that mentions a new grip as long as it gives the bat size", () => {
    yes("Miken Freak Black Maxload 34/27 USSSA with new grip", freakBlack);
  });

  it("rejects fastpitch, baseball and youth bats", () => {
    no("Miken Freak Fastpitch Softball Bat 33/23 (-10)", freakBlack, /not a slowpitch|drop/);
    no("Miken Freak Black Maxload fast pitch 34/27", freakBlack, /not a slowpitch/);
    no("Easton Tantrum Youth Baseball Bat 29/19 (-10)", tantrumUsa, /not a slowpitch/);
    no("Miken Freak Black Maxload BBCOR 33/30 (-3)", freakBlack);
    no("Miken Freak Youth Slowpitch 30/20", freakBlack, /not a slowpitch/);
    no("Worth Bedlam XL USSSA T-Ball bat 26/12", bedlamXl, /not a slowpitch/);
  });

  it("rejects bags, grips, accessories and lots", () => {
    no("Miken Freak Black Maxload bat bag backpack", freakBlack, /not a slowpitch/);
    no("Miken Freak Black Maxload Replacement Grip Tape", freakBlack, /accessory/);
    no("Lizard Skins grip for Miken Freak Black Maxload bats", freakBlack, /accessory/);
    no("Miken Freak Black Maxload knob end cap", freakBlack, /accessory/);
    no("Lot of 3 slowpitch bats Miken Freak Black Maxload Easton Worth", freakBlack, /not a slowpitch/);
    no("Miken Freak Black Maxload 2 bats bundle", freakBlack, /not a slowpitch/);
    no("Miken Freak Black Maxload for parts or repair", freakBlack, /not a slowpitch/);
  });

  it("rejects modified bats", () => {
    no("Miken Freak Black Maxload ROLLED 34/27 hot", freakBlack, /not a slowpitch/);
    no("Shaved Miken Freak Black Maxload 34/28", freakBlack, /not a slowpitch/);
  });

  it("rejects a different model in the same line", () => {
    no("Miken Freak Whiteout Maxload 34/27", freakBlack, /missing black/);
    no("Miken Freak Black Balanced 34/27", freakBlack, /missing maxload/);
    no("Miken Freak 23 Maxload 34/27", freakBlack, /missing black/);
    no("Worth Bedlam XXL Josh Riley 34/27", bedlamXl, /missing xl/);
    no("Miken Ultra II Maxload 34/27", freakBlack, /model name missing/);
  });

  it("rejects a different brand's bat that shares a word", () => {
    no("Monsta Torch 34/27 USSSA", mercy, /model name missing/);
    no("Axe Avenge Fury 34/27", bedlamXl, /model name missing/);
  });

  it("rejects a title that states a different model year", () => {
    no("2023 Miken Freak Black Maxload 34/27", freakBlack, /different year/);
    yes("2026 Miken Freak Black Maxload 34/27", freakBlack);
    yes("Miken Freak Black Maxload 34/27 bought 2025", { ...freakBlack, year: 2025 });
  });

  it("checks the stamp when the title states one", () => {
    no("Easton Tantrum 2 Piece Loaded USSSA 34/27", tantrumUsa, /stamp USSSA/);
    yes("Easton Tantrum 2 Piece Loaded USSSA/USA Dual Stamp 34/27", tantrumUsa);
    no("Miken Freak Black Maxload USA ASA only 34/27", freakBlack, /stamp USA/);
    yes("Miken Freak Black Maxload 34/27", freakBlack); // no stamp stated: can't tell, so it stays
    yes("Miken Freak Black Maxload 34/27 Made in USA", freakBlack); // not a stamp
  });

  it("needs the brand next to a common word model name", () => {
    const thing: MatchModel = { id: "t", brand: "Easton", modelName: "Thing", year: 2026, stamps: ["USSSA"], lineName: "Thing", aliases: ["easton thing"] };
    no("The Thing movie poster slowpitch", thing);
    no("Thing bat 34/27", thing, /ambiguous/);
    yes("Easton Thing 2pc Loaded USSSA 34/27", thing);
  });

  it("isRelevantTitle and shapeListings apply the same rules", () => {
    expect(isRelevantTitle("Miken Freak Black Maxload 34/27", freakBlack)).toBe(true);
    const items = [
      normalizeSummary(summary({ itemId: "1", price: { value: "220", currency: "USD" } }))!,
      normalizeSummary(summary({ itemId: "2", title: "Miken Freak Fastpitch", price: { value: "20", currency: "USD" } }))!,
      normalizeSummary(summary({ itemId: "3", price: { value: "140", currency: "USD" } }))!,
    ];
    const shaped = shapeListings(items, freakBlack)!;
    expect(shaped.count).toBe(2);
    expect(shaped.fromCents).toBe(14000);
    expect(shaped.anyAffiliate).toBe(true);
    expect(shapeListings([items[1]], freakBlack)).toBeNull();
  });
});
