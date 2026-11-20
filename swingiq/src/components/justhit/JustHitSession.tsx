"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyzeContext } from "@/engine/analyzer";
import { checkHand, sideFromReads, type HandReads } from "@/engine/handedness";
import { pickOneFix } from "@/engine/oneFix";
import { LiveEngine, type CapturedSwing } from "@/live/engine";
import { isEstimated, newGuest, nextQuestion, type ProfileQuestion } from "@/lib/guest";
import { recordFromCapture, rereadSwing, rollUpSession, saveCapture } from "@/lib/store/capture";
import { db, uid } from "@/lib/store/db";
import { defaultFacing, type Player, type Session, type SwingRecord } from "@/lib/store/types";
import { ArcScore } from "../ArcScore";
import { LockupH } from "../Logo";
import { usePlayers } from "../PlayerProvider";
import { Button } from "../ui";
import { ProfilePrompt } from "./ProfilePrompt";

type Stage = "aim" | "recording" | "result" | "error";

/** One profile question per visit (a browser tab session), only after a swing. */
const ASKED_KEY = "gapper_profile_asked";
const askedThisVisit = () => {
  try {
    return sessionStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
};
const markAsked = () => {
  try {
    sessionStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* private mode: the in-memory flag still holds for this visit */
  }
};

/**
 * A batter in stance, side on, to line up with. Drawn to the frame Gapper needs: head to shoes, a little room around.
 * Drawn facing left: how a righty looks on the mirrored front-camera preview. A lefty, or the unmirrored back camera,
 * flips it so the outline matches what the hitter sees.
 */
function BatterOutline({ found, flip }: { found: boolean; flip: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
      <div className={`flex h-[62dvh] max-h-[34rem] aspect-[9/16] items-center justify-center rounded-[1.6rem] border-2 border-dashed transition-colors duration-500 ${found ? "border-optic/25" : "border-optic/60"}`}>
        {/* Once a body is tracked, the figure steps aside so the hitter sees themselves; the frame stays as a guide. */}
        <svg viewBox="0 0 150 340" data-facing={flip ? "right" : "left"} className={`h-[86%] w-auto transition-opacity duration-500 ${found ? "opacity-0" : "opacity-100"} ${flip ? "-scale-x-100" : ""}`} fill="none" stroke="rgb(255 255 255 / 0.6)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="76" cy="38" r="20" />
          <path d="M74 58 L70 168" />
          <path d="M72 82 L100 98 L112 64" />
          <path d="M72 84 L92 96" />
          <path d="M112 64 L132 12" strokeWidth="5" stroke="rgb(255 255 255 / 0.45)" />
          <path d="M70 168 L42 246 L34 322" />
          <path d="M70 168 L104 244 L112 322" />
          <path d="M22 326 H128" stroke="rgb(183 243 74 / 0.7)" strokeDasharray="2 7" />
        </svg>
      </div>
    </div>
  );
}

export function JustHitSession() {
  const { ready, player, settings, savePlayer, storageOk } = usePlayers();
  const [stage, setStage] = useState<Stage>("aim");
  const [error, setError] = useState<string | null>(null);
  const [engineOn, setEngineOn] = useState(false);
  const [hasBody, setHasBody] = useState(false);
  const [last, setLast] = useState<SwingRecord | null>(null);
  const [question, setQuestion] = useState<ProfileQuestion | null>(null);
  const [handNote, setHandNote] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<LiveEngine | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const swingsRef = useRef<SwingRecord[]>([]);
  const playerRef = useRef<Player | null>(null);
  /** Trusted batting-side reads from this visit's swings (engine/handedness.ts). */
  const readsRef = useRef<HandReads>({ R: 0, L: 0 });
  /** The last swing's frames and how it was read, so an answer to the profile question can re-read it. */
  const lastCapRef = useRef<{ cap: CapturedSwing; ctx: AnalyzeContext; recId: string } | null>(null);
  const armedRef = useRef(false);
  const askedRef = useRef(false);
  const startedRef = useRef(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    playerRef.current = player;
    settingsRef.current = settings;
  }, [player, settings]);

  // No hitter yet: make a guest behind the scenes. No forms, no questions.
  useEffect(() => {
    if (!ready || player || !storageOk) return;
    savePlayer(newGuest(uid())).catch(() => setError("Couldn't save on this device."));
  }, [ready, player, storageOk, savePlayer]);

  const onSwing = useCallback(async (cap: CapturedSwing) => {
    const engine = engineRef.current;
    const p = playerRef.current;
    if (!engine || !p) return;
    // One swing, one result: stop listening while they read it.
    engine.setDetecting(false);
    engine.setPaused(true);
    armedRef.current = false;

    const ctx: AnalyzeContext = {
      geom: cap.frameSize,
      hand: p.hand,
      view: "side",
      heightIn: p.heightIn,
      cameraFps: engine.cameraFps,
      audioContactT: cap.analysis.phases.contactSource === "audio" ? cap.analysis.phases.contact : null,
      micOn: engine.micActive,
      previous: swingsRef.current.slice(-5).reverse().map((s) => s.analysis.metrics),
    };
    // A guest's batting side is only a default: let the swing check it, and read a clear lefty swing as a lefty's.
    let analysis = cap.analysis;
    let hand = p.hand;
    if (p.assumed?.includes("hand")) {
      const checked = checkHand(cap.pose, cap.window, ctx, cap.analysis);
      analysis = checked.analysis;
      hand = checked.hand;
      if (hand !== p.hand) setHandNote(`Read as a ${hand === "L" ? "left" : "right"}-handed swing.`);
      if (checked.trusted && checked.guess) {
        readsRef.current = { ...readsRef.current, [checked.guess.hand]: readsRef.current[checked.guess.hand] + 1 };
        // The saved side only follows once most swings agree; one odd swing can't flip it.
        const side = sideFromReads(p.hand, readsRef.current);
        if (side !== p.hand) await savePlayer({ ...p, hand: side }).catch(() => {});
      }
    }
    const now = Date.now();
    const sess: Session = sessionRef.current ?? {
      id: uid(),
      playerId: p.id,
      kind: "live",
      view: "side",
      startedAt: now,
      endedAt: now,
      swingCount: 0,
      bestScore: null,
      avgScore: null,
      cameraFps: Math.round(engine.cameraFps),
      poseFps: 0,
      batId: null,
      notes: "Just Hit",
    };
    sessionRef.current = sess;
    const rec = recordFromCapture({ ...cap, analysis }, { sessionId: sess.id, playerId: p.id, n: swingsRef.current.length + 1, view: "side", hand, batId: null, estimated: isEstimated(p) });
    swingsRef.current = [...swingsRef.current, rec];
    lastCapRef.current = { cap, ctx: { ...ctx, hand }, recId: rec.id };
    rollUpSession(sess, swingsRef.current);
    sess.endedAt = now;
    setLast(rec);
    if (!askedRef.current && !askedThisVisit()) {
      const q = nextQuestion({ ...p, hand });
      setQuestion(q);
      // Shown once: it counts as this visit's question even if they just tap Again.
      if (q) {
        askedRef.current = true;
        markAsked();
      }
    }
    setStage("result");
    try {
      await saveCapture(rec, sess, cap.clip, settingsRef.current.keepClips);
    } catch {
      setError("Couldn't save that swing on this device. Storage may be full.");
    }
  }, [savePlayer]);

  // The camera opens as soon as there's a hitter: no instruction screens.
  useEffect(() => {
    if (!ready || !player || startedRef.current || !videoRef.current || !overlayRef.current) return;
    startedRef.current = true;
    const s = settingsRef.current;
    const engine = new LiveEngine(
      {
        video: videoRef.current,
        overlay: overlayRef.current,
        view: "side",
        hand: player.hand,
        heightIn: player.heightIn,
        // The bat-ball sound pins contact far better than a phone camera's frame rate can (Profile › Listen for contact).
        // Browsers ask for camera and mic in one prompt; if the mic is refused, it carries on with the camera alone.
        micOn: s.micOn,
        quality: s.modelQuality,
        facing: s.cameraFacing?.side ?? defaultFacing("side"),
        previous: () => swingsRef.current.slice(-5).reverse().map((sw) => sw.analysis.metrics),
      },
      {
        onTick: (t) => setHasBody(t.hasBody),
        onSwing,
        onError: (m) => setError(m),
      },
    );
    engineRef.current = engine;
    engine
      .start()
      .then(() => {
        setEngineOn(true);
        // Tapped record while the tracker was still loading: start listening now.
        if (armedRef.current) engine.setDetecting(true);
      })
      .catch(async (e) => {
        await engine.stop();
        engineRef.current = null;
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site in your browser settings, then try again."
            : name === "NotFoundError"
              ? "No camera found on this device."
              : `Couldn't start the camera. ${e instanceof Error ? e.message : ""}`,
        );
        setStage("error");
      });
  }, [ready, player, onSwing]);

  // The guest's height or side changed (they answered the prompt): the next swing uses it.
  useEffect(() => {
    if (player) engineRef.current?.setHitter({ hand: player.hand, heightIn: player.heightIn });
  }, [player]);

  // Storage blocked (some private modes): there's nowhere to keep a guest or a swing.
  const blocked = ready && !storageOk && !player;

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  function record() {
    armedRef.current = true;
    setHandNote(null);
    // The question was this visit's one: answered or not, it doesn't come back.
    setQuestion(null);
    setStage("recording");
    const e = engineRef.current;
    if (e && engineOn) {
      e.setPaused(false);
      e.setDetecting(true);
    }
  }

  function stopRecording() {
    armedRef.current = false;
    engineRef.current?.setDetecting(false);
    setStage("aim");
  }

  function dismissQuestion() {
    askedRef.current = true;
    markAsked();
    setQuestion(null);
  }

  async function saveAnswer(p: Player) {
    askedRef.current = true;
    markAsked();
    await savePlayer(p);
    // They've told us now: no need to say how the swing guessed.
    setHandNote(null);
    // Re-read the swing on screen with what they just told us, so its fix is right too (a lefty's legs, their height).
    const lc = lastCapRef.current;
    // The stored record itself (not a copy): the clip save that may still be running writes this same object.
    const rec = lc && swingsRef.current.find((s) => s.id === lc.recId);
    const sess = sessionRef.current;
    if (!lc || !rec || !sess || (p.hand === rec.hand && p.heightIn === lc.ctx.heightIn)) return;
    const ctx = { ...lc.ctx, hand: p.hand, heightIn: p.heightIn };
    lastCapRef.current = { ...lc, ctx };
    rereadSwing(rec, lc.cap, ctx, isEstimated(p));
    rollUpSession(sess, swingsRef.current);
    setLast({ ...rec });
    try {
      await db.saveSwing(rec);
      await db.saveSession({ ...sess });
    } catch {
      setError("Couldn't save that change on this device.");
    }
  }

  if (blocked) {
    return (
      <div className="mx-auto max-w-[30rem] px-5 pt-24 text-center">
        <h1 className="display text-2xl">This browser won&apos;t save swings</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] text-chalk-2">It&apos;s blocking storage (private mode?). Open Gapper in a normal tab to hit.</p>
      </div>
    );
  }

  const camOn = stage === "aim" || stage === "recording";
  const fix = last ? pickOneFix(last.analysis) : null;

  return (
    <div className="relative min-h-dvh bg-night">
      {/* Camera layer: always mounted so the engine has its elements; hidden behind the result. */}
      <div className={`fixed inset-0 ${camOn ? "" : "pointer-events-none opacity-0"}`} aria-hidden={!camOn}>
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: (settings.cameraFacing?.side ?? defaultFacing("side")) === "user" ? "scaleX(-1)" : undefined }}
          muted
          playsInline
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        <BatterOutline found={hasBody} flip={(player?.hand === "L") !== ((settings.cameraFacing?.side ?? defaultFacing("side")) === "environment")} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-night/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-night/90 to-transparent" />
      </div>

      {camOn && (
        <div className="fixed inset-0 flex flex-col justify-between px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(0.9rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-night/75 text-chalk">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </Link>
            <p className="flex h-9 items-center gap-2 rounded-full bg-night/75 px-3.5 text-[14px] font-semibold text-chalk">
              <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
                <rect x="2" y="1" width="10" height="14" rx="2" fill="none" stroke="var(--color-optic)" strokeWidth="1.8" />
              </svg>
              Side view · ~10 ft back
            </p>
            <span className="w-11" />
          </div>

          <div className="flex flex-col items-center gap-3">
            {stage === "aim" ? (
              <button type="button" onClick={record} aria-label="Record swing" className="press grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full border-4 border-chalk">
                <span className="block h-[4.1rem] w-[4.1rem] rounded-full bg-optic" />
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                aria-label="Stop recording"
                data-state={engineOn ? "recording" : "starting"}
                className="press grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full border-4 border-optic"
              >
                <span className="block h-8 w-8 rounded-md bg-stitch" />
              </button>
            )}
            <p role="status" aria-live="polite" className="rounded-full bg-night/75 px-3 py-1 text-[14px] text-chalk-2">
              {stage === "aim"
                ? engineOn
                  ? "Tap, then swing"
                  : "Starting camera…"
                : !engineOn
                  ? "Starting camera… swing in a moment"
                  : hasBody
                    ? "Swing when ready"
                    : "Step into the outline"}
            </p>
          </div>
        </div>
      )}

      {stage === "result" && last && fix && (
        <div className="animate-rise relative mx-auto flex min-h-dvh max-w-[30rem] flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="Gapper home">
              <LockupH height={22} />
            </Link>
            {last.estimated && (
              <span title="Worked out with default height and batting side. Add yours for sharper numbers." className="rounded-full border border-line-2 px-3 py-1 text-[13px] text-chalk-2">
                Estimated
              </span>
            )}
          </div>

          <div className="flex flex-col items-center pt-2">
            <ArcScore score={last.analysis.score.overall} size={210} />
            <p className="-mt-2 text-[14px] text-chalk-3">
              {last.analysis.score.overall === null ? "Couldn't grade this one: keep your whole body, shoes too, in the picture." : `Swing ${last.n}`}
            </p>
          </div>

          <section aria-label={fix.kind === "fix" ? "Your one fix" : "Keep doing this"} className="surface boxed cut rounded-2xl p-5">
            <p className="text-[13px] font-semibold text-chalk-3">{fix.kind === "fix" ? (fix.legs ? "Your one fix · legs and feet" : "Your one fix") : "Keep doing this"}</p>
            <p className="head mt-1.5 text-[19px] leading-snug text-chalk">{fix.cue.text}</p>
          </section>

          {handNote && <p className="text-[13px] text-chalk-3">{handNote}</p>}

          {question && player && <ProfilePrompt key={question} player={player} question={question} onSave={saveAnswer} onDismiss={dismissQuestion} />}

          {error && (
            <p role="alert" className="text-[13px] text-stitch">
              {error}
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3 pt-2">
            <Button size="lg" className="display w-full !min-h-16 text-[1.4rem]" onClick={record}>
              Again
            </Button>
            <Link href={`/swings/${last.id}`} className="py-2 text-center text-[15px] font-semibold text-optic">
              See full breakdown
            </Link>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div className="relative mx-auto max-w-[30rem] px-5 pt-24 text-center">
          <h1 className="display text-2xl">Camera didn&apos;t start</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] text-chalk-2">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <Link href="/record" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-[15px]">
              Upload a video
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
