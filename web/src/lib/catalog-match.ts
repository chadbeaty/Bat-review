// Matching free text (an eBay title, a pasted Facebook post) to a catalog bat model. Pure and deterministic: no
// network, no AI. Shared by the eBay relevance filter and the "paste your post" importer so both agree on what
// "this is the same bat" means. A model is identified by its brand, its product line (with the aliases from
// product_lines), the variant words in its name ("Black", "Maxload", "XXL"), its year and its stamps.

/** What the matcher needs to know about one catalog model. */
export type MatchModel = {
  id: string;
  /** Manufacturer name, for example "Miken". */
  brand: string;
  /** The model name without the brand or year, for example "Freak Black Maxload". */
  modelName: string;
  year: number | null;
  /** Certification stamps in the catalog: USSSA, USA, NSA, ISA, SSUSA. */
  stamps: string[];
  /** The product line, for example "Freak". */
  lineName: string | null;
  /** Other names for the line or model ("super freak", "kp 23"). */
  aliases: string[];
};

/** The shape of a bat summary this module reads (structural, so the server-only bats module isn't imported). */
export type BatLike = {
  id: string;
  manufacturerName: string;
  modelName: string;
  modelYear: number | null;
  stamps: string[];
  productLineName: string | null;
};

/** Builds a MatchModel from a catalog bat summary and the alias list of its product line. */
export function matchModelFromBat(bat: BatLike, lineAliases: string[] = []): MatchModel {
  return {
    id: bat.id,
    brand: bat.manufacturerName,
    modelName: bat.modelName,
    year: bat.modelYear,
    stamps: bat.stamps,
    lineName: bat.productLineName,
    aliases: lineAliases,
  };
}

// ---------------------------------------------------------------------------
// Text normalizing
// ---------------------------------------------------------------------------

/** Lowercase letters, digits and single spaces only ("34/27" becomes "34 27", "Rckless" stays "rckless"). */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Brand name to the spellings people use for it. */
export const BRAND_WORDS: Record<string, string[]> = {
  easton: ["easton"],
  demarini: ["demarini", "de marini"],
  miken: ["miken"],
  worth: ["worth"],
  "louisville slugger": ["louisville slugger", "louisville", "slugger"],
  monsta: ["monsta"],
  suncoast: ["suncoast"],
  victus: ["victus"],
  axe: ["axe"],
  marucci: ["marucci"],
  anarchy: ["anarchy"],
  anderson: ["anderson"],
  combat: ["combat"],
};

export function brandWords(brand: string): string[] {
  const key = normalize(brand);
  return BRAND_WORDS[key] ?? (key ? [key] : []);
}

/** A regex source for one word that tolerates a space between letters and digits ("freak30" matches "freak 30"). */
function flexWord(word: string): string {
  const runs = word.match(/[a-z]+|\d+/g) ?? [];
  return runs.join("\\s?");
}

// Words that mean the same thing in different spellings. Keys are normalized model words.
const LOAD_END = "(?:end\\s?load(?:ed)?|loaded)";
const SYNONYMS: Record<string, string> = {
  endload: LOAD_END,
  loaded: LOAD_END,
  endloaded: LOAD_END,
  maxload: "max\\s?load(?:ed)?",
  powerload: "power\\s?load(?:ed)?",
  midload: "mid\\s?(?:load(?:ed)?|weighted)",
  balanced: "balanced",
  "1pc": "(?:1\\s?pc|1\\s?piece|one\\s?piece)",
  "2pc": "(?:2\\s?pc|2\\s?piece|two\\s?piece)",
};

const B_START = "(?<![a-z0-9])";
const B_END = "(?![a-z0-9])";

/** A regex that finds a whole word or phrase in normalized text. */
export function phraseRegex(phrase: string): RegExp {
  const words = normalize(phrase).split(" ").filter(Boolean);
  const body = words.map((w) => SYNONYMS[w] ?? flexWord(w)).join("\\s?");
  return new RegExp(`${B_START}${body}${B_END}`);
}

// ---------------------------------------------------------------------------
// Model words
// ---------------------------------------------------------------------------

// Words in a model name that don't tell one bat from another.
const NOISE = new Set([
  "bat", "bats", "slowpitch", "slow", "pitch", "softball", "piece", "pc", "1pc", "2pc", "one", "two", "usssa", "usa", "asa", "nsa", "isa", "ssusa",
  "senior", "composite", "alloy", "the", "edition", "series", "model", "new", "and", "inch", "in", "barrel", "oz",
]);

/** The words that tell this model apart from its line ("Freak Black Maxload" in the Freak line gives black, maxload). */
export function variantWords(model: Pick<MatchModel, "brand" | "modelName" | "lineName">): string[] {
  const skip = new Set<string>([...brandWords(model.brand).flatMap((b) => b.split(" ")), ...normalize(model.lineName ?? "").split(" ")]);
  const out: string[] = [];
  for (const w of normalize(model.modelName).split(" ")) {
    if (!w || skip.has(w) || NOISE.has(w) || /^\d+$/.test(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/** Names that identify the model's line in text: the line name, its aliases and the full model name. */
export function linePhrases(model: MatchModel): string[] {
  const names = [model.lineName, model.modelName, ...model.aliases].filter((x): x is string => Boolean(x && normalize(x)));
  return [...new Set(names.map(normalize))].sort((a, b) => b.length - a.length);
}

export type TextMatch = {
  /** The line, an alias or the full model name appears. */
  line: boolean;
  /** The phrase that matched, for display. */
  phrase: string | null;
  /** That phrase contains a digit or a space, so it is specific on its own ("kp23", "freak black"). */
  specific: boolean;
  brand: boolean;
  variantsTotal: number;
  variantsMatched: string[];
  variantsMissing: string[];
};

/** Which parts of the model show up in the (already normalized) text. */
export function matchModelInText(norm: string, model: MatchModel): TextMatch {
  let phrase: string | null = null;
  for (const p of linePhrases(model)) {
    if (phraseRegex(p).test(norm)) {
      phrase = p;
      break;
    }
  }
  const variants = variantWords(model);
  const matched = variants.filter((v) => phraseRegex(v).test(norm));
  return {
    line: phrase !== null,
    phrase,
    specific: phrase !== null && /[\s\d]/.test(phrase),
    brand: brandWords(model.brand).some((b) => phraseRegex(b).test(norm)),
    variantsTotal: variants.length,
    variantsMatched: matched,
    variantsMissing: variants.filter((v) => !matched.includes(v)),
  };
}

// ---------------------------------------------------------------------------
// Years and stamps
// ---------------------------------------------------------------------------

/** Four-digit years (2015 to 2032) written as words in the text, including "'24" style. */
export function yearsIn(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/(?<![\d.$/-])(20[123]\d)(?![\d%])/g)) out.add(Number(m[1]));
  for (const m of text.matchAll(/(?<![\w])['’](\d{2})(?![\d])/g)) {
    const y = 2000 + Number(m[1]);
    if (y >= 2015 && y <= 2032) out.add(y);
  }
  return [...out].sort();
}

export const STAMP_ORDER = ["USSSA", "USA", "NSA", "ISA", "SSUSA"] as const;

export type StampRead = {
  /** Stamps stated plainly, in the catalog's order. */
  stamps: string[];
  /** A hedge ("I think", "not sure", "maybe") sits next to a stamp. */
  hedged: boolean;
  /** The text says dual-stamp, or "all stamps", without naming them. */
  dualMentioned: boolean;
  /** A stamp was denied ("not USSSA"). */
  denied: string[];
};

const HEDGE = /\b(i think|not sure|unsure|maybe|probably|might be|pretty sure|i believe|idk|supposedly|should be|not certain|i guess)\b/;

/** Reads the stamps a text claims. "Made in USA" and "USA Baseball" are not stamps. */
export function readStamps(text: string): StampRead {
  const t = text.toLowerCase();
  const found = new Set<string>();
  const denied = new Set<string>();
  let hedged = false;
  const patterns: [string, RegExp][] = [
    ["USSSA", /(?<![a-z0-9])(?:usssa|u\.s\.s\.s\.a\.?)(?![a-z0-9])/g],
    ["USA", /(?<![a-z0-9])(?:usa|asa|u\.s\.a\.)(?![a-z0-9])/g],
    ["NSA", /(?<![a-z0-9])nsa(?![a-z0-9])/g],
    ["ISA", /(?<![a-z0-9])isa(?![a-z0-9])/g],
    ["SSUSA", /(?<![a-z0-9])(?:ssusa|seniors?)(?![a-z0-9])/g],
  ];
  for (const [stamp, re] of patterns) {
    for (const m of t.matchAll(re)) {
      const before = t.slice(Math.max(0, m.index - 14), m.index);
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 14);
      if (stamp === "USA" && (/(made in|team|from the|proudly)\s*$/.test(before) || /^\s*(baseball|made|flag)\b/.test(after))) continue;
      if (stamp === "SSUSA" && /^\s*(discount|citizen)/.test(after)) continue;
      if (/(?:\bno|\bnot|\bnon|\bisnt|\bisn't|\bwithout|\bnever)[\s-]+(?:a\s+|an\s+)?$/.test(before)) {
        denied.add(stamp);
        continue;
      }
      found.add(stamp);
      const around = t.slice(Math.max(0, m.index - 45), m.index + m[0].length + 45);
      if (HEDGE.test(around)) hedged = true;
    }
  }
  const dualMentioned = /\bdual[\s-]?(?:stamp(?:ed)?|certified|cert)\b|\ball (?:the )?(?:stamps|certs|certifications)\b|\bdual\b.{0,24}\bstamp/.test(t);
  return { stamps: STAMP_ORDER.filter((s) => found.has(s)), hedged, dualMentioned, denied: STAMP_ORDER.filter((s) => denied.has(s)) };
}

/** True when two stamp lists share at least one stamp. */
export function stampsOverlap(a: string[], b: string[]): boolean {
  return a.some((s) => b.includes(s));
}
