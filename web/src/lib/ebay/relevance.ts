// eBay search is fuzzy: a search for "Miken Freak" also returns fastpitch bats, grips, bat bags and other years.
// These pure functions build the search text for a catalog model and decide which returned titles really are that
// model. They lean toward showing less: a missing listing costs nothing, a wrong one costs trust.

import { matchModelInText, normalize, readStamps, stampsOverlap, variantWords, yearsIn, type MatchModel } from "@/lib/catalog-match";

/** The search text for a model: brand, product line and its name words, plus "slowpitch". The stamp is checked
 *  afterwards, because eBay's search requires every word and many titles leave the stamp out. */
export function buildEbayQuery(model: MatchModel): string {
  const words: string[] = [];
  const add = (w: string) => {
    if (w && !words.some((x) => x.toLowerCase() === w.toLowerCase())) words.push(w);
  };
  add(model.brand.trim());
  for (const w of (model.lineName ?? "").split(/\s+/)) add(w.replace(/[^A-Za-z0-9]/g, ""));
  if (!model.lineName) for (const w of model.modelName.split(/\s+/)) add(w.replace(/[^A-Za-z0-9]/g, ""));
  // Name words like "Black" or "Maxload" narrow the search. Words that mix letters and digits ("Freak30") are
  // spelled differently in titles, so they are left for the relevance check.
  const variants = new Set(variantWords(model));
  for (const w of model.modelName.split(/\s+/)) {
    const clean = w.replace(/[^A-Za-z0-9]/g, "");
    if (variants.has(normalize(clean)) && !/\d/.test(clean)) add(clean);
  }
  add("slowpitch");
  return words.filter(Boolean).join(" ").slice(0, 100);
}

// Titles that are never the bat itself, whatever else they say.
const NEVER = new RegExp(
  [
    "fast\\s?pitch",
    "baseball",
    "bbcor",
    "youth",
    "\\bt\\s?-?ball\\b",
    "\\btee\\s?ball\\b",
    "little league",
    "junior",
    "\\bjr\\b",
    "\\bkids?\\b",
    "\\bgirls?\\b",
    "toddler",
    "bat\\s?bags?",
    "\\bbags?\\b",
    "backpack",
    "helmet",
    "gloves?\\b",
    "jersey",
    "cleats?\\b",
    "\\bcase\\b",
    "lot of",
    "bundle",
    "set of",
    "\\b[2-9]\\s?bats\\b",
    "for parts",
    "parts only",
    "not working",
    "rolled",
    "shaved",
    "juiced",
    "doctored",
    "display",
    "plaque",
    "poster",
    "autograph",
    "replica",
    "miniature",
    "mini bat",
  ].join("|"),
  "i"
);

// Drop-weight marks such as "-10" or "(-8)" are baseball and fastpitch sizing, not slowpitch.
const DROP_WEIGHT = /(?:^|[\s(])-\s?\d{1,2}(?=$|[\s),/])/;

// Accessories. A title with one of these is dropped unless it also gives a bat size such as "34/27" (a real bat
// listed with "new grip").
const ACCESSORY = /\b(?:grips?|grip tape|knobs?|wraps?|tape|sleeves?|end\s?caps?|cap|warmers?|sticker|decals?)\b/i;
const BAT_SIZE = /\b3[0-6]\s?(?:"|in\b|inch(?:es)?)?\s?[/-]\s?2\d(?:\.5)?\b|\b2[0-9](?:\.5)?\s?oz\b/i;

export type TitleVerdict = { ok: boolean; reason: string };

/** Whether an eBay listing title is the given catalog model. `reason` says why not, for tests and logs. */
export function judgeTitle(title: string, model: MatchModel): TitleVerdict {
  const raw = title.trim();
  if (!raw) return { ok: false, reason: "empty title" };
  if (NEVER.test(raw)) return { ok: false, reason: "not a slowpitch bat" };
  if (DROP_WEIGHT.test(raw)) return { ok: false, reason: "drop-weight sizing" };
  if (ACCESSORY.test(raw) && !BAT_SIZE.test(raw)) return { ok: false, reason: "accessory" };

  const norm = normalize(raw);
  const m = matchModelInText(norm, model);
  if (!m.line) return { ok: false, reason: "model name missing" };
  // A bare common word ("thing", "mercy") needs the brand next to it.
  if (!m.specific && !m.brand && /^(?:thing|mercy|torch|legit|amp|standard|culture|rival|stealth|ultra|vibe|melee|omen|beacon|fury|empire|alpha|marsh)$/.test(m.phrase ?? "")) {
    return { ok: false, reason: "ambiguous model word without the brand" };
  }
  if (m.variantsMissing.length > 0) return { ok: false, reason: `missing ${m.variantsMissing.join(", ")}` };

  // A different model year in the title means a different bat.
  const years = yearsIn(raw);
  if (model.year != null && years.length > 0 && !years.includes(model.year)) return { ok: false, reason: `different year (${years.join(", ")})` };

  // A stamp in the title that the model doesn't carry means a different bat (USA vs USSSA are separate catalog models).
  const titleStamps = readStamps(raw).stamps;
  if (titleStamps.length > 0 && model.stamps.length > 0 && !stampsOverlap(titleStamps, model.stamps)) {
    return { ok: false, reason: `stamp ${titleStamps.join("/")} isn't ${model.stamps.join("/")}` };
  }
  return { ok: true, reason: "matches" };
}

export function isRelevantTitle(title: string, model: MatchModel): boolean {
  return judgeTitle(title, model).ok;
}

export function filterRelevant<T extends { title: string }>(items: T[], model: MatchModel): T[] {
  return items.filter((i) => isRelevantTitle(i.title, model));
}
