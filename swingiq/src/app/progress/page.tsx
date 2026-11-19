"use client";
import { useEffect, useMemo, useState } from "react";
import { usePlayers } from "@/components/PlayerProvider";
import { SprayChart } from "@/components/SprayChart";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { ButtonLink, Empty, PageTitle, Panel, Segmented, SectionTitle } from "@/components/ui";
import { METRICS } from "@/engine/catalog";
import type { MetricKey } from "@/engine/types";
import { db } from "@/lib/store/db";
import type { Session, SwingRecord } from "@/lib/store/types";

type Range = "30d" | "season" | "all";
const TREND_KEYS: MetricKey[] = ["swingTime", "headMovement", "handDrop", "balance", "handSpeed", "strideLength"];

export default function ProgressPage() {
  const { ready, player } = usePlayers();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [swings, setSwings] = useState<SwingRecord[]>([]);
  const [range, setRange] = useState<Range>("all");
  const [metric, setMetric] = useState<MetricKey>("swingTime");

  useEffect(() => {
    if (!player) return;
    Promise.all([db.sessions(player.id), db.swingsForPlayer(player.id)])
      .then(([ss, sw]) => {
        setSessions(ss.filter((s) => s.swingCount > 0));
        setSwings(sw);
      })
      .catch(() => setSessions([]));
  }, [player]);

  const since = useMemo(() => {
    const now = new Date();
    if (range === "30d") return now.getTime() - 30 * 864e5;
    if (range === "season") return new Date(now.getFullYear(), 0, 1).getTime();
    return 0;
  }, [range]);

  const inRange = useMemo(() => (sessions ?? []).filter((s) => s.startedAt >= since).sort((a, b) => a.startedAt - b.startedAt), [sessions, since]);
  const swingsInRange = useMemo(() => swings.filter((s) => s.at >= since), [swings, since]);

  const label = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const scorePts: TrendPoint[] = inRange.filter((s) => s.avgScore !== null).map((s) => ({ x: s.startedAt, y: s.avgScore!, label: label(s.startedAt) }));

  const metricPts: TrendPoint[] = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const sw of swingsInRange) {
      const mv = sw.analysis.metrics[metric];
      if (!mv || mv.source === "unavailable" || mv.value === null) continue;
      by.set(sw.sessionId, [...(by.get(sw.sessionId) ?? []), mv.value]);
    }
    return inRange
      .filter((s) => by.has(s.id))
      .map((s) => {
        const xs = by.get(s.id)!;
        return { x: s.startedAt, y: xs.reduce((a, b) => a + b, 0) / xs.length, label: label(s.startedAt) };
      });
  }, [swingsInRange, inRange, metric]);

  const records = useMemo(() => {
    const vals = (k: MetricKey) =>
      swingsInRange
        .map((s) => ({ s, v: s.analysis.metrics[k] }))
        .filter((x) => x.v && x.v.source !== "unavailable" && x.v.value !== null)
        .map((x) => ({ s: x.s, v: x.v!.value! }));
    const best = (k: MetricKey, dir: 1 | -1) => vals(k).reduce<{ s: SwingRecord; v: number } | null>((b, x) => (!b || (x.v - b.v) * dir > 0 ? x : b), null);
    return {
      score: swingsInRange.reduce<SwingRecord | null>((b, s) => ((s.analysis.score.overall ?? -1) > (b?.analysis.score.overall ?? -1) ? s : b), null),
      quickest: best("swingTime", -1),
      hands: best("handSpeed", 1),
      quietest: best("headMovement", -1),
    };
  }, [swingsInRange]);

  if (!ready) return null;
  if (!player)
    return (
      <>
        <PageTitle title="Progress" />
        <Empty title="No hitter yet">Set one up on the Home screen first.</Empty>
      </>
    );

  const info = METRICS[metric];
  return (
    <div className="animate-rise">
      <PageTitle title="Progress" sub={`${player.name}'s swing over time`} />
      <Segmented label="Time range" value={range} onChange={setRange} options={[{ value: "30d", label: "30 days" }, { value: "season", label: "This season" }, { value: "all", label: "All time" }]} />

      {sessions !== null && inRange.length === 0 ? (
        <div className="mt-6">
          <Empty title="Nothing in this range yet">
            <p>Progress fills in after a session or two. Every number here comes from your own recorded swings.</p>
            <ButtonLink href="/live" className="mt-5">Start live session</ButtonLink>
          </Empty>
        </div>
      ) : (
        <>
          <SectionTitle>Personal bests</SectionTitle>
          <Panel><ul className="divide-y divide-line">
            <Record title="Top score" value={records.score?.analysis.score.overall ?? null} href={records.score ? `/swings/${records.score.id}` : undefined} />
            <Record title="Quickest swing" value={records.quickest ? Math.round(records.quickest.v) : null} unit="ms" href={records.quickest ? `/swings/${records.quickest.s.id}` : undefined} />
            <Record title="Quietest head" value={records.quietest ? records.quietest.v.toFixed(1) : null} unit="in" href={records.quietest ? `/swings/${records.quietest.s.id}` : undefined} />
            <Record title="Peak hand speed" value={records.hands ? records.hands.v.toFixed(1) : null} unit="mph" note="camera estimate" href={records.hands ? `/swings/${records.hands.s.id}` : undefined} />
          </ul></Panel>

          <SectionTitle>Trends</SectionTitle>
          <Panel className="p-4">
            {scorePts.length >= 1 ? <TrendChart title="Average SwingIQ score by session" points={scorePts} unit="pts" /> : <p className="text-sm text-chalk-3">No scored sessions yet.</p>}
          </Panel>
          <Panel className="mt-3 p-4">
            <label htmlFor="metric" className="sr-only">Metric</label>
            <select id="metric" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className="mb-3 min-h-11 rounded-xl border border-line bg-night-3 px-3 text-[15px]">
              {TREND_KEYS.map((k) => (
                <option key={k} value={k}>{METRICS[k].label}</option>
              ))}
            </select>
            {metricPts.length ? (
              <TrendChart title={`${info.label} (session average)`} points={metricPts} unit={info.suffix || info.unit} decimals={info.decimals} lowerIsBetter={info.better === "lower"} />
            ) : (
              <p className="text-sm text-chalk-3">No {info.label.toLowerCase()} data in this range. {metric === "strideLength" ? "Stride needs side view with your feet in frame." : ""}</p>
            )}
            <p className="mt-2 text-xs text-chalk-3">{info.explain}</p>
          </Panel>

          <SectionTitle>Spray chart</SectionTitle>
          <Panel className="p-4">
            <SprayChart hand={player.hand} tags={swingsInRange.map((s) => s.tag ?? {})} />
          </Panel>
        </>
      )}
    </div>
  );
}

function Record({ title, value, unit, href, note }: { title: string; value: number | string | null; unit?: string; href?: string; note?: string }) {
  const body = (
    <span className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span>
        <span className="block text-[15px] text-chalk">{title}</span>
        {note && <span className="block text-[12px] text-chalk-3">{note}</span>}
      </span>
      <span className="num text-2xl text-chalk">
        {value ?? "—"}
        {value !== null && unit && <span className="ml-1 font-sans text-sm font-normal text-chalk-3">{unit}</span>}
        {href && <span className="ml-3 font-sans text-base text-chalk-3" aria-hidden="true">›</span>}
      </span>
    </span>
  );
  return <li>{href ? <a href={href} className="block hover:bg-night-3">{body}</a> : body}</li>;
}
