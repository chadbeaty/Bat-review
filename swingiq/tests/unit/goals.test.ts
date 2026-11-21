import { describe, expect, it } from "vitest";
import { currentGoal, goalProgress, periodWindow } from "@/lib/goals";
import type { SwingGoal, SwingRecord } from "@/lib/store/types";

const day = (s: string) => new Date(s);

describe("swing goal windows", () => {
  it("a week runs Monday to Sunday", () => {
    const w = periodWindow("week", day("2026-11-19T15:00:00")); // a Thursday
    expect(new Date(w.startAt).getDay()).toBe(1);
    expect(new Date(w.endAt).getDay()).toBe(0);
    expect(new Date(w.startAt).getDate()).toBe(16);
    expect(new Date(w.endAt).getDate()).toBe(22);
  });
  it("this weekend is the coming Friday to Sunday, or the current one", () => {
    const thu = periodWindow("weekend", day("2026-11-19T15:00:00"));
    expect(new Date(thu.startAt).getDate()).toBe(20);
    const sat = periodWindow("weekend", day("2026-11-21T10:00:00"));
    expect(new Date(sat.startAt).getDate()).toBe(20);
    expect(new Date(sat.endAt).getDate()).toBe(22);
  });
});

describe("swing goal progress", () => {
  const goal: SwingGoal = { id: "g", playerId: "p", target: 3, period: "week", ...periodWindow("week", day("2026-11-19T12:00:00")), createdAt: 0 };
  const sw = (at: string, session: string, score: number | null): SwingRecord =>
    ({ id: at, sessionId: session, at: day(at).getTime(), analysis: { score: { overall: score } } }) as unknown as SwingRecord;
  it("counts only swings inside the window, by day and session", () => {
    const swings = [sw("2026-11-17T10:00:00", "a", 60), sw("2026-11-17T10:01:00", "a", 70), sw("2026-11-19T18:00:00", "b", null), sw("2026-11-25T10:00:00", "c", 90)];
    const p = goalProgress(goal, swings, [], day("2026-11-20T09:00:00").getTime());
    expect(p.done).toBe(3);
    expect(p.met).toBe(true);
    expect(p.sessions).toBe(2);
    expect(p.days).toHaveLength(7);
    expect(p.avgScore).toBe(65);
    expect(p.ended).toBe(false);
  });
  it("shows the running goal, or one that just ended", () => {
    expect(currentGoal([goal], day("2026-11-20T09:00:00").getTime())?.id).toBe("g");
    expect(currentGoal([goal], day("2026-11-25T09:00:00").getTime())?.id).toBe("g");
    expect(currentGoal([goal], day("2026-12-10T09:00:00").getTime())).toBeNull();
  });
});
