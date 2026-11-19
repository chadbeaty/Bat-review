"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { METRICS } from "@/engine/catalog";
import type { SetupCheck } from "@/engine/setup";
import { readyToBat } from "@/engine/setup";
import type { CameraView, MetricKey, MetricValue } from "@/engine/types";
import { LiveEngine, type CapturedSwing, type LiveTick } from "@/live/engine";
import { shouldSpeak, voice } from "@/live/voice";
import { compactPose, db, uid } from "@/lib/store/db";
import type { Bat, Session, SwingRecord } from "@/lib/store/types";
import { ClipPlayer } from "../ClipPlayer";
import { challengeProgress, coachingFor } from "@/engine/coaching";
import { BASIC_SLOTS, CueLine, GroupedMetrics, displayValue } from "../Metrics";
import { PlayerForm } from "../PlayerForm";
import { usePlayers } from "../PlayerProvider";
import { GapMark as LogoMark } from "../Logo";
import { Softball } from "../Softball";
import { Button, Panel, Toggle, fmtDuration } from "../ui";
import { SetupChecklist } from "./SetupChecklist";
import { ViewPicker, viewNote } from "./ViewPicker";

type Stage = "prep" | "starting" | "setup" | "live" | "summary" | "error";

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function LiveSession() {
  const router = useRouter();
  const { ready, player, players, settings, updateSettings, savePlayer, setActive } = usePlayers();
  const [stage, setStage] = useState<Stage>("prep");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CameraView>(settings.lastView);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [bats, setBats] = useState<Bat[]>([]);
  const [batId, setBatId] = useState<string | null>(null);
  const [tick, setTick] = useState<LiveTick | null>(null);
  const [swings, setSwings] = useState<SwingRecord[]>([]);
  const [cardOpen, setCardOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState<"swing" | "contact" | null>(null);
  const [micNote, setMicNote] = useState(false);
  const [review, setReview] = useState<SwingRecord | null>(null);
  const searchParams = useSearchParams();
  // A 10-swing challenge: started from a swing's coach card (?challenge=issue) or from the result card.
  const [challenge, setChallenge] = useState<{ issueId: string; startN: number; target?: number } | null>(() => {
    const id = searchParams.get("challenge");
    const target = Number(searchParams.get("target"));
    return id ? { issueId: id, startN: 0, target: Number.isFinite(target) && target > 0 ? target : undefined } : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const [notes, setNotes] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [reviewFrames, setReviewFrames] = useState<{ t: number; blob: Blob }[] | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<LiveEngine | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const swingsRef = useRef<SwingRecord[]>([]);
  const clipsRef = useRef(new Map<string, { t: number; blob: Blob }[]>());
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!player) return;
    db.bats(player.id).then(setBats).catch(() => setBats([]));
  }, [player]);

  // Session clock.
  useEffect(() => {
    if (stage !== "live") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);

  // Setup shows the whole camera frame (so the feet are visible above the checklist); batting fills the screen.
  useEffect(() => {
    if (engineRef.current) engineRef.current.fit = stage === "setup" ? "contain" : "cover";
  }, [stage]);

  // Stop the camera when leaving the page.
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const speak = useCallback((text: string, isFix: boolean, n: number) => {
    const s = settingsRef.current;
    if (!s.voiceOn || s.quiet) return;
    if (!shouldSpeak(s.voiceFrequency, n, isFix)) return;
    voice.say(text, s.voiceURI);
  }, []);

  const onSwing = useCallback(
    async (cap: CapturedSwing) => {
      const sess = sessionRef.current;
      if (!sess || !player) return;
      const n = swingsRef.current.length + 1;
      const rec: SwingRecord = {
        id: uid(),
        sessionId: sess.id,
        playerId: player.id,
        n,
        at: Date.now(),
        view,
        hand: player.hand,
        analysis: cap.analysis,
        pose: compactPose(cap.pose),
        frameSize: cap.frameSize,
        clipFrames: 0,
        batId: sess.batId,
        source: "live",
      };
      swingsRef.current = [...swingsRef.current, rec];
      setSwings(swingsRef.current);
      setFlash(cap.analysis.metrics.contact?.value === 1 ? "contact" : "swing");
      setTimeout(() => setFlash(null), 1100);
      setCardOpen(true);
      if (cardTimer.current) clearTimeout(cardTimer.current);
      cardTimer.current = setTimeout(() => setCardOpen(false), 9000);

      const score = cap.analysis.score.overall;
      const spoken = score !== null && cap.analysis.cue.tone !== "fix" ? `${score}. ${cap.analysis.cue.spoken}` : cap.analysis.cue.spoken;
      speak(spoken, cap.analysis.cue.tone === "fix", n);

      const scores = swingsRef.current.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
      sess.swingCount = n;
      sess.bestScore = scores.length ? Math.max(...scores) : null;
      sess.avgScore = scores.length ? Math.round(avg(scores)!) : null;
      sess.poseFps = Math.round(avg(swingsRef.current.map((s) => s.analysis.quality.poseFps)) ?? 0);
      try {
        await db.saveSwing(rec);
        await db.saveSession({ ...sess });
        const frames = await cap.clip;
        clipsRef.current.set(rec.id, frames);
        if (settingsRef.current.keepClips && frames.length) {
          await db.saveClip({ swingId: rec.id, frames });
          rec.clipFrames = frames.length;
          await db.saveSwing(rec);
        }
      } catch {
        setError("Couldn't save that swing on this device. Storage may be full. Free up space in Profile.");
      }
    },
    [player, view, speak],
  );

  async function startCamera() {
    if (!player) return;
    setError(null);
    setStage("starting");
    await updateSettings({ lastView: view });
    if (settings.voiceOn && !settings.quiet) voice.unlock();
    const engine = new LiveEngine(
      {
        video: videoRef.current!,
        overlay: overlayRef.current!,
        view,
        hand: player.hand,
        heightIn: player.heightIn,
        micOn: settings.micOn,
        quality: settings.modelQuality,
        facing,
        previous: () => swingsRef.current.slice(-5).reverse().map((s) => s.analysis.metrics),
      },
      {
        onTick: setTick,
        onSwing,
        onMicUnavailable: () => setMicNote(true),
        onError: (m) => setError(m),
      },
    );
    engineRef.current = engine;
    try {
      await engine.start();
      setStage("setup");
    } catch (e) {
      await engine.stop();
      engineRef.current = null;
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera for this site in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No camera found on this device."
            : `Couldn't start the camera or body tracking. ${e instanceof Error ? e.message : ""}`,
      );
      setStage("error");
    }
  }

  const beginBatting = useCallback(() => {
    if (!player || !engineRef.current) return;
    const sess: Session = {
      id: uid(),
      playerId: player.id,
      view,
      startedAt: Date.now(),
      endedAt: null,
      swingCount: 0,
      bestScore: null,
      avgScore: null,
      cameraFps: Math.round(engineRef.current.cameraFps),
      poseFps: 0,
      batId,
      notes: "",
    };
    sessionRef.current = sess;
    db.saveSession(sess).catch(() => {});
    engineRef.current.setDetecting(true);
    setStartedAt(sess.startedAt);
    setStage("live");
    setNow(Date.now());
    const s = settingsRef.current;
    if (s.voiceOn && !s.quiet) voice.say("Ready. Start swinging.", s.voiceURI);
  }, [player, view, batId]);

  // Hands-free start: once every check has passed for two seconds, start the session.
  const checks: SetupCheck[] = tick?.checks ?? [];
  const isReady = readyToBat(checks);
  const feetOut = (tick?.hasBody ?? false) && checks.find((c) => c.id === "body")?.status !== "ok";
  useEffect(() => {
    if (stage !== "setup" || !isReady) return;
    const id = setTimeout(beginBatting, 2000);
    return () => clearTimeout(id);
  }, [stage, isReady, beginBatting]);

  function togglePause() {
    const p = !paused;
    setPaused(p);
    engineRef.current?.setPaused(p);
  }

  async function endSession() {
    await engineRef.current?.stop();
    engineRef.current = null;
    const sess = sessionRef.current;
    if (sess) {
      sess.endedAt = Date.now();
      setEndedAt(sess.endedAt);
      if (sess.swingCount === 0) {
        await db.deleteSession(sess.id).catch(() => {});
        sessionRef.current = null;
        router.push("/");
        return;
      }
      await db.saveSession({ ...sess }).catch(() => {});
    }
    setStage("summary");
  }

  async function saveNotes() {
    const sess = sessionRef.current;
    if (!sess) return;
    sess.notes = notes.slice(0, 2000);
    await db.saveSession({ ...sess });
  }

  function openReview(s: SwingRecord) {
    setReview(s);
    setReviewFrames(clipsRef.current.get(s.id) ?? null);
    engineRef.current?.setPaused(true);
  }
  function closeReview() {
    setReview(null);
    if (!paused) engineRef.current?.setPaused(false);
  }

  const last = swings[swings.length - 1] ?? null;
  const stats = useMemo(() => {
    const scores = swings.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
    const val = (k: MetricKey) =>
      swings.map((s) => s.analysis.metrics[k]).filter((m): m is MetricValue => !!m && m.source !== "unavailable" && m.value !== null).map((m) => m.value!);
    const hs = val("handSpeed");
    const st = val("swingTime");
    const best = swings.reduce<SwingRecord | null>((b, s) => ((s.analysis.score.overall ?? -1) > (b?.analysis.score.overall ?? -1) ? s : b), null);
    const contacts = swings.filter((s) => s.analysis.metrics.contact?.source === "measured");
    // Most common fix this session = next session's focus.
    const fixCounts = new Map<string, { n: number; text: string }>();
    for (const s of swings) {
      const c = s.analysis.cue;
      if (c.tone !== "fix") continue;
      const e = fixCounts.get(c.id) ?? { n: 0, text: c.text };
      e.n++;
      fixCounts.set(c.id, e);
    }
    const focus = [...fixCounts.values()].sort((a, b) => b.n - a.n)[0] ?? null;
    return {
      avgScore: avg(scores),
      bestScore: scores.length ? Math.max(...scores) : null,
      best,
      avgHand: avg(hs),
      maxHand: hs.length ? Math.max(...hs) : null,
      avgSwingTime: avg(st),
      contactRate: contacts.length ? contacts.filter((s) => s.analysis.metrics.contact?.value === 1).length / contacts.length : null,
      focus,
    };
  }, [swings]);

  if (!ready) return <div className="min-h-dvh bg-night" />;

  const elapsed = startedAt ? now - startedAt : 0;
  const camOn = stage === "starting" || stage === "setup" || stage === "live";

  return (
    <div className="relative min-h-dvh bg-night">
      {/* Camera layer: always mounted so the engine has its elements. */}
      <div
        className={`fixed inset-x-0 top-0 transition-[height] ${stage === "setup" ? "h-[58dvh]" : "h-dvh"} ${camOn ? "" : "pointer-events-none opacity-0"}`}
        aria-hidden={!camOn}
      >
        <video
          ref={videoRef}
          className={`h-full w-full ${stage === "setup" ? "object-contain" : "object-cover"}`}
          style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
          muted
          playsInline
        />
        {stage === "setup" && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {/* Framing guide: head under the top line, shoes above the bottom line. */}
            <div className="absolute inset-x-6 top-[6%] border-t-2 border-dashed border-optic/70">
              <span className="mt-1 inline-block rounded bg-night/70 px-1.5 py-0.5 text-[11px] font-bold text-optic">Head below here</span>
            </div>
            <div className="absolute inset-x-6 bottom-[5%] border-b-2 border-dashed border-optic/70">
              <span className="mb-1 inline-block -translate-y-full rounded bg-night/70 px-1.5 py-0.5 text-[11px] font-bold text-optic">Shoes above here</span>
            </div>
          </div>
        )}
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-night/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-night/90 to-transparent" />
      </div>

      {stage === "prep" && (
        <div className="relative mx-auto max-w-[34rem] px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between pt-2">
            <Link href="/" className="-ml-2 rounded-lg px-2 py-2 text-[15px] text-chalk-2 hover:text-chalk">← Home</Link>
            <LogoMark size={26} />
            <Link href="/guide" className="rounded-lg px-2 py-2 text-[15px] text-optic">Setup guide</Link>
          </div>
          <h1 className="display mt-3 text-[2.1rem] leading-[1.05]">Live session</h1>
          <p className="mt-2 text-[15px] text-chalk-2">Put the phone on a tripod, pick the view, and step in. Every swing gets caught and scored on its own.</p>

          {!player ? (
            <Panel className="mt-6 p-5">
              <h2 className="mb-4 head text-lg">First, who&apos;s hitting?</h2>
              <PlayerForm onSave={savePlayer} submitLabel="Save and continue" />
            </Panel>
          ) : (
            <>
              {players.length > 1 && (
                <div className="mt-6">
                  <span className="mb-2 block text-sm text-chalk-2">Hitter</span>
                  <div className="flex flex-wrap gap-2">
                    {players.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActive(p.id)}
                        aria-pressed={p.id === player.id}
                        className={`min-h-10 rounded-xl border px-3 text-[15px] ${p.id === player.id ? "border-optic text-chalk" : "border-line text-chalk-2"}`}
                      >
                        {p.name} <span className="text-chalk-3">· {p.hand === "R" ? "R" : "L"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <span className="mb-2 block text-sm text-chalk-2">Where&apos;s the phone?</span>
                <ViewPicker value={view} onChange={setView} hand={player.hand} />
                <p className="mt-2 text-[13px] text-chalk-3">{viewNote(view)}</p>
              </div>

              {bats.length > 0 && (
                <div className="mt-6">
                  <label htmlFor="bat" className="mb-2 block text-sm text-chalk-2">Bat</label>
                  <select
                    id="bat"
                    value={batId ?? ""}
                    onChange={(e) => setBatId(e.target.value || null)}
                    className="min-h-12 w-full rounded-xl border border-line bg-night-2 px-3 text-[16px] text-chalk"
                  >
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

              <Panel className="mt-6 divide-y divide-line px-4">
                <Toggle id="mic" checked={settings.micOn} onChange={(v) => updateSettings({ micOn: v })} label="Listen for contact" hint="Uses the mic to hear bat-on-ball. Nothing is recorded or sent." />
                <Toggle id="voice" checked={settings.voiceOn && !settings.quiet} onChange={(v) => updateSettings({ voiceOn: v, quiet: false })} label="Voice cues" hint="A short tip after each swing. Great with earbuds." />
                <div className="flex items-center justify-between py-3">
                  <span className="text-[15px]">Camera</span>
                  <button type="button" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} className="min-h-10 rounded-xl border border-line px-3 text-sm text-chalk-2">
                    {facing === "environment" ? "Back camera" : "Front camera"}
                  </button>
                </div>
              </Panel>

              <Button size="lg" className="mt-6 w-full" onClick={startCamera}>
                Turn on camera
              </Button>
              <p className="mt-3 text-center text-[13px] text-chalk-3">Hitting as {player.name}. Video stays on this phone.</p>
            </>
          )}
        </div>
      )}

      {stage === "starting" && (
        <div className="fixed inset-0 grid place-items-center">
          <div className="text-center">
            <Softball size={56} spin className="mx-auto" />
            <p className="mt-4 text-[15px] text-chalk-2">Starting camera and body tracking…</p>
            <p className="mt-1 text-xs text-chalk-3">First time takes a few seconds to download the tracker.</p>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div className="relative mx-auto max-w-[34rem] px-4 pt-24 text-center">
          <h1 className="display text-2xl">Camera didn&apos;t start</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] text-chalk-2">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => setStage("prep")}>Try again</Button>
            <Link href="/guide" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-[15px]">Setup guide</Link>
          </div>
        </div>
      )}

      {stage === "setup" && (
        <div className="fixed inset-0 flex flex-col justify-between">
          <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={async () => {
                await engineRef.current?.stop();
                engineRef.current = null;
                setStage("prep");
              }}
              className="rounded-xl bg-night/70 px-3 py-2 text-[15px] text-chalk"
            >
              ← Back
            </button>
            <span className="rounded-xl bg-night/70 px-3 py-2 text-xs text-chalk-2">
              {tick ? `${Math.round(tick.poseFps)} fps tracking · camera ${Math.round(tick.cameraFps)} fps` : "…"}
            </span>
          </div>
          <div className="mx-auto w-full max-w-[34rem] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <Panel className="bg-night/90 p-5">
              <h2 className="display text-xl">{isReady ? "Looking good. Get set…" : "Line up the shot"}</h2>
              <p className="mb-4 mt-1 text-[13px] text-chalk-3">
                {isReady ? "Starting on its own in a moment. Take your stance." : "Fix anything red or amber, or start anyway."}
              </p>
              <SetupChecklist checks={checks} />
              {micNote && <p className="mt-3 text-[13px] text-amber">Mic isn&apos;t available, so contact won&apos;t be detected. Everything else works.</p>}
              <Button size="lg" variant={isReady ? "primary" : "ghost"} className="mt-5 w-full" onClick={beginBatting}>
                {isReady ? "Start now" : "Start anyway"}
              </Button>
            </Panel>
          </div>
        </div>
      )}

      {stage === "live" && (
        <div className="fixed inset-0 flex flex-col justify-between">
          {/* Top bar */}
          <div className="flex items-start justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div>
              <div className="num text-3xl leading-none text-chalk" aria-label={`${swings.length} swings`}>
                {swings.length}
                <span className="ml-1.5 font-sans text-sm font-normal text-chalk-2">{swings.length === 1 ? "swing" : "swings"}</span>
              </div>
              <div className="mt-1 text-xs text-chalk-2">{fmtDuration(elapsed)}</div>
            </div>
            <div className="flex flex-col items-center gap-1.5" aria-live="polite">
              <span
                className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
                  flash === "swing" ? "animate-pop bg-optic text-optic-ink" : flash === "contact" ? "animate-pop bg-optic text-optic-ink" : paused ? "bg-night-3 text-chalk-2" : "bg-night/70 text-chalk"
                }`}
              >
                {flash === "swing" ? "Swing captured" : flash === "contact" ? "Swing + contact" : paused ? "Paused" : tick?.hasBody ? "Watching" : "Step into view"}
              </span>
              <span className="h-1 w-24 overflow-hidden rounded-full bg-night-4" aria-hidden="true">
                <span className="block h-full bg-optic transition-[width] duration-100" style={{ width: `${Math.min(100, ((tick?.speed ?? 0) / 10) * 100)}%` }} />
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateSettings({ advancedView: !settings.advancedView })}
                className="min-h-10 rounded-xl bg-night/70 px-3 text-xs text-chalk"
                aria-pressed={settings.advancedView}
              >
                {settings.advancedView ? "Advanced" : "Basic"}
              </button>
              <button type="button" onClick={togglePause} className="grid min-h-10 min-w-10 place-items-center rounded-xl bg-night/70 text-chalk" aria-label={paused ? "Resume" : "Pause"}>
                {paused ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2v12M11 2v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
                )}
              </button>
            </div>
          </div>

          {challenge && (() => {
            const run = swings.filter((s) => s.n > challenge.startN);
            const c = coachingFor({ id: challenge.issueId, tone: "fix", text: "", spoken: "", basedOn: [] }, {}, challenge.target ?? null).challenge;
            const prog = challengeProgress(c, run.map((s) => s.analysis.metrics), run.map((s) => s.analysis.score.overall), challenge.target);
            const done = prog.counted >= 10;
            return (
              <div role="status" className="mx-4 mt-3 flex max-w-sm items-center gap-3 self-start rounded-xl bg-night/92 px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-optic">{done ? "Challenge done" : "10-swing challenge"}</span>
                  <span className="block text-chalk-2">{c.goal}</span>
                </span>
                <span className="num text-xl text-chalk" aria-label={`${prog.passed} of ${Math.min(10, prog.counted)} swings hit the goal`}>
                  {prog.passed}/{Math.min(10, prog.counted)}
                </span>
                <button type="button" onClick={() => setChallenge(null)} className="text-chalk-3" aria-label="End challenge">✕</button>
              </div>
            );
          })()}

          {feetOut && !paused && (
            <p role="status" className="mx-4 mt-3 self-start rounded-xl bg-stitch px-3 py-2 text-[13px] font-bold text-chalk">
              Feet out of the picture: leg and foot numbers are off until your shoes are back in view.
            </p>
          )}

          {settings.advancedView && (
            <div className="mx-4 mt-3 grid max-w-sm grid-cols-3 gap-x-4 gap-y-2 self-start rounded-2xl bg-night/90 p-3 text-xs">
              <Stat label="Avg score" v={stats.avgScore !== null ? Math.round(stats.avgScore) : null} />
              <Stat label="Best" v={stats.bestScore} />
              <Stat label="Avg swing" v={stats.avgSwingTime !== null ? Math.round(stats.avgSwingTime) : null} unit="ms" />
              <Stat label="Avg hands" v={stats.avgHand !== null ? stats.avgHand.toFixed(1) : null} unit="mph" />
              <Stat label="Max hands" v={stats.maxHand !== null ? stats.maxHand.toFixed(1) : null} unit="mph" />
              <Stat label="Contact" v={stats.contactRate !== null ? Math.round(stats.contactRate * 100) : null} unit="%" />
              <div className="col-span-3 text-[11px] text-chalk-3">
                {tick ? `${Math.round(tick.poseFps)} fps tracking (${tick.delegate ?? "…"}) · camera ${Math.round(tick.cameraFps)} fps` : ""} · exit velo and bat speed: upload a slo-mo video
              </div>
            </div>
          )}

          <div className="flex-1" onClick={() => last && setCardOpen((o) => !o)} />

          {/* Result card */}
          <div className="mx-auto w-full max-w-[34rem] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {error && <p className="mb-2 rounded-xl bg-stitch-wash px-3 py-2 text-[13px] text-chalk">{error}</p>}
            {last && cardOpen && (
              <div key={last.id} className="mb-3 animate-slide-up rounded-2xl border border-line bg-night/92 p-4">
                <div className="flex items-start gap-4">
                  <div className="text-center">
                    <div className="num text-5xl leading-none text-chalk">{last.analysis.score.overall ?? "—"}</div>
                    <div className="mt-1 text-[11px] text-chalk-3">Swing {last.n}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <CueLine cue={last.analysis.cue} large />
                    {(() => {
                      // Next swing vs. the previous one, on the thing being coached.
                      const prev = swings.length > 1 ? swings[swings.length - 2] : null;
                      const k = last.analysis.cue.basedOn[0];
                      const now = k ? last.analysis.metrics[k] : undefined;
                      const was = k && prev ? prev.analysis.metrics[k] : undefined;
                      if (!k || !now || !was || now.source === "unavailable" || was.source === "unavailable") return null;
                      return (
                        <p className="mt-1.5 text-[12px] text-chalk-3">
                          {METRICS[k].label}: <span className="num text-chalk">{displayValue(now)}</span>
                          {METRICS[k].suffix && ` ${METRICS[k].suffix}`} · last swing {displayValue(was)}
                          {METRICS[k].suffix && ` ${METRICS[k].suffix}`}
                        </p>
                      );
                    })()}
                  </div>
                </div>
                {(() => {
                  const coach = coachingFor(last.analysis.cue, last.analysis.metrics, last.analysis.score.overall);
                  return (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-night-3 px-3 py-2 text-[12px]">
                      <span className="min-w-0 text-chalk-2">
                        <span className="text-chalk-3">Drill: </span>
                        {coach.drill.name}
                      </span>
                      {challenge?.issueId !== coach.issueId && (
                        <button
                          type="button"
                          onClick={() => setChallenge({ issueId: coach.issueId, startN: last.n, target: coach.issueId === "repeat" && last.analysis.score.overall !== null ? Math.max(0, last.analysis.score.overall - 5) : undefined })}
                          className="shrink-0 rounded-lg border border-optic/60 px-2 py-1 font-bold text-optic"
                        >
                          Start 10-swing challenge
                        </button>
                      )}
                    </div>
                  );
                })()}
                {settings.advancedView ? (
                  <div className="mt-3 max-h-[34dvh] overflow-y-auto pr-1">
                    <GroupedMetrics metrics={last.analysis.metrics} />
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {BASIC_SLOTS.map((slot) => {
                      const k = slot.find((key) => last.analysis.metrics[key] && last.analysis.metrics[key]!.source !== "unavailable") ?? slot[0];
                      const mv = last.analysis.metrics[k];
                      const na = !mv || mv.source === "unavailable";
                      return (
                        <div key={k} className="rounded-xl bg-night-3 px-3 py-2">
                          <div className="text-[11px] text-chalk-3">{METRICS[k].label}</div>
                          <div className="num mt-0.5 text-xl text-chalk">
                            {na ? "—" : displayValue(mv!)}
                            {!na && <span className="ml-0.5 font-sans text-xs font-normal text-chalk-3">{METRICS[k].suffix}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {last && !cardOpen && (
              <button type="button" onClick={() => setCardOpen(true)} className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-night/92 px-4 py-3 text-left">
                <span className="num text-2xl text-chalk">{last.analysis.score.overall ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-chalk-2">{last.analysis.cue.spoken}</span>
                <span className="text-xs text-chalk-3">Swing {last.n}</span>
              </button>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1 bg-night/70" disabled={!last} onClick={() => last && openReview(last)}>
                Review last
              </Button>
              <Button variant="ghost" className="flex-1 border-stitch/40 bg-night/70" onClick={endSession}>
                End session
              </Button>
            </div>
          </div>
        </div>
      )}

      {review && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-night/97 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true" aria-label={`Swing ${review.n} review`}>
          <div className="mx-auto max-w-[34rem]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="display text-xl">Swing {review.n}</h2>
              <Button variant="ghost" onClick={closeReview}>Back to batting</Button>
            </div>
            <ClipPlayer key={review.id} pose={review.pose} frames={reviewFrames} phases={review.analysis.phases} frameSize={review.frameSize} handPath={review.analysis.handPath} hand={review.hand} />
            <div className="mt-5 space-y-2">
              {review.analysis.observations.slice(0, 3).map((c) => (
                <CueLine key={c.id} cue={c} />
              ))}
            </div>
            <div className="mt-4">
              <GroupedMetrics metrics={review.analysis.metrics} />
            </div>
          </div>
        </div>
      )}

      {stage === "summary" && (
        <div className="relative mx-auto max-w-[34rem] px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <p className="text-sm text-chalk-3">Session done · {fmtDuration((endedAt ?? now) - (startedAt ?? now))}</p>
          <h1 className="display mt-1 text-[2.1rem] leading-[1.05]">
            {swings.length} {swings.length === 1 ? "swing" : "swings"} logged
          </h1>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Panel className="p-4">
              <div className="text-xs text-chalk-3">Average score</div>
              <div className="num mt-1 text-4xl">{stats.avgScore !== null ? Math.round(stats.avgScore) : "—"}</div>
            </Panel>
            <Panel className="p-4">
              <div className="text-xs text-chalk-3">Best swing</div>
              <div className="num mt-1 text-4xl">{stats.bestScore ?? "—"}</div>
              {stats.best && <div className="text-xs text-chalk-3">Swing {stats.best.n}</div>}
            </Panel>
          </div>
          {stats.focus && (
            <Panel className="mt-3 p-4">
              <div className="text-xs text-chalk-3">Focus for next session</div>
              <p className="mt-1 text-[15px] leading-snug text-chalk">{stats.focus.text}</p>
              <p className="mt-1 text-xs text-chalk-3">Came up on {stats.focus.n} of {swings.length} swings.</p>
            </Panel>
          )}
          <div className="mt-5">
            <label htmlFor="notes" className="mb-2 block text-sm text-chalk-2">Practice notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              className="w-full rounded-xl border border-line bg-night-2 p-3 text-[16px] text-chalk placeholder:text-chalk-3 focus:border-chalk-3 focus:outline-none"
              placeholder="Cage, pitcher, what felt good…"
            />
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              className="flex-1"
              onClick={async () => {
                await saveNotes();
                router.push(`/swings?session=${sessionRef.current?.id ?? ""}`);
              }}
            >
              Review swings
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await saveNotes();
                router.push("/");
              }}
            >
              Done
            </Button>
          </div>
          <p className="mt-6 text-xs text-chalk-3">
            Scores grade your mechanics from body tracking. They don&apos;t include bat speed or exit velocity, which need high-speed capture or a sensor. See{" "}
            <Link href="/how-it-works" className="underline">how Gapper measures</Link>.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v, unit }: { label: string; v: number | string | null; unit?: string }) {
  return (
    <div>
      <div className="text-[11px] text-chalk-3">{label}</div>
      <div className="num text-lg text-chalk">
        {v ?? "—"}
        {v !== null && unit && <span className="ml-0.5 font-sans text-[11px] font-normal text-chalk-3">{unit}</span>}
      </div>
    </div>
  );
}

