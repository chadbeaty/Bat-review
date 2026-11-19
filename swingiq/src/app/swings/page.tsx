"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePlayers } from "@/components/PlayerProvider";
import { ButtonLink, Empty, PageTitle, fmtDate, fmtTime } from "@/components/ui";
import { db } from "@/lib/store/db";
import type { Session, SwingRecord } from "@/lib/store/types";

const VIEW_LABEL = { side: "Side view", behind: "Behind view", front: "Front view" } as const;

function SwingsInner() {
  const { ready, player } = usePlayers();
  const params = useSearchParams();
  const router = useRouter();
  const sessionFilter = params.get("session");
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [swings, setSwings] = useState<SwingRecord[]>([]);

  useEffect(() => {
    if (!player) return;
    Promise.all([db.sessions(player.id), db.swingsForPlayer(player.id)])
      .then(([ss, sw]) => {
        setSessions(ss.filter((s) => s.swingCount > 0));
        setSwings(sw);
      })
      .catch(() => setSessions([]));
  }, [player]);

  const grouped = useMemo(() => {
    const by = new Map<string, SwingRecord[]>();
    for (const s of swings) by.set(s.sessionId, [...(by.get(s.sessionId) ?? []), s]);
    return (sessions ?? [])
      .filter((s) => !sessionFilter || s.id === sessionFilter)
      .map((s) => ({ session: s, swings: (by.get(s.id) ?? []).sort((a, b) => a.n - b.n) }))
      .filter((g) => g.swings.length);
  }, [sessions, swings, sessionFilter]);

  if (!ready) return null;
  if (!player)
    return (
      <>
        <PageTitle title="My Swings" />
        <Empty title="No hitter yet">Set one up on the Home screen first.</Empty>
      </>
    );

  return (
    <div className="animate-rise">
      <PageTitle
        title="My Swings"
        sub={sessions ? `${swings.length} swings · ${sessions.length} sessions` : " "}
        right={
          sessionFilter ? (
            <button type="button" onClick={() => router.push("/swings")} className="rounded-lg border border-line px-3 py-1.5 text-sm text-chalk-2">
              All sessions
            </button>
          ) : null
        }
      />
      {sessions !== null && grouped.length === 0 && (
        <Empty title="No swings yet">
          <p>Start a live session and every swing you take shows up here, with video and a frame-by-frame breakdown.</p>
          <ButtonLink href="/live" className="mt-5">Start live session</ButtonLink>
        </Empty>
      )}
      <div className="space-y-8">
        {grouped.map(({ session, swings: list }) => (
          <section key={session.id} aria-labelledby={`s-${session.id}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id={`s-${session.id}`} className="text-[17px] font-bold">
                {fmtDate(session.startedAt)} <span className="font-normal text-chalk-3">· {fmtTime(session.startedAt)}</span>
              </h2>
              <span className="text-[13px] text-chalk-3">
                {VIEW_LABEL[session.view]}
                {session.avgScore !== null && ` · avg ${session.avgScore}`}
              </span>
            </div>
            {session.notes && <p className="mb-3 text-[14px] italic text-chalk-2">“{session.notes}”</p>}
            <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-night-2">
              {list.map((s) => {
                const best = session.bestScore !== null && s.analysis.score.overall === session.bestScore;
                return (
                  <li key={s.id}>
                    <Link href={`/swings/${s.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-night-3">
                      <span className="w-8 text-sm text-chalk-3">#{s.n}</span>
                      <span className={`num w-12 text-2xl ${best ? "text-optic" : "text-chalk"}`}>{s.analysis.score.overall ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-chalk-2">{s.analysis.cue.spoken}</span>
                      {s.tag?.type && <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-chalk-2">{s.tag.type}</span>}
                      <span className="text-chalk-3" aria-hidden="true">›</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function SwingsPage() {
  return (
    <Suspense>
      <SwingsInner />
    </Suspense>
  );
}
