// Search query parsing and URL building, shared by every browse page. Pure functions (no database access),
// so they run anywhere and are unit-tested in tests/unit/search.test.ts. The database side is the
// search_listings function in supabase/migrations/20261102000100_shop_search.sql.
//
// Every filter lives in the URL so results are shareable and crawlable. Prices are whole dollars in the URL
// and integer cents everywhere else.

export const PAGE_SIZE = 24;
const MAX_TERMS = 8;
const MAX_PAGE = 500;

export const SORTS = {
  newest: "Newest",
  price_asc: "Lowest price",
  price_desc: "Highest price",
  condition: "Best condition",
  best: "Best match",
} as const;
export type Sort = keyof typeof SORTS;

export const STAMPS = ["USSSA", "USA", "NSA", "ISA", "SSUSA", "Other"] as const;
export const WEIGHTINGS = ["balanced", "endload", "midload"] as const;

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export type SearchQuery = {
  /** The visitor's words, trimmed, as typed (shown back in the search box). */
  q: string;
  /** Normalized words sent to the database. */
  terms: string[];
  brands: string[];
  model?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  condition?: number;
  state?: string;
  weights: number[];
  stamps: string[];
  years: number[];
  loads: string[];
  rating?: number;
  /** Bat length range in inches (URL: minlen, maxlen). */
  minLength?: number;
  maxLength?: number;
  /** Only listings published in the last 7 days (URL: new=1). */
  fresh?: boolean;
  /** Only bats stamped for two or more associations (URL: dual=1). */
  dual?: boolean;
  /** Only listings whose seller accepts offers (URL: offers=1). */
  offers?: boolean;
  /** Category-specific attribute filters from product_categories.attribute_schema (URL: a.<key>=value). */
  attrs: Record<string, string[]>;
  sort: Sort;
  page: number;
};

export type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

/**
 * Lowercases and rewrites common softball spellings to one form, so "End-Loaded", "end load" and "endloaded"
 * all match, "ASA" finds USA-stamped bats, and "one piece", "1-piece" and "1pc" are the same.
 * Must stay in step with public.search_normalize() in the database.
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bend[\s_-]*load(ed|s)?\b/g, "endload")
    .replace(/\bmid[\s_-]*load(ed|s)?\b/g, "midload")
    .replace(/\b(one|1|single)[\s_-]*(piece|pc)\b/g, "1pc")
    .replace(/\b(two|2)[\s_-]*(piece|pc)\b/g, "2pc")
    .replace(/\basa\b/g, "usa")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized, de-duplicated search words. Stray dots are dropped; "26.5" is kept. */
export function searchTerms(q: string): string[] {
  const words = normalizeSearchText(q)
    .split(" ")
    .map((w) => w.replace(/^\.+|\.+$/g, "").slice(0, 40))
    .filter((w) => w.length > 0);
  return [...new Set(words)].slice(0, MAX_TERMS);
}

function all(params: RawParams, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const v = params[key];
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function first(params: RawParams, key: string): string | undefined {
  const v = all(params, key)[0]?.trim();
  return v ? v : undefined;
}

/** Values may arrive repeated (?stamp=USA&stamp=NSA) or comma-separated (?stamp=USA,NSA). */
function list(params: RawParams, key: string): string[] {
  return [
    ...new Set(
      all(params, key)
        .flatMap((v) => v.split(","))
        .map((v) => v.trim())
        .filter(Boolean)
    ),
  ];
}

const SLUG = /^[a-z0-9-]{1,80}$/;

function dollarsToCents(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const cleaned = v.replace(/[$,\s]/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

function intInRange(v: string | undefined, min: number, max: number): number | undefined {
  if (!v || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

export function normalizeStamp(v: string): string | null {
  const s = v.trim().toUpperCase();
  if (s === "ASA") return "USA";
  const known = STAMPS.find((k) => k.toUpperCase() === s);
  return known ?? null;
}

export function normalizeWeighting(v: string): string | null {
  const s = normalizeSearchText(v).replace(/\s/g, "");
  if (s === "endload" || s === "loaded") return "endload";
  if (s === "midload") return "midload";
  if (s === "balanced") return "balanced";
  return null;
}

/**
 * Reads browse filters from URL query parameters. Anything invalid is dropped rather than causing an error,
 * so an edited or old link still shows sensible results.
 */
export function parseSearchParams(params: RawParams, opts: { attributeKeys?: string[] } = {}): SearchQuery {
  const q = (first(params, "q") ?? "").replace(/\s+/g, " ").slice(0, 120);
  let minPriceCents = dollarsToCents(first(params, "min"));
  let maxPriceCents = dollarsToCents(first(params, "max"));
  if (minPriceCents != null && maxPriceCents != null && minPriceCents > maxPriceCents) {
    [minPriceCents, maxPriceCents] = [maxPriceCents, minPriceCents];
  }
  const sortRaw = first(params, "sort");
  const sort: Sort = sortRaw && sortRaw in SORTS ? (sortRaw as Sort) : "newest";
  const stateRaw = first(params, "state")?.toUpperCase();
  const ratingRaw = first(params, "rating");
  const rating = ratingRaw && /^[1-5](\.\d)?$/.test(ratingRaw) ? Number(ratingRaw) : undefined;

  const attrs: Record<string, string[]> = {};
  for (const key of opts.attributeKeys ?? []) {
    if (!/^[a-z0-9_]{1,40}$/.test(key)) continue;
    const values = list(params, `a.${key}`).filter((v) => v.length <= 40).slice(0, 10);
    if (values.length) attrs[key] = values;
  }

  const model = first(params, "model");
  const lenOf = (k: string) => {
    const v = first(params, k);
    const n = v && /^\d{2}(\.\d)?$/.test(v) ? Number(v) : undefined;
    return n != null && n >= 20 && n <= 40 ? n : undefined;
  };
  let minLength = lenOf("minlen");
  let maxLength = lenOf("maxlen");
  if (minLength != null && maxLength != null && minLength > maxLength) [minLength, maxLength] = [maxLength, minLength];
  const flag = (k: string) => (["1", "true"].includes(first(params, k) ?? "") ? true : undefined);
  return {
    q,
    terms: searchTerms(q),
    brands: list(params, "brand").filter((b) => SLUG.test(b)).slice(0, 10),
    model: model && SLUG.test(model) ? model : undefined,
    minPriceCents,
    maxPriceCents,
    condition: intInRange(first(params, "condition"), 1, 10),
    state: stateRaw && stateRaw in US_STATES ? stateRaw : undefined,
    weights: [
      ...new Set(
        list(params, "weight")
          .map((w) => w.replace(/\s*oz$/i, ""))
          .filter((w) => /^\d{2}(\.5)?$/.test(w))
          .map(Number)
          .filter((w) => w >= 18 && w <= 40)
      ),
    ].sort((a, b) => a - b),
    stamps: [...new Set(list(params, "stamp").map(normalizeStamp).filter((s): s is string => s !== null))],
    years: [...new Set(list(params, "year").map((y) => intInRange(y, 1980, 2100)).filter((y): y is number => y != null))].sort(
      (a, b) => b - a
    ),
    loads: [...new Set(list(params, "load").map(normalizeWeighting).filter((s): s is string => s !== null))],
    rating,
    minLength,
    maxLength,
    fresh: flag("new"),
    dual: flag("dual"),
    offers: flag("offers"),
    attrs,
    sort,
    page: intInRange(first(params, "page"), 1, MAX_PAGE) ?? 1,
  };
}

/** Builds the query string for a search, in a stable order. Page 1 and the default sort are left out. */
export function toQueryString(query: Partial<SearchQuery>): string {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  for (const b of query.brands ?? []) p.append("brand", b);
  if (query.model) p.set("model", query.model);
  if (query.minPriceCents != null) p.set("min", centsToDollarString(query.minPriceCents));
  if (query.maxPriceCents != null) p.set("max", centsToDollarString(query.maxPriceCents));
  if (query.condition != null) p.set("condition", String(query.condition));
  if (query.state) p.set("state", query.state);
  for (const w of query.weights ?? []) p.append("weight", String(w));
  for (const s of query.stamps ?? []) p.append("stamp", s);
  for (const y of query.years ?? []) p.append("year", String(y));
  for (const l of query.loads ?? []) p.append("load", l);
  if (query.rating != null) p.set("rating", String(query.rating));
  if (query.minLength != null) p.set("minlen", String(query.minLength));
  if (query.maxLength != null) p.set("maxlen", String(query.maxLength));
  if (query.fresh) p.set("new", "1");
  if (query.dual) p.set("dual", "1");
  if (query.offers) p.set("offers", "1");
  for (const [k, values] of Object.entries(query.attrs ?? {})) for (const v of values) p.append(`a.${k}`, v);
  if (query.sort && query.sort !== "newest") p.set("sort", query.sort);
  if (query.page && query.page > 1) p.set("page", String(query.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function centsToDollarString(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Link to the same search with changes applied. Changing a filter always goes back to page 1. */
export function searchHref(path: string, query: SearchQuery, changes: Partial<SearchQuery> = {}): string {
  const resetsPage = Object.keys(changes).some((k) => k !== "page");
  return path + toQueryString({ ...query, ...(resetsPage ? { page: 1 } : {}), ...changes });
}

export type ActiveFilter = { key: string; label: string; remove: Partial<SearchQuery> };

/** Every filter in use, each with the change that removes it. Used for chips and the no-results help. */
export function activeFilters(
  query: SearchQuery,
  names: { brands?: Record<string, string>; model?: string; attrs?: Record<string, string> } = {}
): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (query.q) out.push({ key: "q", label: `“${query.q}”`, remove: { q: "", terms: [] } });
  for (const b of query.brands)
    out.push({ key: `brand:${b}`, label: names.brands?.[b] ?? b, remove: { brands: query.brands.filter((x) => x !== b) } });
  if (query.model) out.push({ key: "model", label: names.model ?? query.model, remove: { model: undefined } });
  if (query.minPriceCents != null && query.maxPriceCents != null)
    out.push({
      key: "price",
      label: `$${centsToDollarString(query.minPriceCents)}–$${centsToDollarString(query.maxPriceCents)}`,
      remove: { minPriceCents: undefined, maxPriceCents: undefined },
    });
  else if (query.minPriceCents != null)
    out.push({ key: "price", label: `$${centsToDollarString(query.minPriceCents)} and up`, remove: { minPriceCents: undefined } });
  else if (query.maxPriceCents != null)
    out.push({ key: "price", label: `Up to $${centsToDollarString(query.maxPriceCents)}`, remove: { maxPriceCents: undefined } });
  if (query.condition != null) out.push({ key: "condition", label: `Condition ${query.condition}/10 or better`, remove: { condition: undefined } });
  if (query.state) out.push({ key: "state", label: US_STATES[query.state] ?? query.state, remove: { state: undefined } });
  for (const w of query.weights) out.push({ key: `weight:${w}`, label: `${w} oz`, remove: { weights: query.weights.filter((x) => x !== w) } });
  for (const s of query.stamps) out.push({ key: `stamp:${s}`, label: `${s} stamp`, remove: { stamps: query.stamps.filter((x) => x !== s) } });
  for (const y of query.years) out.push({ key: `year:${y}`, label: String(y), remove: { years: query.years.filter((x) => x !== y) } });
  for (const l of query.loads)
    out.push({ key: `load:${l}`, label: WEIGHTING_NAMES[l] ?? l, remove: { loads: query.loads.filter((x) => x !== l) } });
  if (query.rating != null) out.push({ key: "rating", label: `Seller rated ${query.rating}+`, remove: { rating: undefined } });
  if (query.minLength != null || query.maxLength != null) {
    const a = query.minLength, b = query.maxLength;
    out.push({
      key: "length",
      label: a != null && b != null ? `${a}–${b} in long` : a != null ? `${a} in or longer` : `Up to ${b} in long`,
      remove: { minLength: undefined, maxLength: undefined },
    });
  }
  if (query.fresh) out.push({ key: "fresh", label: "Listed this week", remove: { fresh: undefined } });
  if (query.dual) out.push({ key: "dual", label: "Dual-stamp", remove: { dual: undefined } });
  if (query.offers) out.push({ key: "offers", label: "Accepts offers", remove: { offers: undefined } });
  for (const [k, values] of Object.entries(query.attrs))
    for (const v of values) {
      const rest = values.filter((x) => x !== v);
      const attrs = { ...query.attrs };
      if (rest.length) attrs[k] = rest;
      else delete attrs[k];
      out.push({ key: `a.${k}:${v}`, label: `${names.attrs?.[k] ?? k}: ${humanize(v)}`, remove: { attrs } });
    }
  return out;
}

const WEIGHTING_NAMES: Record<string, string> = { balanced: "Balanced", endload: "End-loaded", midload: "Mid-loaded" };

/** "one_piece" → "One piece". For showing stored option values. */
export function humanize(v: string): string {
  const s = v.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Arguments for the search_listings database function. */
export function searchRpcArgs(query: SearchQuery, scope: { category?: string; sellerId?: string; pageSize?: number } = {}) {
  const pageSize = scope.pageSize ?? PAGE_SIZE;
  const nonEmpty = <T,>(a: T[]) => (a.length ? a : null);
  return {
    p_terms: nonEmpty(query.terms),
    p_category: scope.category ?? null,
    p_manufacturers: nonEmpty(query.brands),
    p_product: query.model ?? null,
    p_price_min: query.minPriceCents ?? null,
    p_price_max: query.maxPriceCents ?? null,
    p_min_condition: query.condition ?? null,
    p_state: query.state ?? null,
    p_weights: nonEmpty(query.weights),
    p_certifications: nonEmpty(query.stamps),
    p_model_years: nonEmpty(query.years),
    p_weighting: nonEmpty(query.loads),
    p_min_rating: query.rating ?? null,
    p_attributes: Object.keys(query.attrs).length ? query.attrs : null,
    p_seller_id: scope.sellerId ?? null,
    p_sort: query.sort,
    p_limit: pageSize,
    p_offset: (query.page - 1) * pageSize,
    p_min_length: query.minLength ?? null,
    p_max_length: query.maxLength ?? null,
    p_new_days: query.fresh ? 7 : null,
    p_accepts_offers: query.offers ? true : null,
    p_dual_stamp: query.dual ? true : null,
  };
}

/** True when anything narrows the results (used to decide between "nothing listed" and "nothing matches"). */
export function hasFilters(query: SearchQuery): boolean {
  return activeFilters(query).length > 0;
}

/** Page numbers to show around the current page, with null for gaps: 1 … 4 5 6 … 12. */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}
