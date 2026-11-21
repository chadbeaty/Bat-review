// Swing goals: "100 swings this weekend" from a coach, or "500 cuts this week" for yourself. Progress counts every swing
// Gapper recorded in the window (live sessions count each swing automatically; videos count each swing found).
import type { GoalPeriod, Session, SwingGoal, SwingRecord } from "./store/types";

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  today: "Today",
  weekend: "This weekend",
  week: "This week",
  next7: "Next 7 days",
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The goal window for a period, in local time. Weeks run Monday to Sunday; a weekend is Friday to Sunday. */
export function periodWindow(period: GoalPeriod, now = new Date()): { startAt: number; endAt: number } {
  const today = startOfDay(now);
  const dow = (today.getDay() + 6) % 7; // Monday = 0 … Sunday = 6
  if (period === "today") return { startAt: today.getTime(), endAt: endOfDay(today).getTime() };
  if (period === "week") return { startAt: addDays(today, -dow).getTime(), endAt: endOfDay(addDays(today, 6 - dow)).getTime() };
  if (period === "weekend") {
    // Friday through Sunday: this weekend if it's already Friday or later, otherwise the coming one.
    const fri = addDays(today, 4 - dow);
    return { startAt: fri.getTime(), endAt: endOfDay(addDays(fri, 2)).getTime() };
  }
  return { startAt: today.getTime(), endAt: endOfDay(addDays(today, 6)).getTime() };
}

export type GoalProgress = {
  done: number;
  target: number;
  pct: number;
  met: boolean;
  sessions: number;
  days: { day: number; n: number }[];
  avgScore: number | null;
  bestScore: number | null;
  /** True once the window has closed. */
  ended: boolean;
  /** Whole days left including today (0 once ended). */
  daysLeft: number;
};

export function goalProgress(goal: SwingGoal, swings: SwingRecord[], sessions: Session[], now = Date.now()): GoalProgress {
  const inWindow = swings.filter((s) => s.at >= goal.startAt && s.at <= goal.endAt);
  const done = inWindow.length;
  const sessionIds = new Set(inWindow.map((s) => s.sessionId));
  const byDay = new Map<number, number>();
  for (let d = startOfDay(new Date(goal.startAt)); d.getTime() <= goal.endAt; d = addDays(d, 1)) byDay.set(d.getTime(), 0);
  for (const s of inWindow) {
    const k = startOfDay(new Date(s.at)).getTime();
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const scores = inWindow.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
  const ended = now > goal.endAt;
  void sessions;
  return {
    done,
    target: goal.target,
    pct: Math.min(100, Math.round((done / goal.target) * 100)),
    met: done >= goal.target,
    sessions: sessionIds.size,
    days: [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, n]) => ({ day, n })),
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    ended,
    daysLeft: ended ? 0 : Math.max(1, Math.ceil((goal.endAt - Math.max(now, goal.startAt)) / 864e5)),
  };
}

/** The goal to show: the one running now, or the most recent one that ended in the last week (to share its report). */
export function currentGoal(goals: SwingGoal[], now = Date.now()): SwingGoal | null {
  const sorted = [...goals].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.find((g) => g.startAt <= now + 7 * 864e5 && g.endAt >= now) ?? sorted.find((g) => g.endAt < now && now - g.endAt < 7 * 864e5) ?? null;
}

export function windowLabel(goal: SwingGoal) {
  const f = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return goal.period === "today" ? f(goal.startAt) : `${f(goal.startAt)} – ${f(goal.endAt)}`;
}
