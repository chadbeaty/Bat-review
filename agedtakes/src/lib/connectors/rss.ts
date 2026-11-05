import type { FetchedItem, SourceConnector } from "./types";
import { allowedByRobots, decodeEntities, getText, htmlToText } from "./http";

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim() : null;
}

function attr(block: string, name: string, attribute: string): string | null {
  const m = block.match(new RegExp(`<${name}\\s[^>]*${attribute}=["']([^"']+)["'][^>]*>`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

/** Parses RSS 2.0 and Atom feeds without dependencies. */
export function parseFeed(xml: string): FetchedItem[] {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks.map((b) => {
    const link = isAtom ? attr(b, "link", "href") : tag(b, "link");
    const id = tag(b, isAtom ? "id" : "guid") ?? link ?? tag(b, "title") ?? "";
    const date = tag(b, isAtom ? "published" : "pubDate") ?? tag(b, "updated") ?? tag(b, "dc:date");
    const body = tag(b, "content:encoded") ?? tag(b, "content") ?? tag(b, isAtom ? "summary" : "description");
    const parsed = date ? new Date(date) : null;
    return {
      externalId: id.slice(0, 500),
      url: link && /^https?:\/\//.test(link) ? link : null,
      title: tag(b, "title"),
      author: tag(b, "author") ?? tag(b, "dc:creator"),
      publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      contentText: body ? htmlToText(body).slice(0, 50_000) : null,
    };
  }).filter((i) => i.externalId);
}

export const rssConnector: SourceConnector = {
  id: "rss",
  label: "RSS / Atom feed",
  description: "Public RSS or Atom feeds: blogs, newsletters with public archives, podcasts, official press releases.",
  requiresEnv: [],
  exampleConfig: { url: "https://example.com/feed.xml" },
  terms: "Only public feeds. Respects robots.txt. Full articles behind paywalls are not fetched.",
  async fetchItems(config, ctx) {
    const url = typeof config.url === "string" ? config.url : "";
    if (!/^https?:\/\//.test(url)) return { status: "error", message: "Set config.url to the feed address." };
    if (!(await allowedByRobots(url, ctx.fetch))) return { status: "skipped", reason: "robots.txt disallows this feed." };
    const xml = await getText(url, { fetch: ctx.fetch });
    return { status: "ok", items: parseFeed(xml).slice(0, Number(config.limit ?? 30)) };
  },
};
