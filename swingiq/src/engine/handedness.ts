import { analyzeSwing, type AnalyzeContext } from "./analyzer";
import type { SwingWindow } from "./detector";
import { L, frameHasBody, hands, median, px, shoulderCenter, torso } from "./geometry";
import type { FrameGeometry, Handedness, PoseFrame, SwingAnalysis } from "./types";

export type HandGuess = { hand: Handedness; confidence: number };

/**
 * Which side the hitter bats from, read off one side-view swing, for a guest who hasn't told us. Two independent
 * signs, both relative to the body's own left and right (so it doesn't matter which side of the plate the phone is on):
 *  - the swing: the grip travels toward the lead shoulder (a righty's left) from launch to peak hand speed;
 *  - the stance: the grip sets up on the rear shoulder's side (a righty's right).
 * Only side view: from behind or in front the shoulders overlap and the swing runs toward or away from the camera.
 * Returns null when the picture can't say (shoulders stacked, too little travel, too few frames).
 */
export function inferHandedness(frames: PoseFrame[], win: Pick<SwingWindow, "launch" | "peak">, geom: FrameGeometry): HandGuess | null {
  const rows = frames.filter((f) => frameHasBody(f, 0.4));
  if (rows.length < 6) return null;
  const scale = median(rows.map((f) => torso(f.lm!, geom)));
  if (!(scale > 0)) return null;

  const stance = rows.filter((f) => f.t <= win.launch - 150);
  const pre = stance.length >= 3 ? stance : rows.slice(0, 3);
  // Shoulder axis in image x: + when the hitter's left shoulder is to the right of their right shoulder.
  const axis = median(pre.map((f) => px(f.lm![L.leftShoulder], geom).x - px(f.lm![L.rightShoulder], geom).x)) / scale;
  if (Math.abs(axis) < 0.12) return null;

  const near = (t: number) => rows.reduce((b, f) => (Math.abs(f.t - t) < Math.abs(b.t - t) ? f : b), rows[0]);
  const travel = (hands(near(win.peak).lm!, geom).x - hands(near(win.launch).lm!, geom).x) / scale;
  if (Math.abs(travel) < 0.4) return null;
  // Toward the left shoulder = a righty.
  const bySwing: Handedness = Math.sign(travel) === Math.sign(axis) ? "R" : "L";

  const grip = median(pre.map((f) => hands(f.lm!, geom).x - shoulderCenter(f.lm!, geom).x)) / scale;
  // Grip on the right shoulder's side = a righty. Hands set up near the middle say nothing.
  const byStance: Handedness | null = Math.abs(grip) < 0.1 ? null : Math.sign(grip) === -Math.sign(axis) ? "R" : "L";

  if (byStance === null) return { hand: bySwing, confidence: 0.6 };
  return byStance === bySwing ? { hand: bySwing, confidence: 0.85 } : { hand: bySwing, confidence: 0.3 };
}

/** Trust a guess enough to re-read the swing with it. */
export const HAND_GUESS_MIN = 0.6;

/**
 * For a hitter whose batting side is only a default: check it against the swing, and when the swing clearly says
 * otherwise, read the same frames again as the other side (the legs-and-feet numbers depend on which leg is in front).
 * Returns the side to use from now on and the analysis to keep.
 */
export function checkHand(
  frames: PoseFrame[],
  win: SwingWindow,
  ctx: AnalyzeContext,
  analysis: SwingAnalysis,
): { hand: Handedness; analysis: SwingAnalysis; guess: HandGuess | null } {
  if (ctx.view !== "side") return { hand: ctx.hand, analysis, guess: null };
  const guess = inferHandedness(frames, win, ctx.geom);
  if (!guess || guess.confidence < HAND_GUESS_MIN || guess.hand === ctx.hand) return { hand: ctx.hand, analysis, guess };
  const audioContactT = analysis.phases.contactSource === "audio" ? analysis.phases.contact : ctx.audioContactT;
  return { hand: guess.hand, analysis: analyzeSwing(frames, win, { ...ctx, hand: guess.hand, audioContactT }), guess };
}
