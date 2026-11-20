import { analyzeSwing, type AnalyzeContext } from "@/engine/analyzer";
import type { CameraView, Handedness } from "@/engine/types";
import type { CapturedSwing } from "@/live/engine";
import { compactPose, db, uid } from "./db";
import type { Session, SwingRecord } from "./types";

/** A swing caught by the live camera, as stored. Shared by the live session and Just Hit. */
export function recordFromCapture(
  cap: Pick<CapturedSwing, "analysis" | "pose" | "frameSize">,
  o: { sessionId: string; playerId: string; n: number; view: CameraView; hand: Handedness; batId: string | null; estimated?: boolean },
): SwingRecord {
  const rec: SwingRecord = {
    id: uid(),
    sessionId: o.sessionId,
    playerId: o.playerId,
    n: o.n,
    at: Date.now(),
    view: o.view,
    hand: o.hand,
    analysis: cap.analysis,
    pose: compactPose(cap.pose),
    frameSize: cap.frameSize,
    clipFrames: 0,
    batId: o.batId,
    source: "live",
  };
  if (o.estimated) rec.estimated = true;
  return rec;
}

/** Session totals from its swings so far. */
export function rollUpSession(sess: Session, swings: SwingRecord[]) {
  const scores = swings.map((s) => s.analysis.score.overall).filter((x): x is number => x !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  sess.swingCount = swings.length;
  sess.bestScore = scores.length ? Math.max(...scores) : null;
  sess.avgScore = scores.length ? Math.round(avg(scores)!) : null;
  sess.poseFps = Math.round(avg(swings.map((s) => s.analysis.quality.poseFps)) ?? 0);
}

/** Saves the swing and its session, then the clip once it's encoded (when the hitter keeps clips). */
export async function saveCapture(
  rec: SwingRecord,
  sess: Session,
  clip: CapturedSwing["clip"],
  keepClips: boolean,
  onClip?: (frames: { t: number; blob: Blob }[]) => void,
) {
  await db.saveSwing(rec);
  await db.saveSession({ ...sess });
  const frames = await clip;
  onClip?.(frames);
  if (keepClips && frames.length) {
    await db.saveClip({ swingId: rec.id, frames });
    rec.clipFrames = frames.length;
    await db.saveSwing(rec);
  }
  return frames;
}

/**
 * Re-reads a stored swing from its frames with corrected hitter details (Just Hit: the hitter just told us their side
 * or height). Updates the record in place, because a clip save that may still be running writes this same object.
 */
export function rereadSwing(rec: SwingRecord, cap: Pick<CapturedSwing, "pose" | "window">, ctx: AnalyzeContext, estimated: boolean) {
  rec.analysis = analyzeSwing(cap.pose, cap.window, ctx);
  rec.hand = ctx.hand;
  if (estimated) rec.estimated = true;
  else delete rec.estimated;
}
