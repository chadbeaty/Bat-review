"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Panel, Segmented, SectionTitle, Sheet } from "./ui";
import { PERIOD_LABEL, currentGoal, goalProgress, periodWindow, windowLabel } from "@/lib/goals";
import { db, uid } from "@/lib/store/db";
import type { GoalPeriod, Player, Session, SwingGoal as Goal, SwingRecord } from "@/lib/store/types";
import { workReportBlob } from "@/lib/workReport";

/**
 * Swing goal: "100 swings this weekend" from a coach, or "500 cuts this week" for yourself. A progress bar fills as
 * Gapper logs swings, and the work report is one picture to text as proof of the reps.
 */
export function SwingGoal({ player }: { player: Player }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [swings, setSwings] = useState<SwingRecord[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState("100");
  const [period, setPeriod] = useState<GoalPeriod>("week");
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [g, sw, ss] = await Promise.all([db.goals(player.id), db.swingsForPlayer(player.id), db.sessions(player.id)]);
    setGoals(g);
    setSwings(sw);
    setSessions(ss);
  }, [player.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setGoals([]));
  }, [load]);
  useEffect(() => () => {
    if (report) URL.revokeObjectURL(report.url);
  }, [report]);

  const goal = useMemo(() => (goals ? currentGoal(goals, now) : null), [goals, now]);
  const prog = useMemo(() => (goal ? goalProgress(goal, swings, sessions, now) : null), [goal, swings, sessions, now]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(target));
    if (!Number.isFinite(n) || n < 1 || n > 10000) return setErr("Pick a number of swings from 1 to 10,000.");
    setErr(null);
    const w = periodWindow(period);
    const g: Goal = { id: uid(), playerId: player.id, target: n, period, ...w, createdAt: Date.now() };
    await db.saveGoals(player.id, [...(goals ?? []).filter((x) => x.endAt > Date.now() - 60 * 864e5), g]);
    setEditing(false);
    await load();
  }
  async function endGoal() {
    if (!goal || !confirm("Stop tracking this goal?")) return;
    await db.saveGoals(player.id, (goals ?? []).filter((x) => x.id !== goal.id));
    await load();
  }
  async function makeReport() {
    if (!goal || !prog) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await workReportBlob(player, goal, prog);
      setReport({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setErr("Couldn't draw the work report on this browser. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const fileName = `gapper-${player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-work-report.png`;
  async function share() {
    if (!report) return;
    const file = new File([report.blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${player.name}'s work report` }).catch(() => {});
    else download();
  }
  function download() {
    if (!report) return;
    const a = document.createElement("a");
    a.href = report.url;
    a.download = fileName;
    a.click();
  }

  if (goals === null) return null;
  const input = "min-h-11 w-28 rounded-xl border border-line-2 bg-night-3 px-3 text-[16px]";

  return (
    <section aria-label="Swing goal">
      <SectionTitle right={goal && !editing ? <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-chalk-2 hover:text-chalk">New goal</button> : undefined}>Swing goal</SectionTitle>
      {!goal || editing ? (
        <Panel className="p-4">
          <form onSubmit={save} className="space-y-3">
            <p className="text-[14px] text-chalk-2">Hold yourself to a number: 500 cuts this week, or the 100 your team coach asked for before Sunday. Every swing Gapper logs counts, live or from video. When you&apos;re done, share the work report as proof of the reps.</p>
            <label className="flex items-center gap-3">
              <input aria-label="Number of swings" inputMode="numeric" className={input} value={target} onChange={(e) => setTarget(e.target.value)} />
              <span className="text-[15px] text-chalk">swings</span>
            </label>
            <Segmented<GoalPeriod>
              label="When"
              value={period}
              onChange={setPeriod}
              options={(Object.keys(PERIOD_LABEL) as GoalPeriod[]).map((k) => ({ value: k, label: PERIOD_LABEL[k] }))}
            />
            {err && <p role="alert" className="text-[13px] text-stitch">{err}</p>}
            <div className="flex gap-3">
              <Button type="submit">Start goal</Button>
              {editing && <Button type="button" variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>}
            </div>
          </form>
        </Panel>
      ) : (
        prog && (
          <Panel boxed className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] text-chalk-3">
                {PERIOD_LABEL[goal.period]} · {windowLabel(goal)}
              </p>
              <p className="text-[13px] text-chalk-3">{prog.ended ? "Finished" : `${prog.daysLeft} ${prog.daysLeft === 1 ? "day" : "days"} left`}</p>
            </div>
            <p className="mt-2 flex items-baseline gap-2" aria-label={`${prog.done} of ${prog.target} swings`}>
              <span className={`jumbo text-[3.4rem] ${prog.met ? "text-optic" : "text-chalk"}`}>{prog.done}</span>
              <span className="num text-[1.4rem] text-chalk-3">/ {prog.target}</span>
              <span className="text-[13px] font-semibold text-chalk-3">swings</span>
              {prog.met && <span className="ml-auto rounded-md border border-optic px-2 py-0.5 text-[12px] font-extrabold uppercase italic tracking-[0.06em] text-optic">Goal met</span>}
            </p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-night-4" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.pct} aria-label="Goal progress">
              <div className="grow h-full rounded-full bg-optic" style={{ width: `${Math.max(prog.pct, prog.done ? 2 : 0)}%` }} />
            </div>
            <p className="mt-2 text-[13px] text-chalk-3">
              {prog.met ? "Done. " : `${prog.target - prog.done} ${prog.ended ? "short" : "to go"}. `}
              {prog.sessions} {prog.sessions === 1 ? "session" : "sessions"}
              {prog.avgScore !== null ? ` · avg score ${prog.avgScore}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <Button onClick={makeReport} disabled={busy}>{busy ? "Drawing…" : "Share work report"}</Button>
              <button type="button" onClick={endGoal} className="text-[13px] text-chalk-3 hover:text-chalk">Stop goal</button>
            </div>
            {err && <p role="alert" className="mt-2 text-[13px] text-stitch">{err}</p>}
          </Panel>
        )
      )}
      <Sheet open={report !== null} onClose={() => setReport(null)} title="Your work report">
        {report && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={report.url} alt={`${player.name}'s Gapper work report`} className="mx-auto max-h-[58dvh] w-auto rounded-lg border border-line" />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={share}>Share</Button>
              <Button variant="ghost" onClick={download}>Save image</Button>
            </div>
            <p className="mt-3 text-[12px] text-chalk-3">On iPhone you can also press and hold the picture, then tap Save to Photos.</p>
          </div>
        )}
      </Sheet>
    </section>
  );
}
