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
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!player) return;
    (async () => {
      const ss = (await db.sessions(player.id)).filter((s) => s.swingCount > 0);
      setSessions(ss);
      if (ss[0]) setLastSwings(await db.swingsInSession(ss[0].id));
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
  const week = (sessions ?? []).filter((s) => s.startedAt >= weekAgo);
  const weekSwings = week.reduce((a, s) => a + s.swingCount, 0);
  const weekBest = week.reduce<number | null>((b, s) => (s.bestScore !== null && (b === null || s.bestScore > b) ? s.bestScore : b), null);
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
      <div className="flex items-center justify-between pt-2">
        <p className="flex items-center gap-2 text-sm font-bold text-optic">
          <Softball size={18} /> SwingIQ Live
        </p>
        <Link href="/profile" className="rounded-lg border border-line px-3 py-1.5 text-sm text-chalk-2">
          {player.name} · {player.hand === "R" ? "Righty" : "Lefty"}
        </Link>
      </div>

      <Link
        href="/live"
        className="group mt-6 flex items-center justify-between gap-4 rounded-3xl bg-optic p-6 text-optic-ink transition active:scale-[0.99]"
      >
        <span>
          <span className="display block text-[1.9rem] leading-[1.02]">Start live session</span>
          <span className="mt-2 block text-[15px] font-semibold opacity-75">Phone on the tripod. Every swing caught.</span>
        </span>
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-optic-ink transition group-hover:rotate-12">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <path d="M8 4l14 9-14 9z" fill="#e4f542" />
          </svg>
        </span>
      </Link>

      {sessions === null ? null : last ? (
        <>
          <SectionTitle right={<Link href={`/swings?session=${last.id}`} className="text-sm text-optic">Review</Link>}>Last session</SectionTitle>
          <Panel className="flex items-center gap-5 p-5">
            <ArcScore score={last.avgScore} size={170} label="Average score" />
            <div className="min-w-0 flex-1 space-y-2 text-[15px]">
              <p className="text-chalk-2">{fmtDate(last.startedAt)}</p>
              <p>
                <span className="num text-2xl">{last.swingCount}</span> <span className="text-chalk-2">swings</span>
              </p>
              {last.bestScore !== null && (
                <p className="text-chalk-2">
                  Best <span className="num text-lg text-chalk">{last.bestScore}</span>
                </p>
              )}
            </div>
          </Panel>
          {focus && (
            <Panel className="mt-3 border-l-4 border-l-stitch p-4">
              <p className="text-xs text-chalk-3">Work on this next</p>
              <p className="mt-1 text-[15px] leading-snug">{focus.text}</p>
            </Panel>
          )}

          <SectionTitle>This week</SectionTitle>
          <p className="text-[17px] leading-relaxed text-chalk-2">
            <span className="num text-2xl text-chalk">{weekSwings}</span> swings across{" "}
            <span className="num text-2xl text-chalk">{week.length}</span> {week.length === 1 ? "session" : "sessions"}
            {weekBest !== null && (
              <>
                . Best score <span className="num text-2xl text-optic">{weekBest}</span>
              </>
            )}
            .
          </p>
        </>
      ) : (
        <>
          <SectionTitle>Before your first session</SectionTitle>
          <ul className="space-y-3 text-[15px] leading-snug text-chalk-2">
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-optic" />Tripod about 10–15 ft away, across the plate, facing your chest. Phone at waist height.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-optic" />Whole body in the picture, head to feet, with room for the bat.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-optic" />Bright light helps. Behind netting is fine.</li>
          </ul>
          <Link href="/guide" className="mt-4 inline-block text-[15px] text-optic">Full setup guide →</Link>
        </>
      )}

      <div className="mt-10 border-t border-line pt-5 text-[13px] text-chalk-3">
        <Link href="/how-it-works" className="underline">How SwingIQ measures</Link> · Bat speed, exit velocity and launch angle arrive with the high-speed iPhone app.
      </div>
    </div>
  );
}
