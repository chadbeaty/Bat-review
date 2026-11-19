"use client";
import Link from "next/link";
import { useState } from "react";
import { coachingFor } from "@/engine/coaching";
import { scoreSwing } from "@/engine/scoring";
import type { SwingAnalysis } from "@/engine/types";

function barColor(s: number) {
  return s >= 75 ? "bg-optic" : s >= 50 ? "bg-amber" : "bg-stitch";
}

/** The six score categories, each with the checks behind it. Unmeasured categories say why instead of guessing. */
export function ScoreCategories({ analysis, view }: { analysis: SwingAnalysis; view: "side" | "behind" | "front" }) {
  const [open, setOpen] = useState<string | null>(null);
  // Swings saved before categories existed get them computed from their stored metrics.
  const cats = analysis.score.categories ?? scoreSwing(analysis.metrics, view).categories ?? [];
  const comps = analysis.score.components;
  return (
    <div>
      <p className="mb-2 text-xs text-chalk-3">Score breakdown. Tap a row to see what went into it.</p>
      <ul className="space-y-1" aria-label="Score breakdown">
        {cats.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => setOpen((o) => (o === c.key ? null : c.key))}
              aria-expanded={open === c.key}
              className="flex w-full items-center gap-3 rounded-lg py-1.5 text-left text-[14px]"
            >
              <span className="w-28 shrink-0 text-chalk">{c.label}</span>
              {c.score === null ? (
                <span className="flex-1 text-[12px] text-chalk-3">Not measured</span>
              ) : (
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-night-4">
                  <span className={`block h-full ${barColor(c.score)}`} style={{ width: `${c.score}%` }} />
                </span>
              )}
              <span className="num w-8 text-right text-chalk">{c.score ?? "—"}</span>
            </button>
            {open === c.key && (
              <div className="mb-2 ml-1 border-l-2 border-line pl-3 text-[13px] text-chalk-2">
                {c.score === null ? (
                  <p>{c.reason}</p>
                ) : (
                  <ul className="space-y-1">
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

/** Coach card: biggest issue, why it matters, the fix, a drill and a 10-swing challenge. */
export function CoachCard({ analysis, action }: { analysis: SwingAnalysis; action?: React.ReactNode }) {
  const c = coachingFor(analysis.cue, analysis.metrics, analysis.score.overall);
  return (
    <section aria-label="Coach" className="rounded-2xl border border-line bg-night-2 p-4">
      <p className="text-xs font-bold text-optic">Coach</p>
      <h3 className="display mt-1 text-xl leading-tight">{c.title}</h3>
      <dl className="mt-3 space-y-3 text-[14px] leading-relaxed">
        <div>
          <dt className="text-chalk-3">Why it matters</dt>
          <dd className="text-chalk-2">{c.why}</dd>
        </div>
        <div>
          <dt className="text-chalk-3">The fix</dt>
          <dd className="text-chalk">{c.fix}</dd>
        </div>
        <div>
          <dt className="text-chalk-3">Drill: {c.drill.name}</dt>
          <dd className="text-chalk-2">{c.drill.how}</dd>
        </div>
        <div className="rounded-xl bg-night-3 p-3">
          <dt className="text-chalk-3">10-swing challenge</dt>
          <dd className="font-bold text-chalk">{c.challenge.goal}</dd>
        </div>
      </dl>
      {action && <div className="mt-3">{action}</div>}
    </section>
  );
}

export function SourceBadge({ source }: { source?: "live" | "video" }) {
  return source === "video" ? (
    <span className="rounded-md border border-optic/50 px-1.5 py-0.5 text-[11px] font-bold text-optic">Processed from video · every frame</span>
  ) : (
    <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-chalk-2">Live estimate</span>
  );
}

export function CompareLink({ a, b, children }: { a: string; b: string; children: React.ReactNode }) {
  return (
    <Link href={`/compare?a=${a}&b=${b}`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-[15px] hover:bg-night-3">
      {children}
    </Link>
  );
}
