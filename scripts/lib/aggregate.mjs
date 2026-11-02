// Turns collected posts into mention records, then mention records into the per-line summary the site reads.

import { findMentions } from "./match.mjs";
import { scoreText, toneOf, topicsOf } from "./sentiment.mjs";
import { clip, splitSentences } from "./text.mjs";

export const MAX_MENTIONS_PER_FAMILY = 400;
export const QUOTES_PER_FAMILY = 15;

// A comment in a thread titled after exactly one bat line ("Thoughts on the Freak?") is about that line,
// even when the comment itself just says "love mine".
export function assignThreadFamilies(docs, matchers) {
  const cache = new Map();
  for (const doc of docs) {
    if (!doc.threadId || doc.defaultFamily || !doc.title) continue;
    if (!cache.has(doc.threadId)) {
      const fams = [...new Set(findMentions(doc.title, matchers, { context: doc.title, sourceIsSoftball: true }).map((m) => m.family))];
      cache.set(doc.threadId, fams.length === 1 ? fams[0] : null);
    }
    doc.defaultFamily = cache.get(doc.threadId) || undefined;
  }
  return docs;
}

// doc: { id, source, sourceName, url, title, text, date, votes, softball, defaultFamily? }
export function extractMentions(docs, matchers) {
  const out = [];
  for (const doc of docs) {
    let found = findMentions(doc.text, matchers, { context: doc.title || "", sourceIsSoftball: doc.softball !== false });
    if (!found.length && doc.defaultFamily && doc.text.trim().length >= 20) {
      found = [{ family: doc.defaultFamily, snippet: clip(doc.text, 360), sentences: splitSentences(doc.text).slice(0, 4) }];
    }
    for (const m of found) {
      const s = scoreText(m.snippet);
      out.push({
        key: `${doc.id}::${m.family}`,
        family: m.family,
        source: doc.source,
        sourceName: doc.sourceName,
        url: doc.url || null,
        date: doc.date || null,
        votes: doc.votes ?? 0,
        text: m.snippet,
        s: Math.round(s * 100) / 100,
        tone: toneOf(s),
        topics: Object.fromEntries(Object.entries(topicsOf(m.sentences)).map(([k, v]) => [k, Math.round(v * 100) / 100])),
      });
    }
  }
  return out;
}

// New mentions replace stored ones with the same key; each line keeps its newest records.
export function mergeMentions(previous, fresh) {
  const byKey = new Map(previous.map((m) => [m.key, m]));
  for (const m of fresh) byKey.set(m.key, m);
  const byFamily = new Map();
  for (const m of byKey.values()) {
    if (!byFamily.has(m.family)) byFamily.set(m.family, []);
    byFamily.get(m.family).push(m);
  }
  const kept = [];
  for (const list of byFamily.values()) {
    list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    kept.push(...list.slice(0, MAX_MENTIONS_PER_FAMILY));
  }
  return kept.sort((a, b) => a.key.localeCompare(b.key));
}

// Score from 0 to 100, pulled toward 50 by five imaginary neutral votes so a handful of posts can't swing it.
export function communityScore(pos, neg) {
  return Math.round((100 * (pos + 2.5)) / (pos + neg + 5));
}

function quoteRank(m, now) {
  const ageDays = m.date ? (now - Date.parse(m.date)) / 864e5 : 365;
  const recency = 1 / (1 + Math.max(0, ageDays) / 365);
  const length = m.text.length >= 60 ? 1 : 0.4;
  return (Math.abs(m.s) + 0.2) * Math.log2(3 + Math.max(0, m.votes)) * recency * length;
}

export function summarize(mentions, now = Date.now()) {
  const families = {};
  const groups = new Map();
  for (const m of mentions) {
    if (!groups.has(m.family)) groups.set(m.family, []);
    groups.get(m.family).push(m);
  }
  for (const [family, list] of groups) {
    const positive = list.filter((m) => m.tone === "good").length;
    const negative = list.filter((m) => m.tone === "bad").length;
    const mixed = list.length - positive - negative;
    const topics = {};
    for (const m of list) {
      for (const [k, v] of Object.entries(m.topics || {})) {
        topics[k] ||= { n: 0, net: 0 };
        topics[k].n += 1;
        topics[k].net += v > 0.2 ? 1 : v < -0.2 ? -1 : 0;
      }
    }
    const sources = {};
    for (const m of list) sources[m.sourceName] = (sources[m.sourceName] || 0) + 1;

    const ranked = [...list].filter((m) => m.text.length >= 40).sort((a, b) => quoteRank(b, now) - quoteRank(a, now));
    const pick = (tone, n) => ranked.filter((m) => m.tone === tone).slice(0, n);
    const quotes = [...pick("good", 6), ...pick("bad", 6), ...pick("mixed", 3)]
      .sort((a, b) => quoteRank(b, now) - quoteRank(a, now))
      .slice(0, QUOTES_PER_FAMILY)
      .map((m) => ({ text: m.text, tone: m.tone, source: m.sourceName, url: m.url, date: m.date }));

    const dates = list.map((m) => m.date).filter(Boolean).sort();
    families[family] = {
      mentions: list.length,
      recent90: list.filter((m) => m.date && now - Date.parse(m.date) < 90 * 864e5).length,
      positive,
      mixed,
      negative,
      score: communityScore(positive, negative),
      topics,
      sources,
      quotes,
      lastSeen: dates.at(-1) || null,
    };
  }
  return families;
}
