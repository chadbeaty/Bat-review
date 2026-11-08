import { describe, expect, it } from "vitest";
import { parseIsoDuration, parseUploadsFeed, parseYoutubeInput, YoutubeClient } from "@/lib/connectors/youtube";
import { detectPlatform, isPrivateHost, parsePageMeta, tiktokVideoId } from "@/lib/connectors/manual";
import { getText, robotsAllows, SourceUnavailable } from "@/lib/connectors/http";
import { parseSetting, validateSetting, DEFAULTS } from "@/lib/settings";
import { alertEmail, digestEmail } from "@/lib/email/templates";
import type { ProductBrief } from "@/lib/data/brief";
import type { ProductRow } from "@/lib/data/types";

describe("YouTube input parsing", () => {
  it.each([
    ["https://www.youtube.com/@JordanWelch", { kind: "handle", value: "JordanWelch" }],
    ["@SmithReesBusiness", { kind: "handle", value: "SmithReesBusiness" }],
    ["https://www.youtube.com/channel/UC5deKm1RRbcoUIuLuSCFprg", { kind: "channel_id", value: "UC5deKm1RRbcoUIuLuSCFprg" }],
    ["https://youtu.be/dQw4w9WgXcQ", { kind: "video", value: "dQw4w9WgXcQ" }],
    ["https://www.youtube.com/shorts/N-KM24uirGM", { kind: "video", value: "N-KM24uirGM" }],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10", { kind: "video", value: "dQw4w9WgXcQ" }],
    ["https://vimeo.com/123", { kind: "unsupported", value: "https://vimeo.com/123" }],
  ])("%s", (input, expected) => expect(parseYoutubeInput(input)).toEqual(expected));

  it("parses ISO durations", () => {
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("bogus")).toBeNull();
  });
});

describe("YouTube Data API client", () => {
  it("verifies a channel by handle and counts quota units", async () => {
    const calls: string[] = [];
    const f = (async (u: string) => {
      calls.push(u);
      return new Response(JSON.stringify({ items: [{ id: "UC5deKm1RRbcoUIuLuSCFprg", snippet: { title: "Jordan Welch", customUrl: "@jordanwelch" }, statistics: { subscriberCount: "2020000" }, contentDetails: { relatedPlaylists: { uploads: "UU5deKm1RRbcoUIuLuSCFprg" } } }] }), { status: 200 });
    }) as typeof fetch;
    const yt = new YoutubeClient("k", f);
    const c = await yt.resolveChannel("https://www.youtube.com/@JordanWelch");
    expect(c).toMatchObject({ channelId: "UC5deKm1RRbcoUIuLuSCFprg", subscriberCount: 2020000, uploadsPlaylistId: "UU5deKm1RRbcoUIuLuSCFprg", url: "https://www.youtube.com/@jordanwelch" });
    expect(calls[0]).toContain("forHandle=JordanWelch");
    expect(yt.unitsUsed).toBe(1);
  });

  it("explains a 403 (bad key, API not enabled, or quota)", async () => {
    const yt = new YoutubeClient("k", (async () => new Response("{}", { status: 403 })) as typeof fetch);
    await expect(yt.recentUploadIds("UUx")).rejects.toThrow(/quota/);
  });

  it("parses the public upload feed", () => {
    const xml = `<feed><entry><yt:videoId>abcDEF12345</yt:videoId><yt:channelId>UC5deKm1RRbcoUIuLuSCFprg</yt:channelId><title>Viral &amp; useful</title><link rel="alternate" href="https://www.youtube.com/shorts/abcDEF12345"/><author><name>Jordan Welch</name></author><published>2026-11-07T03:00:26+00:00</published><media:group><media:title>Viral &amp; useful</media:title><media:thumbnail url="https://i3.ytimg.com/vi/abcDEF12345/hqdefault.jpg" width="480" height="360"/><media:description>desc</media:description><media:community><media:statistics views="3439"/></media:community></media:group></entry></feed>`;
    expect(parseUploadsFeed(xml)[0]).toMatchObject({ videoId: "abcDEF12345", title: "Viral & useful", viewCount: 3439, channelId: "UC5deKm1RRbcoUIuLuSCFprg", likeCount: null });
  });
});

describe("manual URLs", () => {
  it("routes platforms and never treats marketplaces as fetchable pages", () => {
    expect(detectPlatform("https://www.tiktok.com/@a/video/7300000000000000001")?.platform).toBe("tiktok");
    expect(detectPlatform("https://shop.tiktok.com/view/product/1")?.platform).toBe("marketplace");
    expect(detectPlatform("https://www.amazon.com/dp/B0")?.platform).toBe("marketplace");
    expect(detectPlatform("https://www.aliexpress.us/item/1.html")?.platform).toBe("marketplace");
    expect(detectPlatform("https://coolstore.myshopify.com/products/x")?.platform).toBe("web");
    expect(detectPlatform("ftp://example.com")).toBeNull();
  });

  it("blocks internal addresses", () => {
    for (const h of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254", "intranet"]) expect(isPrivateHost(h)).toBe(true);
    expect(isPrivateHost("example.com")).toBe(false);
    expect(detectPlatform("http://169.254.169.254/latest/meta-data")).toBeNull();
  });

  it("reads TikTok video ids", () => {
    expect(tiktokVideoId(new URL("https://www.tiktok.com/@scout2015/video/6718335390845095173"))).toBe("6718335390845095173");
  });

  it("reads a store page's own metadata and JSON-LD price", () => {
    const html = `<html><head><title>Fallback</title><meta property="og:title" content="Mini Bag Sealer &amp; Cutter"><meta property="og:image" content="https://cdn.shop/x.jpg"><script type="application/ld+json">{"@type":"Product","offers":{"price":"19.99","priceCurrency":"USD"}}</script></head></html>`;
    expect(parsePageMeta(html)).toMatchObject({ title: "Mini Bag Sealer & Cutter", image: "https://cdn.shop/x.jpg", price: 19.99, currency: "USD" });
  });

  it("honours robots.txt", () => {
    const robots = "User-agent: *\nDisallow: /products/\nAllow: /products/public\n";
    expect(robotsAllows(robots, "/products/secret")).toBe(false);
    expect(robotsAllows(robots, "/products/public-item")).toBe(true);
    expect(robotsAllows(robots, "/about")).toBe(true);
  });

  it("retries server errors but not refusals", async () => {
    let n = 0;
    const flaky = (async () => (++n < 3 ? new Response("", { status: 503 }) : new Response("ok"))) as typeof fetch;
    expect(await getText("https://example.com", { fetch: flaky, sleep: async () => {} })).toBe("ok");
    let m = 0;
    const refused = (async () => (m++, new Response("", { status: 403 }))) as typeof fetch;
    await expect(getText("https://example.com", { fetch: refused, sleep: async () => {} })).rejects.toBeInstanceOf(SourceUnavailable);
    expect(m).toBe(1);
  });
});

describe("settings", () => {
  it("fills missing keys from defaults and rejects weights that don't add to 100", () => {
    expect(parseSetting("ai", { daily_budget_usd: 3 })).toMatchObject({ daily_budget_usd: 3, model: DEFAULTS.ai.model });
    expect(parseSetting("ai", "garbage")).toEqual(DEFAULTS.ai);
    expect(validateSetting("scoring_weights", { ...DEFAULTS.scoring_weights, competition: 30 })).toMatchObject({ ok: false });
    expect(validateSetting("scoring_weights", DEFAULTS.scoring_weights)).toMatchObject({ ok: true });
  });
});

describe("emails", () => {
  const product = { canonical_name: "Bag <Sealer>", slug: "bag-sealer", latest_score: 82, latest_confidence: "medium", suggested_price_low: 19.99, suggested_price_high: 24.99, ai_recommendation: "Watch it." } as unknown as ProductRow;
  const brief: ProductBrief = {
    product,
    firstSeen: { at: "2026-11-07T10:00:00Z", platform: "youtube", creator: "Jordan Welch", url: "https://youtu.be/x" },
    competition: { creators: 2, promoVideos: 2, confidence: "low", note: "" },
    sources: [{ url: "https://youtu.be/x", label: "youtube · Jordan Welch", at: "2026-11-07T10:00:00Z" }],
    ideas: ["Idea one", "Idea two", "Idea three"],
    reasons: [],
  };
  it("includes every required field, labels estimates, and escapes HTML", () => {
    const e = alertEmail(brief, [{ label: "High opportunity score", reason: "Score 82" }], "https://radar.example");
    for (const s of ["82/100", "Jordan Welch", "AI estimate", "real market count unknown", "Idea three", "https://youtu.be/x", "Score 82"]) expect(e.text).toContain(s);
    expect(e.html).toContain("Bag &lt;Sealer&gt;");
    expect(e.html).not.toContain("<Sealer>");
  });
  it("says so plainly when there is nothing to report", () => {
    expect(digestEmail([], "https://radar.example", "2026-11-08").text).toMatch(/No products have been scored yet/);
  });
});
