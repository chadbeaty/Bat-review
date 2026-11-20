"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArcScore } from "./ArcScore";
import { GapMark } from "./Logo";
import { SprayChart } from "./SprayChart";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { Button, InfoTip, Panel, SectionTitle, Sheet, SourceLegend } from "./ui";
import { sessionSeries, speedOf } from "@/lib/insights";
import { buildProfile } from "@/lib/profile";
import { reportBlob } from "@/lib/report";
import { db } from "@/lib/store/db";
import { GOAL_LABEL, LEVEL_LABEL, type Player, type Session, type SwingRecord } from "@/lib/store/types";

/**
 * My Hitting Profile: who you are as a hitter, from every swing you've recorded. The season line, your score over
 * time, where you hit it, what you do well, the drills for what keeps showing up, and a report card to share.
 */
export function HittingProfile({ player }: { player: Player }) {
  const [data, setData] = useState<{ swings: SwingRecord[]; sessions: Session[] } | null>(null);
  const [report, setReport] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([db.swingsForPlayer(player.id), db.sessions(player.id)])
      .then(([swings, sessions]) => live && setData({ swings, sessions }))
      .catch(() => live && setData({ swings: [], sessions: [] }));
    return () => {
      live = false;
    };
  }, [player.id]);

  useEffect(() => () => {
    if (report) URL.revokeObjectURL(report.url);
  }, [report]);

  const profile = useMemo(() => (data ? buildProfile(data.swings, data.sessions) : null), [data]);
  const points: TrendPoint[] = useMemo(() => {
    if (!data) return [];
    const label = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return sessionSeries(data.sessions, data.swings)
      .filter((p) => p.avg !== null)
      .map((p) => ({ x: p.t, y: p.avg!, lo: p.lo, hi: p.hi, n: p.n, label: label(p.t) }));
  }, [data]);

  async function makeReport() {
    if (!profile) return;
    setBusy(true);
    try {
      const blob = await reportBlob(player, profile);
      setReport({ blob, url: URL.createObjectURL(blob) });
    } finally {
      setBusy(false);
    }
  }
  const fileName = `gapper-${player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.png`;
  async function share() {
    if (!report) return;
    const file = new File([report.blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${player.name}'s Gapper report` }).catch(() => {});
    } else {
      download();
    }
  }
  function download() {
    if (!report) return;
    const a = document.createElement("a");
    a.href = report.url;
    a.download = fileName;
    a.click();
  }

  const facts = [
    `Bats ${player.hand === "R" ? "right" : "left"}`,
    `${Math.floor(player.heightIn / 12)}′${player.heightIn % 12}″`,
    player.level ? LEVEL_LABEL[player.level] : null,
    player.positions?.length ? player.positions.join(", ") : null,
  ].filter(Boolean);

  return (
    <section aria-labelledby="hp-title">
      {/* The card */}
      <div className="carbon boxed relative overflow-hidden rounded-2xl p-5 md:p-6">
        <GapMark size={360} ink="#ffffff" accent="#ffffff" className="pointer-events-none absolute -right-24 -top-8 opacity-[0.035]" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="label">Hitter</p>
            <h2 id="hp-title" className="display mt-1.5 max-w-full truncate text-[2.6rem] md:text-[3.2rem]">{player.name}</h2>
            <p className="mt-2 text-[14px] text-chalk-2">{facts.join(" · ")}</p>
            {player.goals?.length ? (
              <p className="mt-3 flex flex-wrap gap-1.5">
                {player.goals.map((g) => (
                  <span key={g} className="rounded-md border border-line-2 px-2 py-0.5 text-[12px] text-chalk-2">{GOAL_LABEL[g]}</span>
                ))}
              </p>
            ) : null}
          </div>
          <ArcScore score={profile?.avgScore ?? null} size={168} label="Average score" />
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4">
          <Button onClick={makeReport} disabled={!profile || profile.swings === 0 || busy}>
            {busy ? "Drawing…" : "Share player report"}
          </Button>
          <span className="text-[12px] text-chalk-3">{profile && profile.swings === 0 ? "Record a swing first. The report is built from your own numbers." : "One image with your numbers, ready to text to a coach or your team."}</span>
        </div>
      </div>

      {/* The season line */}
      <SectionTitle right={<InfoTip label="the season line">Totals from every swing on this phone. Front foot on time is estimated from body tracking; line-drive rate and tendencies come from the hits you tag; exit velo only from slo-mo video or your own radar.</InfoTip>}>Season line</SectionTitle>
      <div className="surface overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[34rem] text-left">
          <thead>
            <tr className="label border-b border-line">
              {["Swings", "Sessions", "Avg", "Best", "Foot on time", "Repeat", "Line drives", "Top EV"].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 font-bold first:pl-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="num text-[1.35rem]">
              <td className="px-3 py-3 first:pl-4">{profile?.swings ?? "—"}</td>
              <td className="px-3 py-3">{profile?.sessions ?? "—"}</td>
              <td className="px-3 py-3">{profile?.avgScore ?? "—"}</td>
              <td className="px-3 py-3 text-optic">{profile?.bestScore ?? "—"}</td>
              <td className="px-3 py-3">{profile?.footOnTime == null ? "—" : `${profile.footOnTime}%`}</td>
              <td className="px-3 py-3">{profile?.repeatability ?? "—"}</td>
              <td className="px-3 py-3">{profile?.lineDriveRate == null ? "—" : `${profile.lineDriveRate}%`}</td>
              <td className="px-3 py-3">{profile?.topEv ? <>{Math.round(profile.topEv.v)}<span className="ml-1 text-[12px] font-semibold text-chalk-3">mph</span></> : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2.5"><SourceLegend kinds={["measured", "estimate", "slomo", "sensor"]} /></div>

      {/* History */}
      <SectionTitle>Score history</SectionTitle>
      <Panel className="p-4">
        {points.length >= 1 ? (
          <>
            <TrendChart title="Gapper Score by session" points={points} unit="pts" />
            {points.length >= 2 && <p className="mt-2 text-[12px] text-chalk-3">Line: session average. Shaded: worst to best swing that day.</p>}
          </>
        ) : (
          <p className="text-[14px] text-chalk-3">Your score history starts with your first session.</p>
        )}
        <Link href="/progress" className="mt-3 inline-block text-[13px] font-semibold text-optic">Every metric over time →</Link>
      </Panel>

      {/* Strengths and work-ons */}
      <SectionTitle>Strengths and what to work on</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="p-4">
          <p className="label">Strengths</p>
          {profile?.strengths.length ? (
            <ul className="mt-2 space-y-2">
              {profile.strengths.map((c) => (
                <li key={c.key} className="flex items-baseline justify-between gap-3">
                  <span className="brandline text-[20px]">{c.label}</span>
                  <span className="num text-[1.5rem] text-optic">{c.avg}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-chalk-3">Shows up after a few swings score 70 or better in an area.</p>
          )}
        </Panel>
        <Panel className="p-4">
          <p className="label">Working on</p>
          {profile?.workOns.length ? (
            <ul className="mt-2 space-y-2">
              {profile.workOns.map((c) => (
                <li key={c.key} className="flex items-baseline justify-between gap-3">
                  <span className="brandline text-[20px]">{c.label}</span>
                  <span className="num text-[1.5rem] text-stitch">{c.avg}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-chalk-3">Nothing stands out yet. Keep swinging.</p>
          )}
        </Panel>
      </div>

      {/* Tendencies */}
      <SectionTitle>Tendencies</SectionTitle>
      <Panel className="p-4">
        {profile?.spray && (
          <p className="mb-3 text-[14px] text-chalk-2">
            Pull side <b className="num text-chalk">{profile.spray.pull}%</b> · Middle <b className="num text-chalk">{profile.spray.center}%</b> · Opposite field <b className="num text-chalk">{profile.spray.oppo}%</b>
            {profile.lineDriveRate !== null && <> · Line drives <b className="num text-optic">{profile.lineDriveRate}%</b></>}
          </p>
        )}
        <SprayChart hand={player.hand} tags={(data?.swings ?? []).map((s) => ({ ...(s.tag ?? {}), ev: speedOf(s, "exitVelocity")?.v ?? null }))} />
      </Panel>

      {/* Drills */}
      <SectionTitle id="drills">Your drills</SectionTitle>
      {profile?.drills.length ? (
        <ol className="space-y-3">
          {profile.drills.map((d, i) => (
            <li key={d.issueId}>
              <Panel className="relative overflow-hidden p-4 pl-5">
                <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r ${i === 0 ? "bg-stitch" : "bg-line-2"}`} aria-hidden="true" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="head text-[17px]">{d.drill.name}</h3>
                  <span className="text-[12px] text-chalk-3">For: {d.title.toLowerCase()} · {d.count} of last {d.of} swings</span>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-chalk-2">{d.drill.how}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-chalk-3">{d.why}</p>
                <Link href={`/live?challenge=${encodeURIComponent(d.issueId)}`} className="mt-3 inline-block text-[13px] font-semibold text-optic">Take the 10-swing challenge live →</Link>
              </Panel>
            </li>
          ))}
        </ol>
      ) : (
        <Panel className="p-4">
          <p className="text-[14px] text-chalk-3">Your drills come from the faults that keep showing up in your swings. Record a few and they&apos;ll appear here.</p>
        </Panel>
      )}

      <Sheet open={report !== null} onClose={() => setReport(null)} title="Your player report">
        {report && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={report.url} alt={`${player.name}'s Gapper player report`} className="mx-auto max-h-[58dvh] w-auto rounded-lg border border-line" />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={share}>Share</Button>
              <Button variant="ghost" onClick={download}>Save image</Button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}
