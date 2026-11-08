import type { Thresholds } from "@/lib/settings";
import type { TrendMetrics } from "@/lib/engine/trends";
import type { ScoreResult } from "@/lib/engine/scoring";

// Decides which alerts a scoring run should raise. Each alert has a fingerprint; the database keeps one row per
// fingerprint, so the same alert is never sent twice unless the fingerprint changes, i.e. something material
// changed (a higher score band, a new platform, more creators).

export type AlertType = "score_80" | "high_momentum" | "multi_source" | "low_competition_strong_demand" | "saturated";

export type AlertCandidate = { type: AlertType; fingerprint: string; reason: string };

export const ALERT_LABELS: Record<AlertType, string> = {
  score_80: "High opportunity score",
  high_momentum: "Unusually high momentum",
  multi_source: "Seen by multiple independent sources",
  low_competition_strong_demand: "Low observed competition, strong early demand",
  saturated: "Now looks saturated",
};

const bucket = (n: number, steps: number[]) => steps.filter((s) => n >= s).length;

export function evaluateAlerts(args: {
  productId: string;
  score: ScoreResult;
  trend: TrendMetrics;
  thresholds: Thresholds;
  previousBestScore: number | null;
  saturated: boolean;
}): AlertCandidate[] {
  const { productId: id, score, trend: t, thresholds: th } = args;
  const out: AlertCandidate[] = [];

  if (args.saturated) {
    if ((args.previousBestScore ?? 0) >= th.saturation_min_previous_score) {
      out.push({ type: "saturated", fingerprint: `${id}:saturated`, reason: `${t.unique_creators_7d} different creators promoted it in the last 7 days; it previously scored ${args.previousBestScore?.toFixed(0)}.` });
    }
    return out;
  }

  if (score.overall >= th.score) {
    out.push({ type: "score_80", fingerprint: `${id}:score:${Math.floor(score.overall / th.rescore_change_points)}`, reason: `Opportunity score ${score.overall.toFixed(0)} (${score.confidence} confidence).` });
  }
  if (t.acceleration >= th.momentum_acceleration && t.mentions_72h >= th.momentum_min_mentions_72h) {
    out.push({
      type: "high_momentum",
      fingerprint: `${id}:momentum:${bucket(t.mentions_72h, [3, 6, 12, 24, 48])}`,
      reason: `${t.mentions_72h} mentions in 72 hours, ${t.acceleration.toFixed(1)}× its earlier pace.`,
    });
  }
  if (t.unique_platforms >= th.multi_source_min_platforms || t.unique_creators_total >= 3) {
    out.push({
      type: "multi_source",
      fingerprint: `${id}:multi:p${t.unique_platforms}:c${bucket(t.unique_creators_total, [3, 5, 8, 13])}`,
      reason: `Seen by ${t.unique_creators_total} unrelated creators across ${t.unique_platforms} platform(s).`,
    });
  }
  const comp = score.categories.competition;
  const demand = score.categories.demand_acceleration;
  const momentum = score.categories.early_momentum;
  if (comp !== null && demand !== null && momentum !== null && comp >= th.low_competition_min_score && demand >= th.strong_demand_min_score && momentum >= 50) {
    out.push({ type: "low_competition_strong_demand", fingerprint: `${id}:lcsd`, reason: `Competition score ${comp.toFixed(0)} with demand acceleration ${demand.toFixed(0)}.` });
  }
  return out;
}

/** Saturation: many independent promoters in one week (or many marketplace sellers once researched). */
export function isSaturated(t: TrendMetrics, marketplaceSellers: number | null, th: Thresholds): boolean {
  return t.unique_creators_7d >= th.saturation_creators_7d || (marketplaceSellers !== null && marketplaceSellers >= th.saturation_creators_7d * 3);
}
