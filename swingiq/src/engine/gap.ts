/**
 * The gap: time from front foot down to contact, in seconds. The scoreboard's headline number ("Own the gap").
 *
 * It comes straight from the swing's phases (`footPlant` → `contact`), and inherits the source and confidence of the
 * `strideTiming` metric that measures the same interval. Slow-pitch reference: skilled hitters land the front heel about
 * 0.2 s before contact (Wu et al., see docs/reports/Slow pitch lower body mechanics.md). Baseball's "get the foot down
 * early" norm does not apply.
 *
 * Precision: live mode tracks at the camera's 30–60 fps, so the gap is only good to about one tracking frame. We round
 * to hundredths, always show ± one frame, and label it an estimate. Below a minimum confidence we show a dash and a
 * short reason instead of a number.
 */
import type { MetricSource, SwingAnalysis } from "./types";

/** The slow-pitch reference for the gap (s), and the window around it (matches FOOT_DOWN_WINDOW in lib/insights). */
export const GAP_REFERENCE_S = 0.2;
export const GAP_WINDOW_S = { lo: 0.14, hi: 0.38 } as const;
/** Below this confidence ("Low" in the app's labels) the scoreboard shows a dash instead of a number. */
export const GAP_MIN_CONFIDENCE = 0.45;
/** Longer than this between foot down and contact isn't a stride for this swing. */
const GAP_MAX_S = 1.5;
/** Used when the tracking rate wasn't recorded. */
const FALLBACK_FPS = 30;

export type GapVerdict = "quick" | "window" | "waited";

export type GapReading =
  | {
      ok: true;
      /** Gap in seconds, rounded to hundredths. */
      seconds: number;
      /** ± one tracking frame, in seconds, rounded up to hundredths. */
      plusMinus: number;
      /** Tracking rate the gap was measured at. */
      fps: number;
      source: Exclude<MetricSource, "unavailable">;
      confidence: number;
      verdict: GapVerdict;
      /** Plain words for the verdict, against the slow-pitch reference. */
      verdictText: string;
    }
  | {
      ok: false;
      /** A few words for the scoreboard, under the dash. */
      short: string;
      /** The full reason, for screen readers and the swing page. */
      reason: string;
      source: "unavailable";
      confidence: 0;
    };

function none(short: string, reason: string): GapReading {
  return { ok: false, short, reason, source: "unavailable", confidence: 0 };
}

export function gapVerdict(seconds: number): { verdict: GapVerdict; text: string } {
  if (seconds < GAP_WINDOW_S.lo) return { verdict: "quick", text: "Still landing as you swung" };
  if (seconds > GAP_WINDOW_S.hi) return { verdict: "waited", text: "Landed early and waited" };
  return { verdict: "window", text: "In the slow-pitch window" };
}

/** The gap for one analysed swing, or why there isn't one. */
export function gapReading(a: Pick<SwingAnalysis, "phases" | "metrics" | "quality">): GapReading {
  const st = a.metrics.strideTiming;
  const { footPlant, contact } = a.phases;

  if (st?.source === "unavailable") {
    const r = st.reason ?? "";
    const short = /feet|visible|picture|view/i.test(r) ? "Feet not in view" : /stride|toe tap/i.test(r) ? "No stride to time" : "Foot down not found";
    return none(short, r || "Couldn't measure when the front foot landed.");
  }
  if (footPlant === null || footPlant === undefined || !Number.isFinite(footPlant) || !Number.isFinite(contact)) {
    return none("Foot down not found", "Couldn't find when the front foot landed on this swing.");
  }
  const ms = contact - footPlant;
  if (ms < 0) {
    return none("Foot not down at contact", "Contact came before the front foot landed, so there's no gap to time.");
  }
  if (ms / 1000 > GAP_MAX_S) {
    return none("Foot down not found", "The foot landed too long before contact to belong to this swing.");
  }

  const confidence = st?.confidence ?? 0;
  if (!st || confidence < GAP_MIN_CONFIDENCE) {
    return none("Low confidence", "Tracking was too slow or the feet too unclear to time the gap. Try more light or a steadier phone.");
  }

  const fps = a.quality.poseFps > 0 ? a.quality.poseFps : FALLBACK_FPS;
  const seconds = Math.round(ms / 10) / 100;
  const plusMinus = Math.ceil(100 / fps - 1e-9) / 100;
  const v = gapVerdict(seconds);
  return { ok: true, seconds, plusMinus, fps: Math.round(fps), source: st.source, confidence, verdict: v.verdict, verdictText: v.text };
}

/** "0.21" for the board. */
export function gapDisplay(seconds: number): string {
  return seconds.toFixed(2);
}

const DIGIT = ["oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "point two one" for the voice (1.05 → "one point oh five"). */
export function gapSpoken(seconds: number): string {
  const [whole, frac] = seconds.toFixed(2).split(".");
  const head = whole === "0" ? "point" : `${whole === "1" ? "one" : whole} point`;
  return `${head} ${frac.split("").map((d) => DIGIT[Number(d)]).join(" ")}`;
}

/** What the voice says after a swing in scoreboard mode: "72. Gap, point two one. Hands dropped." */
export function scoreboardSpeech(score: number | null, gap: GapReading, cue: string): string {
  const parts: string[] = [];
  if (score !== null) parts.push(`${score}.`);
  if (gap.ok) parts.push(`Gap, ${gapSpoken(gap.seconds)}.`);
  parts.push(cue);
  return parts.join(" ");
}
