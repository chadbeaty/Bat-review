"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePlayers } from "@/components/PlayerProvider";
import { SprayChart } from "@/components/SprayChart";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { ButtonLink, Empty, InfoTip, Meter, PageSkeleton, PageTitle, Panel, Segmented, SectionTitle, Stat } from "@/components/ui";
import { FieldPrint } from "@/components/viz/FieldPrint";
import { METRICS } from "@/engine/catalog";
import type { MetricKey } from "@/engine/types";
import { db } from "@/lib/store/db";
import { categoryAverages, consistency, metricValues, recentVsBefore, sd, sessionSeries, speedOf } from "@/lib/insights";
import type { Session, SwingRecord } from "@/lib/store/types";

type Range = "30d" | "season" | "all";
const TREND_KEYS: MetricKey[] = ["strideTiming", "frontLegBlock", "frontFootSlide", "swingTime", "headMovement", "handDrop", "balance", "strideLength", "handSpeed"];

export default function ProgressPage() {
  const { ready, player } = usePlayers();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [swings, setSwings] = useState<SwingRecord[]>([]);
  const [range, setRange] = useState<Range>("all");
  const [metric, setMetric] = useState<MetricKey>("strideTiming");

  useEffect(() => {
    if (!player) return;
    Promise.all([db.sessions(player.id), db.swingsForPlayer(player.id)])
      .then(([ss, sw]) => {
        setSwings(sw);
        setSessions(ss.filter((s) => s.swingCount > 0));
      })
      .catch(() => setSessions([]));
  }, [player]);

  const since = useMemo(() => {
    const now = new Date();
    if (range === "30d") return now.getTime() - 30 * 864e5;
    if (range === "season") return new Date(now.getFullYear(), 0, 1).getTime();
    return 0;
  }, [range]);

  const inRange = useMemo(() => (sessions ?? []).filter((s) => s.startedAt >= since), [sessions, since]);
  const swingsInRange = useMemo(() => swings.filter((s) => s.at >= since), [swings, since]);
  const series = useMemo(() => sessionSeries(inRange, swingsInRange), [inRange, swingsInRange]);
  const label = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const scorePts: TrendPoint[] = series.filter((p) => p.avg !== null).map((p) => ({ x: p.t, y: p.avg!, lo: p.lo, hi: p.hi, n: p.n, label: label(p.t) }));
  const evPts: TrendPoint[] = useMemo(() => {
    return series
      .map((p) => {
        const evs = swingsInRange.filter((s) => s.sessionId === p.session.id).map((s) => speedOf(s, "exitVelocity")?.v).filter((v): v is number => v !== undefined);
        if (!evs.length) return null;
        return { x: p.t, y: evs.reduce((a, b) => a + b, 0) / evs.length, lo: Math.min(...evs), hi: Math.max(...evs), n: evs.length, label: label(p.t) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [series, swingsInRange]);

  const metricPts: TrendPoint[] = useMemo(() => {
    return series
      .map((p) => {
        const xs = metricValues(
          swingsInRange.filter((s) => s.sessionId === p.session.id),
          metric,
        );
        if (!xs.length) return null;
        return { x: p.t, y: xs.reduce((a, b) => a + b, 0) / xs.length, lo: Math.min(...xs), hi: Math.max(...xs), n: xs.length, label: label(p.t) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [series, swingsInRange, metric]);

  const { recent, before } = useMemo(() => recentVsBefore(swingsInRange, 20), [swingsInRange]);
  const scoresOf = (xs: SwingRecord[]) => xs.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
  const steadyNow = consistency(scoresOf(recent));
  const steadyBefore = consistency(scoresOf(before));
  const timingNow = sd(metricValues(recent, "strideTiming"));
  const timingBefore = sd(metricValues(before, "strideTiming"));

  const records = useMemo(() => {
    const vals = (k: MetricKey) =>
      swingsInRange
        .map((s) => ({ s, v: s.analysis.metrics[k] }))
        .filter((x) => x.v && x.v.source !== "unavailable" && x.v.value !== null)
        .map((x) => ({ s: x.s, v: x.v!.value! }));
    const best = (k: MetricKey, dir: 1 | -1) => vals(k).reduce<{ s: SwingRecord; v: number } | null>((b, x) => (!b || (x.v - b.v) * dir > 0 ? x : b), null);
    const topEv = swingsInRange.reduce<{ s: SwingRecord; v: number } | null>((b, s) => {
      const v = speedOf(s, "exitVelocity")?.v;
      return v !== undefined && (!b || v > b.v) ? { s, v } : b;
    }, null);
    return {
      score: swingsInRange.reduce<SwingRecord | null>((b, s) => ((s.analysis.score.overall ?? -1) > (b?.analysis.score.overall ?? -1) ? s : b), null),
      quickest: best("swingTime", -1),
      quietest: best("headMovement", -1),
      ev: topEv,
    };
  }, [swingsInRange]);

  if (!ready) return <PageSkeleton />;
  if (!player)
    return (
      <>
        <PageTitle title="Progress" />
        <Empty title="No hitter yet">Set one up on the Home screen first.</Empty>
      </>
    );
  if (sessions === null) return <PageSkeleton />;

  const info = METRICS[metric];
  return (
    <div className="animate-rise">
      <PageTitle title="Progress" sub={`${player.name}'s swing over time. Every number here comes from your own recorded swings.`} />
      <Segmented label="Time range" value={range} onChange={setRange} options={[{ value: "30d", label: "30 days" }, { value: "season", label: "This season" }, { value: "all", label: "All time" }]} />

      {inRange.length === 0 ? (
        <div className="mt-6">
          <Empty title="Nothing in this range yet">
            <p>Progress fills in after a session or two.</p>
            <ButtonLink href="/record" className="mt-5">Record a swing</ButtonLink>
          </Empty>
        </div>
      ) : (
        <>
          <div className="mt-6 md:grid md:grid-cols-2 md:gap-4">
            <Panel boxed className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="head text-[15px]">Field Print</h2>
                <InfoTip label="the Field Print">
                  Your six skill areas drawn as wedges of a ballfield. Each wedge reaches as far as its average score: the fence is 100. Clay lines show the 20 swings before, so you can see what moved.
                </InfoTip>
              </div>
              <FieldPrint now={categoryAverages(recent)} before={before.length ? categoryAverages(before) : null} caption={before.length ? "Last 20 swings vs. the 20 before (clay). Tap a wedge." : "Tap a wedge. After 20 more swings, you'll see what moved."} />
            </Panel>
            <Panel className="mt-4 p-4 md:mt-0">
              <h2 className="head text-[15px]">Consistency</h2>
              <p className="mt-1 text-[13px] text-chalk-3">Repeatable beats occasionally great. Last 20 swings, with the 20 before in clay.</p>
              <div className="mt-5 space-y-6">
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <Stat label="Score consistency" value={steadyNow ?? "—"} tone={steadyNow === null ? "muted" : "chalk"} />
                    {steadyBefore !== null && steadyNow !== null && (
                      <span className={`text-[13px] ${steadyNow >= steadyBefore ? "text-optic" : "text-chalk-3"}`}>
                        {steadyNow >= steadyBefore ? "+" : "−"}
                        {Math.abs(steadyNow - steadyBefore)} vs before
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <Meter value={steadyNow} compare={steadyBefore} label="Score consistency" />
                  </div>
                  <p className="mt-1.5 text-[12px] text-chalk-3">{steadyNow === null ? "Needs at least 3 scored swings." : "100 = every swing scored the same."}</p>
                </div>
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <Stat label="Foot-down timing spread" value={timingNow === null ? "—" : `±${Math.round(timingNow)}`} unit={timingNow === null ? undefined : "ms"} tone={timingNow === null ? "muted" : "chalk"} />
                    {timingBefore !== null && timingNow !== null && (
                      <span className={`text-[13px] ${timingNow <= timingBefore ? "text-optic" : "text-chalk-3"}`}>
                        {timingNow <= timingBefore ? "tighter" : "looser"} than before (±{Math.round(timingBefore)})
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12px] text-chalk-3">
                    {timingNow === null ? "Needs 3 swings with your feet in the picture." : "How much your front-foot landing time varies. Smaller is more repeatable."}
                  </p>
                </div>
              </div>
            </Panel>
          </div>

          <SectionTitle>Score timeline</SectionTitle>
          <Panel className="p-4">
            {scorePts.length >= 1 ? <TrendChart title="SwingIQ score by session" points={scorePts} unit="pts" /> : <p className="text-sm text-chalk-3">No scored sessions yet.</p>}
            {scorePts.length >= 2 && <p className="mt-2 text-[12px] text-chalk-3">Line: session average. Shaded: worst to best swing that day.</p>}
          </Panel>

          {evPts.length > 0 && (
            <>
              <SectionTitle>Exit velo timeline</SectionTitle>
              <Panel className="p-4">
                <TrendChart title="Exit velo by session (slo-mo or radar)" points={evPts} unit="mph" decimals={1} />
              </Panel>
            </>
          )}

          <SectionTitle>Any metric over time</SectionTitle>
          <Panel className="p-4">
            <label htmlFor="metric" className="sr-only">Metric</label>
            <select id="metric" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className="mb-4 min-h-11 w-full rounded-xl border border-line-2 bg-night-3 px-3 text-[15px] sm:w-auto">
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
            <SprayChart hand={player.hand} tags={swingsInRange.map((s) => ({ ...(s.tag ?? {}), ev: speedOf(s, "exitVelocity")?.v ?? null }))} />
          </Panel>

          <SectionTitle>Personal bests</SectionTitle>
          <Panel className="divide-y divide-line">
            <Record title="Top score" value={records.score?.analysis.score.overall ?? null} href={records.score ? `/swings/${records.score.id}` : undefined} />
            <Record title="Top exit velo" value={records.ev ? Math.round(records.ev.v) : null} unit="mph" note="slo-mo video or radar" href={records.ev ? `/swings/${records.ev.s.id}` : undefined} />
            <Record title="Quickest swing" value={records.quickest ? Math.round(records.quickest.v) : null} unit="ms" href={records.quickest ? `/swings/${records.quickest.s.id}` : undefined} />
            <Record title="Quietest head" value={records.quietest ? records.quietest.v.toFixed(1) : null} unit="in" href={records.quietest ? `/swings/${records.quietest.s.id}` : undefined} />
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
  return href ? (
    <Link href={href} className="press block hover:bg-night-3">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}
