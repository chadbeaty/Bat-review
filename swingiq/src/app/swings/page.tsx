"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePlayers } from "@/components/PlayerProvider";
import { ButtonLink, Chip, Empty, PageSkeleton, PageTitle, fmtDate, fmtTime } from "@/components/ui";
import { SparkBars } from "@/components/viz/SparkBars";
import { speedOf } from "@/lib/insights";
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

  if (!ready) return <PageSkeleton />;
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
            <button type="button" onClick={() => router.push("/swings")} className="press rounded-lg border border-line-2 px-3 py-1.5 text-sm text-chalk-2 hover:text-chalk">
              All sessions
            </button>
          ) : swings.length >= 2 ? (
            <Link href="/compare" className="press rounded-lg border border-line-2 px-3 py-1.5 text-sm text-chalk-2 hover:text-chalk">
              Compare
            </Link>
          ) : null
        }
      />
      {sessions === null && <PageSkeleton />}
      {sessions !== null && grouped.length === 0 && (
        <Empty title="No swings yet">
          <p>Start a live session and every swing you take shows up here, with video and a frame-by-frame breakdown.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/record">Record a swing</ButtonLink>
            <ButtonLink href="/live" variant="ghost">Start live session</ButtonLink>
          </div>
        </Empty>
      )}
      <div className="space-y-9">
        {grouped.map(({ session, swings: list }) => (
          <section key={session.id} aria-labelledby={`s-${session.id}`}>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 id={`s-${session.id}`} className="head text-[17px]">
                  {fmtDate(session.startedAt)} <span className="font-sans text-[14px] font-normal text-chalk-3">· {fmtTime(session.startedAt)}</span>
                </h2>
                <p className="mt-0.5 text-[12px] text-chalk-3">
                  {session.kind === "video" ? "From video · " : "Live · "}
                  {VIEW_LABEL[session.view]} · {list.length} {list.length === 1 ? "swing" : "swings"}
                  {session.avgScore !== null && ` · avg ${session.avgScore}`}
                </p>
              </div>
              {list.length >= 3 && <SparkBars scores={list.map((x) => x.analysis.score.overall)} />}
            </div>
            {session.notes && <p className="mb-3 text-[14px] italic text-chalk-2">“{session.notes}”</p>}
            <ol className="surface divide-y divide-line overflow-hidden rounded-2xl">
              {list.map((s) => {
                const best = list.length > 1 && session.bestScore !== null && s.analysis.score.overall === session.bestScore;
                const ev = speedOf(s, "exitVelocity");
                return (
                  <li key={s.id}>
                    <Link href={`/swings/${s.id}`} className="press flex items-center gap-4 px-4 py-3.5 hover:bg-night-3">
                      <span className="w-8 text-[13px] text-chalk-3">#{s.n}</span>
                      <span className={`num w-11 text-[1.6rem] leading-none ${best ? "text-optic" : "text-chalk"}`}>{s.analysis.score.overall ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-chalk-2">{s.analysis.cue.spoken}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {s.pb && <Chip tone="optic"><span aria-label="Personal best">★</span></Chip>}
                        {ev && <Chip tone="optic">{Math.round(ev.v)} mph</Chip>}
                        {s.source === "video" && !ev && <Chip>video</Chip>}
                        {s.tag?.type && <Chip>{s.tag.type}</Chip>}
                      </span>
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
