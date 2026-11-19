// Summaries across a player's recorded swings. Only real, stored measurements go in; anything not measured stays null.
import { CATEGORY_LABEL, scoreSwing } from "@/engine/scoring";
import type { MetricKey, ScoreCategoryKey } from "@/engine/types";
import type { Session, SwingRecord } from "./store/types";

export const CATEGORY_KEYS = Object.keys(CATEGORY_LABEL) as ScoreCategoryKey[];

export const CATEGORY_SHORT: Record<ScoreCategoryKey, string> = {
  balance: "Balance",
  timing: "Timing",
  rotation: "Rotation",
  batPath: "Bat path",
  contact: "Contact",
  followThrough: "Finish",
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const sd = (xs: number[]) => {
  const m = mean(xs);
  if (m === null || xs.length < 3) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** A swing's six categories (computed from its stored metrics for swings saved before categories existed). */
export function categoriesOf(sw: SwingRecord) {
  return sw.analysis.score.categories ?? scoreSwing(sw.analysis.metrics, sw.view).categories ?? [];
}

export type CategorySummary = Record<ScoreCategoryKey, { avg: number | null; n: number }>;

export function categoryAverages(swings: SwingRecord[]): CategorySummary {
  const acc = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, [] as number[]])) as Record<ScoreCategoryKey, number[]>;
  for (const s of swings) for (const c of categoriesOf(s)) if (c.score !== null) acc[c.key].push(c.score);
  return Object.fromEntries(CATEGORY_KEYS.map((k) => [k, { avg: mean(acc[k]), n: acc[k].length }])) as CategorySummary;
}

/** Newest-first swings split into the latest block and the block before it. */
export function recentVsBefore(swings: SwingRecord[], n = 20) {
  const sorted = [...swings].sort((a, b) => b.at - a.at);
  return { recent: sorted.slice(0, n), before: sorted.slice(n, n * 2) };
}

/** A speed for a swing: the player's own sensor/radar reading wins over the slo-mo measurement. */
export function speedOf(s: SwingRecord, k: "exitVelocity" | "batSpeed" | "launchAngle"): { v: number; pm?: number; source: "sensor" | "slomo" } | null {
  const ext = (s.external ?? []).filter((e) => e.key === k).map((e) => e.value);
  if (ext.length) return { v: Math.max(...ext), source: "sensor" };
  const m = s.analysis.metrics[k];
  return m && m.source !== "unavailable" && m.value !== null ? { v: m.value, pm: m.plusMinus, source: "slomo" } : null;
}

export function metricValues(swings: SwingRecord[], k: MetricKey): number[] {
  return swings
    .map((s) => s.analysis.metrics[k])
    .filter((m) => m && m.source !== "unavailable" && m.value !== null)
    .map((m) => m!.value!);
}

/** 0–100: 100 = every swing scored the same. */
export function consistency(scores: number[]): number | null {
  const s = sd(scores);
  return s === null ? null : Math.max(0, Math.round(100 - s * 3));
}

export type SessionPoint = {
  session: Session;
  t: number;
  n: number;
  avg: number | null;
  lo: number | null;
  hi: number | null;
  evBest: number | null;
  evAvg: number | null;
  timingSd: number | null;
};

/** One row per session that has swings, oldest first. */
export function sessionSeries(sessions: Session[], swings: SwingRecord[]): SessionPoint[] {
  const by = new Map<string, SwingRecord[]>();
  for (const s of swings) by.set(s.sessionId, [...(by.get(s.sessionId) ?? []), s]);
  return sessions
    .filter((s) => by.has(s.id))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((session) => {
      const list = by.get(session.id)!;
      const scores = list.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
      const evs = list.map((s) => speedOf(s, "exitVelocity")?.v).filter((x): x is number => x !== undefined);
      return {
        session,
        t: session.startedAt,
        n: list.length,
        avg: mean(scores),
        lo: scores.length ? Math.min(...scores) : null,
        hi: scores.length ? Math.max(...scores) : null,
        evBest: evs.length ? Math.max(...evs) : null,
        evAvg: mean(evs),
        timingSd: sd(metricValues(list, "strideTiming")),
      };
    });
}

/** The slow-pitch window for front foot down before contact (ms), from the lower-body research. */
export const FOOT_DOWN_WINDOW = { lo: 140, hi: 380 };
