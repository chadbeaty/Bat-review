"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawSwingFrame, fitCanvas } from "./clipDraw";
import type { Handedness, PoseFrame, SwingPhases } from "@/engine/types";

type PhaseMark = { key: string; label: string; t: number };

export function phaseMarks(p: SwingPhases): PhaseMark[] {
  const marks: (PhaseMark | null)[] = [
    { key: "stance", label: "Stance", t: p.stanceStart },
    p.loadStart !== null ? { key: "load", label: "Load", t: p.loadStart } : null,
    p.strideStart !== null ? { key: "stride", label: "Stride", t: p.strideStart } : null,
    p.footPlant !== null ? { key: "plant", label: "Foot down", t: p.footPlant } : null,
    { key: "launch", label: "Launch", t: p.launch },
    { key: "contact", label: "Contact", t: p.contact },
    { key: "finish", label: "Finish", t: p.finish },
  ];
  return marks.filter((m): m is PhaseMark => !!m);
}

function nearest<T extends { t: number }>(xs: T[], t: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1].t - t) < Math.abs(xs[lo].t - t)) return lo - 1;
  return lo;
}

/**
 * Frame-by-frame swing player: the recorded frames with the tracked skeleton, the grip's path and the swing phases.
 * Works without video too (skeleton only) if the clip was deleted to save space.
 */
export function ClipPlayer({
  pose,
  frames,
  phases,
  frameSize,
  handPath,
  hand = "R",
}: {
  pose: PoseFrame[];
  frames: { t: number; blob: Blob }[] | null;
  phases: SwingPhases;
  frameSize: { width: number; height: number };
  handPath: { t: number; x: number; y: number }[];
  hand?: Handedness;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bitmaps, setBitmaps] = useState<(ImageBitmap | null)[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<1 | 0.25>(0.25);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // The timeline is the clip frames when we have them, otherwise the pose frames.
  const timeline = useMemo(() => (frames?.length ? frames.map((f) => ({ t: f.t })) : pose.map((p) => ({ t: p.t }))), [frames, pose]);
  const marks = useMemo(() => phaseMarks(phases), [phases]);
  const t0 = timeline[0]?.t ?? 0;
  const t1 = timeline[timeline.length - 1]?.t ?? 1;
  // Start on the contact frame: it's the one players want first. (The parent keys this component by swing.)
  const [idx, setIdx] = useState(() => (timeline.length ? nearest(timeline, phases.contact) : 0));

  useEffect(() => {
    let alive = true;
    const made: ImageBitmap[] = [];
    if (!frames?.length) return;
    Promise.all(
      frames.map((f) =>
        createImageBitmap(f.blob)
          .then((b) => {
            made.push(b);
            return b;
          })
          .catch(() => null),
      ),
    ).then((bs) => alive && setBitmaps(bs));
    return () => {
      alive = false;
      made.forEach((b) => b.close());
    };
  }, [frames]);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !timeline.length) return;
    fitCanvas(c, frameSize);
    drawSwingFrame(c, { t: timeline[idx].t, bitmap: bitmaps?.[idx], pose, handPath, hand, showSkeleton });
  }, [bitmaps, idx, timeline, pose, handPath, showSkeleton, frameSize, hand]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  // Playback at real frame spacing, scaled by the chosen rate.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let clock = timeline[idx]?.t ?? t0;
    const tick = (now: number) => {
      clock += (now - last) * rate;
      last = now;
      if (clock > t1) {
        setPlaying(false);
        setIdx(timeline.length - 1);
        return;
      }
      setIdx(nearest(timeline, clock));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // idx is only read when playback starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, timeline, t0, t1]);

  const step = (d: number) => {
    setPlaying(false);
    setIdx((i) => Math.max(0, Math.min(timeline.length - 1, i + d)));
  };

  const curT = timeline[idx]?.t ?? t0;
  const currentPhase = [...marks].reverse().find((m) => curT >= m.t)?.label ?? "Stance";

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-night-2">
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ aspectRatio: `${frameSize.width} / ${frameSize.height}`, maxHeight: "68dvh", objectFit: "contain" }}
          aria-label={`Swing frame ${idx + 1} of ${timeline.length}, ${currentPhase}`}
        />
        <div className="absolute left-3 top-3 rounded-lg bg-night/80 px-2.5 py-1 text-sm font-bold text-optic">{currentPhase}</div>
        <div className="num absolute right-3 top-3 rounded-lg bg-night/80 px-2.5 py-1 text-sm text-chalk-2">
          {Math.round(curT - phases.contact) >= 0 ? "+" : ""}
          {Math.round(curT - phases.contact)} ms
        </div>
        {!frames?.length && (
          <div className="absolute inset-x-0 bottom-3 text-center text-xs text-chalk-3">Video not saved for this swing. Showing tracking only.</div>
        )}
      </div>

      {/* Timeline with phase marks */}
      <div className="relative mt-3 px-1">
        <input
          type="range"
          className="scrub"
          min={0}
          max={Math.max(0, timeline.length - 1)}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            setIdx(Number(e.target.value));
          }}
          aria-label="Scrub through the swing"
        />
        <div className="relative h-5">
          {marks.map((m) => (
            <span
              key={m.key}
              className={`absolute top-0 h-2 w-0.5 -translate-x-1/2 ${m.key === "contact" ? "bg-optic" : "bg-chalk-3"}`}
              style={{ left: `${((m.t - t0) / Math.max(1, t1 - t0)) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-1 flex flex-wrap gap-2">
        {marks.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => {
              setPlaying(false);
              setIdx(nearest(timeline, m.t));
            }}
            className={`min-h-9 rounded-lg border px-3 text-sm ${currentPhase === m.label ? "border-optic text-optic" : "border-line text-chalk-2 hover:text-chalk"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} className="grid h-12 w-12 place-items-center rounded-xl border border-line text-chalk hover:bg-night-3" aria-label="Previous frame">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4 6 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!playing && idx >= timeline.length - 1) setIdx(0);
              setPlaying((p) => !p);
            }}
            className="grid h-12 w-16 place-items-center rounded-xl bg-optic text-optic-ink"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
            )}
          </button>
          <button type="button" onClick={() => step(1)} className="grid h-12 w-12 place-items-center rounded-xl border border-line text-chalk hover:bg-night-3" aria-label="Next frame">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="m8 4 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRate((r) => (r === 1 ? 0.25 : 1))} className="min-h-12 rounded-xl border border-line px-3 text-sm text-chalk-2 hover:text-chalk" aria-label="Playback speed">
            {rate === 1 ? "1×" : "¼×"}
          </button>
          <button
            type="button"
            onClick={() => setShowSkeleton((s) => !s)}
            aria-pressed={showSkeleton}
            className={`min-h-12 rounded-xl border px-3 text-sm ${showSkeleton ? "border-chalk-3 text-chalk" : "border-line text-chalk-3"}`}
          >
            Skeleton
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-chalk-3">
        Frame {idx + 1} of {timeline.length}
      </p>
    </div>
  );
}
