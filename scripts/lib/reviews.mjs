// Turns review videos and review-site articles into entries for data/reviews.json,
// matched to the exact bat when the title is specific enough, otherwise to the bat line.

import { findMentions } from "./match.mjs";
import { normalize } from "./text.mjs";

// Words in model names that don't tell versions apart.
const GENERIC = new Set(["piece", "loaded", "load", "end", "the", "and", "usssa", "usa", "senior", "barrel", "slowpitch", "bat", "maxload", "balanced", "endload", "end-loaded"]);

function modelTokens(bat) {
  return normalize(`${bat.model} ${bat.sku || ""}`)
    .replace(/["”]/g, "")
    .split(/[^a-z0-9.]+/)
    .filter((t) => t && (t.length >= 3 || /\d\d/.test(t) || t === "xl") && !GENERIC.has(t));
}

function stampWords(title) {
  const t = normalize(title);
  return {
    usa: /\b(usa|asa)\b/.test(t),
    usssa: /\busssa\b/.test(t),
    senior: /\b(senior|ssusa)\b/.test(t),
  };
}

// Returns { bats: [ids], families: [ids] } for a review title, or null when it isn't about a known bat line.
export function matchReview(title, bats, matchers) {
  const fams = [...new Set(findMentions(title, matchers, { context: `${title} slowpitch bat`, sourceIsSoftball: true }).map((m) => m.family))];
  if (!fams.length) return null;
  const t = normalize(title).replace(/["”]/g, "");
  const words = new Set(t.split(/[^a-z0-9.]+/));
  const year = (t.match(/\b(20\d\d)\b/) || [])[1];
  const stamps = stampWords(title);

  const matchedBats = [];
  for (const fam of fams) {
    const scored = bats
      .filter((b) => b.family === fam)
      .map((b) => {
        const tokens = modelTokens(b);
        const hits = tokens.filter((tok) => words.has(tok)).length;
        // Words in the model name that the title doesn't mention count against it ("Black XL" vs "XXL").
        let score = hits * 2 - (tokens.length - hits);
        if (year && String(b.year) === year) score += 2;
        else if (year) score -= 3;
        if (stamps.usa && b.stamps.includes("USA")) score += 1;
        if (stamps.usssa && b.stamps.includes("USSSA")) score += 1;
        if (stamps.senior && b.stamps.includes("SSUSA")) score += 2;
        if ((stamps.usa && !b.stamps.includes("USA")) || (stamps.senior && !b.stamps.includes("SSUSA"))) score -= 2;
        if (/\b1[\s-]?(pc|piece)\b/.test(t)) score += b.build === "1pc" ? 1 : -1;
        if (/\b2[\s-]?(pc|piece)\b/.test(t)) score += b.build === "2pc" ? 1 : -1;
        return { id: b.id, score };
      })
      .sort((a, b) => b.score - a.score);
    // Only claim an exact bat when it clearly beats the next best version,
    // or when it is the only version of this line from the year in the title.
    const sameYear = year ? bats.filter((b) => b.family === fam && String(b.year) === year) : [];
    if (scored[0] && scored[0].score >= 5 && (!scored[1] || scored[0].score - scored[1].score >= 2)) matchedBats.push(scored[0].id);
    else if (sameYear.length === 1 && scored.find((x) => x.id === sameYear[0].id).score >= 2) matchedBats.push(sameYear[0].id);
  }
  const batFamilies = new Set(matchedBats.map((id) => bats.find((b) => b.id === id).family));
  return { bats: matchedBats, families: fams.filter((f) => !batFamilies.has(f)) };
}

// Adds new entries to the curated list. Curated entries are never changed; automatic ones are keyed by URL.
export function mergeReviews(existing, found) {
  const byUrl = new Map(existing.map((r) => [r.url, r]));
  let added = 0;
  for (const r of found) {
    if (byUrl.has(r.url)) continue;
    byUrl.set(r.url, r);
    added += 1;
  }
  const list = [...byUrl.values()];
  let n = list.reduce((max, r) => Math.max(max, Number(String(r.id || "").replace(/\D/g, "")) || 0), 0);
  for (const r of list) if (!r.id) r.id = "r" + String(++n).padStart(3, "0");
  return { reviews: list, added };
}
