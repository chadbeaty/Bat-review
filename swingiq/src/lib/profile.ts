// My Hitting Profile: a player's whole record, summed up from their own stored swings. Only real measurements go in;
// anything that wasn't measured stays null and shows as "—". Nothing here guesses.
import { coachingFor, type Coaching } from "@/engine/coaching";
import type { ScoreCategoryKey } from "@/engine/types";
import { CATEGORY_KEYS, CATEGORY_SHORT, FOOT_DOWN_WINDOW, categoryAverages, consistency, metricValues, speedOf } from "./insights";
import type { Session, SwingRecord } from "./store/types";

export type Drill = Coaching & { count: number; of: number };

export type HittingProfile = {
  swings: number;
  sessions: number;
  avgScore: number | null;
  bestScore: number | null;
  /** Share of swings with the front foot down inside the slow-pitch window (estimated from body tracking). */
  footOnTime: number | null;
  /** 0–100: how alike the last 20 scores are. */
  repeatability: number | null;
  /** Line drives as a share of tagged balls in play. */
  lineDriveRate: number | null;
  tagged: number;
  spray: { pull: number; center: number; oppo: number } | null;
  topEv: { v: number; source: "sensor" | "slomo"; pm?: number } | null;
  strengths: { key: ScoreCategoryKey; label: string; avg: number }[];
  workOns: { key: ScoreCategoryKey; label: string; avg: number }[];
  drills: Drill[];
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function buildProfile(all: SwingRecord[], sessions: Session[]): HittingProfile {
  const sorted = [...all].sort((a, b) => b.at - a.at);
  const scores = sorted.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
  const avg = mean(scores);
  const foot = metricValues(sorted, "strideTiming");
  const inPlay = sorted.filter((s) => s.tag?.type && s.tag.type !== "miss" && s.tag.type !== "foul");
  const directed = sorted.filter((s) => s.tag?.direction && s.tag.type !== "miss" && s.tag.type !== "foul");
  const share = (d: "pull" | "center" | "oppo") => directed.filter((s) => s.tag!.direction === d).length / directed.length;
  const topEv = sorted.reduce<HittingProfile["topEv"]>((b, s) => {
    const v = speedOf(s, "exitVelocity");
    return v && (!b || v.v > b.v) ? { v: v.v, source: v.source, pm: v.pm } : b;
  }, null);

  const cats = categoryAverages(sorted.slice(0, 20));
  const ranked = CATEGORY_KEYS.map((k) => ({ key: k, label: CATEGORY_SHORT[k], avg: cats[k].avg, n: cats[k].n }))
    .filter((c): c is { key: ScoreCategoryKey; label: string; avg: number; n: number } => c.avg !== null && c.n >= 2)
    .map(({ key, label, avg }) => ({ key, label, avg: Math.round(avg) }))
    .sort((a, b) => b.avg - a.avg);
  const strengths = ranked.filter((c) => c.avg >= 70).slice(0, 2);
  const workOns = [...ranked].reverse().filter((c) => c.avg < 70 && !strengths.some((s) => s.key === c.key)).slice(0, 2);

  // Drills: the faults that keep showing up in the last 30 swings, most frequent first, each with the playbook's drill.
  const recent = sorted.slice(0, 30);
  const byCue = new Map<string, { n: number; swing: SwingRecord }>();
  for (const s of recent) {
    const cues = [s.analysis.cue, ...s.analysis.observations].filter((c, i, xs) => c.tone === "fix" && xs.findIndex((x) => x.id === c.id) === i);
    for (const c of cues) {
      const e = byCue.get(c.id);
      byCue.set(c.id, { n: (e?.n ?? 0) + 1, swing: e?.swing ?? s });
    }
  }
  const drills: Drill[] = [...byCue.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([id, { n, swing }]) => {
      const cue = [swing.analysis.cue, ...swing.analysis.observations].find((c) => c.id === id)!;
      return { ...coachingFor(cue, swing.analysis.metrics, swing.analysis.score.overall), count: n, of: recent.length };
    })
    .filter((d, i, xs) => d.issueId !== "repeat" && xs.findIndex((x) => x.drill.name === d.drill.name) === i)
    .slice(0, 3);

  return {
    swings: sorted.length,
    sessions: sessions.filter((s) => s.swingCount > 0).length,
    avgScore: avg === null ? null : Math.round(avg),
    bestScore: scores.length ? Math.max(...scores) : null,
    footOnTime: foot.length ? Math.round((foot.filter((v) => v >= FOOT_DOWN_WINDOW.lo && v <= FOOT_DOWN_WINDOW.hi).length / foot.length) * 100) : null,
    repeatability: consistency(scores.slice(0, 20)),
    lineDriveRate: inPlay.length ? Math.round((inPlay.filter((s) => s.tag!.type === "liner").length / inPlay.length) * 100) : null,
    tagged: inPlay.length,
    spray: directed.length ? { pull: Math.round(share("pull") * 100), center: Math.round(share("center") * 100), oppo: Math.round(share("oppo") * 100) } : null,
    topEv,
    strengths,
    workOns,
    drills,
  };
}
