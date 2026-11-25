"use client";
import { scoreSwing } from "@/engine/scoring";
import type { CameraView, Handedness, MetricValue, PoseFrame, ScoreCategoryKey, SwingAnalysis } from "@/engine/types";
import { SourceTag } from "./ui";
import { PhaseLine } from "./viz/PhaseLine";
import { BalanceTrace, FrontLegBlock, PathTrail, type Size } from "./viz/SwingFigures";

/*
  The read: timing, balance, rotation and bat path, each as a picture drawn from the swing's own tracking, its category
  score, and the checks that went into it. Everything here is estimated from body tracking (ring), and says so.
*/

export function scoreTone(s: number | null) {
  return s === null ? "text-chalk-3" : s >= 85 ? "text-optic" : s >= 50 ? "text-chalk" : "text-stitch";
}
function barTone(s: number) {
  return s >= 85 ? "bg-optic" : s >= 50 ? "bg-chalk-2" : "bg-stitch";
}

function ReadCard({
  title,
  score,
  reason,
  checks,
  children,
  caption,
}: {
  title: string;
  score: number | null;
  reason?: string;
  checks: { key: string; label: string; score: number }[];
  children: React.ReactNode;
  caption?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="frame flex flex-col rounded-2xl p-4 md:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="title">{title}</h3>
          <SourceTag kind="estimate" className="mt-1.5" />
        </div>
        <span className={`jumbo text-[2.6rem] ${scoreTone(score)}`} aria-label={score === null ? `${title}: not measured` : `${title}: ${score} of 100`}>
          {score ?? "—"}
        </span>
      </header>
      <div className="mt-3 flex-1">{children}</div>
      {caption && <p className="mt-2 text-[13px] leading-relaxed text-chalk-2">{caption}</p>}
      {score === null && reason && <p className="mt-2 text-[13px] leading-relaxed text-chalk-3">{reason}</p>}
      {checks.length > 0 && (
        <ul className="rows mt-3 border-t border-line text-[13px]">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 text-chalk-2">{c.label}</span>
              <span className="h-1 w-16 overflow-hidden rounded-full bg-night-4" aria-hidden="true">
                <span className={`block h-full rounded-full ${barTone(c.score)}`} style={{ width: `${Math.max(4, c.score)}%` }} />
              </span>
              <span className="num w-7 text-right text-chalk">{c.score}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <div className="hatch grid min-h-40 place-items-center rounded-xl px-6 text-center text-[13px] leading-relaxed text-chalk-3">{children}</div>;
}

/** Hips vs. hands: which started first, on a short time axis around launch. Only when the footage could tell. */
function HipsHands({ mv }: { mv?: MetricValue }) {
  if (!mv || mv.source === "unavailable" || mv.value === null) return null;
  const lead = mv.value; // ms the hips started before the hands (negative = hands first)
  const span = Math.max(160, Math.abs(lead) + 60);
  const x = (ms: number) => 8 + ((ms + span) / (span * 2)) * 84; // percent across
  return (
    <div className="mt-3 text-[12px]" role="img" aria-label={lead >= 0 ? `Hips started ${Math.round(lead)} ms before the hands` : `Hands started ${Math.round(-lead)} ms before the hips`}>
      {[
        { k: "Hips", at: -lead, tone: "bg-optic" },
        { k: "Hands", at: 0, tone: "bg-chalk" },
      ].map((r) => (
        <div key={r.k} className="relative flex h-6 items-center">
          <span className="w-12 shrink-0 text-chalk-3">{r.k}</span>
          <span className="relative h-px flex-1 bg-line-2">
            <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${r.tone}`} style={{ left: `${x(r.at)}%` }} />
          </span>
        </div>
      ))}
      <p className="mt-1 text-chalk-2">
        {lead >= 0 ? `Hips started ${Math.round(lead)} ms before the hands.` : `Hands started ${Math.round(-lead)} ms before the hips.`}{" "}
        <span className="text-chalk-3">A hint, not a number to chase.</span>
      </p>
    </div>
  );
}

export function SwingRead({ analysis, pose, size, hand, view }: { analysis: SwingAnalysis; pose: PoseFrame[]; size: Size; hand: Handedness; view: CameraView }) {
  const cats = analysis.score.categories ?? scoreSwing(analysis.metrics, view).categories ?? [];
  const cat = (k: ScoreCategoryKey) => cats.find((c) => c.key === k);
  const checks = (k: ScoreCategoryKey) =>
    analysis.score.components.filter((c) => c.category === k && Number.isFinite(c.score)).map((c) => ({ key: c.key, label: c.label, score: Math.round(c.score) }));
  const p = analysis.phases;
  const balance = BalanceTrace({ pose, phases: p, size, hand });
  const leg = FrontLegBlock({ pose, phases: p, size, hand });
  const path = PathTrail({ pose, phases: p, size, hand, handPath: analysis.handPath, batPath: analysis.batPath });
  const block = analysis.metrics.frontLegBlock;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReadCard title="Timing" score={cat("timing")?.score ?? null} reason={cat("timing")?.reason} checks={checks("timing")}>
        <PhaseLine phases={p} />
      </ReadCard>
      <ReadCard
        title="Balance"
        score={cat("balance")?.score ?? null}
        reason={cat("balance")?.reason}
        checks={checks("balance")}
        caption="Your head (lime) and the middle of your hips from stance to finish, over your feet where you landed."
      >
        {balance ?? <Missing>Keep your whole body in the picture to see your head and hip path.</Missing>}
      </ReadCard>
      <ReadCard
        title="Rotation"
        score={cat("rotation")?.score ?? null}
        reason={cat("rotation")?.reason}
        checks={checks("rotation")}
        caption={
          leg ? (
            <>
              Front leg at foot down (dashed) and at contact (lime).
              {block && block.value !== null && block.source !== "unavailable" && (
                <>
                  {" "}
                  It {block.value >= 0 ? "straightened" : "kept bending"} <span className="num text-chalk">{Math.abs(Math.round(block.value))}°</span>
                  {block.value >= 0 ? ", giving your hips something to turn against." : " after you landed."}
                </>
              )}
            </>
          ) : undefined
        }
      >
        {leg ?? <Missing>Front foot landing wasn&apos;t visible. Keep your shoes in the picture to see your front side.</Missing>}
        <HipsHands mv={analysis.metrics.hipLead} />
      </ReadCard>
      <ReadCard
        title="Bat path"
        score={cat("batPath")?.score ?? null}
        reason={cat("batPath")?.reason}
        checks={checks("batPath")}
        caption={
          analysis.batPath?.length
            ? "Your hands' path in lime; the tracked barrel in alloy, from the high-speed clip."
            : "Your hands' path from the load through contact. Bat path is read from the hands; the barrel is tracked on slo-mo clips."
        }
      >
        {path ?? <Missing>Your hands weren&apos;t clear enough to draw their path.</Missing>}
      </ReadCard>
    </div>
  );
}
