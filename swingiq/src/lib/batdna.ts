import type { MetricKey } from "@/engine/types";
import type { Bat, Session, SwingRecord } from "./store/types";

/**
 * Bat DNA: how a hitter actually swings each of their bats, from recorded swings only.
 * Nothing here is estimated beyond what each swing already measured; bat speed and launch angle come only from
 * readings the player entered from a sensor or radar. Comparisons need enough swings to mean anything.
 */
export const MIN_SWINGS_TO_COMPARE = 15;

export type BatStats = {
  batId: string;
  swings: number;
  enough: boolean;
  needMore: number;
  avgScore: number | null;
  /** 0–100: 100 = every swing scored the same. From the spread of SwingIQ scores. */
  scoreConsistency: number | null;
  /** Standard deviation of foot-down timing, ms. Lower = more repeatable timing. */
  timingSpreadMs: number | null;
  categories: Partial<Record<string, number>>;
  /** From sensor/radar readings the player entered. */
  batSpeed: { avg: number; n: number } | null;
  launchAngle: { avg: number; n: number } | null;
  exitVelocity: { avg: number; n: number } | null;
  /** Share of mic-checked swings where contact was heard. */
  contactRate: { rate: number; n: number } | null;
  /** Share of tagged balls in play that were line drives. */
  linerRate: { rate: number; n: number } | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[]) => {
  const m = mean(xs);
  if (m === null || xs.length < 3) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Which bat a swing used: its own setting, else its session's. */
export function batOf(sw: SwingRecord, sessions: Map<string, Session>): string | null {
  if (sw.batId !== undefined) return sw.batId;
  return sessions.get(sw.sessionId)?.batId ?? null;
}

function metricValues(swings: SwingRecord[], k: MetricKey): number[] {
  return swings
    .map((s) => s.analysis.metrics[k])
    .filter((m) => m && m.source !== "unavailable" && m.value !== null)
    .map((m) => m!.value!);
}

function external(swings: SwingRecord[], k: "batSpeed" | "launchAngle" | "exitVelocity") {
  const xs = swings.flatMap((s) => (s.external ?? []).filter((e) => e.key === k).map((e) => e.value));
  const m = mean(xs);
  return m === null ? null : { avg: m, n: xs.length };
}

export function batStats(bat: Bat, all: SwingRecord[], sessions: Map<string, Session>): BatStats {
  const swings = all.filter((s) => batOf(s, sessions) === bat.id);
  const scores = swings.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
  const scoreSd = sd(scores);
  const timing = metricValues(swings, "strideTiming");
  const timingSd = sd(timing);

  const cats: Record<string, number[]> = {};
  for (const s of swings) for (const c of s.analysis.score.categories ?? []) if (c.score !== null) (cats[c.key] ??= []).push(c.score);
  const categories: Partial<Record<string, number>> = {};
  for (const [k, xs] of Object.entries(cats)) categories[k] = Math.round(mean(xs)!);

  const micChecked = swings.filter((s) => s.analysis.metrics.contact?.source === "measured");
  const inPlay = swings.filter((s) => s.tag?.type && s.tag.type !== "miss" && s.tag.type !== "foul");
  return {
    batId: bat.id,
    swings: swings.length,
    enough: swings.length >= MIN_SWINGS_TO_COMPARE,
    needMore: Math.max(0, MIN_SWINGS_TO_COMPARE - swings.length),
    avgScore: scores.length ? Math.round(mean(scores)!) : null,
    scoreConsistency: scoreSd === null ? null : Math.max(0, Math.round(100 - scoreSd * 3)),
    timingSpreadMs: timingSd === null ? null : Math.round(timingSd),
    categories,
    batSpeed: external(swings, "batSpeed"),
    launchAngle: external(swings, "launchAngle"),
    exitVelocity: external(swings, "exitVelocity"),
    contactRate: micChecked.length ? { rate: micChecked.filter((s) => s.analysis.metrics.contact?.value === 1).length / micChecked.length, n: micChecked.length } : null,
    linerRate: inPlay.length ? { rate: inPlay.filter((s) => s.tag?.type === "liner").length / inPlay.length, n: inPlay.length } : null,
  };
}
