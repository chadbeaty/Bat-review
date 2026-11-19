"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArcScore } from "@/components/ArcScore";
import { ClipPlayer } from "@/components/ClipPlayer";
import { CueLine, GroupedMetrics, averageMetrics } from "@/components/Metrics";
import { usePlayers } from "@/components/PlayerProvider";
import { Button, Panel, Segmented, SectionTitle, fmtDate, fmtTime } from "@/components/ui";
import { METRICS } from "@/engine/catalog";
import { EXTERNAL_LIMITS, applyExternal, validExternal, type ExternalKey } from "@/engine/external";
import type { HitDirection, HitType, MetricKey } from "@/engine/types";
import { db } from "@/lib/store/db";
import type { ClipRecord, SwingRecord } from "@/lib/store/types";

const TYPES: { value: HitType; label: string }[] = [
  { value: "grounder", label: "Grounder" },
  { value: "liner", label: "Liner" },
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

  useEffect(() => {
    (async () => {
      const s = (await db.swing(id)) ?? null;
      setSwing(s);
      if (!s) return;
      setNote(s.note ?? "");
      setClip((await db.clip(id)) ?? null);
      const all = await db.swingsForPlayer(s.playerId);
      setAverages(averageMetrics(all.filter((x) => x.id !== s.id).slice(0, 50).map((x) => x.analysis.metrics)));
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

  async function removeVideo() {
    if (!swing || !confirm("Delete the video for this swing? The tracking data and numbers stay.")) return;
    await db.deleteClip(swing.id);
    setClip(null);
    await update({ clipFrames: 0 });
  }

  if (swing === undefined) return null;
  if (swing === null)
    return (
      <div className="pt-10 text-center">
        <p className="text-lg font-bold">Swing not found</p>
        <Link href="/swings" className="mt-3 inline-block text-optic">Back to My Swings</Link>
      </div>
    );

  const a = swing.analysis;
  return (
    <div className="animate-rise pb-10">
      <div className="flex items-center justify-between pt-2">
        <Link href={`/swings?session=${swing.sessionId}`} className="-ml-2 rounded-lg px-2 py-2 text-[15px] text-chalk-2 hover:text-chalk">← Session</Link>
        <span className="text-[13px] text-chalk-3">{fmtDate(swing.at)} · {fmtTime(swing.at)}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-4">
        <h1 className="display text-[2rem] leading-none">Swing {swing.n}</h1>
        {player && swing.playerId !== player.id && <span className="text-xs text-chalk-3">Another hitter&apos;s swing</span>}
      </div>

      <div className="mt-5 md:grid md:grid-cols-[1.2fr_1fr] md:gap-8">
        <div>
          {clip === undefined ? (
            <div className="rounded-2xl border border-line bg-night-2" style={{ aspectRatio: `${swing.frameSize.width} / ${swing.frameSize.height}`, maxHeight: "68dvh" }} />
          ) : (
            <ClipPlayer key={`${swing.id}-${clip ? "v" : "p"}`} pose={swing.pose} frames={clip?.frames ?? null} phases={a.phases} frameSize={swing.frameSize} handPath={a.handPath} hand={swing.hand} />
          )}
        </div>
        <div>
          <Panel className="mt-6 flex items-center gap-4 p-4 md:mt-0">
            <ArcScore score={a.score.overall} size={150} />
            <div className="min-w-0 flex-1">
              <CueLine cue={a.cue} />
            </div>
          </Panel>
          {a.observations.length > 1 && (
            <div className="mt-4 space-y-2.5">
              {a.observations.slice(1, 4).map((c) => (
                <CueLine key={c.id} cue={c} />
              ))}
            </div>
          )}
          {a.score.components.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs text-chalk-3">What went into the score</p>
              <ul className="space-y-2">
                {a.score.components.map((c) => (
                  <li key={c.key} className="flex items-center gap-3 text-[13px]">
                    <span className="w-36 shrink-0 text-chalk-2">{c.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-night-4">
                      <span className={`block h-full ${c.score >= 75 ? "bg-optic" : c.score >= 50 ? "bg-amber" : "bg-stitch"}`} style={{ width: `${c.score}%` }} />
                    </span>
                    <span className="num w-8 text-right text-chalk">{c.score}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <SectionTitle>Numbers</SectionTitle>
      <p className="-mt-1 mb-2 text-[13px] text-chalk-3">Tap any row for what it means and exactly how it was measured.</p>
      <GroupedMetrics metrics={metrics} averages={averages} />

      <SectionTitle>How did it go?</SectionTitle>
      <p className="-mt-1 mb-3 text-[13px] text-chalk-3">Tag the result. It feeds your spray chart and Swing DNA.</p>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Result">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={swing.tag?.type === t.value}
              onClick={() => update({ tag: { ...swing.tag, type: swing.tag?.type === t.value ? undefined : t.value } })}
              className={`min-h-10 rounded-xl border px-3 text-sm ${swing.tag?.type === t.value ? "border-optic bg-night-3 text-chalk" : "border-line text-chalk-2"}`}
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
