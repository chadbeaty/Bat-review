// Price guide statistics. Pure functions, shared by the model page, the price guide and the tests.
//
// Honesty rules (from the brief):
// - Asking prices (live listings) and sold prices (completed sales) are never combined into one number.
// - Sold prices come only from price_history rows with verified_transaction = true.
// - Fewer than `minSales` verified sales: no sold-price numbers at all ("Not enough verified sales yet").
//   minSales..fullSales-1: an indicative range with a small-sample warning, no average.
//   fullSales or more: the average and the range.
// - Stats are per product (model + year + stamp). Breakdowns by weight and condition are computed separately,
//   each with the same thresholds, so different bats or very different conditions are never averaged together.

export type PriceThresholds = { minSales: number; fullSales: number };

export const DEFAULT_THRESHOLDS: PriceThresholds = { minSales: 5, fullSales: 10 };

/** Reads the two site settings defensively: bad or missing values fall back to the defaults, and full ≥ min. */
export function normalizeThresholds(min: unknown, full: unknown): PriceThresholds {
  const toInt = (v: unknown, d: number) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : d;
  };
  const minSales = toInt(min, DEFAULT_THRESHOLDS.minSales);
  const fullSales = Math.max(minSales, toInt(full, DEFAULT_THRESHOLDS.fullSales));
  return { minSales, fullSales };
}

export type AskingListing = { productId?: string; priceCents: number; weightOz: number | null; conditionScore: number | null };

export type SaleRecord = {
  productId?: string;
  priceCents: number;
  saleDate: string; // YYYY-MM-DD
  weightOz: number | null;
  conditionScore: number | null;
  verified: boolean;
};

export type AskingStats = { count: number; minCents: number; maxCents: number; averageCents: number };

/** Current asking-price range and average, from live listings only. Null when nothing is listed. */
export function askingStats(listings: AskingListing[]): AskingStats | null {
  const prices = listings.map((l) => l.priceCents).filter((p) => Number.isFinite(p) && p > 0);
  if (!prices.length) return null;
  return {
    count: prices.length,
    minCents: Math.min(...prices),
    maxCents: Math.max(...prices),
    averageCents: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
  };
}

export type SoldStats =
  | { tier: "insufficient"; count: number; needed: number }
  | { tier: "indicative"; count: number; minCents: number; maxCents: number; firstDate: string; lastDate: string; needed: number }
  | { tier: "full"; count: number; minCents: number; maxCents: number; averageCents: number; firstDate: string; lastDate: string };

/** Verified sales only. Any row without verified=true is ignored, whatever its price. */
export function verifiedOnly(sales: SaleRecord[]): SaleRecord[] {
  return sales.filter((s) => s.verified === true && Number.isFinite(s.priceCents) && s.priceCents > 0);
}

export function soldStats(sales: SaleRecord[], t: PriceThresholds): SoldStats {
  const verified = verifiedOnly(sales);
  const count = verified.length;
  if (count < t.minSales) return { tier: "insufficient", count, needed: t.minSales - count };
  const prices = verified.map((s) => s.priceCents);
  const dates = verified.map((s) => s.saleDate).sort();
  const base = { count, minCents: Math.min(...prices), maxCents: Math.max(...prices), firstDate: dates[0], lastDate: dates[dates.length - 1] };
  if (count < t.fullSales) return { tier: "indicative", ...base, needed: t.fullSales - count };
  return { tier: "full", ...base, averageCents: Math.round(prices.reduce((a, b) => a + b, 0) / count) };
}

/** Condition bands used for breakdowns. Scores are the 1–10 cosmetic condition scale. */
export function conditionBand(score: number | null): string {
  if (score == null) return "Condition not stated";
  if (score >= 9) return "9–10 (like new, minimal wear)";
  if (score >= 7) return "7–8 (light to noticeable wear)";
  return "6 and below (heavy wear)";
}

export function weightLabel(oz: number | null): string {
  return oz == null ? "Weight not stated" : `${Number(oz)} oz`;
}

export type Breakdown<T> = { label: string; items: T[] };

/** Groups rows by a key, sorted by label with "not stated" groups last. */
export function groupBy<T>(rows: T[], key: (r: T) => string): Breakdown<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => {
      const an = /not stated/.test(a.label) ? 1 : 0;
      const bn = /not stated/.test(b.label) ? 1 : 0;
      return an - bn || a.label.localeCompare(b.label, "en", { numeric: true });
    });
}

/** Sold-price breakdown by weight or by condition band; each group gets its own threshold check. */
export function soldBreakdown(sales: SaleRecord[], by: "weight" | "condition", t: PriceThresholds) {
  const key = by === "weight" ? (s: SaleRecord) => weightLabel(s.weightOz) : (s: SaleRecord) => conditionBand(s.conditionScore);
  return groupBy(verifiedOnly(sales), key).map((g) => ({ label: g.label, stats: soldStats(g.items, t) }));
}

export function askingBreakdown(listings: AskingListing[], by: "weight" | "condition") {
  const key = by === "weight" ? (l: AskingListing) => weightLabel(l.weightOz) : (l: AskingListing) => conditionBand(l.conditionScore);
  return groupBy(listings, key).map((g) => ({ label: g.label, stats: askingStats(g.items)! }));
}

export type TrendPoint = { month: string; count: number; averageCents: number; minCents: number; maxCents: number };

/** Verified sales per calendar month (YYYY-MM), oldest first. Used for the trend chart. */
export function monthlyTrend(sales: SaleRecord[]): TrendPoint[] {
  const groups = groupBy(verifiedOnly(sales), (s) => s.saleDate.slice(0, 7));
  return groups
    .map((g) => {
      const prices = g.items.map((s) => s.priceCents);
      return {
        month: g.label,
        count: prices.length,
        averageCents: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        minCents: Math.min(...prices),
        maxCents: Math.max(...prices),
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Splits rows by product id, so stats are never computed across different models. */
export function byProduct<T extends { productId?: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.productId) continue;
    map.set(r.productId, [...(map.get(r.productId) ?? []), r]);
  }
  return map;
}
