"use client";
import Link from "next/link";
import { useState } from "react";
import { coachingFor } from "@/engine/coaching";
import { scoreSwing } from "@/engine/scoring";
import type { SwingAnalysis } from "@/engine/types";

function barColor(s: number) {
  return s >= 85 ? "bg-optic" : s >= 50 ? "bg-chalk-2" : "bg-stitch";
}

/** The six score categories, each with the checks behind it. Unmeasured categories say why instead of guessing. */
export function ScoreCategories({ analysis, view }: { analysis: SwingAnalysis; view: "side" | "behind" | "front" }) {
  const [open, setOpen] = useState<string | null>(null);
  // Swings saved before categories existed get them computed from their stored metrics.
  const cats = analysis.score.categories ?? scoreSwing(analysis.metrics, view).categories ?? [];
  const comps = analysis.score.components;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="title shrink-0 whitespace-nowrap text-[16px]">Score breakdown</h2>
        <span className="text-right text-[12px] text-chalk-3">Tap a row for details</span>
      </div>
      <ul className="space-y-0.5" aria-label="Score breakdown">
        {cats.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => setOpen((o) => (o === c.key ? null : c.key))}
              aria-expanded={open === c.key}
              className="press flex min-h-11 w-full items-center gap-3 rounded-lg px-1 py-2 text-left text-[14px] hover:bg-white/[0.03]"
            >
              <span className="w-28 shrink-0 text-chalk">{c.label}</span>
              {c.score === null ? (
                <span className="hatch h-1.5 flex-1 rounded-full bg-night-3" title="Not measured" />
              ) : (
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-night-4">
                  <span className={`grow block h-full rounded-full ${barColor(c.score)}`} style={{ width: `${Math.max(3, c.score)}%` }} />
                </span>
              )}
              <span className={`num w-9 text-right text-[15px] ${c.score === null ? "text-chalk-3" : c.score >= 85 ? "text-optic" : c.score < 50 ? "text-stitch" : "text-chalk"}`}>{c.score ?? "—"}</span>
              <span className={`text-chalk-3 transition ${open === c.key ? "rotate-90" : ""}`} aria-hidden="true">›</span>
            </button>
            {open === c.key && (
              <div className="animate-fade mb-2 ml-2 border-l border-line-2 pl-3 text-[13px] text-chalk-2">
                {c.score === null ? (
                  <p>{c.reason ?? "Not measured from this camera view."}</p>
                ) : (
                  <ul className="space-y-1 py-1">
                    {comps
                      .filter((x) => x.category === c.key)
                      .map((x) => (
                        <li key={x.key} className="flex justify-between gap-3">
                          <span>{x.label}</span>
                          <span className="num text-chalk">{x.score}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The one fix: the single thing to work on from this swing, why it matters, the drill for it and a 10-swing challenge.
 * One fix, not ten tips. It gets its own stage because it's the most useful thing Gapper says.
 */
export function CoachCard({ analysis, action }: { analysis: SwingAnalysis; action?: React.ReactNode }) {
  const c = coachingFor(analysis.cue, analysis.metrics, analysis.score.overall);
  return (
    <section aria-label="Coach" className="stage relative overflow-hidden rounded-2xl">
      <span className="absolute inset-y-6 left-0 w-[3px] rounded-r bg-stitch" aria-hidden="true" />
      <div className="px-5 pb-5 pt-5 md:px-7 md:pt-6">
        <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-chalk-3">
          <span className="h-2 w-2 rounded-full bg-stitch" aria-hidden="true" />
          The one fix
        </p>
        <h3 className="display t-m mt-2 leading-[1.02]">{c.title}</h3>
        <p className="mt-3 max-w-[46ch] text-[18px] font-semibold leading-snug text-chalk md:text-[20px]">{c.fix}</p>
      </div>
      <dl className="grid border-t border-line text-[14px] leading-relaxed md:grid-cols-2">
        <div className="px-5 py-4 md:px-7">
          <dt className="label">Why it matters</dt>
          <dd className="mt-1.5 text-chalk-2">{c.why}</dd>
        </div>
        <div className="border-t border-line px-5 py-4 md:border-l md:border-t-0 md:px-7">
          <dt className="text-[13px] font-bold text-chalk">Drill: {c.drill.name}</dt>
          <dd className="mt-1.5 text-chalk-2">{c.drill.how}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-optic/20 bg-optic-wash/70 px-5 py-4 md:px-7">
        <dl>
          <dt className="text-[12px] font-bold uppercase tracking-[0.08em] text-optic">10-swing challenge</dt>
          <dd className="mt-1 text-[16px] font-bold text-chalk">{c.challenge.goal}</dd>
        </dl>
        {action}
      </div>
    </section>
  );
}

export function SourceBadge({ source }: { source?: "live" | "video" }) {
  return source === "video" ? (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-optic/40 bg-optic-wash px-1.5 py-0.5 text-[11px] font-semibold text-optic">Processed from video · every frame</span>
  ) : (
    <span className="rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-chalk-2">Live estimate</span>
  );
}

export function CompareLink({ a, b, children }: { a: string; b: string; children: React.ReactNode }) {
  return (
    <Link href={`/compare?a=${a}&b=${b}`} className="press inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-4 text-[15px] hover:border-chalk-3 hover:bg-night-3">
      {children}
    </Link>
  );
}
