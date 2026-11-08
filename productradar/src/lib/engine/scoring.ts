import type { Economics, Weights } from "@/lib/settings";
import type { TrendMetrics } from "@/lib/engine/trends";

// Product Opportunity Score (0-100) with the six category scores shown separately.
// Missing information never raises a score: a category with no data counts as MISSING_VALUE (well below neutral)
// in the overall score, is listed under "missing", and lowers the confidence rating.

export const SCORE_VERSION = "v1";
export const MISSING_VALUE = 25;

export type Category = keyof Weights;
export const CATEGORY_LABELS: Record<Category, string> = {
  early_momentum: "Early momentum",
  demand_acceleration: "Demand acceleration",
  competition: "Competition (higher = less crowded)",
  organic_video_potential: "Organic video potential",
  problem_solving: "Problem-solving appeal",
  profit_potential: "Profit potential",
};

export type CompetitionEvidence = {
  /** Distinct creators/sellers seen promoting it in the sources this tool monitors. */
  observedPromoters: number;
  /** Distinct sellers found in marketplace/storefront research (Phase 3). Null = not researched. */
  marketplaceSellers: number | null;
  /** 0..1 how much of the market the evidence covers. Monitored creators only ≈ 0.3. */
  coverage: number;
};

export type ScoreInput = {
  trend: TrendMetrics;
  competition: CompetitionEvidence | null;
  organicVideoPotential: number | null;
  problemSolving: number | null;
  estimates: { costLow: number | null; costHigh: number | null; shipping: number | null; priceLow: number | null; priceHigh: number | null } | null;
  weights: Weights;
  economics: Economics;
};

export type ScoreResult = {
  overall: number;
  categories: Record<Category, number | null>;
  confidence: "high" | "medium" | "low";
  missing: string[];
  reasons: Record<string, string>;
  margin: MarginEstimate | null;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

export function earlyMomentum(t: TrendMetrics): { score: number; reason: string } {
  const freshness = t.age_days <= 3 ? 1 : t.age_days <= 7 ? 0.85 : t.age_days <= 14 ? 0.65 : t.age_days <= 30 ? 0.4 : t.age_days <= 60 ? 0.2 : 0.1;
  const activity = Math.min(1, (t.mentions_72h * 0.4 + t.unique_creators_7d * 0.6) / 3);
  const score = r1(clamp(100 * freshness * activity));
  return {
    score,
    reason: `First seen ${t.age_days.toFixed(1)} days ago; ${t.mentions_72h} mention(s) in 72h from ${t.unique_creators_7d} creator(s) this week.`,
  };
}

export function demandAcceleration(t: TrendMetrics): { score: number; reason: string } {
  const parts: { v: number; label: string }[] = [];
  let accel = clamp((Math.log2(Math.max(t.acceleration, 1)) / 3) * 100);
  // One data point cannot show acceleration.
  if (t.mentions_7d < 2) accel = Math.min(accel, 40);
  parts.push({ v: accel, label: `mention acceleration ×${t.acceleration.toFixed(1)}` });
  if (t.engagement_growth !== null) parts.push({ v: clamp(t.engagement_growth * 100), label: `views growing ${(t.engagement_growth * 100).toFixed(0)}%/day` });
  if (t.search_interest_growth !== null) parts.push({ v: clamp(t.search_interest_growth * 100), label: `search interest growth ${(t.search_interest_growth * 100).toFixed(0)}%` });
  const score = r1(parts.reduce((a, p) => a + p.v, 0) / parts.length);
  const unknown = [t.engagement_growth === null ? "view growth not measurable yet" : null, t.search_interest_growth === null ? "search interest not connected" : null].filter(Boolean);
  return { score, reason: `${parts.map((p) => p.label).join("; ")}${unknown.length ? ` (${unknown.join(", ")})` : ""}.` };
}

/** Higher = less competition. With partial evidence the score is pulled toward a cautious prior, never up. */
export function competitionScore(c: CompetitionEvidence | null): { score: number | null; reason: string } {
  if (!c) return { score: null, reason: "No competition evidence yet." };
  const prior = 40;
  const crowd = c.marketplaceSellers !== null ? Math.max(c.observedPromoters, c.marketplaceSellers) : c.observedPromoters;
  const raw = clamp(100 - crowd * 12);
  const coverage = clamp(c.coverage, 0, 1);
  const score = r1(prior + coverage * (raw - prior));
  return {
    score,
    reason: `${c.observedPromoters} promoter(s) seen in monitored sources${c.marketplaceSellers !== null ? `, ${c.marketplaceSellers} marketplace seller(s) found` : ", marketplaces not yet researched"}; evidence covers ~${Math.round(coverage * 100)}% of the picture, so the score is held near cautious.`,
  };
}

export type MarginEstimate = { price: number; cost: number; shipping: number; fees: number; margin: number; marginPct: number };

export function estimateMargin(e: ScoreInput["estimates"], econ: Economics): MarginEstimate | null {
  if (!e || e.priceLow === null || e.costLow === null) return null;
  const price = e.priceHigh !== null ? (e.priceLow + e.priceHigh) / 2 : e.priceLow;
  const cost = e.costHigh !== null ? (e.costLow + e.costHigh) / 2 : e.costLow;
  const shipping = e.shipping ?? econ.default_shipping;
  if (price <= 0) return null;
  const fees = price * (econ.payment_pct + econ.refund_reserve_pct + econ.other_pct) + econ.payment_fixed;
  const margin = price - cost - shipping - fees;
  return { price: r2(price), cost: r2(cost), shipping: r2(shipping), fees: r2(fees), margin: r2(margin), marginPct: r2(margin / price) };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function profitPotential(m: MarginEstimate | null): { score: number | null; reason: string } {
  if (!m) return { score: null, reason: "No price or cost estimate yet." };
  let raw = clamp(((m.marginPct - 0.1) / 0.5) * 100);
  if (m.margin < 8) raw *= Math.max(0, m.margin) / 8;
  // Estimates, not quotes: pull toward a cautious prior.
  const score = r1(40 + 0.6 * (raw - 40));
  return { score, reason: `Estimated ${(m.marginPct * 100).toFixed(0)}% gross margin ($${m.margin.toFixed(2)}/order at $${m.price.toFixed(2)}) after cost, shipping, payment fees and refund reserve. AI estimate, not a supplier quote.` };
}

export function scoreProduct(input: ScoreInput): ScoreResult {
  const momentum = earlyMomentum(input.trend);
  const demand = demandAcceleration(input.trend);
  const comp = competitionScore(input.competition);
  const margin = estimateMargin(input.estimates, input.economics);
  const profit = profitPotential(margin);

  const categories: Record<Category, number | null> = {
    early_momentum: momentum.score,
    demand_acceleration: demand.score,
    competition: comp.score,
    organic_video_potential: input.organicVideoPotential === null ? null : clamp(input.organicVideoPotential),
    problem_solving: input.problemSolving === null ? null : clamp(input.problemSolving),
    profit_potential: profit.score,
  };

  const totalWeight = Object.values(input.weights).reduce((a, b) => a + b, 0) || 100;
  let overall = 0;
  for (const k of Object.keys(categories) as Category[]) overall += (input.weights[k] / totalWeight) * (categories[k] ?? MISSING_VALUE);

  const missing: string[] = [];
  for (const k of Object.keys(categories) as Category[]) if (categories[k] === null) missing.push(CATEGORY_LABELS[k]);
  if (!input.trend.coverage.search) missing.push("Search interest (Google Trends not connected)");
  if (!input.trend.coverage.engagement) missing.push("View growth (needs two stat checks)");
  if (!input.competition || input.competition.marketplaceSellers === null) missing.push("Marketplace seller research");

  const available = Object.values(categories).filter((v) => v !== null).length;
  const t = input.trend;
  const broadEvidence = t.unique_creators_total >= 3 && t.unique_platforms >= 2;
  const confidence: ScoreResult["confidence"] =
    available === 6 && broadEvidence && input.competition?.marketplaceSellers !== null && input.competition !== null ? "high"
    : available >= 5 && t.unique_creators_total >= 2 ? "medium"
    : "low";

  return {
    overall: r1(clamp(overall)),
    categories,
    confidence,
    missing,
    reasons: {
      early_momentum: momentum.reason,
      demand_acceleration: demand.reason,
      competition: comp.reason,
      profit_potential: profit.reason,
    },
    margin,
  };
}
