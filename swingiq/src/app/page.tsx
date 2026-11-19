"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArcScore } from "@/components/ArcScore";
import { Lockup, Wordmark } from "@/components/Logo";
import { PlayerForm } from "@/components/PlayerForm";
import { usePlayers } from "@/components/PlayerProvider";
import { Softball } from "@/components/Softball";
import { Chip, InfoTip, Meter, PageSkeleton, Panel, SectionTitle, Skeleton, Stat, fmtDate } from "@/components/ui";
import { FieldPrint } from "@/components/viz/FieldPrint";
import { db } from "@/lib/store/db";
import { FOOT_DOWN_WINDOW, categoryAverages, consistency, metricValues, recentVsBefore, speedOf } from "@/lib/insights";
import type { Session, SwingRecord } from "@/lib/store/types";

/**
 * The brand idea, drawn from above: three outfielders and their range, and a line drive splitting the gap between
 * left and center to the wall. No numbers: it's an illustration, not a reading.
 */
function GapField() {
  const home = { x: 180, y: 196 };
  const fielders = [
    { x: 92, y: 92 },
    { x: 180, y: 66 },
    { x: 268, y: 92 },
  ];
  return (
    <svg viewBox="0 0 360 210" className="w-full" aria-hidden="true">
      <path d={`M${home.x} ${home.y} L22 48 M${home.x} ${home.y} L338 48`} stroke="var(--color-line-2)" strokeWidth="1" />
      <path d="M22 48 Q180 -30 338 48" fill="none" stroke="var(--color-chalk-3)" strokeOpacity="0.55" strokeWidth="1.4" />
      <path d="M126 150 Q180 118 234 150" fill="none" stroke="var(--color-line-2)" strokeWidth="1" />
      {fielders.map((f) => (
        <g key={f.x}>
          <circle cx={f.x} cy={f.y} r="30" fill="var(--color-chalk)" fillOpacity="0.035" stroke="var(--color-chalk-3)" strokeOpacity="0.35" strokeDasharray="2 4" />
          <circle cx={f.x} cy={f.y} r="4" fill="var(--color-chalk-2)" />
        </g>
      ))}
      <path d={`M${home.x} ${home.y - 6} l9 -9 l-9 -9 l-9 9 z`} fill="none" stroke="var(--color-chalk-2)" strokeWidth="1.2" />
      <path d={`M${home.x} ${home.y - 14} L115 23`} fill="none" stroke="var(--color-optic)" strokeWidth="2.4" strokeLinecap="round" className="draw" pathLength={1000} style={{ ["--len" as string]: 1000 }} />
      <circle cx="115" cy="23" r="6" fill="var(--color-optic)" className="animate-pop" style={{ animationDelay: "0.9s" }} />
    </svg>
  );
}

const READS = [
  { h: "Legs and feet first", p: "Foot-down timing, stride and front-leg block, judged against slow-pitch norms, not baseball's." },
  { h: "The one thing to fix", p: "Every swing scored across six skill areas, with the single change that matters most and a drill for it." },
  { h: "Speed from slo-mo", p: "Exit velo, launch angle, pitch speed and bat speed from 120–240 fps video, always with a ± range." },
];

function CageDiagram() {
  return (
    <svg viewBox="0 0 300 150" className="w-full" role="img" aria-label="Phone position: across the plate, 10 to 15 feet away, facing the hitter's chest, at waist height.">
      <rect x="6" y="6" width="288" height="138" rx="6" fill="none" stroke="var(--color-line-2)" strokeDasharray="3 5" />
      <path d="M70 66 h18 v8 l-9 7 l-9 -7 z" fill="var(--color-chalk-2)" />
      <circle cx="58" cy="70" r="9" fill="none" stroke="var(--color-chalk)" strokeWidth="1.6" />
      <path d="M78 22 Q120 10 150 20" fill="none" stroke="var(--color-optic)" strokeWidth="1.4" strokeDasharray="1 5" strokeLinecap="round" />
      <text x="96" y="16" fontSize="10" fill="var(--color-chalk-3)">pitch</text>
      <rect x="226" y="60" width="13" height="22" rx="3" fill="var(--color-optic)" />
      <path d="M226 71 L92 71" stroke="var(--color-optic)" strokeOpacity="0.35" strokeDasharray="2 4" />
      <text x="140" y="64" fontSize="10.5" fill="var(--color-chalk-2)">10–15 ft</text>
      <text x="206" y="100" fontSize="10.5" fill="var(--color-optic)">phone, waist high</text>
      <text x="30" y="100" fontSize="10.5" fill="var(--color-chalk-2)">you</text>
    </svg>
  );
}

export default function Home() {
  const { ready, player, savePlayer, storageOk } = usePlayers();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [lastSwings, setLastSwings] = useState<SwingRecord[]>([]);
  const [all, setAll] = useState<SwingRecord[]>([]);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!player) return;
    (async () => {
      const ss = (await db.sessions(player.id)).filter((s) => s.swingCount > 0);
      if (ss[0]) setLastSwings(await db.swingsInSession(ss[0].id));
      setAll(await db.swingsForPlayer(player.id));
      setSessions(ss);
    })().catch(() => setSessions([]));
  }, [player]);

  if (!ready) return <PageSkeleton />;

  if (!player) {
    return (
      <div className="animate-rise pb-10">
        <header className="flex items-center justify-between pt-3">
          <span className="md:invisible">
            <Wordmark height={20} />
          </span>
          <Link href="/how-it-works" className="text-[14px] text-chalk-2 hover:text-chalk">
            How it measures
          </Link>
        </header>
        <div className="mt-9 md:grid md:grid-cols-[1.4fr_1fr] md:items-center md:gap-10">
          <div>
            <h1 className="display text-[3rem] leading-[0.95] md:text-[3.4rem]">
              <span className="whitespace-nowrap">Own the gap.</span>
              <span className="mt-3 block text-[1.35rem] font-semibold leading-tight tracking-[-0.01em] text-chalk-2 [font-stretch:108%] md:text-[1.6rem]">Know your swing. Own your game.</span>
            </h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-chalk-2">
              Gapper is a hitting lab on your phone. It catches every swing on its own, reads your legs and feet first, and tells you the one thing to fix. Film in slo-mo and it
              measures exit velo and bat speed too.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#start" className="press inline-flex min-h-12 items-center rounded-xl bg-optic px-5 font-semibold text-optic-ink hover:bg-optic-2">
                Set up your hitter
              </a>
              <Link href="/guide" className="press inline-flex min-h-12 items-center rounded-xl border border-line-2 px-5 text-chalk hover:border-chalk-3">
                Camera setup
              </Link>
            </div>
          </div>
          <div className="mt-10 md:mt-0">
            <GapField />
          </div>
        </div>

        <section aria-label="What Gapper reads" className="mt-12">
          <dl className="surface divide-y divide-line rounded-2xl md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
            {READS.map((r) => (
              <div key={r.h} className="p-5">
                <dt className="head text-[17px]">{r.h}</dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-chalk-3">{r.p}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[13px] leading-relaxed text-chalk-3">
            Estimates from one phone camera: every number shows how sure it is, and what a phone can&apos;t measure is left out.{" "}
            <Link href="/how-it-works" className="text-chalk-2 underline">
              Here&apos;s the honest version.
            </Link>{" "}
            Built for slow-pitch softball first; baseball is on the way.
          </p>
        </section>

        {!storageOk && <p className="mt-6 rounded-xl border border-amber/40 bg-amber-wash px-4 py-3 text-sm text-chalk">This browser is blocking storage (private mode?). Swings won&apos;t be saved.</p>}
        <Panel boxed id="start" className="mt-10 scroll-mt-6 p-5 md:max-w-xl">
          <h2 className="head text-[19px]">Set up your hitter</h2>
          <p className="mb-5 mt-1 text-[14px] text-chalk-3">Stays on this phone. No account, no sign-up.</p>
          <PlayerForm onSave={savePlayer} submitLabel="Let's hit" />
        </Panel>

        <footer className="mt-14 flex items-end justify-between border-t border-line pt-6">
          <Lockup width={132} />
          <div className="flex gap-4 text-[13px] text-chalk-3">
            <Link href="/privacy" className="hover:text-chalk-2">Privacy</Link>
            <Link href="/sign-in" className="hover:text-chalk-2">Sign in</Link>
          </div>
        </footer>
      </div>
    );
  }

  const last = sessions?.[0] ?? null;
  const weekAgo = now - 7 * 864e5;
  const twoWeeksAgo = now - 14 * 864e5;
  const scoreOf = (xs: SwingRecord[]) => {
    const v = xs.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const { recent, before } = recentVsBefore(all, 20);
  const overall = scoreOf(recent);
  const prevOverall = scoreOf(before);
  const thisWeek = all.filter((s) => s.at >= weekAgo);
  const lastWeek = all.filter((s) => s.at >= twoWeeksAgo && s.at < weekAgo);
  const trend = scoreOf(thisWeek) !== null && scoreOf(lastWeek) !== null ? scoreOf(thisWeek)! - scoreOf(lastWeek)! : null;
  const best = all.reduce<SwingRecord | null>((b, s) => ((s.analysis.score.overall ?? -1) > (b?.analysis.score.overall ?? -1) ? s : b), null);
  const pb = all.find((s) => s.pb) ?? null;
  const top = (k: "exitVelocity" | "batSpeed") =>
    all.reduce<{ id: string; v: number; source: "sensor" | "slomo" } | null>((b, s) => {
      const v = speedOf(s, k);
      return v && (!b || v.v > b.v) ? { id: s.id, v: v.v, source: v.source } : b;
    }, null);
  const topEv = top("exitVelocity");
  const topBat = top("batSpeed");
  const evs = all.map((s) => speedOf(s, "exitVelocity")?.v).filter((x): x is number => x !== undefined);
  const evAvg = evs.length >= 2 ? evs.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(10, evs.length) : null;
  const footVals = metricValues(all, "strideTiming");
  const onTime = footVals.length ? Math.round((footVals.filter((v) => v >= FOOT_DOWN_WINDOW.lo && v <= FOOT_DOWN_WINDOW.hi).length / footVals.length) * 100) : null;
  const steady = consistency(recent.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null));
  const lastFix = lastSwings.filter((s) => s.analysis.cue.tone === "fix");
  const focusCounts = new Map<string, { n: number; text: string }>();
  for (const s of lastFix) {
    const e = focusCounts.get(s.analysis.cue.id) ?? { n: 0, text: s.analysis.cue.text };
    e.n++;
    focusCounts.set(s.analysis.cue.id, e);
  }
  const focus = [...focusCounts.values()].sort((a, b) => b.n - a.n)[0];

  return (
    <div className="animate-rise pb-6">
      <div className="flex items-center justify-between pt-3">
        <span className="md:invisible">
          <Wordmark />
        </span>
        <Link href="/profile" className="press rounded-lg border border-line-2 px-3 py-1.5 text-[13px] text-chalk-2 hover:text-chalk">
          {player.name} · {player.hand === "R" ? "Righty" : "Lefty"}
        </Link>
      </div>

      {sessions === null ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : all.length > 0 ? (
        <div className="lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-x-6">
          <div>
          <Panel boxed as="section" aria-label="Your Gapper Score" className="mt-5 overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <span className="head text-[15px]">Your Gapper Score</span>
              <Link href="/progress" className="text-[13px] text-chalk-2 hover:text-chalk">
                Progress
              </Link>
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-5">
              <ArcScore score={overall} size={176} label={`Last ${Math.min(20, recent.length)} swings`} previous={prevOverall} />
              <div className="space-y-4">
                {trend !== null ? (
                  <Stat label="vs last week" value={`${trend >= 0 ? "+" : "−"}${Math.abs(trend)}`} tone={trend >= 0 ? "optic" : "chalk"} size="sm" />
                ) : (
                  <Stat label="Swings logged" value={all.length} size="sm" note={`${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`} />
                )}
                <div>
                  <Stat label="Foot down on time" value={onTime === null ? "—" : `${onTime}%`} size="sm" />
                  {onTime !== null && <div className="mt-1.5"><Meter value={onTime} label="Foot down on time" /></div>}
                </div>
                <Stat label="Consistency" value={steady ?? "—"} size="sm" note={steady === null ? "After 3 swings" : undefined} />
              </div>
            </div>
            {prevOverall !== null && <p className="mt-3 text-[12px] text-chalk-3"><span className="text-clay">○</span> the 20 swings before: {prevOverall}</p>}
          </Panel>

          <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-3">
            <Link href="/record" className="press flex min-h-14 items-center gap-3 rounded-xl bg-optic px-4 font-bold text-optic-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_10px_28px_-14px_rgb(183_243_74/0.22)]">
              <svg width="22" height="22" viewBox="0 0 30 30" aria-hidden="true">
                <rect x="2" y="7" width="19" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2.6" />
                <path d="M21 13l7-4v12l-7-4z" fill="currentColor" />
              </svg>
              <span className="leading-tight">Record my swing</span>
            </Link>
            <Link href="/live" className="press flex min-h-14 items-center gap-2.5 rounded-xl border border-line-2 bg-night-2 px-3.5 text-[15px] hover:border-chalk-3">
              <Softball size={20} />
              <span className="leading-tight">Start live analysis</span>
            </Link>
          </div>

          {(topEv || topBat) && (
            <>
              <SectionTitle right={<InfoTip label="these speeds">Measured from slo-mo video by tracking the ball (or typed in from your radar or sensor). Bat speed is worked out from exit velo and pitch speed, assuming a sweet-spot hit.</InfoTip>}>Speed lab</SectionTitle>
              <Panel className="grid grid-cols-3 divide-x divide-line">
                {topEv ? (
                  <Link href={`/swings/${topEv.id}`} className="press p-4 hover:bg-night-3">
                    <Stat align label="Top exit velo" value={Math.round(topEv.v)} unit="mph" source={topEv.source} size="md" />
                  </Link>
                ) : (
                  <div className="p-4"><Stat align label="Exit velo" value="—" tone="muted" /></div>
                )}
                <div className="p-4">
                  <Stat align label="Avg exit velo" value={evAvg === null ? "—" : Math.round(evAvg)} unit={evAvg === null ? undefined : "mph"} tone={evAvg === null ? "muted" : "chalk"} size="md" note={evAvg === null ? "After 2 slo-mo swings" : `last ${Math.min(10, evs.length)}`} />
                </div>
                {topBat ? (
                  <Link href={`/swings/${topBat.id}`} className="press p-4 hover:bg-night-3">
                    <Stat align label="Top bat speed" value={Math.round(topBat.v)} unit="mph" source={topBat.source} size="md" note="estimate" />
                  </Link>
                ) : (
                  <div className="p-4"><Stat align label="Bat speed" value="—" tone="muted" /></div>
                )}
              </Panel>
            </>
          )}

          {last && focus && (
            <>
              <SectionTitle right={<Link href={`/swings?session=${last.id}`} className="text-[13px] text-chalk-2 hover:text-chalk">Review</Link>}>Work on this next</SectionTitle>
              <Panel className="relative overflow-hidden p-4 pl-5">
                <span className="absolute inset-y-0 left-0 w-1 bg-stitch" aria-hidden="true" />
                <p className="text-[15px] leading-snug text-chalk">{focus.text}</p>
                <p className="mt-2 text-[12px] text-chalk-3">
                  Came up on {focus.n} of {lastSwings.length} swings · {fmtDate(last.startedAt)}
                </p>
              </Panel>
            </>
          )}
          </div>
          <div className="lg:-mt-5">
          <SectionTitle right={<Link href="/progress" className="text-[13px] text-chalk-2 hover:text-chalk">Details</Link>}>Field Print</SectionTitle>
          <Panel className="p-4">
            <FieldPrint now={categoryAverages(recent)} before={before.length ? categoryAverages(before) : null} caption={before.length ? "Last 20 swings. Silver lines: the 20 before. Tap a wedge." : "Your six skill areas over your recent swings. Tap a wedge."} />
          </Panel>

          <SectionTitle right={<Link href="/swings" className="text-[13px] text-chalk-2 hover:text-chalk">All swings</Link>}>Recent swings</SectionTitle>
          <ol className="surface divide-y divide-line overflow-hidden rounded-2xl">
            {all.slice(0, 5).map((s) => {
              const ev = speedOf(s, "exitVelocity");
              const score = s.analysis.score.overall;
              return (
                <li key={s.id}>
                  <Link href={`/swings/${s.id}`} className="press flex items-center gap-4 px-4 py-3.5 hover:bg-night-3">
                    <span className="w-11 shrink-0">
                      <span className={`num block text-[1.6rem] leading-none ${score === best?.analysis.score.overall ? "text-optic" : "text-chalk"}`}>{score ?? "—"}</span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-night-4">
                        <span className="block h-full bg-chalk-3" style={{ width: `${score ?? 0}%` }} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-chalk">{s.analysis.cue.spoken}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-chalk-3">
                        {fmtDate(s.at)} · {s.source === "video" ? "from video" : "live"}
                        {s.pb && <Chip tone="optic">★ best</Chip>}
                        {ev && <Chip tone="optic">{Math.round(ev.v)} mph</Chip>}
                      </span>
                    </span>
                    <span className="text-chalk-3" aria-hidden="true">›</span>
                  </Link>
                </li>
              );
            })}
          </ol>

          <SectionTitle>Personal records</SectionTitle>
          <Panel className="divide-y divide-line">
            <Link href={best ? `/swings/${best.id}` : "/swings"} className="press flex items-center justify-between px-4 py-3.5 hover:bg-night-3">
              <span className="text-[15px]">Top score</span>
              <span className="num text-2xl">{best?.analysis.score.overall ?? "—"}</span>
            </Link>
            {pb ? (
              <Link href={`/compare?a=${all[0].id}&b=${pb.id}`} className="press flex items-center justify-between px-4 py-3.5 hover:bg-night-3">
                <span className="text-[15px]">
                  Personal best swing<span className="block text-[12px] text-chalk-3">Line your latest swing up against it</span>
                </span>
                <span className="num text-2xl text-optic">{pb.analysis.score.overall ?? "★"}</span>
              </Link>
            ) : (
              <p className="px-4 py-3.5 text-[14px] text-chalk-3">Mark a swing as your personal best on its page to compare against it.</p>
            )}
          </Panel>
          </div>
        </div>
      ) : (
        <>
          <Panel boxed className="mt-5 p-5">
            <h2 className="head text-[19px]">Your first swing</h2>
            <p className="mt-1 text-[14px] text-chalk-2">Set the phone up like this, whole body in the picture, shoes included.</p>
            <div className="mt-4">
              <CageDiagram />
            </div>
          </Panel>
          <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-3">
            <Link href="/record" className="press flex min-h-14 items-center gap-3 rounded-xl bg-optic px-4 font-bold text-optic-ink">
              Record my swing
            </Link>
            <Link href="/live" className="press flex min-h-14 items-center gap-2.5 rounded-xl border border-line-2 bg-night-2 px-3.5 text-[15px]">
              <Softball size={20} />
              Start live analysis
            </Link>
          </div>
          <Link href="/guide" className="mt-4 inline-block text-[15px] text-optic">
            Full camera setup guide →
          </Link>
        </>
      )}

      <div className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-5 text-[13px] text-chalk-3">
        <Link href="/how-it-works" className="hover:text-chalk-2">How Gapper measures</Link>
        <Link href="/bats" className="hover:text-chalk-2">Bat DNA</Link>
        <Link href="/guide" className="hover:text-chalk-2">Camera setup guide</Link>
      </div>
    </div>
  );
}
