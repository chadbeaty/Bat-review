"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArcScore } from "@/components/ArcScore";
import { ClipPlayer } from "@/components/ClipPlayer";
import { CueLine, GroupedMetrics, averageMetrics } from "@/components/Metrics";
import { CoachCard, CompareLink, ScoreCategories, SourceBadge } from "@/components/ScoreParts";
import { SpeedCard } from "@/components/SpeedCard";
import { PhaseLine } from "@/components/viz/PhaseLine";
import { speedOf } from "@/lib/insights";
import { usePlayers } from "@/components/PlayerProvider";
import { Button, InfoTip, PageSkeleton, Panel, PillarStrip, Segmented, SectionTitle, SourceLegend, fmtDate, fmtTime } from "@/components/ui";
import { METRICS } from "@/engine/catalog";
import { coachingFor } from "@/engine/coaching";
import { EXTERNAL_LIMITS, applyExternal, validExternal, type ExternalKey } from "@/engine/external";
import type { HitDirection, HitType, MetricKey } from "@/engine/types";
import { db } from "@/lib/store/db";
import type { Bat, ClipRecord, SwingRecord } from "@/lib/store/types";

const TYPES: { value: HitType; label: string }[] = [
  { value: "grounder", label: "Grounder" },
  { value: "liner", label: "Line drive" },
  { value: "fly", label: "Fly ball" },
  { value: "popup", label: "Pop-up" },
  { value: "foul", label: "Foul" },
  { value: "miss", label: "Miss" },
];
const DIRS: { value: HitDirection; label: string }[] = [
  { value: "pull", label: "Pull" },
  { value: "center", label: "Middle" },
  { value: "oppo", label: "Oppo" },
];

export default function SwingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { player } = usePlayers();
  const [swing, setSwing] = useState<SwingRecord | null | undefined>(undefined);
  const [clip, setClip] = useState<ClipRecord | null | undefined>(undefined);
  const [averages, setAverages] = useState<Partial<Record<MetricKey, number>>>({});
  const [note, setNote] = useState("");
  const [extKey, setExtKey] = useState<ExternalKey>("exitVelocity");
  const [extVal, setExtVal] = useState("");
  const [extDevice, setExtDevice] = useState("");
  const [extErr, setExtErr] = useState<string | null>(null);
  const [bats, setBats] = useState<Bat[]>([]);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [pbId, setPbId] = useState<string | null>(null);
  const [hist, setHist] = useState<{ ev: number[]; bat: number[] }>({ ev: [], bat: [] });

  useEffect(() => {
    (async () => {
      const s = (await db.swing(id)) ?? null;
      setSwing(s);
      if (!s) return;
      setNote(s.note ?? "");
      setClip((await db.clip(id)) ?? null);
      const all = await db.swingsForPlayer(s.playerId);
      setAverages(averageMetrics(all.filter((x) => x.id !== s.id).slice(0, 50).map((x) => x.analysis.metrics)));
      // all is newest first: the previous swing is the next one in the list after this one.
      const i = all.findIndex((x) => x.id === s.id);
      setPrevId(i >= 0 && i + 1 < all.length ? all[i + 1].id : null);
      setPbId(all.find((x) => x.pb)?.id ?? null);
      setHist({
        ev: all.map((x) => speedOf(x, "exitVelocity")?.v).filter((v): v is number => v !== undefined),
        bat: all.map((x) => speedOf(x, "batSpeed")?.v).filter((v): v is number => v !== undefined),
      });
      setBats(await db.bats(s.playerId));
      if (s.batId === undefined) {
        const sess = await db.session(s.sessionId);
        if (sess?.batId) setSwing({ ...s, batId: sess.batId });
      }
    })().catch(() => setSwing(null));
  }, [id]);

  const metrics = useMemo(() => (swing ? applyExternal(swing.analysis.metrics, swing.external) : {}), [swing]);

  async function update(patch: Partial<SwingRecord>) {
    if (!swing) return;
    const next = { ...swing, ...patch, syncedAt: null };
    setSwing(next);
    await db.saveSwing(next);
  }

  async function addExternal(e: React.FormEvent) {
    e.preventDefault();
    if (!swing) return;
    const value = Number(extVal);
    if (!validExternal({ key: extKey, value })) {
      const l = EXTERNAL_LIMITS[extKey];
      return setExtErr(`Enter a number between ${l.min} and ${l.max}.`);
    }
    if (!extDevice.trim()) return setExtErr("Which device measured it?");
    setExtErr(null);
    const rest = (swing.external ?? []).filter((x) => x.key !== extKey);
    await update({ external: [...rest, { key: extKey, value, device: extDevice.trim().slice(0, 40), via: "manual", enteredAt: Date.now() }] });
    setExtVal("");
  }

  async function remove() {
    if (!swing || !confirm("Delete this swing and its video? This can't be undone.")) return;
    await db.deleteSwing(swing.id);
    const sess = await db.session(swing.sessionId);
    if (sess) {
      const left = await db.swingsInSession(sess.id);
      const scores = left.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
      await db.saveSession({
        ...sess,
        swingCount: left.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      });
    }
    router.push("/swings");
  }

  async function togglePb() {
    if (!swing) return;
    const on = !swing.pb;
    if (on) {
      // One personal best per hitter: unmark the old one.
      for (const x of await db.swingsForPlayer(swing.playerId)) if (x.pb && x.id !== swing.id) await db.saveSwing({ ...x, pb: false });
    }
    await update({ pb: on });
    setPbId(on ? swing.id : null);
  }

  async function removeVideo() {
    if (!swing || !confirm("Delete the video for this swing? The tracking data and numbers stay.")) return;
    await db.deleteClip(swing.id);
    setClip(null);
    await update({ clipFrames: 0 });
  }

  if (swing === undefined) return <PageSkeleton />;
  if (swing === null)
    return (
      <div className="pt-10 text-center">
        <p className="head text-lg">Swing not found</p>
        <Link href="/swings" className="mt-3 inline-block text-optic">Back to My Swings</Link>
      </div>
    );

  const a = swing.analysis;
  return (
    <div className="animate-rise pb-10">
      <div className="flex items-center justify-between pt-3">
        <Link href={`/swings?session=${swing.sessionId}`} className="press -ml-2 rounded-lg px-2 py-2 text-[14px] text-chalk-2 hover:text-chalk">
          ← Session
        </Link>
        <span className="text-[13px] text-chalk-3">
          {fmtDate(swing.at)} · {fmtTime(swing.at)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <PillarStrip active="analyze" className="mb-3" />
          <p className="label">Swing report</p>
          <h1 className="display mt-1 text-[2.4rem] md:text-[2.9rem]">Swing {swing.n}</h1>
        </div>
        <button
          type="button"
          onClick={togglePb}
          aria-pressed={!!swing.pb}
          className={`press min-h-10 rounded-lg border px-3 text-sm ${swing.pb ? "border-optic bg-optic font-bold text-optic-ink" : "border-line-2 text-chalk-2 hover:text-chalk"}`}
        >
          {swing.pb ? "★ Personal best" : "☆ Mark as personal best"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SourceBadge source={swing.source} />
        {swing.source === "video" && swing.slowMo && swing.slowMo > 1 && <span className="text-[11px] text-chalk-3">slow motion corrected {swing.slowMo}×</span>}
        <span className="text-[11px] text-chalk-3">{swing.view === "side" ? "Side view" : swing.view === "behind" ? "Behind view" : "Front view"}</span>
        {player && swing.playerId !== player.id && <span className="text-xs text-chalk-3">Another hitter&apos;s swing</span>}
      </div>

      <div className="mt-5 md:grid md:grid-cols-[1.1fr_1fr] md:items-start md:gap-8">
        <div className="md:sticky md:top-6">
          {clip === undefined ? (
            <div className="skel rounded-2xl" style={{ aspectRatio: `${swing.frameSize.width} / ${swing.frameSize.height}`, maxHeight: "68dvh" }} />
          ) : (
            <ClipPlayer key={`${swing.id}-${clip ? "v" : "p"}`} pose={swing.pose} frames={clip?.frames ?? null} phases={a.phases} frameSize={swing.frameSize} handPath={a.handPath} hand={swing.hand} />
          )}
        </div>
        <div>
          <Panel boxed className="carbon mt-6 p-4 md:mt-0">
            <div className="flex items-center gap-4">
              <ArcScore score={a.score.overall} size={150} />
              <div className="min-w-0 flex-1">
                <CueLine cue={a.cue} />
              </div>
            </div>
            {a.observations.length > 1 && (
              <div className="mt-4 space-y-2.5 border-t border-line pt-4">
                {a.observations.slice(1, 4).map((c) => (
                  <CueLine key={c.id} cue={c} />
                ))}
              </div>
            )}
          </Panel>
          <div className="mt-4">
            <SpeedCard metrics={a.metrics} source={swing.source} history={hist} />
          </div>
          <Panel className="mt-4 p-4">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="head text-[15px]">Load-to-contact timing</h2>
              <InfoTip label="load-to-contact timing">
                Each move in time, from load to contact at the right. Slow-pitch hitters who time the arc well land the front foot about 0.14 to 0.38 seconds before contact (the shaded window).
              </InfoTip>
            </div>
            <PhaseLine phases={a.phases} />
          </Panel>
          <Panel className="mt-4 p-4">
            <ScoreCategories analysis={a} view={swing.view} />
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <CoachCard
          analysis={a}
          action={
            <Link
              href={`/live?challenge=${encodeURIComponent(coachingFor(a.cue, a.metrics, a.score.overall).issueId)}${a.score.overall !== null ? `&target=${Math.max(0, a.score.overall - 5)}` : ""}`}
              className="btn-label press inline-flex min-h-11 items-center rounded-lg bg-optic px-4 text-[14px] text-optic-ink hover:bg-optic-2"
            >
              Take the challenge live
            </Link>
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {prevId && <CompareLink a={swing.id} b={prevId}>Compare with previous swing</CompareLink>}
        {pbId && pbId !== swing.id && <CompareLink a={swing.id} b={pbId}>Compare with my best</CompareLink>}
      </div>

      {bats.length > 0 && (
        <div className="mt-6">
          <label htmlFor="sbat" className="mb-2 block text-sm text-chalk-2">Bat used</label>
          <select
            id="sbat"
            value={swing.batId ?? ""}
            onChange={(e) => update({ batId: e.target.value || null })}
            className="min-h-12 w-full max-w-sm rounded-xl border border-line-2 bg-night-2 px-3 text-[16px] text-chalk"
          >
            <option value="">No bat recorded</option>
            {bats.map((b) => (
              <option key={b.id} value={b.id}>{b.brand} {b.model}</option>
            ))}
          </select>
        </div>
      )}

      <SectionTitle>Numbers</SectionTitle>
      <p className="-mt-1 mb-2 text-[13px] text-chalk-3">Tap any row for what it means and exactly how it was measured. Every number says where it came from:</p>
      <div className="mb-3"><SourceLegend kinds={["measured", "estimate", "slomo", "sensor", "none"]} /></div>
      <GroupedMetrics metrics={metrics} averages={averages} />

      <SectionTitle>Tag the hit</SectionTitle>
      <p className="-mt-1 mb-3 text-[13px] text-chalk-3">Line drive, grounder, fly ball? Pull side, middle or opposite field? Your tags build your line-drive rate and hitting tendencies (a cage net stops the ball, so Gapper can&apos;t see where it lands).</p>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Result">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={swing.tag?.type === t.value}
              onClick={() => update({ tag: { ...swing.tag, type: swing.tag?.type === t.value ? undefined : t.value } })}
              className={`press min-h-10 rounded-xl border px-3 text-sm ${swing.tag?.type === t.value ? "border-optic bg-optic-wash text-chalk" : "border-line-2 text-chalk-2 hover:text-chalk"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Segmented
          label="Direction"
          value={swing.tag?.direction ?? ("" as HitDirection)}
          options={DIRS}
          onChange={(d) => update({ tag: { ...swing.tag, direction: d } })}
        />
      </div>

      <SectionTitle>Add a sensor or radar reading</SectionTitle>
      <form onSubmit={addExternal} className="space-y-3">
        <p className="text-[13px] text-chalk-3">Got a Pocket Radar, bat sensor or launch monitor? Enter its number here and it shows up as a sensor reading.</p>
        <div className="flex gap-2">
          <select aria-label="Measurement" value={extKey} onChange={(e) => setExtKey(e.target.value as ExternalKey)} className="min-h-12 flex-1 rounded-xl border border-line bg-night-2 px-3 text-[16px]">
            {(Object.keys(EXTERNAL_LIMITS) as ExternalKey[]).map((k) => (
              <option key={k} value={k}>{METRICS[k].label}</option>
            ))}
          </select>
          <label className="flex w-32 items-center gap-1 rounded-xl border border-line bg-night-2 px-3">
            <input inputMode="decimal" aria-label="Value" value={extVal} onChange={(e) => setExtVal(e.target.value)} className="min-h-12 w-full bg-transparent text-[16px] focus:outline-none" />
            <span className="text-sm text-chalk-3">{METRICS[extKey].suffix}</span>
          </label>
        </div>
        <div className="flex gap-2">
          <input aria-label="Device" placeholder="Device, e.g. Pocket Radar" value={extDevice} onChange={(e) => setExtDevice(e.target.value)} className="min-h-12 flex-1 rounded-xl border border-line bg-night-2 px-3 text-[16px] placeholder:text-chalk-3" />
          <Button type="submit" variant="ghost">Add</Button>
        </div>
        {extErr && <p role="alert" className="text-sm text-stitch">{extErr}</p>}
      </form>

      <SectionTitle>Note</SectionTitle>
      <textarea
        aria-label="Note for this swing"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => update({ note: note.slice(0, 1000) })}
        rows={2}
        className="w-full rounded-xl border border-line bg-night-2 p-3 text-[16px] placeholder:text-chalk-3 focus:border-chalk-3 focus:outline-none"
        placeholder="What did it feel like?"
      />

      <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
        {clip && <Button variant="ghost" onClick={removeVideo}>Delete video only</Button>}
        <Button variant="danger" onClick={remove}>Delete swing</Button>
      </div>
      <p className="mt-4 text-xs text-chalk-3">
        Tracking {Math.round(a.quality.poseFps)} fps · camera {Math.round(a.quality.cameraFps)} fps · {a.quality.feetVisible ? "full body" : "feet not visible"} · contact from{" "}
        {a.phases.contactSource === "audio" ? "sound" : "hand speed"}
      </p>
    </div>
  );
}
