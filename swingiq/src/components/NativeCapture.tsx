"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import type { GapperCapturePlugin, NativeRecording, PreviewState, SetupCheck } from "@/native/capture";

/**
 * Gapper's own high-speed camera, inside the iOS app. The native engine draws the camera full screen behind this page
 * (the page goes see-through while it's open); this component is the overlay: the setup assistant with live checks,
 * the framing guide, and Record / Stop. The video comes back real speed at 240 fps with every frame's true time.
 */
export function NativeCapture({ plugin, onDone, onCancel }: { plugin: GapperCapturePlugin; onDone: (r: NativeRecording) => void; onCancel: () => void }) {
  const [state, setState] = useState<PreviewState | null>(null);
  const [phase, setPhase] = useState<"setup" | "recording" | "saving">("setup");
  const [marks, setMarks] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    let alive = true;
    const subs: { remove: () => Promise<void> }[] = [];
    document.documentElement.classList.add("native-camera");
    (async () => {
      try {
        subs.push(await plugin.addListener("previewState", (s) => alive && setState(s)));
        subs.push(await plugin.addListener("swingMark", () => alive && setMarks((n) => n + 1)));
        const s = await plugin.startPreview({ fps: 240, orientation: "landscape", maxExposureS: 1 / 1000, lens: "wide" });
        if (alive) setState(s);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "The camera couldn't start.");
      }
    })();
    return () => {
      alive = false;
      document.documentElement.classList.remove("native-camera");
      subs.forEach((s) => s.remove().catch(() => {}));
      plugin.stopPreview().catch(() => {});
    };
  }, [plugin]);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [phase]);

  const checks = state?.checks ?? [];
  const blocking = checks.some((c) => c.status === "fail");

  async function record() {
    setError(null);
    try {
      await plugin.startRecording();
      startedAt.current = Date.now();
      setMarks(0);
      setPhase("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start recording.");
    }
  }

  async function stop() {
    setPhase("saving");
    try {
      onDone(await plugin.stopRecording());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the recording.");
      setPhase("setup");
    }
  }

  return createPortal(
    <div className="native-camera-overlay fixed inset-0 z-50 flex flex-col justify-between p-4 text-chalk" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      {/* Framing guide: hitter on one side, plate low in the middle, room in front for the ball. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true">
        <rect x="18" y="8" width="44" height="76" fill="none" stroke="rgba(245,242,234,0.5)" strokeWidth="0.4" strokeDasharray="2 2" />
        <path d="M70 80 h10 l2 3 h-14 z" fill="none" stroke="#C4F135" strokeWidth="0.5" />
        <path d="M84 70 H150" stroke="rgba(185,191,197,0.45)" strokeWidth="0.4" strokeDasharray="1 2" />
      </svg>

      <div className="relative flex items-start justify-between gap-3">
        <div className="rounded-xl bg-night/80 px-3 py-2 text-[13px] backdrop-blur-sm">
          {state ? (
            <>
              <span className="num text-optic">{state.format.fps} fps</span> · {state.format.width}×{state.format.height} ·{" "}
              {state.exposureS > 0 ? `1/${Math.round(1 / state.exposureS)} s` : "auto"}
            </>
          ) : (
            "Starting the camera…"
          )}
        </div>
        {phase === "setup" && (
          <Button variant="ghost" onClick={onCancel}>
            Close
          </Button>
        )}
      </div>

      {phase === "setup" && (
        <div className="relative max-w-md rounded-2xl bg-night/85 p-4 backdrop-blur-sm">
          <p className="head text-[15px]">Set up the shot</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-chalk-2">
            <li>Phone sideways on a tripod or the fence. Not in your hand.</li>
            <li>Facing the hitter&apos;s chest, 10 to 14 feet from the plate, chest high, tipped slightly down.</li>
            <li>Hitter in the dashed box, plate on the lime mark, open space in front for the ball.</li>
          </ol>
          <ul className="mt-3 space-y-1.5" aria-live="polite">
            {checks.map((c) => (
              <CheckRow key={c.id} c={c} />
            ))}
          </ul>
        </div>
      )}

      <div className="relative flex items-center justify-center gap-4">
        {error && <p role="alert" className="rounded-lg bg-night/85 px-3 py-2 text-[13px] text-amber">{error}</p>}
        {phase === "setup" && (
          <button
            type="button"
            onClick={record}
            disabled={!state || blocking}
            className="press h-20 w-20 rounded-full border-4 border-chalk bg-clay disabled:opacity-40"
            aria-label={blocking ? "Fix the red checks to record" : "Start recording"}
          />
        )}
        {phase === "recording" && (
          <>
            <span className="num rounded-lg bg-night/80 px-3 py-1 text-lg">{Math.floor(elapsed / 1000)}s</span>
            <button type="button" onClick={stop} className="press flex h-20 w-20 items-center justify-center rounded-full border-4 border-chalk bg-night/60" aria-label="Stop recording">
              <span className="h-7 w-7 rounded-md bg-clay" />
            </button>
            <span className="rounded-lg bg-night/80 px-3 py-1 text-[13px]">
              {marks} {marks === 1 ? "swing" : "swings"}
            </span>
          </>
        )}
        {phase === "saving" && <span className="rounded-lg bg-night/80 px-3 py-2 text-[14px]">Saving…</span>}
      </div>
    </div>,
    document.body,
  );
}

function CheckRow({ c }: { c: SetupCheck }) {
  const color = c.status === "ok" ? "bg-optic" : c.status === "warn" ? "bg-amber" : "bg-clay";
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
      <span>
        <span className="sr-only">{c.status === "ok" ? "Good: " : c.status === "warn" ? "Check: " : "Fix: "}</span>
        {c.message}
      </span>
    </li>
  );
}
