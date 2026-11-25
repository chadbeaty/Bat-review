"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawSwingFrame, fitCanvas } from "./clipDraw";
import { PoseThumb, poseAt, stripBox } from "./viz/SwingFigures";
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
  batPath,
  hand = "R",
}: {
  pose: PoseFrame[];
  frames: { t: number; blob: Blob }[] | null;
  phases: SwingPhases;
  frameSize: { width: number; height: number };
  handPath: { t: number; x: number; y: number }[];
  batPath?: { t: number; hx: number; hy: number; tx: number; ty: number; sx: number; sy: number }[];
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
    drawSwingFrame(c, { t: timeline[idx].t, bitmap: bitmaps?.[idx], pose, handPath, hand, showSkeleton, batPath });
  }, [bitmaps, idx, timeline, pose, handPath, showSkeleton, frameSize, hand, batPath]);

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
  const fromContact = Math.round(curT - phases.contact);
  const pct = (t: number) => `${((t - t0) / Math.max(1, t1 - t0)) * 100}%`;
  const thumbBox = useMemo(() => stripBox(pose, marks.map((m) => m.t), frameSize, 0.78), [pose, marks, frameSize]);
  const thumbs = useMemo(() => marks.map((m) => poseAt(pose, m.t)), [pose, marks]);
  const iconBtn = "press grid h-12 w-12 place-items-center rounded-xl border border-line-2 text-chalk hover:bg-white/[0.04]";

  return (
    <div>
      {/* The replay: the clip on carbon, where you are in the swing, and the time from contact. */}
      <div className="stage relative overflow-hidden rounded-2xl">
        <canvas
          ref={canvasRef}
          className="relative block w-full"
          style={{ aspectRatio: `${frameSize.width} / ${frameSize.height}`, maxHeight: "70dvh", objectFit: "contain" }}
          aria-label={`Swing frame ${idx + 1} of ${timeline.length}, ${currentPhase}`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/55 to-transparent p-3">
          <span className="flex items-center gap-2 rounded-md bg-night/75 px-2.5 py-1 backdrop-blur-sm">
            <span className={`h-2 w-2 rounded-full ${currentPhase === "Contact" ? "bg-optic" : "bg-chalk"}`} aria-hidden="true" />
            <span className="brandline text-[14px] leading-none text-chalk">{currentPhase}</span>
          </span>
          <span className="num rounded-md bg-night/75 px-2.5 py-1 text-[14px] leading-none text-chalk backdrop-blur-sm">
            {fromContact >= 0 ? "+" : "−"}
            {Math.abs(fromContact)}
            <span className="ml-0.5 text-[11px] font-semibold text-chalk-3">ms</span>
          </span>
        </div>
        <span className="num pointer-events-none absolute bottom-3 right-3 rounded-md bg-night/75 px-2 py-0.5 text-[11px] text-chalk-2 backdrop-blur-sm">
          {idx + 1}/{timeline.length}
        </span>
        {!frames?.length && (
          <div className="absolute inset-x-0 bottom-3 text-center text-xs text-chalk-3">Video not saved for this swing. Showing tracking only.</div>
        )}
      </div>

      {/* Scrubber with the phases marked on it; contact in lime. */}
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
          aria-valuetext={`Frame ${idx + 1} of ${timeline.length}, ${currentPhase}`}
        />
        <div className="relative -mt-1 h-2" aria-hidden="true">
          {marks.map((m) => (
            <span key={m.key} className={`absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-full ${m.key === "contact" ? "bg-optic" : "bg-chalk-3/70"}`} style={{ left: pct(m.t) }} />
          ))}
        </div>
      </div>

      {/* Controls: frame back, play, frame forward; speed and skeleton on the right. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} className={iconBtn} aria-label="Previous frame">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4 6 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" /></svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!playing && idx >= timeline.length - 1) setIdx(0);
              setPlaying((p) => !p);
            }}
            className="press grid h-12 w-[4.5rem] place-items-center rounded-xl bg-optic text-optic-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] hover:bg-optic-2"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" strokeWidth="3" strokeLinecap="square" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
            )}
          </button>
          <button type="button" onClick={() => step(1)} className={iconBtn} aria-label="Next frame">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="m8 4 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" /></svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRate((r) => (r === 1 ? 0.25 : 1))} className="press num min-h-12 min-w-12 rounded-xl border border-line-2 px-3 text-[14px] text-chalk-2 hover:text-chalk" aria-label={`Playback speed ${rate === 1 ? "normal" : "quarter"}`}>
            {rate === 1 ? "1×" : "¼×"}
          </button>
          <button
            type="button"
            onClick={() => setShowSkeleton((s) => !s)}
            aria-pressed={showSkeleton}
            className={`press min-h-12 rounded-xl border px-3 text-[14px] ${showSkeleton ? "border-chalk-3 text-chalk" : "border-line-2 text-chalk-3"}`}
          >
            Skeleton
          </button>
        </div>
      </div>

      {/* The phase strip: what the swing looked like at each phase. Tap one to jump there. */}
      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 [scrollbar-width:none]">
        <ol className="flex min-w-max gap-1.5 md:min-w-0" aria-label="Swing phases">
          {marks.map((m, i) => {
            const on = currentPhase === m.label;
            const dt = Math.round(m.t - phases.contact);
            return (
              <li key={m.key} className="w-[4.6rem] shrink-0 md:w-auto md:min-w-0 md:flex-1">
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setIdx(nearest(timeline, m.t));
                  }}
                  aria-pressed={on}
                  aria-label={m.label}
                  title={`${m.label}, ${dt === 0 ? "contact" : `${Math.abs(dt)} ms ${dt > 0 ? "after" : "before"} contact`}`}
                  className={`press group block w-full overflow-hidden rounded-lg border text-left ${on ? "border-optic/70 bg-optic-wash" : "border-line bg-white/[0.015] hover:border-line-2"}`}
                >
                  <span className="block h-[4.6rem] px-1 pt-1">
                    <PoseThumb lm={thumbs[i]} box={thumbBox} size={frameSize} hand={hand} active={on} />
                  </span>
                  <span className={`block border-t px-1.5 pb-1.5 pt-1 ${on ? "border-optic/30" : "border-line"}`}>
                    <span className={`block text-[12px] font-bold leading-tight ${on ? "text-optic" : "text-chalk"}`}>{m.label}</span>
                    <span className="num block text-[11px] font-semibold text-chalk-3">{dt === 0 ? "0 ms" : `${dt > 0 ? "+" : "−"}${Math.abs(dt)} ms`}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
