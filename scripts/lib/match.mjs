// Finds which bat lines a post talks about, and pulls out the sentences about each one.

import { normalize, escapeRegex, splitSentences, clip } from "./text.mjs";

const BRAND_WORDS = {
  Easton: ["easton"],
  DeMarini: ["demarini", "de marini"],
  Miken: ["miken"],
  Worth: ["worth"],
  "Louisville Slugger": ["louisville", "slugger", "ls"],
  Monsta: ["monsta"],
  Suncoast: ["suncoast"],
  Victus: ["victus"],
  Axe: ["axe"],
  Marucci: ["marucci"],
  Anarchy: ["anarchy"],
  Anderson: ["anderson"],
};

// Words that show a post is about bats, for aliases that are also everyday words ("mercy", "torch", "freak").
const BAT_CONTEXT = /\b(bats?|barrel|end ?load(ed)?|maxload|loaded|balanced|usssa|asa|usa stamp|ssusa|composite|alloy|1 ?pc|2 ?pc|one piece|two piece|\d{2}(\.\d)? ?oz|break ?in|broke(n)? in|swing|swung|hitting|exit velo|pop)\b/;

function wordRegex(phrase) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(phrase).replace(/\\ /g, "[\\s\\-]?")}(?=$|[^a-z0-9])`, "i");
}

export function buildMatchers(families) {
  return families.map((f) => {
    const brandWords = BRAND_WORDS[f.brand] || [f.brand.toLowerCase()];
    return {
      id: f.id,
      brand: f.brand,
      needsContext: Boolean(f.needsContext),
      exclude: (f.exclude || []).map((e) => new RegExp(escapeRegex(normalize(e)), "gi")),
      aliases: [...new Set(f.aliases.map(normalize))].sort((a, b) => b.length - a.length).map((a) => ({ alias: a, re: wordRegex(a) })),
      brandRe: new RegExp(`(^|[^a-z])(${brandWords.map(escapeRegex).join("|")})(?=$|[^a-z])`, "i"),
    };
  });
}

// Returns [{ family, snippet }] for every bat line mentioned in the text.
// `context` is extra text (like the thread title) used only to decide whether a post is about bats.
export function findMentions(text, matchers, { context = "", sourceIsSoftball = true } = {}) {
  const body = normalize(text);
  if (!body.trim()) return [];
  const ctx = normalize(context) + " " + body;
  const aboutBats = BAT_CONTEXT.test(ctx);
  const sentences = splitSentences(text);
  const out = [];

  for (const m of matchers) {
    // Phrases like "mercy rule" are removed before looking for this line's names.
    const scrubbed = m.exclude.reduce((t, re) => t.replace(re, " "), body);
    const hit = m.aliases.find((a) => a.re.test(scrubbed));
    if (!hit) continue;
    // Multi-word names and names with digits ("freak black", "kp23") are specific on their own.
    const specific = /[\s\d]/.test(hit.alias);
    if (m.needsContext && !specific) {
      // Ambiguous names need the brand nearby, or a softball source plus bat talk.
      const brandNamed = m.brandRe.test(ctx);
      if (!brandNamed && !(sourceIsSoftball && aboutBats)) continue;
    } else if (!sourceIsSoftball && !aboutBats && !m.brandRe.test(ctx)) {
      continue;
    }
    const idx = sentences.findIndex((s) => hit.re.test(m.exclude.reduce((t, re) => t.replace(re, " "), normalize(s))));
    const around = idx === -1 ? [text] : sentences.slice(Math.max(0, idx - 1), idx + 3);
    out.push({ family: m.id, alias: hit.alias, snippet: clip(around.join(" "), 360), sentences: idx === -1 ? sentences : sentences.slice(idx, idx + 3) });
  }
  return out;
}
