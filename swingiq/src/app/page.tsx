"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArcScore } from "@/components/ArcScore";
import { GapMark, LockupH } from "@/components/Logo";
import { usePlayers } from "@/components/PlayerProvider";
import { useSync } from "@/components/SyncProvider";
import { Setup } from "@/components/Setup";
import { SwingGoal } from "@/components/SwingGoal";
import { Softball } from "@/components/Softball";
import { Chip, InfoTip, Meter, PageSkeleton, Panel, PillarStrip, SectionTitle, Skeleton, Stat, fmtDate } from "@/components/ui";
import { FieldPrint } from "@/components/viz/FieldPrint";
import { PoseThumb, Strobe, poseAt, stripBox } from "@/components/viz/SwingFigures";
import { db } from "@/lib/store/db";
import { FOOT_DOWN_WINDOW, categoryAverages, consistency, metricValues, recentVsBefore, speedOf } from "@/lib/insights";
import { LEVEL_LABEL, type Session, type SwingRecord } from "@/lib/store/types";

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

/** The two ways to record, named by what you do, each with the one line that tells them apart. */
function SwingActions() {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Link href="/live" className="press group relative flex min-h-[5rem] items-center gap-3.5 overflow-hidden rounded-xl bg-optic px-4 py-3 text-optic-ink shadow-[0_16px_30px_-18px_rgb(196_241_53/0.6)] hover:bg-optic-2">
        <Softball size={30} />
        <span className="min-w-0">
          <span className="brandline block text-[19px] leading-tight">Hit live</span>
          <span className="block text-[13px] font-semibold leading-snug opacity-75">Prop up your phone. Feedback after every swing.</span>
        </span>
      </Link>
      <Link href="/record" className="press flex min-h-[5rem] items-center gap-3.5 rounded-xl border border-line-2 bg-night-2 px-4 py-3 hover:border-clay/60">
        <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true" className="shrink-0 text-chalk">
          <path d="M15 20V5M9 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
          <path d="M4 19v7h22v-7" fill="none" stroke="currentColor" strokeWidth="2.6" />
        </svg>
        <span className="min-w-0">
          <span className="brandline block text-[19px] leading-tight text-chalk">Upload a video</span>
          <span className="block text-[13px] leading-snug text-chalk-3">Or film one now. Slo-mo clips measure exit velo and bat speed.</span>
        </span>
      </Link>
    </div>
  );
}

/** Recent form: the last dozen swing scores as bars, oldest to newest; the latest is lit. Real scores only. */
function RecentForm({ swings }: { swings: SwingRecord[] }) {
  const xs = swings
    .slice(0, 12)
    .map((s) => s.analysis.score.overall)
    .filter((v): v is number => v !== null)
    .reverse();
  if (xs.length < 2) return null;
  return (
    <div className="relative mt-5 border-t border-white/[0.07] pt-4">
      <div className="mb-2 flex items-baseline justify-between text-[12px] text-chalk-3">
        <span className="label">Recent form</span>
        <span>last {xs.length} swings</span>
      </div>
      <div className="flex h-12 items-end gap-1.5" role="img" aria-label={`Recent scores, oldest to newest: ${xs.join(", ")}`}>
        {xs.map((v, i) => (
          <div key={i} className="grow-y max-w-7 flex-1 rounded-t-sm" style={{ height: `${Math.max(8, v)}%`, background: i === xs.length - 1 ? "var(--color-optic)" : "rgb(214 220 226 / 0.28)", animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    </div>
  );
}

/** One quiet line for a signed-out hitter: sign in to see these swings on every device. */
function SyncPrompt() {
  const { status } = useSync();
  if (status !== "signed-out") return null;
  return (
    <Link href="/sign-in" className="press mt-3 flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[14px] text-chalk-2 hover:border-line-2 hover:text-chalk">
      <span>
        <span className="font-semibold text-chalk">Use Gapper on all your devices.</span> Sign in to sync your swings.
      </span>
      <span className="text-optic" aria-hidden="true">→</span>
    </Link>
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

  // New visitors get the scroll site at "/" (public/site, via the rewrite in next.config.ts). Anyone who reaches the
  // app here without a hitter (storage cleared, say) gets setup.
  if (!player) return <Setup onSave={savePlayer} storageOk={storageOk} />;

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
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="md:hidden">
            <LockupH height={26} />
          </span>
          <span className="hidden md:block"><PillarStrip /></span>
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
          <section aria-label="Your Gapper Score" className="stage relative mt-5 overflow-hidden rounded-2xl p-5">
            <GapMark size={340} ink="#ffffff" accent="#ffffff" className="pointer-events-none absolute -right-24 -top-6 opacity-[0.03]" />
            {/* The latest swing as a strobe: the hitter's own tracked swing is the card's photo. */}
            <Link href={`/swings/${all[0].id}`} aria-label="Your latest swing" className="absolute right-3 top-3 h-[9.5rem] w-[7.6rem] sm:h-[11rem] sm:w-[8.8rem]">
              <Strobe pose={all[0].pose} phases={all[0].analysis.phases} size={all[0].frameSize} hand={all[0].hand} handPath={all[0].analysis.handPath} className="h-full w-full" label="Your latest swing as a strobe, the hands' path in lime." />
            </Link>
            <div className="relative max-w-[calc(100%-8rem)] sm:max-w-[calc(100%-9.5rem)]">
              <p className="label">Player card</p>
              <h2 className="display t-l mt-1.5 max-w-full truncate pr-2">{player.name}</h2>
              <p className="mt-2 text-[13px] text-chalk-2">
                Bats {player.hand === "R" ? "right" : "left"} · {Math.floor(player.heightIn / 12)}′{player.heightIn % 12}″{player.level ? ` · ${LEVEL_LABEL[player.level]}` : ""}
              </p>
              <Link href="/profile" className="mt-3 inline-flex min-h-8 items-center rounded-md border border-line-2 px-2.5 text-[12px] font-semibold text-chalk-2 hover:text-chalk">
                Hitting Profile →
              </Link>
            </div>
            <div className="relative mt-5 grid grid-cols-1 items-center gap-5 min-[360px]:grid-cols-[auto_1fr]">
              <div className="flex justify-center">
                <ArcScore score={overall} size={172} label="Gapper Score" previous={prevOverall} />
              </div>
              <div className="space-y-4">
                {trend !== null ? (
                  <Stat label="vs last week" value={`${trend >= 0 ? "+" : "−"}${Math.abs(trend)}`} tone={trend >= 0 ? "optic" : "chalk"} size="sm" />
                ) : (
                  <Stat label="Swings logged" value={all.length} size="sm" note={`${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`} />
                )}
                <div>
                  <Stat label="Front foot on time" value={onTime === null ? "—" : `${onTime}%`} size="sm" source={onTime === null ? undefined : "estimate"} />
                  {onTime !== null && <div className="mt-1.5"><Meter value={onTime} label="Front foot on time" /></div>}
                </div>
                <Stat label="Repeatability" value={steady ?? "—"} size="sm" note={steady === null ? "After 3 swings" : undefined} />
              </div>
            </div>
            <RecentForm swings={all} />
            {prevOverall !== null && <p className="relative mt-3 text-[12px] text-chalk-3"><span className="text-clay">▲</span> the 20 swings before: {prevOverall}</p>}
          </section>

          <SwingActions />
          <SyncPrompt />

          <SwingGoal player={player} />

          {(topEv || topBat) && (
            <>
              <SectionTitle right={<InfoTip label="these speeds">Exit velo from tracking the ball, bat speed from tracking the bat, both from high-speed video (or typed in from your radar or sensor).</InfoTip>}>Power</SectionTitle>
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
                    <Stat align label="Top bat speed" value={Math.round(topBat.v)} unit="mph" source={topBat.source === "sensor" ? "sensor" : "estimate"} size="md" note={topBat.source === "sensor" ? "from your sensor" : "estimate, ± range"} />
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
                <span className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-stitch" aria-hidden="true" />
                <p className="text-[15px] font-semibold leading-snug text-chalk">{focus.text}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-chalk-3">
                  <span>Came up on {focus.n} of {lastSwings.length} swings · {fmtDate(last.startedAt)}</span>
                  <Link href="/profile#drills" className="font-semibold text-optic">Your drills →</Link>
                </p>
              </Panel>
            </>
          )}
          </div>
          <div className="lg:-mt-5">
          <SectionTitle right={<Link href="/progress" className="text-[13px] text-chalk-2 hover:text-chalk">Details</Link>}>Field Print</SectionTitle>
          <Panel className="p-4">
            <FieldPrint now={categoryAverages(recent)} before={before.length ? categoryAverages(before) : null} caption={before.length ? "Last 20 swings. Alloy lines: the 20 before. Tap a wedge." : "Your six skill areas over your recent swings. Tap a wedge."} />
          </Panel>

          <SectionTitle right={<Link href="/swings" className="text-[13px] text-chalk-2 hover:text-chalk">All swings</Link>}>Recent swings</SectionTitle>
          <ol className="surface divide-y divide-line overflow-hidden rounded-2xl">
            {all.slice(0, 5).map((s) => {
              const ev = speedOf(s, "exitVelocity");
              const score = s.analysis.score.overall;
              return (
                <li key={s.id}>
                  <Link href={`/swings/${s.id}`} className="press flex items-center gap-3.5 px-3 py-3 hover:bg-white/[0.03]">
                    <span className="h-12 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-night">
                      <PoseThumb lm={poseAt(s.pose, s.analysis.phases.contact)} box={stripBox(s.pose, [s.analysis.phases.contact], s.frameSize, 0.8)} size={s.frameSize} hand={s.hand} active />
                    </span>
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
          <section aria-label="Welcome" className="stage relative mt-5 overflow-hidden rounded-2xl p-5">
            <GapMark size={320} ink="#ffffff" accent="#ffffff" className="pointer-events-none absolute -right-20 -top-6 opacity-[0.035]" />
            <p className="label relative">Rookie card</p>
            <h2 className="display t-l relative mt-1.5 max-w-full truncate pr-2">{player.name}</h2>
            <p className="relative mt-1.5 text-[13px] text-chalk-2">
              Bats {player.hand === "R" ? "right" : "left"} · {Math.floor(player.heightIn / 12)}′{player.heightIn % 12}″ · your Gapper Score shows up after your first swing
            </p>
          </section>
          <Panel boxed className="mt-4 p-5">
            <PillarStrip active="record" className="mb-3" />
            <h2 className="title">Your first swing</h2>
            <p className="mt-1 text-[14px] text-chalk-2">Set the phone up like this, whole body in the picture, shoes included.</p>
            <div className="mt-4">
              <CageDiagram />
            </div>
          </Panel>
          <SwingActions />
          <SwingGoal player={player} />
          <Link href="/guide" className="mt-4 inline-block text-[15px] text-optic">
            Full camera setup guide →
          </Link>
        </>
      )}

      <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-5 text-[13px] text-chalk-3">
        <span className="brandline text-[12px] tracking-[0.04em] text-optic">Built for slowpitch</span>
        <Link href="/how-it-works" className="hover:text-chalk-2">How Gapper measures</Link>
        <Link href="/bats" className="hover:text-chalk-2">Bat DNA</Link>
        <Link href="/guide" className="hover:text-chalk-2">Camera setup guide</Link>
      </div>
    </div>
  );
}
