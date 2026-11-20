import { LEG_METRICS } from "./catalog";
import type { Cue, SwingAnalysis } from "./types";

export type OneFix = {
  /** The single thing to show. */
  cue: Cue;
  /** "fix": something to change. "keep": nothing to fix, so the best praise or note instead. */
  kind: "fix" | "keep";
  /** The fix is about the legs and feet. */
  legs: boolean;
};

const isLegs = (c: Cue) => c.basedOn.some((k) => LEG_METRICS.includes(k));

/**
 * Just Hit shows one thing per swing. It comes straight from the analyzer's ranked feedback (no new rules):
 * the worst legs-and-feet fault first (the owner's priority: the legs drive the swing), then the worst fault of any
 * kind, and only when nothing needs fixing, the swing's top praise or note.
 */
export function pickOneFix(a: Pick<SwingAnalysis, "cue" | "observations">): OneFix {
  const ranked = a.observations.length ? a.observations : [a.cue];
  const fixes = ranked.filter((c) => c.tone === "fix");
  const legFix = fixes.find(isLegs);
  if (legFix) return { cue: legFix, kind: "fix", legs: true };
  if (fixes[0]) return { cue: fixes[0], kind: "fix", legs: false };
  return { cue: a.cue, kind: "keep", legs: isLegs(a.cue) };
}
