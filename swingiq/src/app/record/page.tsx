"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CueLine } from "@/components/Metrics";
import { PlayerForm } from "@/components/PlayerForm";
import { usePlayers } from "@/components/PlayerProvider";
import { Button, PageTitle, Panel, SectionTitle, Segmented } from "@/components/ui";
import { ViewPicker, viewNote } from "@/components/live/ViewPicker";
import { SOFTBALL_11, SOFTBALL_12 } from "@/engine/ballflight";
import type { CameraView } from "@/engine/types";
import { analyzeVideo, MAX_VIDEO_SECONDS, VideoFormatError, type VideoAnalysisResult } from "@/live/videoAnalyzer";
import { compactPose, db, uid } from "@/lib/store/db";
import type { Bat, Session, SwingRecord } from "@/lib/store/types";

type Stage = "choose" | "processing" | "done" | "error";
const SLOWMO: { value: "1" | "4" | "8"; label: string }[] = [
  { value: "1", label: "Normal" },
  { value: "4", label: "120 fps · 4×" },
  { value: "8", label: "240 fps · 8×" },
];

function SpeedLine({ m }: { m: SwingRecord["analysis"]["metrics"] }) {
  const ev = m.exitVelocity;
  const bat = m.batSpeed;
  if (!ev || ev.source === "unavailable" || ev.value === null) return null;
  return (
    <span className="mt-1 block text-[13px] text-optic">
      Exit velo {Math.round(ev.value)} mph
      {bat && bat.source !== "unavailable" && bat.value !== null ? ` · bat ${Math.round(bat.value)} mph` : ""}
    </span>
  );
}

export default function RecordPage() {
  const { ready, player, settings, savePlayer, updateSettings } = usePlayers();
  const [stage, setStage] = useState<Stage>("choose");
  const [view, setView] = useState<CameraView>(settings.lastView);
  const [bats, setBats] = useState<Bat[]>([]);
  const [batId, setBatId] = useState<string>("");
  const [slowMo, setSlowMo] = useState<"1" | "4" | "8">("1");
  const [ballSize, setBallSize] = useState<"12" | "11">("12");
  const [note, setNote] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState({ f: 0, stage: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ result: VideoAnalysisResult; swings: SwingRecord[] } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!player) return;
    db.bats(player.id).then(setBats).catch(() => setBats([]));
  }, [player]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run(f: File, factor: number, retried = false) {
    if (!player) return;
    setFile(f);
    setError(null);
    setSaved(null);
    if (!retried) setNote(null);
    setStage("processing");
    setProgress({ f: 0, stage: "Opening your video…" });
    await updateSettings({ lastView: view });
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const prior = (await db.swingsForPlayer(player.id)).slice(0, 5).map((s) => s.analysis.metrics);
      const result = await analyzeVideo({
        file: f,
        view,
        hand: player.hand,
        heightIn: player.heightIn,
        quality: settings.modelQuality,
        slowMo: factor,
        previous: () => prior,
        onProgress: (fr, st) => setProgress({ f: fr, stage: st }),
        signal: ac.signal,
        videoEl: videoRef.current,
        ball: ballSize === "11" ? SOFTBALL_11 : SOFTBALL_12,
        certification: bats.find((b) => b.id === batId)?.certification,
      });
      (window as unknown as { __swingiqVideo?: unknown }).__swingiqVideo = {
        ...result.debug,
        fps: result.fps,
        coverage: result.coverage,
        timeBaseFix: result.timeBaseFix,
      };
      // The pitch's fall says the slow-motion setting was wrong: fix it and go again (once).
      if (result.timeBaseFix && !retried) {
        const nf = factor * result.timeBaseFix;
        if ([1, 2, 4, 8, 16].includes(nf)) {
          if (nf === 1 || nf === 4 || nf === 8) setSlowMo(String(nf) as "1" | "4" | "8");
          setNote(nf === 1 ? "That video was normal speed, so it was re-analyzed as normal speed." : `That video was ${nf}× slow motion, so it was re-analyzed at ${nf}×.`);
          abortRef.current = null;
          return run(f, nf, true);
        }
      }
      const records: SwingRecord[] = [];
      if (result.swings.length) {
        const scores = result.swings.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
        const sess: Session = {
          id: uid(),
          playerId: player.id,
          kind: "video",
          view,
          startedAt: Date.now(),
          endedAt: Date.now(),
          swingCount: result.swings.length,
          bestScore: scores.length ? Math.max(...scores) : null,
          avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
          cameraFps: Math.round(result.fps),
          poseFps: Math.round(result.fps * result.coverage),
          batId: batId || null,
          notes: f.name ? `Video: ${f.name.slice(0, 80)}` : "",
        };
        await db.saveSession(sess);
        for (const [i, s] of result.swings.entries()) {
          const rec: SwingRecord = {
            id: uid(),
            sessionId: sess.id,
            playerId: player.id,
            n: i + 1,
            at: Date.now(),
            view,
            hand: player.hand,
            analysis: s.analysis,
            pose: compactPose(s.pose),
            frameSize: s.frameSize,
            clipFrames: settings.keepClips ? s.clip.length : 0,
            batId: batId || null,
            source: "video",
            slowMo: factor,
          };
          await db.saveSwing(rec);
          if (settings.keepClips && s.clip.length) await db.saveClip({ swingId: rec.id, frames: s.clip });
          records.push(rec);
        }
      }
      setSaved({ result, swings: records });
      setStage("done");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStage("choose");
        return;
      }
      setError(
        e instanceof VideoFormatError
          ? `${e.message} On iPhone, try Safari, or set Settings › Camera › Formats to "Most Compatible" and record again.`
          : `Something went wrong while analyzing the video. ${e instanceof Error ? e.message : ""}`,
      );
      setStage("error");
    } finally {
      abortRef.current = null;
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) run(f, Number(slowMo));
  }

  if (!ready) return null;

  if (!player) {
    return (
      <div className="animate-rise pb-8">
        <PageTitle title="Record a swing" />
        <Panel className="p-5">
          <h2 className="head mb-4 text-lg">First, who&apos;s hitting?</h2>
          <PlayerForm onSave={savePlayer} submitLabel="Save and continue" />
        </Panel>
      </div>
    );
  }

  return (
    <div className="animate-rise pb-8">
      <PageTitle title="Record a swing" sub="Film it or upload it. Gapper goes through every frame for the most accurate read." />

      {stage === "choose" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="up-input" className="press flex min-h-[5.5rem] cursor-pointer items-center gap-4 rounded-2xl bg-optic px-5 py-4 text-optic-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_14px_34px_-18px_rgb(183_243_74/0.22)]">
              <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                <path d="M15 20V5M9 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 19v5a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
              <span>
                <span className="display block text-[1.35rem] leading-tight">Upload a video</span>
                <span className="block text-[13px] font-semibold opacity-75">Slo-mo clips also get exit velo and bat speed · up to {MAX_VIDEO_SECONDS} s</span>
              </span>
            </label>
            <input id="up-input" type="file" accept="video/*" className="sr-only" onChange={onPick} aria-label="Upload a video" />
            <label htmlFor="rec-input" className="press surface flex min-h-[5.5rem] cursor-pointer items-center gap-4 rounded-2xl px-5 py-4 hover:border-chalk-3">
              <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                <rect x="2" y="7" width="19" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2.4" />
                <path d="M21 13l7-4v12l-7-4z" fill="currentColor" />
              </svg>
              <span>
                <span className="display block text-[1.35rem] leading-tight">Record with camera</span>
                <span className="block text-[13px] text-chalk-3">Opens your phone&apos;s camera at normal speed</span>
              </span>
            </label>
            <input id="rec-input" type="file" accept="video/*" capture="environment" className="sr-only" onChange={onPick} />
          </div>

          <SectionTitle>About the clip</SectionTitle>
          <div>
            <span className="mb-2 block text-sm text-chalk-2">Where was the camera?</span>
            <ViewPicker value={view} onChange={setView} hand={player.hand} />
            <p className="mt-2 text-[13px] text-chalk-3">{viewNote(view)}</p>
          </div>

          <div className="mt-6">
            <span className="mb-2 block text-sm text-chalk-2">Was it filmed in slow motion?</span>
            <Segmented label="Slow motion" value={slowMo} onChange={setSlowMo} options={SLOWMO} />
            <p className="mt-2 text-[13px] text-chalk-3">
              Slo-mo is what unlocks exit velo and bat speed. iPhone: Settings › Camera › Record Slo-mo shows 120 or 240 fps. If you pick wrong, Gapper notices from how
              the pitch falls and fixes it.
            </p>
          </div>

          <div className="mt-6">
            <span className="mb-2 block text-sm text-chalk-2">Ball</span>
            <Segmented
              label="Ball size"
              value={ballSize}
              onChange={setBallSize}
              options={[
                { value: "12", label: '12" ball' },
                { value: "11", label: '11" ball' },
              ]}
            />
          </div>

          {bats.length > 0 && (
            <div className="mt-6">
              <label htmlFor="rbat" className="mb-2 block text-sm text-chalk-2">Bat</label>
              <select id="rbat" value={batId} onChange={(e) => setBatId(e.target.value)} className="min-h-12 w-full rounded-xl border border-line-2 bg-night-2 px-3 text-[16px] text-chalk">
                <option value="">Not tracking a bat</option>
                {bats.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.brand} {b.model}
                    {b.weightOz ? ` · ${b.weightOz} oz` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <SectionTitle>Filming tips</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
          <Panel className="p-4">
            <p className="head text-[15px]">For the best read</p>
            <ul className="mt-2 space-y-1.5 text-[14px] text-chalk-2">
              <li>Whole body in the picture, head to shoes, phone held still or on a tripod.</li>
              <li>Side view, facing your chest, gives the most numbers.</li>
              <li>One to a few swings per video. Longer videos take longer to analyze.</li>
              <li>For live feedback on every swing in the cage, use <Link href="/live" className="text-optic">Live session</Link> instead.</li>
            </ul>
          </Panel>

          <Panel boxed className="p-4">
            <p className="head text-[15px] text-optic">For exit velo and bat speed</p>
            <ul className="mt-2 space-y-1.5 text-[14px] text-chalk-2">
              <li>Film in the Camera app&apos;s Slo-mo mode, then tap Upload a video here (the Record button above can&apos;t shoot slo-mo).</li>
              <li>Phone on a stand or fence, not in your hand.</li>
              <li>Side view, 10 to 15 feet from the plate, about waist high.</li>
              <li>Get the pitch coming in and 4 to 6 feet in front of the plate in the shot.</li>
              <li>Daylight or bright lights. Dim light blurs the ball.</li>
            </ul>
            <Link href="/guide#speed" className="mt-2 inline-block text-[14px] text-optic">Full filming guide</Link>
          </Panel>
          </div>
        </>
      )}

      <div className={stage === "processing" ? "" : "hidden"}>
        <div className="surface boxed overflow-hidden rounded-2xl">
          <video ref={videoRef} className="max-h-[52dvh] w-full object-contain" muted playsInline aria-label="Your video, playing slowed down while it's analyzed" />
        </div>
        <div className="mt-4" role="status" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[15px] text-chalk">{progress.stage}</p>
            <span className="num text-[15px] text-optic">{Math.round(progress.f * 100)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-night-4" aria-hidden="true">
            <div className="h-full bg-optic transition-[width] duration-200" style={{ width: `${Math.round(progress.f * 100)}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-chalk-3">Plays slowed down so every frame gets tracked. Keep this screen open.</p>
        </div>
        <Button variant="ghost" className="mt-4" onClick={() => abortRef.current?.abort()}>Cancel</Button>
      </div>

      {stage === "done" && saved && (
        <div>
          {saved.swings.length > 0 ? (
            <>
              <h2 className="display text-2xl">
                {saved.swings.length} {saved.swings.length === 1 ? "swing" : "swings"} analyzed
              </h2>
              {note && <p className="mt-1 text-[13px] text-optic">{note}</p>}
              <p className="mt-1 text-[13px] text-chalk-3">
                Processed from video at {Math.round(saved.result.fps)} fps ({Math.round(saved.result.coverage * 100)}% of frames tracked)
                {saved.result.heardAudio ? ", contact from the video's sound" : ""}.{saved.result.truncated ? ` Only the first ${MAX_VIDEO_SECONDS} s were analyzed.` : ""}
              </p>
              <ol className="surface mt-4 divide-y divide-line overflow-hidden rounded-2xl">
                {saved.swings.map((s) => (
                  <li key={s.id}>
                    <Link href={`/swings/${s.id}`} className="press flex items-center gap-4 px-4 py-4 hover:bg-night-3">
                      <span className="num w-12 text-3xl text-chalk">{s.analysis.score.overall ?? "—"}</span>
                      <span className="min-w-0 flex-1">
                        <CueLine cue={s.analysis.cue} />
                        <SpeedLine m={s.analysis.metrics} />
                      </span>
                      <span className="text-chalk-3" aria-hidden="true">›</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <Panel className="p-5">
              <h2 className="head text-lg">No swing found in that video</h2>
              <ul className="mt-2 space-y-1.5 text-[14px] text-chalk-2">
                <li>Make sure your whole body, including your shoes, stays in the picture.</li>
                <li>If it was filmed in slow motion, pick 4× or 8× and try again.</li>
                <li>Practice swings at half speed don&apos;t count as swings.</li>
              </ul>
              {file && slowMo === "1" && (
                <Button variant="ghost" className="mt-4" onClick={() => { setSlowMo("4"); run(file, 4); }}>
                  Try again as slow motion (4×)
                </Button>
              )}
            </Panel>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => setStage("choose")}>Record another</Button>
            <Link href="/swings" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-[15px] hover:bg-night-3">My Swings</Link>
          </div>
        </div>
      )}

      {stage === "error" && (
        <Panel className="p-5">
          <h2 className="head text-lg">Couldn&apos;t analyze that video</h2>
          <p role="alert" className="mt-2 text-[14px] text-chalk-2">{error}</p>
          <Button className="mt-4" onClick={() => setStage("choose")}>Try another video</Button>
        </Panel>
      )}
    </div>
  );
}
