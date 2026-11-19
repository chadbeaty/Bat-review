"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawSwingFrame, fitCanvas, nearestIndex } from "@/components/clipDraw";
import { displayValue, TEXT_METRICS } from "@/components/Metrics";
import { usePlayers } from "@/components/PlayerProvider";
import { Empty, PageTitle, Segmented, fmtDate } from "@/components/ui";
import { METRICS } from "@/engine/catalog";
import { scoreSwing } from "@/engine/scoring";
import type { MetricKey } from "@/engine/types";
import { db } from "@/lib/store/db";
import type { SwingRecord } from "@/lib/store/types";

type Anchor = "contact" | "footPlant" | "launch";
const COMPARE_KEYS: MetricKey[] = [
  "strideTiming",
  "frontFootSlide",
  "frontLegBlock",
  "weightShift",
  "headMovement",
  "handDrop",
  "handCast",
  "handPathAngle",
  "contactPoint",
  "finishHeight",
  "balance",
  "swingTime",
];

type Loaded = { swing: SwingRecord; frames: { t: number }[]; bitmaps: (ImageBitmap | null)[] };

function anchorTime(s: SwingRecord, a: Anchor) {
  const p = s.analysis.phases;
  if (a === "footPlant") return p.footPlant ?? p.contact;
  if (a === "launch") return p.launch;
  return p.contact;
}

function useClip(swing: SwingRecord | null): Loaded | null {
  const [state, setState] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!swing) return;
    let alive = true;
    const made: ImageBitmap[] = [];
    (async () => {
      const clip = await db.clip(swing.id);
      if (!clip?.frames.length) {
        if (alive) setState({ swing, frames: swing.pose.map((p) => ({ t: p.t })), bitmaps: [] });
        return;
      }
      const bitmaps = await Promise.all(
        clip.frames.map((f) =>
          createImageBitmap(f.blob)
            .then((b) => {
              made.push(b);
              return b;
            })
            .catch(() => null),
        ),
      );
      if (alive) setState({ swing, frames: clip.frames.map((f) => ({ t: f.t })), bitmaps });
    })().catch(() => alive && setState({ swing, frames: swing.pose.map((p) => ({ t: p.t })), bitmaps: [] }));
    return () => {
      alive = false;
      made.forEach((b) => b.close());
    };
  }, [swing]);
  return state && swing && state.swing.id === swing.id ? state : null;
}

function Panel({ loaded, rel, anchor, showSkeleton, label }: { loaded: Loaded | null; rel: number; anchor: Anchor; showSkeleton: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const c = ref.current;
    if (!c || !loaded || !loaded.frames.length) return;
    const s = loaded.swing;
    fitCanvas(c, s.frameSize);
    const t = anchorTime(s, anchor) + rel;
    const i = nearestIndex(loaded.frames, t);
    drawSwingFrame(c, { t: loaded.frames[i].t, bitmap: loaded.bitmaps[i], pose: s.pose, handPath: s.analysis.handPath, hand: s.hand, showSkeleton });
  }, [loaded, rel, anchor, showSkeleton]);
  useEffect(() => draw(), [draw]);
  useEffect(() => {
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);
  const s = loaded?.swing;
  return (
    <figure className="min-w-0">
      <div className="surface relative overflow-hidden rounded-2xl">
        <canvas ref={ref} className="block w-full" style={{ aspectRatio: s ? `${s.frameSize.width} / ${s.frameSize.height}` : "9 / 16" }} aria-label={label} />
        <span
          className={`num absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-md text-[14px] ${label.startsWith("A") ? "bg-optic text-optic-ink" : "bg-clay text-night"}`}
          aria-hidden="true"
        >
          {label.startsWith("A") ? "A" : "B"}
        </span>
      </div>
      <figcaption className="mt-1.5 truncate text-[13px] text-chalk-2">{label.slice(4)}</figcaption>
    </figure>
  );
}

function CompareInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, player } = usePlayers();
  const [all, setAll] = useState<SwingRecord[] | null>(null);
  const [anchor, setAnchor] = useState<Anchor>("contact");
  const [rel, setRel] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<"1" | "0.25" | "0.125">("0.25");
  const [showSkeleton, setShowSkeleton] = useState(true);

  useEffect(() => {
    if (!player) return;
    db.swingsForPlayer(player.id).then(setAll).catch(() => setAll([]));
  }, [player]);

  const aId = params.get("a");
  const bId = params.get("b");
  const A = useMemo(() => (all ? (all.find((s) => s.id === aId) ?? all[0] ?? null) : null), [all, aId]);
  const B = useMemo(() => {
    if (!all || !A) return null;
    return all.find((s) => s.id === bId) ?? all.find((s) => s.pb && s.id !== A.id) ?? all.find((s) => s.id !== A.id) ?? null;
  }, [all, A, bId]);
  const la = useClip(A);
  const lb = useClip(B);

  // Time range around the anchor that both clips can show (frames outside a clip hold on its first or last frame).
  const range = useMemo(() => {
    const span = (l: Loaded | null) => {
      if (!l || !l.frames.length) return [-500, 500];
      const at = anchorTime(l.swing, anchor);
      return [l.frames[0].t - at, l.frames[l.frames.length - 1].t - at];
    };
    const ra = span(la);
    const rb = span(lb);
    return [Math.round(Math.min(ra[0], rb[0])), Math.round(Math.max(ra[1], rb[1]))];
  }, [la, lb, anchor]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setRel((r) => {
        const next = r + (now - last) * Number(rate);
        if (next > range[1]) {
          setPlaying(false);
          return range[1];
        }
        return next;
      });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, range]);

  function pick(which: "a" | "b", id: string) {
    const q = new URLSearchParams(params.toString());
    q.set(which, id);
    if (A && which === "b") q.set("a", A.id);
    if (B && which === "a") q.set("b", B.id);
    router.replace(`/compare?${q.toString()}`);
  }

  if (!ready) return null;
  if (!player)
    return (
      <>
        <PageTitle title="Compare swings" />
        <Empty title="No hitter yet">Set one up on the Home screen first.</Empty>
      </>
    );
  if (all && all.length < 2)
    return (
      <>
        <PageTitle title="Compare swings" />
        <Empty title="Record two swings to compare">
          <p>Comparison lines two of your swings up side by side, in sync and in slow motion.</p>
          <Link href="/record" className="mt-4 inline-block text-optic">Record a swing</Link>
        </Empty>
      </>
    );
  if (!A || !B) return null;

  const label = (s: SwingRecord) => `Swing ${s.n} · ${fmtDate(s.at)}${s.pb ? " · ★ best" : ""}`;
  const catsA = A.analysis.score.categories ?? scoreSwing(A.analysis.metrics, A.view).categories ?? [];
  const catsB = B.analysis.score.categories ?? scoreSwing(B.analysis.metrics, B.view).categories ?? [];
  const portrait = A.frameSize.height >= A.frameSize.width && B.frameSize.height >= B.frameSize.width;

  return (
    <div className="animate-rise pb-10">
      <PageTitle title="Compare swings" sub="Two swings, lined up and played together." />

      <div className="grid grid-cols-2 gap-3">
        {(["a", "b"] as const).map((w) => {
          const cur = w === "a" ? A : B;
          return (
            <div key={w}>
              <label htmlFor={`pick-${w}`} className="mb-1 block text-xs text-chalk-3">{w === "a" ? "Swing A" : "Swing B"}</label>
              <select id={`pick-${w}`} value={cur.id} onChange={(e) => pick(w, e.target.value)} className="min-h-11 w-full rounded-xl border border-line-2 bg-night-2 px-2 text-[14px] text-chalk">
                {(all ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{label(s)}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className={`mt-4 grid gap-3 ${portrait ? "grid-cols-2" : "grid-cols-1"}`}>
        <Panel loaded={la} rel={rel} anchor={anchor} showSkeleton={showSkeleton} label={`A · ${label(A)}`} />
        <Panel loaded={lb} rel={rel} anchor={anchor} showSkeleton={showSkeleton} label={`B · ${label(B)}`} />
      </div>

      <div className="mt-3">
        <input
          type="range"
          className="scrub"
          min={range[0]}
          max={range[1]}
          value={Math.round(rel)}
          onChange={(e) => {
            setPlaying(false);
            setRel(Number(e.target.value));
          }}
          aria-label="Scrub both swings together"
        />
        <p className="num text-center text-sm text-chalk-2">
          {Math.round(rel) >= 0 ? "+" : ""}
          {Math.round(rel)} ms from {anchor === "contact" ? "contact" : anchor === "footPlant" ? "foot down" : "launch"}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!playing && rel >= range[1] - 1) setRel(range[0]);
            setPlaying((p) => !p);
          }}
          className="press grid h-12 w-16 place-items-center rounded-xl bg-optic text-optic-ink shadow-[0_10px_28px_-14px_rgb(215_180_106/0.7)]"
          aria-label={playing ? "Pause" : "Play both"}
        >
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="min-w-[13rem] flex-1">
          <Segmented label="Speed" value={rate} onChange={setRate} options={[{ value: "1", label: "1×" }, { value: "0.25", label: "¼×" }, { value: "0.125", label: "⅛×" }]} />
        </div>
        <button
          type="button"
          onClick={() => setShowSkeleton((s) => !s)}
          aria-pressed={showSkeleton}
          className={`press min-h-12 rounded-xl border px-3 text-sm ${showSkeleton ? "border-chalk-3 text-chalk" : "border-line-2 text-chalk-3"}`}
        >
          Skeleton
        </button>
      </div>
      <div className="mt-3">
        <span className="mb-1 block text-xs text-chalk-3">Line them up at</span>
        <Segmented
          label="Line up at"
          value={anchor}
          onChange={(v) => {
            setAnchor(v);
            setRel(0);
          }}
          options={[{ value: "launch", label: "Launch" }, { value: "footPlant", label: "Foot down" }, { value: "contact", label: "Contact" }]}
        />
      </div>

      <h2 className="head mb-3 mt-10 text-[17px]">Side by side</h2>
      <div className="surface overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[22rem] text-[14px]">
          <thead className="bg-night-2 text-left text-[12px] text-chalk-3">
            <tr>
              <th className="px-3 py-2 font-normal">What</th>
              <th className="px-3 py-2 text-right font-normal">A</th>
              <th className="px-3 py-2 text-right font-normal">B</th>
              <th className="px-3 py-2 text-right font-normal">A vs B</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="px-3 py-2 text-chalk">SwingIQ score</td>
              <td className="num px-3 py-2 text-right">{A.analysis.score.overall ?? "—"}</td>
              <td className="num px-3 py-2 text-right">{B.analysis.score.overall ?? "—"}</td>
              <Delta a={A.analysis.score.overall} b={B.analysis.score.overall} better="higher" decimals={0} />
            </tr>
            {catsA.map((c) => {
              const cb = catsB.find((x) => x.key === c.key);
              return (
                <tr key={c.key}>
                  <td className="px-3 py-2 pl-6 text-chalk-2">{c.label}</td>
                  <td className="num px-3 py-2 text-right">{c.score ?? "—"}</td>
                  <td className="num px-3 py-2 text-right">{cb?.score ?? "—"}</td>
                  <Delta a={c.score} b={cb?.score ?? null} better="higher" decimals={0} />
                </tr>
              );
            })}
            {COMPARE_KEYS.map((k) => {
              const ma = A.analysis.metrics[k];
              const mb = B.analysis.metrics[k];
              if (!ma && !mb) return null;
              const va = ma && ma.source !== "unavailable" ? ma.value : null;
              const vb = mb && mb.source !== "unavailable" ? mb.value : null;
              const show = (m: typeof ma) => (!m || m.source === "unavailable" ? "—" : displayValue(m));
              return (
                <tr key={k}>
                  <td className="px-3 py-2 text-chalk">{METRICS[k].label}</td>
                  <td className="num px-3 py-2 text-right">{show(ma)}</td>
                  <td className="num px-3 py-2 text-right">{show(mb)}</td>
                  {TEXT_METRICS.has(k) ? <td className="px-3 py-2" /> : <Delta a={va} b={vb} better={METRICS[k].better} decimals={METRICS[k].decimals} unit={METRICS[k].suffix} />}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-chalk-3">Camera estimates carry the same confidence as on each swing&apos;s own page. A dash means that swing&apos;s footage couldn&apos;t support the number.</p>
    </div>
  );
}

function Delta({ a, b, better, decimals, unit = "" }: { a: number | null; b: number | null; better: "higher" | "lower" | "neither"; decimals: number; unit?: string }) {
  if (a === null || b === null) return <td className="px-3 py-2 text-right text-chalk-3">—</td>;
  const d = a - b;
  const good = better === "neither" || Math.abs(d) < Math.pow(10, -decimals) ? null : (better === "higher") === d > 0;
  return (
    <td className={`num whitespace-nowrap py-2 pl-2 pr-3 text-right ${good === null ? "text-chalk-2" : good ? "text-optic" : "text-amber"}`}>
      {d > 0 ? "+" : d < 0 ? "−" : ""}
      {Math.abs(d).toFixed(decimals)}
      {unit && unit !== ": 1" ? <span className="ml-0.5 font-sans text-[11px] opacity-80">{unit}</span> : null}
    </td>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareInner />
    </Suspense>
  );
}
