// "Paste your post": reads the text of a bat for-sale post (Facebook group, Reddit, Craigslist, a text message...)
// and pulls out the facts a Gamer Bat listing needs. The seller wrote the post and pastes it; nothing here fetches
// a URL. Pure and deterministic: no AI, no network, same text in, same answer out.
//
// The rule that shapes everything: a wrong guess is worse than an empty field. A price, weight or hit count is
// filled when the text says it plainly; a stamp or a model is filled only when the match is confident. Anything the
// post leaves unclear is returned as a flag, so the seller is asked instead of guessed at.

import { brandWords, matchModelInText, normalize, readStamps, stampsOverlap, yearsIn, type MatchModel, type TextMatch } from "@/lib/catalog-match";

export type Confidence = "high" | "medium" | "low";

export type Found<T> = { value: T; confidence: Confidence; evidence: string };

export type ModelCandidate = {
  id: string;
  /** For example "2026 Miken Freak Black Maxload". */
  label: string;
  /** 0 to 1. */
  score: number;
  reasons: string[];
};

export type ImportFieldKey = "model" | "weight_oz" | "length_inches" | "certification" | "approx_hits" | "price" | "accepts_offers" | "description";

/** A form field the post filled in. */
export type ImportField = {
  key: ImportFieldKey;
  label: string;
  /** How the value reads on screen. */
  display: string;
  confidence: Confidence;
  /** What in the post it came from. */
  evidence: string;
};

/** A field the post did not settle, left empty on purpose. */
export type ImportFlag = { key: ImportFieldKey; message: string };

export type DamageMention = "yes" | "no" | null;

export type ParsedPost = {
  /** "link_only": only a link was pasted (we never open links). */
  kind: "empty" | "link_only" | "text";
  /** The post seems to sell more than one bat; nothing is filled. */
  multiple: boolean;
  priceCents: Found<number> | null;
  acceptsOffers: Found<boolean> | null;
  weightOz: Found<number> | null;
  lengthInches: Found<number> | null;
  stamps: Found<string[]> | null;
  hits: Found<number> | null;
  /** "used one season" and similar, which is not a hit count. */
  usage: string | null;
  /** Positive or neutral condition words the seller used, for the seller to weigh ("like new", "broken in"). */
  conditionWords: string[];
  damage: { cracks: DamageMention; rattle: DamageMention; dead: DamageMention; dents: DamageMention; modified: DamageMention };
  shipping: { mode: "ships" | "local" | "both" | null; included: boolean };
  /** Model-year numbers found in the text. */
  years: number[];
  /** The brand named in the post when exactly one is, even if the model is unknown. */
  brand: string | null;
  model: { status: "matched" | "candidates" | "none"; matched: ModelCandidate | null; candidates: ModelCandidate[]; moreCandidates: number };
  /** The post with contact details, links and emoji removed, ready for the description box. */
  description: string;
  /** What changed in the text to make the description. */
  descriptionNotes: string[];
  fields: ImportField[];
  flags: ImportFlag[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b(?:facebook|fb|instagram|youtube|youtu|bit|tinyurl)\.(?:com|me|be|ly)\/\S*/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_RE = /(?<![\d$])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g;
const EMOJI_RE = /[\p{Extended_Pictographic}‍️⃣]/gu;
// Asking people to move off the site, or to pay outside it. Only the phrase is removed.
const OFFSITE_RE =
  /\b(?:pm|dm|msg|message|text|call|inbox|hit)\s+(?:me|us)(?:\s+(?:up|for\s+(?:details|info|more\s+info|pics?)|if\s+interested|at))?\b|\bcomment\s+(?:below|here)\b|\bvenmo(?:\s+me)?\b|\bcash\s?app\b|\bzelle\b|\bpaypal\b|\bf&f\b|\bfriends\s+(?:and|&)\s+family\b/gi;

export type CleanedPost = { body: string; description: string; notes: string[] };

/** Strips links, emails, phone numbers and emoji. `body` keeps everything else for analysis; `description` also drops off-site asks. */
export function cleanPost(raw: string): CleanedPost {
  const notes: string[] = [];
  let body = raw.replace(/\r\n?/g, "\n");
  const had = (re: RegExp) => new RegExp(re.source, re.flags.replace("g", "")).test(body);
  if (had(URL_RE)) notes.push("links");
  if (had(EMAIL_RE)) notes.push("email addresses");
  if (had(PHONE_RE)) notes.push("phone numbers");
  body = body.replace(URL_RE, " ").replace(EMAIL_RE, " ").replace(PHONE_RE, " ").replace(EMOJI_RE, " ");
  let description = body;
  if (had(OFFSITE_RE)) notes.push("messaging and off-site payment asks");
  description = description.replace(OFFSITE_RE, " ").replace(/(?:^|\s)(?:or\s+|and\s+)?(?:call|text|phone)\s*(?:at|:|me)?\s*[.!,;:]*\s*$/gim, " ");
  const tidy = (s: string) =>
    s
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").replace(/\s+([,.;!?])/g, "$1").replace(/^[\s\-–—*•#]+(?=\S)/, "").trim())
      .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
      .join("\n")
      .replace(/([,.;!?-])\1{2,}/g, "$1")
      .trim();
  return { body: tidy(body), description: tidy(description).slice(0, 5000), notes };
}

/** True when the text is only a link (or a link and a few words). We never open links. */
export function isLinkOnly(raw: string): boolean {
  const withoutLinks = raw.replace(URL_RE, " ").replace(/[\s\p{P}]+/gu, " ").trim();
  return withoutLinks.length < 12 && new RegExp(URL_RE.source, "i").test(raw);
}

// ---------------------------------------------------------------------------
// Price, offers
// ---------------------------------------------------------------------------

const MIN_PRICE = 15;
const MAX_PRICE = 1500;

type PriceCandidate = { dollars: number; confidence: Confidence; evidence: string; marker: boolean };

const ORIGINAL_PRICE = /(?:paid|retail(?:s|ed)?|msrp|new\s+for|bought|purchased|originally|orig\.?|cost|was|worth|ordered|lists?\s+for|list\s+price|brand\s+new\s+(?:is|for|at))\s*(?:for|at|about|around|me|over)?\s*[:~]?\s*$/i;
const SHIPPING_COST_AFTER = /^\s*(?:\+\s*)?(?:for\s+)?(?:shipping|ship\b|s\/h|s&h|to\s+ship|postage)/i;
const NOT_A_PRICE_AFTER = /^\s*(?:off\b|less\b|discount|deposit|tax|more\b)/i;

/** Dollar amounts and "180 obo" style prices. Original prices ("paid $300") and shipping costs are skipped. */
function priceCandidates(t: string): PriceCandidate[] {
  const out: PriceCandidate[] = [];
  const add = (dollars: number, confidence: Confidence, evidence: string, marker: boolean) => {
    if (Number.isFinite(dollars) && dollars >= MIN_PRICE && dollars <= MAX_PRICE) out.push({ dollars, confidence, evidence: evidence.trim(), marker });
  };

  for (const m of t.matchAll(/(?<![\w.])\$\s?(\d{1,3}(?:,\d{3})+|\d{2,4})(?:\.(\d{1,2}))?(?!\d)/g)) {
    const before = t.slice(Math.max(0, m.index - 30), m.index);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
    if (ORIGINAL_PRICE.test(before) || SHIPPING_COST_AFTER.test(after) || NOT_A_PRICE_AFTER.test(after)) continue;
    if (/^\s*(?:each|ea\b|per\b)/i.test(after)) continue;
    add(Number(m[1].replace(/,/g, "")) + (m[2] ? Number(`0.${m[2]}`) : 0), "high", m[0], false);
  }
  for (const m of t.matchAll(/(?<![\w.$/])(\d{2,4})\s?\$(?!\d)/g)) add(Number(m[1]), "high", m[0], false);

  // "150 obo", "180 shipped", "120 firm": a bare number right before a selling word.
  for (const m of t.matchAll(/(?<![\w.$/-])(\d{2,4})(?!\d)\s*(?:\$\s*)?(obo|o\.b\.o\.?|ono|firm|shipped|delivered|or\s+best\s+offer|or\s+best|negotiable|nego|plus\s+ship\w*|\+\s?ship\w*)(?![a-z])/gi)) {
    const n = Number(m[1]);
    if (n >= 1980 && n <= 2035) continue;
    add(n, "high", m[0], true);
  }
  // "asking 180", "price: 150", "selling for 140", "taking 160".
  for (const m of t.matchAll(/\b(?:asking|ask|price|prices|selling\s+(?:it\s+)?(?:for|at)|sell(?:ing)?\s+for|taking|want|wanting|looking\s+for)\s*[:=-]?\s*(?:\$\s*)?(\d{2,4})(?![\d/.]|\s*(?:oz|in\b|inch|"|hits|swings|k\b|%|bats?))/gi)) {
    const n = Number(m[1]);
    if (n >= 1980 && n <= 2035) continue;
    add(n, "high", m[0], true);
  }
  // A looser "for 150": only when nothing better exists (decided by the caller).
  for (const m of t.matchAll(/\bfor\s+(\d{2,4})(?![\d/.]|\s*(?:oz|in\b|inch|"|hits|swings|k\b|%|bats?|games|years|seasons|weeks|months|days|hours|times))/gi)) {
    const n = Number(m[1]);
    if (n >= 1980 && n <= 2035) continue;
    add(n, "medium", m[0], false);
  }
  return out;
}

export function readPrice(t: string): { found: Found<number> | null; warning: string | null } {
  const all = priceCandidates(t);
  if (all.length === 0) return { found: null, warning: null };
  const strong = all.filter((c) => c.confidence === "high");
  const pool = strong.length ? strong : all;
  const values = [...new Set(pool.map((c) => c.dollars))];
  if (values.length === 1) {
    const best = pool.find((c) => c.dollars === values[0])!;
    return { found: { value: Math.round(best.dollars * 100), confidence: best.confidence, evidence: best.evidence }, warning: null };
  }
  // Several prices. If exactly one sits next to a selling word (obo, firm, shipped, asking), that is the asking price.
  const marked = [...new Set(pool.filter((c) => c.marker).map((c) => c.dollars))];
  if (marked.length === 1) {
    const best = pool.find((c) => c.dollars === marked[0])!;
    return { found: { value: Math.round(best.dollars * 100), confidence: "medium", evidence: best.evidence }, warning: null };
  }
  return { found: null, warning: `We found more than one price ($${values.sort((a, b) => a - b).join(", $")}). Enter the asking price yourself.` };
}

export function readOffers(t: string): Found<boolean> | null {
  const l = t.toLowerCase();
  const no = l.match(/\bno\s+(?:obo|offers?|low\s?balls?|trades?\s+or\s+offers?)\b|\bno\s+low\s+ball(?:ing|s)?\b|\bprice\s+is\s+firm\b|\bfirm\s+price\b|\bfixed\s+price\b|(?<!not\s)(?<!non[\s-])\bfirm\b/);
  const yes = l.match(/\b(?:obo|o\.b\.o\.?|ono|or\s+best\s+offer|best\s+offer|or\s+offer|make\s+(?:me\s+)?(?:an?\s+)?offer|offers?\s+(?:welcome|accepted|considered|ok)|open\s+to\s+offers|negotiable|nego|willing\s+to\s+negotiate|(?:not|non)[\s-]+firm)\b/);
  if (no && !/not\s+firm|non[\s-]firm/.test(no[0])) {
    if (yes && !/not|non/.test(yes[0]) && !/\bno\s+obo/.test(l)) return null; // "obo" and "firm" together: contradictory, so don't pick
    return { value: false, confidence: "high", evidence: no[0] };
  }
  if (yes) return { value: true, confidence: "high", evidence: yes[0] };
  return null;
}

// ---------------------------------------------------------------------------
// Weight and length
// ---------------------------------------------------------------------------


type SizeReading = {
  pairs: { length: number; weight: number; evidence: string }[];
  weights: { value: number; evidence: string }[];
  lengths: { value: number; evidence: string }[];
};

/** "34/26", "34-26", "34 x 26oz" (length/weight), "26oz", "34 inch". */
export function readSizes(t: string): SizeReading {
  const out: SizeReading = { pairs: [], weights: [], lengths: [] };
  const L = "(3[0-6](?:\\.5)?)";
  const W = "(2\\d(?:\\.5)?|3[0-4](?:\\.5)?)";
  const pair = new RegExp(`(?<![\\d.$/])${L}\\s*(?:"|”|in\\b|inch(?:es)?)?\\s*[/\\\\\\-x×]\\s*${W}\\s*(?:oz\\b|ounces?\\b)?(?![\\d/]|\\.\\d)`, "gi");
  for (const m of t.matchAll(pair)) {
    const length = Number(m[1]);
    const weight = Number(m[2]);
    if (length > weight) out.pairs.push({ length, weight, evidence: m[0].trim() });
  }
  for (const m of t.matchAll(/(?<![\d.$/])(2\d(?:\.5)?|3[0-4](?:\.5)?)\s*(?:oz\b|ounces?\b)/gi)) out.weights.push({ value: Number(m[1]), evidence: m[0].trim() });
  for (const m of t.matchAll(/(?<![\d.$/])(3[0-6](?:\.5)?)\s*(?:inch(?:es)?\b|in\b|"|”)(?!\s*barrel)/gi)) out.lengths.push({ value: Number(m[1]), evidence: m[0].trim() });
  return out;
}

function resolveSizes(sizes: SizeReading): { weight: Found<number> | null; length: Found<number> | null; conflict: boolean } {
  const weightValues = new Set([...sizes.pairs.map((p) => p.weight), ...sizes.weights.map((w) => w.value)]);
  const lengthValues = new Set([...sizes.pairs.map((p) => p.length), ...sizes.lengths.map((l) => l.value)]);
  const conflict = weightValues.size > 1 || lengthValues.size > 1;
  let weight: Found<number> | null = null;
  let length: Found<number> | null = null;
  if (weightValues.size === 1) {
    const [v] = [...weightValues];
    weight = { value: v, confidence: "high", evidence: (sizes.pairs.find((p) => p.weight === v) ?? sizes.weights.find((w) => w.value === v))!.evidence };
  }
  if (lengthValues.size === 1) {
    const [v] = [...lengthValues];
    length = { value: v, confidence: "high", evidence: (sizes.pairs.find((p) => p.length === v) ?? sizes.lengths.find((l) => l.value === v))!.evidence };
  }
  return { weight, length, conflict };
}

// ---------------------------------------------------------------------------
// Hits, usage, condition
// ---------------------------------------------------------------------------

export function readHits(t: string): Found<number> | null {
  const unit = "(?:hits|swings|cuts|bp\\s+swings|rounds\\s+of\\s+bp)";
  const num = "(\\d{1,2},\\d{3}|\\d{1,2}(?:\\.\\d)?\\s?k|\\d{2,5})";
  const re = new RegExp(`(?<![\\w$.])(~|≈|about|around|approx\\.?|approximately|roughly|maybe|only|just|under|over|less\\s+than|more\\s+than|like|close\\s+to)?\\s*${num}\\s*(\\+)?\\s*(?:total\\s+)?${unit}\\b`, "gi");
  for (const m of t.matchAll(re)) {
    const raw = m[2].replace(/,/g, "").replace(/\s/g, "");
    const n = /k$/i.test(raw) ? Math.round(parseFloat(raw) * 1000) : Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 10000) continue;
    const qualifier = (m[1] ?? "").toLowerCase();
    // "under 100 hits" is a ceiling, not a count, so it isn't filled.
    if (/under|less\s+than/.test(qualifier)) continue;
    return { value: n, confidence: /over|more\s+than/.test(qualifier) || m[3] === "+" ? "medium" : "high", evidence: m[0].trim() };
  }
  const balls = t.match(/\bhit\s+(?:it\s+)?(?:about|around|~|roughly)?\s*(\d{2,5})\s+(?:balls|times|pitches)\b/i);
  if (balls && Number(balls[1]) <= 10000) return { value: Number(balls[1]), confidence: "medium", evidence: balls[0].trim() };
  return null;
}

export function readUsage(t: string): string | null {
  const m = t.match(
    /\b(?:(?:only\s+)?used\s+(?:for\s+)?(?:one|1|a|two|2|three|3|half\s+a)\s+(?:season|summer|year|fall|spring|tournament)s?|(?:only\s+)?(?:used|swung|hit)\s+(?:a\s+few|a\s+couple|once|twice)(?:\s+(?:times|games|tournaments|practices))?|(?:one|1|two|2|three|3)\s+(?:seasons?|summers?|years?)\s+(?:old|of\s+use)|(?:gently|lightly|barely|rarely)\s+used)\b/i
  );
  return m ? m[0].trim() : null;
}

const NEGATION_BEFORE = /(?:\bno|\bnot|\bnever|\bwithout|\bzero|\bfree\s+of|\bnon|\bisn'?t|\bhasn'?t(?:\s+been)?|\bhas\s+no|\bdoesn'?t\s+(?:have|has))[\s-]+(?:\w+[\s-]+)?$/;

function mention(t: string, re: RegExp): DamageMention {
  let negated = false;
  for (const m of t.matchAll(re)) {
    const before = t.slice(Math.max(0, m.index - 22), m.index);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (NEGATION_BEFORE.test(before) || /^[\s-]*free\b/.test(after)) negated = true;
    else return "yes";
  }
  return negated ? "no" : null;
}

const POSITIVE_WORDS: [string, RegExp][] = [
  ["like new", /\blike[\s-]new\b|\bmint\b/],
  ["brand new", /\bbrand[\s-]new\b|\bnew in (?:the )?(?:box|wrapper)\b|\bnib\b|\bbnib\b/],
  ["broken in", /\bbroke(?:n)?[\s-]in\b|\bbroken-in\b/],
  ["hot", /\bhot\b/],
  ["great shape", /\b(?:great|good|excellent|perfect|clean)\s+(?:shape|condition)\b/],
];

export function readCondition(t: string) {
  const l = t.toLowerCase();
  const words: string[] = [];
  for (const [label, re] of POSITIVE_WORDS) {
    const m = l.match(re);
    if (m && m.index !== undefined && !NEGATION_BEFORE.test(l.slice(Math.max(0, m.index - 12), m.index))) words.push(label);
  }
  return {
    words,
    damage: {
      cracks: mention(l, /\bcrack(?:s|ed|ing)?\b/g),
      rattle: mention(l, /\brattl(?:e|es|ed|ing)\b/g),
      dead: mention(l, /\bdead(?:\s+(?:spot|spots|bat|barrel))?\b/g),
      dents: mention(l, /\bdent(?:s|ed)?\b|\bflat\s+spots?\b|\bdelaminat\w+\b|\bseparat(?:ed|ion)\b/g),
      modified: mention(l, /\b(?:rolled|shaved|shaving|doctored|juiced|altered|modified)\b/g),
    },
  };
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export function readShipping(t: string): ParsedPost["shipping"] {
  const l = t.toLowerCase();
  const localOnly = /\b(?:local\s+(?:pick\s?up\s+)?only|pick\s?up\s+only|no\s+(?:shipping|ship)\b|will\s+not\s+ship|won'?t\s+ship|cash\s+(?:and|&)\s+carry|must\s+(?:be\s+)?pick(?:ed)?\s?up|local\s+sale\s+only)\b/.test(l);
  const local = localOnly || /\b(?:local|meet\s?up|meet\s+in|pick\s?up|in\s+person|can\s+meet|will\s+meet)\b/.test(l);
  const included = /\b(?:shipped|free\s+ship(?:ping)?|ship(?:ping)?\s+(?:is\s+)?(?:included|free)|incl(?:uding|uded)?\.?\s+ship(?:ping)?|ships?\s+free)\b/.test(l);
  const ships = included || /\b(?:will\s+ship|can\s+ship|ship(?:s|ping)?\s+(?:available|extra|to|anywhere|within|nationwide|at\s+cost)|plus\s+ship\w*|\+\s?ship\w*|ship\s+it|usps|fedex|ups\b|will\s+mail)\b/.test(l);
  const mode = localOnly ? "local" : ships && local ? "both" : ships ? "ships" : local ? "local" : null;
  return { mode, included: included && !localOnly };
}

// ---------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------

function readStampsForImport(t: string): { found: Found<string[]> | null; flag: string | null } {
  const read = readStamps(t);
  let stamps = read.stamps;
  // A bare "senior" can mean the player's age. Treat SSUSA as stated only when it is named or clearly the bat's stamp.
  if (stamps.includes("SSUSA") && !/\bssusa\b|\bsenior\s+(?:bat|softball|stamp|stamped|approved|certified|league\s+approved|slowpitch)\b|\bseniors?\s+(?:stamp|approved)\b/i.test(t)) {
    stamps = stamps.filter((s) => s !== "SSUSA");
  }
  const m = /\b(?:usssa|asa|usa|nsa|isa|ssusa|senior)\b/i.exec(t);
  const evidence = m ? t.slice(Math.max(0, m.index - 8), m.index + m[0].length + 12).replace(/\s+/g, " ").trim() : "";
  if (read.denied.length && !stamps.length) {
    return { found: null, flag: `The post says it is not ${read.denied.join("/")}. Choose the stamps on the barrel.` };
  }
  if (stamps.length && read.hedged) {
    return { found: null, flag: `The post sounds unsure about the stamp (${stamps.join("/")}). Check the barrel and choose it yourself.` };
  }
  if (stamps.length) return { found: { value: stamps, confidence: "high", evidence }, flag: null };
  if (read.dualMentioned) return { found: null, flag: "The post says dual-stamp but doesn't name the stamps. Choose them from the barrel." };
  return { found: null, flag: "The post doesn't name a stamp. Choose the stamps printed on the barrel." };
}

// ---------------------------------------------------------------------------
// Catalog match
// ---------------------------------------------------------------------------

// Words that show a post is about bats, for model names that are also everyday words ("mercy", "torch", "thing").
const BAT_CONTEXT = /\b(bats?|barrel|end\s?load(?:ed)?|max\s?load|loaded|balanced|usssa|asa|usa|ssusa|nsa|isa|composite|alloy|1\s?pc|2\s?pc|one\s+piece|two\s+piece|\d{2}(?:\.5)?\s?oz|34\s?[/-]\s?\d\d|break(?:ing)?[\s-]?in|broke[\s-]in|swings?|hits|slow\s?pitch|softball|stamp(?:ed)?|dual)\b/;

const modelLabel = (m: MatchModel) => [m.year, m.brand, m.modelName].filter(Boolean).join(" ");

function lineKey(m: MatchModel) {
  return `${normalize(m.brand)}|${normalize(m.lineName ?? m.modelName)}`;
}

type Scored = { model: MatchModel; match: TextMatch; score: number; reasons: string[] };

function scoreModels(norm: string, years: number[], postStamps: string[], catalog: MatchModel[]): Scored[] {
  const context = BAT_CONTEXT.test(norm);
  const scored: Scored[] = [];
  for (const model of catalog) {
    const match = matchModelInText(norm, model);
    if (!match.line) continue;
    // A bare common word ("mercy", "legit") counts only with the brand or bat talk around it.
    if (!match.specific && !match.brand && !context) continue;
    let score = 0.45;
    const reasons: string[] = [];
    if (match.brand) {
      score += 0.12;
      reasons.push(`brand ${model.brand}`);
    }
    reasons.push(`name ${match.phrase}`);
    if (match.variantsTotal === 0) score += 0.2;
    else {
      score += 0.25 * (match.variantsMatched.length / match.variantsTotal) + 0.05 * Math.min(match.variantsMatched.length, 3);
      if (match.variantsMatched.length) reasons.push(match.variantsMatched.join(", "));
    }
    if (model.year != null && years.length) {
      if (years.includes(model.year)) {
        score += 0.12;
        reasons.push(`year ${model.year}`);
      } else score -= 0.2;
    }
    if (postStamps.length && model.stamps.length) {
      if (stampsOverlap(postStamps, model.stamps)) {
        score += 0.08;
        reasons.push(`stamp ${postStamps.filter((s) => model.stamps.includes(s)).join("/")}`);
      } else score -= 0.25;
    }
    scored.push({ model, match, score: Math.max(0, Math.min(1, score)), reasons });
  }
  // A model whose matched words are a strict subset of another fully matched model's is the less specific
  // reading of the same text ("Freak Maxload" inside "Freak Black Maxload"), so the more specific one wins.
  return scored.filter(
    (a) =>
      !scored.some(
        (b) =>
          b !== a &&
          lineKey(b.model) === lineKey(a.model) &&
          b.match.variantsMissing.length === 0 &&
          b.match.variantsMatched.length > a.match.variantsMatched.length &&
          a.match.variantsMatched.every((v) => b.match.variantsMatched.includes(v))
      )
  );
}

export function matchCatalog(
  norm: string,
  years: number[],
  postStamps: string[],
  catalog: MatchModel[]
): { model: ParsedPost["model"]; brand: string | null; lines: number } {
  const scored = scoreModels(norm, years, postStamps, catalog).sort(
    (a, b) => b.score - a.score || (b.model.year ?? 0) - (a.model.year ?? 0) || a.model.modelName.localeCompare(b.model.modelName)
  );
  const toCandidate = (s: Scored): ModelCandidate => ({ id: s.model.id, label: modelLabel(s.model), score: Math.round(s.score * 100) / 100, reasons: s.reasons });

  // Brands named in the post (for pre-selecting the brand when the model is unclear).
  const brands = new Set<string>();
  for (const b of new Set(catalog.map((m) => m.brand))) {
    const words = brandWords(b);
    // "Worth" is also a common word, so it counts only when written as a name.
    const hit = words.some((w) => new RegExp(`(?<![a-z0-9])${w.replace(/ /g, "\\s?")}(?![a-z0-9])`).test(norm) && (normalize(b) !== "worth" || /\bWorth\b/.test(norm) || scored.some((s) => s.model.brand === b)));
    if (hit) brands.add(b);
  }
  const brand = brands.size === 1 ? [...brands][0] : null;

  const strong = scored.filter((s) => s.score >= 0.6 && (s.match.brand || s.match.specific || s.match.variantsMatched.length > 0));
  const lines = new Set(strong.map((s) => lineKey(s.model))).size;

  const top = scored[0];
  if (!top || top.score < 0.5) return { model: { status: "none", matched: null, candidates: [], moreCandidates: 0 }, brand, lines };
  const second = scored[1];
  const confident = top.score >= 0.8 && top.match.variantsMissing.length === 0 && (!second || top.score - second.score >= 0.15);
  if (confident) return { model: { status: "matched", matched: toCandidate(top), candidates: [], moreCandidates: 0 }, brand: top.model.brand, lines };
  const near = scored.filter((s) => s.score >= 0.5 && top.score - s.score <= 0.2);
  return {
    model: { status: "candidates", matched: null, candidates: near.slice(0, 5).map(toCandidate), moreCandidates: Math.max(0, near.length - 5) },
    brand: brand ?? (new Set(near.map((s) => s.model.brand)).size === 1 ? top.model.brand : null),
    lines,
  };
}

// ---------------------------------------------------------------------------
// The whole post
// ---------------------------------------------------------------------------

const MULTIPLE_CUES =
  /\b(?:bats\s+for\s+sale|selling\s+(?:\d+|two|three|four|five|several|a\s+few|multiple|all)\s+(?:of\s+)?(?:my\s+)?bats|(?:two|three|four|five|\d)\s+(?:slow\s?pitch\s+)?bats\b|lot\s+of\s+bats|bundle|both\s+bats|all\s+(?:three|four|3|4)\s+bats|bat\s*(?:#|no\.?|number)\s?[12]\b|first\s+bat|second\s+bat|\$\s?\d+\s+each|\d+\s+each)\b/i;

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

/** Reads a pasted post against the catalog. `now` only decides which years are plausible. */
export function parsePost(raw: string, catalog: MatchModel[], now: Date = new Date()): ParsedPost {
  const empty = (kind: ParsedPost["kind"], warning: string): ParsedPost => ({
    kind,
    multiple: false,
    priceCents: null,
    acceptsOffers: null,
    weightOz: null,
    lengthInches: null,
    stamps: null,
    hits: null,
    usage: null,
    conditionWords: [],
    damage: { cracks: null, rattle: null, dead: null, dents: null, modified: null },
    shipping: { mode: null, included: false },
    years: [],
    brand: null,
    model: { status: "none", matched: null, candidates: [], moreCandidates: 0 },
    description: "",
    descriptionNotes: [],
    fields: [],
    flags: [],
    warnings: [warning],
  });

  if (!raw.trim()) return empty("empty", "Paste the text of your post first.");
  if (isLinkOnly(raw)) {
    return empty("link_only", "That's a link. We can't open Facebook (or any other) links, so open your post, copy the words of it, and paste those here instead.");
  }

  const cleaned = cleanPost(raw);
  const t = cleaned.body;
  if (t.replace(/[\W_]+/g, "").length < 6) return empty("empty", "There's not much text there. Paste the words of your post.");
  const norm = normalize(t);
  const maxYear = now.getFullYear() + 2;
  const years = yearsIn(t).filter((y) => y <= maxYear);

  const stampRead = readStampsForImport(t);
  const price = readPrice(t);
  const sizes = readSizes(t);
  const { weight, length, conflict } = resolveSizes(sizes);
  const condition = readCondition(t);
  const match = matchCatalog(norm, years, stampRead.found?.value ?? readStamps(t).stamps, catalog);

  const warnings: string[] = [];
  const distinctPairs = new Set(sizes.pairs.map((p) => `${p.length}/${p.weight}`));
  const multiple = match.lines >= 2 || distinctPairs.size >= 2 || MULTIPLE_CUES.test(t);
  if (multiple) {
    const base = empty("text", "");
    return {
      ...base,
      multiple: true,
      warnings: [
        "This looks like more than one bat. Gamer Bat lists one bat at a time, so we haven't filled anything in. Paste the part about one bat, or list them one after another.",
      ],
    };
  }
  if (price.warning) warnings.push(price.warning);
  if (conflict) warnings.push("The post gives more than one weight or length, so we left those empty. Enter the ones for this bat.");

  const flags: ImportFlag[] = [];
  const fields: ImportField[] = [];

  // Model
  if (match.model.status === "matched" && match.model.matched) {
    fields.push({ key: "model", label: "Model", display: match.model.matched.label, confidence: "high", evidence: match.model.matched.reasons.join(", ") });
  } else if (match.model.status === "candidates") {
    flags.push({ key: "model", message: "We found more than one model that fits. Pick yours below, or choose it from the catalog." });
  } else {
    flags.push({
      key: "model",
      message: match.brand ? `We found the brand (${match.brand}) but not the model. Choose the model in the next step.` : "We couldn't tell the brand or model. Choose them in the next steps.",
    });
  }

  // Stamps
  if (stampRead.found) {
    fields.push({ key: "certification", label: "Stamps on the barrel", display: stampRead.found.value.join(" / "), confidence: stampRead.found.confidence, evidence: stampRead.found.evidence });
  } else if (stampRead.flag) flags.push({ key: "certification", message: stampRead.flag });

  if (weight) fields.push({ key: "weight_oz", label: "Weight", display: `${weight.value} oz`, confidence: weight.confidence, evidence: weight.evidence });
  else if (!conflict) flags.push({ key: "weight_oz", message: "No weight in the post. Weigh the bat or read it off the knob." });
  if (length) fields.push({ key: "length_inches", label: "Length", display: `${length.value} in`, confidence: length.confidence, evidence: length.evidence });

  const hits = readHits(t);
  if (hits) fields.push({ key: "approx_hits", label: "About how many hits", display: `about ${hits.value.toLocaleString("en-US")}`, confidence: hits.confidence, evidence: hits.evidence });
  const usage = hits ? null : readUsage(t);

  if (price.found) fields.push({ key: "price", label: "Asking price", display: dollars(price.found.value), confidence: price.found.confidence, evidence: price.found.evidence });
  else if (!price.warning) flags.push({ key: "price", message: "No price in the post. Set your asking price." });

  const offers = readOffers(t);
  if (offers) fields.push({ key: "accepts_offers", label: "Accepts offers", display: offers.value ? "Yes (obo)" : "No (firm)", confidence: offers.confidence, evidence: offers.evidence });

  // The description is only offered when the post gave us something else to go on (nonsense isn't a listing).
  if (cleaned.description.length >= 15 && fields.length > 0) {
    fields.push({ key: "description", label: "Description", display: "Your post, tidied", confidence: "medium", evidence: "the whole post" });
  }

  return {
    kind: "text",
    multiple: false,
    priceCents: price.found,
    acceptsOffers: offers,
    weightOz: weight,
    lengthInches: length,
    stamps: stampRead.found,
    hits,
    usage,
    conditionWords: condition.words,
    damage: condition.damage,
    shipping: readShipping(t),
    years,
    brand: match.brand,
    model: match.model,
    description: cleaned.description,
    descriptionNotes: cleaned.notes,
    fields,
    flags,
    warnings,
  };
}

/** "We filled 7 fields. Check the highlighted ones." (or what to do when nothing was found). */
export function summaryLine(p: ParsedPost): string {
  if (p.kind !== "text" || p.multiple) return "";
  const n = p.fields.length;
  if (n === 0) return "We couldn't read any listing details from that text. Nothing was filled in, so you can fill the listing in by hand.";
  return `We filled ${n} ${n === 1 ? "field" : "fields"}. Check the highlighted ones.`;
}
