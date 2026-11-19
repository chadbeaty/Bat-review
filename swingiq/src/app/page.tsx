"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArcScore } from "@/components/ArcScore";
import { PlayerForm } from "@/components/PlayerForm";
import { usePlayers } from "@/components/PlayerProvider";
import { Softball } from "@/components/Softball";
import { Panel, SectionTitle, fmtDate } from "@/components/ui";
import { db } from "@/lib/store/db";
import type { Session, SwingRecord } from "@/lib/store/types";

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
      setSessions(ss);
      if (ss[0]) setLastSwings(await db.swingsInSession(ss[0].id));
      setAll(await db.swingsForPlayer(player.id));
    })().catch(() => setSessions([]));
  }, [player]);

  if (!ready) return <div className="min-h-[60dvh]" />;

  if (!player) {
    return (
      <div className="animate-rise pb-8">
        <p className="mt-4 flex items-center gap-2 text-sm font-bold text-optic">
          <Softball size={18} /> SwingIQ Live
        </p>
        <h1 className="display mt-4 text-[2.6rem] leading-[1.02]">
          Know your swing.
          <br />
          Own your at‑bat.
        </h1>
        <p className="mt-4 max-w-md text-[17px] leading-relaxed text-chalk-2">
          Prop your phone next to the cage and hit. SwingIQ spots every swing on its own, scores your mechanics and tells you the one thing to fix, out loud if you want.
        </p>
        {!storageOk && (
          <p className="mt-4 rounded-xl bg-amber-wash px-4 py-3 text-sm text-chalk">This browser is blocking storage (private mode?). Swings won&apos;t be saved.</p>
        )}
        <Panel className="mt-8 p-5">
          <h2 className="mb-1 text-lg font-bold">Set up your hitter</h2>
          <p className="mb-5 text-[14px] text-chalk-3">Stays on this phone. No account needed.</p>
          <PlayerForm onSave={savePlayer} submitLabel="Let's hit" />
        </Panel>
        <p className="mt-6 text-[13px] text-chalk-3">
          Curious what a phone can really measure? <Link href="/how-it-works" className="text-chalk-2 underline">Here&apos;s the honest version.</Link>
        </p>
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
  const overall = scoreOf(all.slice(0, 20));
  const thisWeek = all.filter((s) => s.at >= weekAgo);
  const lastWeek = all.filter((s) => s.at >= twoWeeksAgo && s.at < weekAgo);
  const trend = scoreOf(thisWeek) !== null && scoreOf(lastWeek) !== null ? scoreOf(thisWeek)! - scoreOf(lastWeek)! : null;
  const best = all.reduce<SwingRecord | null>((b, s) => ((s.analysis.score.overall ?? -1) > (b?.analysis.score.overall ?? -1) ? s : b), null);
  const pb = all.find((s) => s.pb) ?? null;
  const footVals = all.map((s) => s.analysis.metrics.strideTiming).filter((m) => m && m.source !== "unavailable" && m.value !== null).map((m) => m!.value!);
  const onTime = footVals.length ? Math.round((footVals.filter((v) => v >= 140 && v <= 380).length / footVals.length) * 100) : null;
  const lastFix = lastSwings.filter((s) => s.analysis.cue.tone === "fix");
  const focusCounts = new Map<string, { n: number; text: string }>();
  for (const s of lastFix) {
    const e = focusCounts.get(s.analysis.cue.id) ?? { n: 0, text: s.analysis.cue.text };
    e.n++;
    focusCounts.set(s.analysis.cue.id, e);
  }
  const focus = [...focusCounts.values()].sort((a, b) => b.n - a.n)[0];
  const lastCats = (() => {
    const acc: Record<string, { label: string; sum: number; n: number }> = {};
    for (const s of lastSwings) for (const c of s.analysis.score.categories ?? []) if (c.score !== null) {
      const e = (acc[c.key] ??= { label: c.label, sum: 0, n: 0 });
      e.sum += c.score;
      e.n++;
    }
    return Object.entries(acc).map(([k, e]) => ({ key: k, label: e.label, score: Math.round(e.sum / e.n) }));
  })();

  return (
    <div className="animate-rise pb-6">
      <div className="flex items-center justify-between pt-2">
        <p className="flex items-center gap-2 text-sm font-bold text-optic">
          <Softball size={18} /> SwingIQ Live
        </p>
        <Link href="/profile" className="rounded-lg border border-line px-3 py-1.5 text-sm text-chalk-2">
          {player.name} · {player.hand === "R" ? "Righty" : "Lefty"}
        </Link>
      </div>

      <Link href="/record" className="group mt-6 flex items-center justify-between gap-4 rounded-3xl bg-optic p-6 text-optic-ink transition active:scale-[0.99]">
        <span>
          <span className="display block text-[1.9rem] leading-[1.02]">Record my swing</span>
          <span className="mt-2 block text-[15px] font-semibold opacity-75">Film it or upload it. Every frame analyzed.</span>
        </span>
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-optic-ink transition group-hover:scale-105">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="8" fill="#e5483a" />
          </svg>
        </span>
      </Link>
      <Link href="/live" className="mt-3 flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-line bg-night-2 px-5 py-4 transition hover:border-chalk-3 active:scale-[0.99]">
        <span>
          <span className="display block text-xl leading-tight">Start live analysis</span>
          <span className="block text-[13px] text-chalk-3">Phone on a tripod in the cage. Feedback after every swing.</span>
        </span>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M7 4l11 7-11 7z" fill="currentColor" /></svg>
      </Link>

      {sessions === null ? null : all.length > 0 ? (
        <>
          <SectionTitle right={<Link href="/progress" className="text-sm text-optic">Progress</Link>}>Your SwingIQ score</SectionTitle>
          <Panel className="flex items-center gap-5 p-5">
            <ArcScore score={overall} size={170} label="Last 20 swings" />
            <div className="min-w-0 flex-1 space-y-2 text-[15px]">
              {trend !== null ? (
                <p className={trend >= 0 ? "text-optic" : "text-amber"}>
                  <span className="num text-2xl">{trend >= 0 ? "+" : "−"}{Math.abs(trend)}</span> <span className="text-chalk-2">vs last week</span>
                </p>
              ) : (
                <p className="text-chalk-3">Trend shows after two weeks of swings.</p>
              )}
              {onTime !== null && (
                <p className="text-chalk-2">
                  Foot down on time <span className="num text-lg text-chalk">{onTime}%</span>
                </p>
              )}
            </div>
          </Panel>

          <SectionTitle right={<Link href="/swings" className="text-sm text-optic">All swings</Link>}>Recent swings</SectionTitle>
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-night-2">
            {all.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link href={`/swings/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-night-3">
                  <span className="num w-10 text-2xl text-chalk">{s.analysis.score.overall ?? "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-chalk-2">{s.analysis.cue.spoken}</span>
                    <span className="block text-[11px] text-chalk-3">
                      {fmtDate(s.at)} · {s.source === "video" ? "from video" : "live"}
                      {s.pb ? " · ★ best" : ""}
                    </span>
                  </span>
                  <span className="text-chalk-3" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ol>

          <SectionTitle>Personal records</SectionTitle>
          <Panel>
            <ul className="divide-y divide-line">
              <li>
                <Link href={best ? `/swings/${best.id}` : "/swings"} className="flex items-center justify-between px-4 py-3.5 hover:bg-night-3">
                  <span className="text-[15px]">Top score</span>
                  <span className="num text-2xl">{best?.analysis.score.overall ?? "—"}</span>
                </Link>
              </li>
              <li>
                {pb ? (
                  <Link href={`/compare?a=${all[0].id}&b=${pb.id}`} className="flex items-center justify-between px-4 py-3.5 hover:bg-night-3">
                    <span className="text-[15px]">Personal best swing<span className="block text-[12px] text-chalk-3">Compare your latest swing with it</span></span>
                    <span className="num text-2xl">{pb.analysis.score.overall ?? "★"}</span>
                  </Link>
                ) : (
                  <p className="px-4 py-3.5 text-[14px] text-chalk-3">Mark a swing as your personal best on its page to compare against it.</p>
                )}
              </li>
            </ul>
          </Panel>

          {last && (focus || lastCats.length > 0) && (
            <>
              <SectionTitle right={<Link href={`/swings?session=${last.id}`} className="text-sm text-optic">Review</Link>}>Last session · {fmtDate(last.startedAt)}</SectionTitle>
              {focus && (
                <Panel className="border-l-4 border-l-stitch p-4">
                  <p className="text-xs text-chalk-3">Work on this next · came up on {focus.n} of {lastSwings.length} swings</p>
                  <p className="mt-1 text-[15px] leading-snug">{focus.text}</p>
                </Panel>
              )}
              {lastCats.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 px-1 text-[14px] sm:grid-cols-3">
                  {lastCats.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-2">
                      <span className="text-chalk-2">{c.label}</span>
                      <span className={`num ${c.score >= 75 ? "text-optic" : c.score >= 50 ? "text-amber" : "text-stitch"}`}>{c.score}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <SectionTitle>Before your first swing</SectionTitle>
          <ul className="space-y-3 text-[15px] leading-snug text-chalk-2">
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-optic" />Phone 10–15 ft away, across the plate, facing your chest, at waist height.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-optic" />Whole body in the picture, head to shoes, with room for the bat.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-optic" />Record one swing to see your breakdown, or go live in the cage.</li>
          </ul>
          <Link href="/guide" className="mt-4 inline-block text-[15px] text-optic">Full setup guide →</Link>
        </>
      )}

      <div className="mt-10 border-t border-line pt-5 text-[13px] text-chalk-3">
        <Link href="/how-it-works" className="underline">How SwingIQ measures</Link> · <Link href="/bats" className="underline">Bat DNA</Link> · Bat speed, exit velocity and launch angle arrive with high-speed capture.
      </div>
    </div>
  );
}
