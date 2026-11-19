"use client";
import { useState } from "react";
import { METRICS, SOURCE_LABEL, confidenceLabel, formatMetric } from "@/engine/catalog";
import type { Cue, MetricKey, MetricValue } from "@/engine/types";

export const BASIC_KEYS: MetricKey[] = ["swingTime", "headMovement", "handDrop", "balance", "contact"];
export const ADVANCED_ORDER: MetricKey[] = [
  "swingTime",
  "loadTime",
  "tempoRatio",
  "strideTiming",
  "handSpeed",
  "batSpeed",
  "exitVelocity",
  "launchAngle",
  "attackAngle",
  "headMovement",
  "handDrop",
  "strideLength",
  "weightShift",
  "balance",
  "hipTurn",
  "shoulderTurn",
  "separation",
  "sequence",
  "contact",
];

export function displayValue(mv: MetricValue): string {
  if (mv.key === "sequence") return mv.text ?? "—";
  if (mv.key === "contact") return mv.text ?? (mv.value ? "Contact" : "—");
  return formatMetric(mv.key, mv.value);
}

function SourceBadge({ mv }: { mv: MetricValue }) {
  const tone =
    mv.source === "unavailable"
      ? "border-line text-chalk-3"
      : mv.source === "sensor"
        ? "border-optic/50 text-optic"
        : mv.source === "measured"
          ? "border-chalk-3 text-chalk"
          : "border-line text-chalk-2";
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${tone}`}>
      {SOURCE_LABEL[mv.source]}
      {mv.source === "cv_estimated" && ` · ${confidenceLabel(mv.confidence)} confidence`}
    </span>
  );
}

/** Small "vs your average" note. */
function Compare({ k, value, avg }: { k: MetricKey; value: number | null; avg?: number }) {
  if (value === null || avg === undefined || Number.isNaN(avg)) return null;
  const info = METRICS[k];
  const d = value - avg;
  if (Math.abs(d) < Math.pow(10, -info.decimals) / 2) return <span className="text-[12px] text-chalk-3">same as your average</span>;
  const better = info.better === "neither" ? null : (info.better === "higher") === d > 0;
  return (
    <span className={`text-[12px] ${better === null ? "text-chalk-3" : better ? "text-optic" : "text-amber"}`}>
      {d > 0 ? "+" : "−"}
      {Math.abs(d).toFixed(info.decimals)}
      {info.suffix && info.suffix !== ": 1" ? ` ${info.suffix}` : ""} vs your avg
    </span>
  );
}

export function MetricRow({ mv, avg }: { mv: MetricValue; avg?: number }) {
  const [open, setOpen] = useState(false);
  const info = METRICS[mv.key];
  const na = mv.source === "unavailable";
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 py-3.5 text-left">
        <span className="min-w-0">
          <span className="block text-[15px] text-chalk">{info.label}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <SourceBadge mv={mv} />
            {!na && <Compare k={mv.key} value={mv.value} avg={avg} />}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {na ? (
            <span className="num text-2xl text-chalk-3" aria-hidden="true">—</span>
          ) : mv.key === "sequence" || mv.key === "contact" ? (
            <span className="block max-w-[11rem] text-[15px] font-bold leading-snug text-chalk">{displayValue(mv)}</span>
          ) : (
            <>
              <span className="num text-2xl text-chalk">{displayValue(mv)}</span>
              {info.suffix && <span className="ml-1 text-sm text-chalk-3">{info.suffix}</span>}
            </>
          )}
        </span>
      </button>
      {(open || na) && (
        <div className="-mt-1 space-y-1.5 pb-4 text-[13px] leading-relaxed text-chalk-2">
          {na ? <p>{mv.reason}</p> : <p>{info.explain}</p>}
          {open && (
            <>
              {mv.text && mv.key !== "sequence" && mv.key !== "contact" && <p className="text-chalk">{mv.text}</p>}
              {!na && mv.reason && <p className="text-amber">{mv.reason}</p>}
              <p className="text-chalk-3">
                <span className="text-chalk-2">How it&apos;s measured:</span> {info.method}
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function MetricList({ metrics, keys, averages }: { metrics: Partial<Record<MetricKey, MetricValue>>; keys: MetricKey[]; averages?: Partial<Record<MetricKey, number>> }) {
  const rows = keys.map((k) => metrics[k]).filter((m): m is MetricValue => !!m);
  return (
    <ul>
      {rows.map((mv) => (
        <MetricRow key={mv.key} mv={mv} avg={averages?.[mv.key]} />
      ))}
    </ul>
  );
}

export function CueLine({ cue, large = false }: { cue: Cue; large?: boolean }) {
  const color = cue.tone === "fix" ? "bg-stitch" : cue.tone === "praise" ? "bg-optic" : "bg-chalk-3";
  return (
    <p className={`flex gap-3 ${large ? "text-[17px] leading-snug" : "text-[15px] leading-snug"} text-chalk`}>
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />
      <span>
        <span className="sr-only">{cue.tone === "fix" ? "Fix: " : cue.tone === "praise" ? "Nice: " : "Note: "}</span>
        {cue.text}
      </span>
    </p>
  );
}

/** Averages of numeric metrics across swings (for comparisons). */
export function averageMetrics(list: Partial<Record<MetricKey, MetricValue>>[]): Partial<Record<MetricKey, number>> {
  const sums: Partial<Record<MetricKey, { s: number; n: number }>> = {};
  for (const m of list) {
    for (const [k, v] of Object.entries(m) as [MetricKey, MetricValue][]) {
      if (!v || v.source === "unavailable" || v.value === null || k === "sequence" || k === "contact") continue;
      const e = (sums[k] ??= { s: 0, n: 0 });
      e.s += v.value;
      e.n++;
    }
  }
  const out: Partial<Record<MetricKey, number>> = {};
  for (const [k, e] of Object.entries(sums) as [MetricKey, { s: number; n: number }][]) if (e.n >= 2) out[k] = e.s / e.n;
  return out;
}
