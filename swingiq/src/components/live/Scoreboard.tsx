"use client";
import { SOURCE_LABEL, confidenceLabel } from "@/engine/catalog";
import { GAP_REFERENCE_S, GAP_WINDOW_S, gapDisplay, type GapReading } from "@/engine/gap";
import type { Cue } from "@/engine/types";

/**
 * Scoreboard mode: the after-swing readout sized to read from the plate (about 12 ft from a phone on a tripod).
 * Headline = the gap (front foot down → contact). Then the swing score and the cue. Navy, white numbers, lime only on
 * the ball marker and an in-window verdict. Never shows ball or bat speeds: those come from slo-mo uploads only.
 */
export function Scoreboard({ n, score, gap, cue, onClose }: { n: number; score: number | null; gap: GapReading; cue: Cue; onClose: () => void }) {
  const scale = 0.6; // reference bar runs 0 → 0.6 s
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / scale) * 100))}%`;
  const label = gap.ok
    ? `Gap ${gapDisplay(gap.seconds)} seconds, plus or minus ${gap.plusMinus}. ${gap.verdictText}. Score ${score ?? "not scored"}.`
    : `Gap not measured: ${gap.reason} Score ${score ?? "not scored"}.`;

  return (
    <section
      role="region"
      aria-label="Scoreboard"
      onClick={onClose}
      className="turf cut animate-slide-up mx-3 flex min-h-0 flex-1 cursor-pointer flex-col justify-center gap-[2.2vh] overflow-hidden rounded-2xl border border-white/10 px-[5vw] py-[2.5vh] landscape:grid landscape:grid-cols-[1.25fr_1fr] landscape:items-center landscape:gap-x-[4vw] landscape:gap-y-0 landscape:px-[4vw] landscape:py-[3vh]"
    >
      <p className="sr-only" aria-live="polite">{label}</p>

      {/* The gap */}
      <div aria-hidden="true" className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="display flex items-center gap-2 text-[min(7vw,4.6vh)] uppercase leading-none text-chalk landscape:text-[min(3vw,6vh)]">
            Gap
            <span className="inline-block size-[0.42em] rounded-full bg-optic" />
          </span>
          <span className="text-[min(4.2vw,2.6vh)] text-chalk-2 landscape:text-[min(2.2vw,4.6vh)]">Foot down → contact</span>
        </div>

        {gap.ok ? (
          <div data-testid="gap-value" className="jumbo mt-[1vh] whitespace-nowrap text-[min(31vw,18vh)] text-chalk landscape:text-[min(16vw,27vh)]">
            {gapDisplay(gap.seconds)}
            <span className="ml-[0.06em] align-baseline text-[0.36em] font-bold text-chalk-2">s</span>
          </div>
        ) : (
          <div data-testid="gap-value" className="mt-[1vh]">
            <div className="jumbo text-[min(18vw,10vh)] text-chalk-3 landscape:text-[min(10vw,20vh)]">—</div>
            <div className="head mt-[1vh] text-[min(7vw,4.4vh)] leading-tight text-chalk landscape:text-[min(3.4vw,7vh)]">{gap.short}</div>
            <p className="mt-[1vh] max-w-[40ch] text-[min(3.6vw,2.2vh)] text-chalk-2 landscape:text-[min(1.8vw,3.8vh)]">{gap.reason}</p>
          </div>
        )}

        {gap.ok && (
          <>
            <div className={`head mt-[0.6vh] text-[min(6.4vw,4vh)] leading-tight landscape:text-[min(2.8vw,5.4vh)] ${gap.verdict === "window" ? "text-optic" : "text-chalk"}`}>
              {gap.verdictText}
            </div>
            {/* Reference: the slow-pitch window, skilled hitters at 0.2 s, and this swing. */}
            <div className="relative mt-[2vh] h-[1.6vh] min-h-3 landscape:mt-[2.5vh] rounded-full bg-night-4">
              <span className="absolute inset-y-0 rounded-full bg-chalk-3/45" style={{ left: pct(GAP_WINDOW_S.lo), width: `calc(${pct(GAP_WINDOW_S.hi)} - ${pct(GAP_WINDOW_S.lo)})` }} />
              <span className="absolute -inset-y-[0.5vh] w-[3px] bg-chalk" style={{ left: pct(GAP_REFERENCE_S) }} />
              <span
                className="absolute top-1/2 size-[3.4vh] min-h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-night bg-optic"
                style={{ left: pct(gap.seconds) }}
              />
            </div>
            <div className="relative mt-[0.8vh] h-[2.4vh] text-[min(3.6vw,2.2vh)] text-chalk-2 landscape:mt-[1.5vh] landscape:h-[4vh] landscape:text-[min(1.6vw,3.6vh)]">
              <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(GAP_REFERENCE_S) }}>
                Skilled hitters ≈ 0.20
              </span>
            </div>
            <p className="mt-[1vh] text-[min(3.4vw,2vh)] text-chalk-3 landscape:truncate landscape:text-[min(1.5vw,3.4vh)]">
              Estimate ± {gap.plusMinus.toFixed(2)} s · {confidenceLabel(gap.confidence)} confidence · {SOURCE_LABEL[gap.source]} · one frame at {gap.fps} fps
            </p>
          </>
        )}
      </div>

      {/* Score and cue */}
      <div aria-hidden="true" className="flex min-w-0 items-end gap-[5vw] border-t border-white/10 pt-[2vh] landscape:flex-col landscape:items-start landscape:gap-[2vh] landscape:border-l landscape:border-t-0 landscape:pl-[4vw] landscape:pt-0">
        <div>
          <div className="display text-[min(4.6vw,2.8vh)] uppercase text-chalk-2 landscape:text-[min(2.4vw,5vh)]">Score</div>
          <div data-testid="scoreboard-score" className="jumbo mt-[0.6vh] text-[min(22vw,12vh)] text-chalk landscape:text-[min(12vw,26vh)]">
            {score ?? "—"}
          </div>
        </div>
        <div className="min-w-0 flex-1 pb-[0.6vh]">
          <div className="text-[min(3.6vw,2.2vh)] text-chalk-3 landscape:text-[min(1.8vw,3.8vh)]">Swing {n} · live estimate</div>
          <div className={`head mt-[0.4vh] text-[min(5.6vw,3.4vh)] leading-snug landscape:text-[min(2.8vw,5.6vh)] ${cue.tone === "praise" ? "text-optic" : "text-chalk"}`}>
            {cue.spoken}
          </div>
        </div>
      </div>
    </section>
  );
}
