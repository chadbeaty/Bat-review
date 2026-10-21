// RSS and Atom feeds: forums (SoftballFans and others), blogs, or Reddit search feeds.

import { createClient } from "../lib/http.mjs";
import { stripHtml, decodeEntities } from "../lib/text.mjs";

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
}

function atomLink(xml) {
  const alt = xml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || xml.match(/<link[^>]*href=["']([^"']+)["']/i);
  return alt ? decodeEntities(alt[1]) : "";
}

export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const isAtom = /^<entry/i.test(b);
    const title = stripHtml(tag(b, "title"));
    const link = isAtom ? atomLink(b) : decodeEntities(stripHtml(tag(b, "link")));
    const body = tag(b, "content:encoded") || tag(b, "content") || tag(b, "description") || tag(b, "summary");
    const date = tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || tag(b, "dc:date");
    const id = stripHtml(tag(b, "guid") || tag(b, "id")) || link || title;
    const parsed = date ? new Date(date) : null;
    items.push({ id, title, link, text: stripHtml(/&lt;\/?[a-z]/i.test(body) ? decodeEntities(body) : body), date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null });
  }
  return items;
}

export async function collectFeeds(feeds, log) {
  const http = createClient({ delayMs: 1500, log });
  const docs = [];
  for (const feed of feeds || []) {
    try {
      const items = parseFeed(await http.text(feed.url));
      for (const it of items) {
        docs.push({
          id: `rss:${feed.name}:${it.id}`,
          source: "forum",
          sourceName: feed.name,
          url: it.link || null,
          title: it.title,
          text: `${it.title}\n${it.text}`,
          date: it.date,
          votes: 0,
          softball: feed.softball !== false,
        });
      }
      log(`  ${feed.name}: ${items.length} items`);
    } catch (err) {
      log(`  ${feed.name}: ${err.message}`);
    }
  }
  return { docs, stats: { items: docs.length } };
}
