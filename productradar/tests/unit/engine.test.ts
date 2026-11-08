import { describe, expect, it } from "vitest";
import { coreTokens, decideMatch, normalizeName, slugify, tokenSimilarity, trigramSimilarity, uniqueAliases } from "@/lib/engine/names";
import { computeTrend, viewGrowth, type MentionPoint } from "@/lib/engine/trends";
import { competitionScore, estimateMargin, scoreProduct, MISSING_VALUE, type ScoreInput } from "@/lib/engine/scoring";
import { evaluateAlerts, isSaturated } from "@/lib/engine/alerts";
import { DEFAULTS } from "@/lib/settings";

const NOW = new Date("2026-11-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const m = (h: number, creator: string, platform = "youtube", views: number | null = 1000): MentionPoint => ({ observedAt: hoursAgo(h), creatorKey: creator, platform, views });

describe("product names", () => {
  it("normalises spelling, plurals and punctuation", () => {
    expect(normalizeName("Mini Handheld Bag-Sealers™")).toBe("mini handheld bag sealer");
    expect(coreTokens("NEW Viral Mini Portable Bag Sealer 2026")).toEqual(["bag", "sealer"]);
    expect(slugify("Magnetic Phone Mount (Car)")).toBe("magnetic-phone-mount-car");
  });

  it("treats word order as irrelevant but keeps function words", () => {
    expect(tokenSimilarity("bag sealer handheld", "handheld bag sealer")).toBe(1);
    expect(tokenSimilarity("heated eyelash curler", "eyelash curler")).toBeLessThan(1);
    expect(trigramSimilarity("bag sealer", "bag sealers")).toBeGreaterThan(0.6);
  });

  it("matches without AI only when the informative words are identical", () => {
    const exact = decideMatch(["Portable Bag Sealer"], [{ productId: "p1", alias: "bag sealer", similarity: 0.8 }]);
    expect(exact).toEqual({ kind: "exact", productId: "p1", confidence: 0.95 });
    // Look-alike with a different function: never merged automatically.
    const lookalike = decideMatch(["heated eyelash curler"], [{ productId: "p2", alias: "eyelash curler", similarity: 0.7 }]);
    expect(lookalike.kind).toBe("needs_ai");
    expect(decideMatch(["dog nail grinder"], [])).toEqual({ kind: "new" });
    expect(decideMatch(["dog nail grinder"], [{ productId: "p3", alias: "car vacuum", similarity: 0.1 }])).toEqual({ kind: "new" });
  });

  it("dedupes aliases by normalised form", () => {
    expect(uniqueAliases(["Bag Sealer", "bag sealers", "ab", null, "Food Clip"]).map((a) => a.alias)).toEqual(["Bag Sealer", "Food Clip"]);
  });
});

describe("trend metrics", () => {
  it("counts windows and unique creators", () => {
    const t = computeTrend({ mentions: [m(2, "a"), m(30, "b"), m(60, "a"), m(24 * 9, "c")], firstObservedAt: null, engagementGrowth: null, searchInterest: null, searchInterestGrowth: null, sellersDetected: null, now: NOW });
    expect([t.mentions_24h, t.mentions_72h, t.mentions_7d, t.mentions_prev_7d, t.mentions_total]).toEqual([1, 3, 3, 1, 4]);
    expect([t.unique_creators_7d, t.unique_creators_total, t.unique_platforms]).toEqual([2, 3, 1]);
    expect(t.views_7d).toBe(3000);
    expect(t.age_days).toBe(9);
  });

  it("measures acceleration: 15 today after 2 a day beats steady volume", () => {
    const burst = [...Array(15)].map((_, i) => m(1 + i, `c${i}`)).concat([...Array(8)].map((_, i) => m(24 * (4 + i), `o${i}`)));
    const steady = [...Array(40)].map((_, i) => m(i * 8, `s${i % 5}`));
    const a = computeTrend({ mentions: burst, firstObservedAt: null, engagementGrowth: null, searchInterest: null, searchInterestGrowth: null, sellersDetected: null, now: NOW });
    const b = computeTrend({ mentions: steady, firstObservedAt: null, engagementGrowth: null, searchInterest: null, searchInterestGrowth: null, sellersDetected: null, now: NOW });
    expect(a.acceleration).toBeGreaterThan(3);
    expect(b.acceleration).toBeLessThan(1.5);
  });

  it("reports unmeasured inputs as null, never zero", () => {
    const t = computeTrend({ mentions: [m(1, "a")], firstObservedAt: null, engagementGrowth: null, searchInterest: null, searchInterestGrowth: null, sellersDetected: null, now: NOW });
    expect(t.search_interest).toBeNull();
    expect(t.sellers_detected).toBeNull();
    expect(t.coverage).toMatchObject({ search: false, sellers: false, engagement: false });
  });

  it("computes view growth only from real repeat observations", () => {
    expect(viewGrowth([[{ observedAt: hoursAgo(5), views: 100 }]])).toBeNull();
    expect(viewGrowth([[{ observedAt: hoursAgo(24), views: 100 }, { observedAt: NOW, views: 300 }]])).toBe(2);
  });
});

const baseTrend = computeTrend({ mentions: [m(2, "a"), m(10, "b"), m(20, "c")], firstObservedAt: hoursAgo(20), engagementGrowth: 0.5, searchInterest: null, searchInterestGrowth: null, sellersDetected: null, now: NOW });
const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  trend: baseTrend,
  competition: { observedPromoters: 3, marketplaceSellers: null, coverage: 0.3 },
  organicVideoPotential: 80,
  problemSolving: 75,
  estimates: { costLow: 3, costHigh: 5, shipping: 4, priceLow: 19.99, priceHigh: 24.99 },
  weights: DEFAULTS.scoring_weights,
  economics: DEFAULTS.economics,
  ...over,
});

describe("opportunity score", () => {
  it("shows every category separately and stays within 0-100", () => {
    const s = scoreProduct(input());
    expect(Object.keys(s.categories)).toHaveLength(6);
    expect(s.overall).toBeGreaterThan(0);
    expect(s.overall).toBeLessThanOrEqual(100);
  });

  it("never gives a higher score because information is missing", () => {
    const full = scoreProduct(input());
    for (const missing of [{ organicVideoPotential: null }, { problemSolving: null }, { estimates: null }, { competition: null }] as Partial<ScoreInput>[]) {
      const s = scoreProduct(input(missing));
      expect(s.overall).toBeLessThanOrEqual(full.overall);
      expect(s.missing.length).toBeGreaterThan(full.missing.length);
    }
    // Even perfect AI judgements can't lift a product with no evidence for the rest.
    const thin = scoreProduct(input({ organicVideoPotential: 100, problemSolving: 100, estimates: null, competition: null }));
    expect(thin.categories.profit_potential).toBeNull();
    expect(thin.overall).toBeLessThan(75);
  });

  it("treats missing data as a low value in the overall score", () => {
    const s = scoreProduct(input({ organicVideoPotential: null, problemSolving: null, estimates: null }));
    expect(MISSING_VALUE).toBeLessThan(50);
    expect(s.confidence).toBe("low");
  });

  it("holds competition near cautious when only monitored creators were checked", () => {
    expect(competitionScore({ observedPromoters: 0, marketplaceSellers: null, coverage: 0.3 }).score).toBeLessThan(60);
    expect(competitionScore({ observedPromoters: 0, marketplaceSellers: 0, coverage: 1 }).score).toBe(100);
    expect(competitionScore(null).score).toBeNull();
  });

  it("is never high-confidence without marketplace research and multiple platforms", () => {
    expect(scoreProduct(input()).confidence).not.toBe("high");
    const broad = computeTrend({ mentions: [m(2, "a"), m(3, "b", "tiktok"), m(4, "c")], firstObservedAt: hoursAgo(4), engagementGrowth: 0.5, searchInterest: null, searchInterestGrowth: null, sellersDetected: 2, now: NOW });
    expect(scoreProduct(input({ trend: broad, competition: { observedPromoters: 3, marketplaceSellers: 4, coverage: 0.6 } })).confidence).toBe("high");
  });

  it("estimates margin after cost, shipping, fees and refunds", () => {
    const mg = estimateMargin({ costLow: 4, costHigh: 4, shipping: 4, priceLow: 20, priceHigh: 20 }, DEFAULTS.economics)!;
    expect(mg.fees).toBeCloseTo(20 * (0.029 + 0.05 + 0.03) + 0.3, 2);
    expect(mg.margin).toBeCloseTo(20 - 8 - mg.fees, 2);
    expect(estimateMargin({ costLow: null, costHigh: null, shipping: null, priceLow: 20, priceHigh: null }, DEFAULTS.economics)).toBeNull();
  });

  it("respects changed weights", () => {
    const momentumOnly = { early_momentum: 100, demand_acceleration: 0, competition: 0, organic_video_potential: 0, problem_solving: 0, profit_potential: 0 };
    const s = scoreProduct(input({ weights: momentumOnly }));
    expect(s.overall).toBeCloseTo(s.categories.early_momentum!, 0);
  });
});

describe("alerts", () => {
  const th = DEFAULTS.alert_thresholds;
  const high = { ...scoreProduct(input()), overall: 84 };

  it("fires for a high score with a fingerprint that only changes with a material rise", () => {
    const a = evaluateAlerts({ productId: "p", score: high, trend: baseTrend, thresholds: th, previousBestScore: null, saturated: false });
    const b = evaluateAlerts({ productId: "p", score: { ...high, overall: 86 }, trend: baseTrend, thresholds: th, previousBestScore: 84, saturated: false });
    const c = evaluateAlerts({ productId: "p", score: { ...high, overall: 92 }, trend: baseTrend, thresholds: th, previousBestScore: 86, saturated: false });
    const fp = (x: typeof a) => x.find((y) => y.type === "score_80")?.fingerprint;
    expect(fp(a)).toBe(fp(b));
    expect(fp(c)).not.toBe(fp(a));
  });

  it("flags multiple independent creators", () => {
    const a = evaluateAlerts({ productId: "p", score: { ...high, overall: 50 }, trend: baseTrend, thresholds: th, previousBestScore: null, saturated: false });
    expect(a.map((x) => x.type)).toContain("multi_source");
  });

  it("warns about saturation only for products that were promising", () => {
    const sat = { ...baseTrend, unique_creators_7d: 9 };
    expect(isSaturated(sat, null, th)).toBe(true);
    expect(evaluateAlerts({ productId: "p", score: high, trend: sat, thresholds: th, previousBestScore: 72, saturated: true }).map((x) => x.type)).toEqual(["saturated"]);
    expect(evaluateAlerts({ productId: "p", score: high, trend: sat, thresholds: th, previousBestScore: 30, saturated: true })).toEqual([]);
  });
});
