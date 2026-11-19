import { BONES, L } from "@/engine/geometry";
import type { Handedness, PoseFrame } from "@/engine/types";

export function nearestIndex<T extends { t: number }>(xs: T[], t: number): number {
  if (!xs.length) return 0;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1].t - t) < Math.abs(xs[lo].t - t)) return lo - 1;
  return lo;
}

/** Sizes a canvas to its on-screen width at the clip's aspect ratio (capped at 2× pixel density). */
export function fitCanvas(c: HTMLCanvasElement, frameSize: { width: number; height: number }) {
  const cw = Math.round(c.clientWidth * Math.min(2, window.devicePixelRatio || 1));
  const ch = Math.round(cw * (frameSize.height / frameSize.width));
  if (c.width !== cw || c.height !== ch) {
    c.width = cw;
    c.height = ch;
  }
}

/**
 * Draws one moment of a swing: the video frame (when saved), the grip's path so far, the skeleton, and the front leg
 * in gold with its knee angle. Shared by the single-swing player and the side-by-side comparison.
 */
export function drawSwingFrame(
  c: HTMLCanvasElement,
  o: { t: number; bitmap: ImageBitmap | null | undefined; pose: PoseFrame[]; handPath: { t: number; x: number; y: number }[]; hand: Handedness; showSkeleton: boolean },
) {
  const ctx = c.getContext("2d")!;
  if (o.bitmap) ctx.drawImage(o.bitmap, 0, 0, c.width, c.height);
  else {
    ctx.fillStyle = "#101012";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  const k = c.width / 400;
  const path = o.handPath.filter((p) => p.t <= o.t);
  if (path.length > 1) {
    ctx.strokeStyle = "rgba(240,205,120,0.9)";
    ctx.lineWidth = 3 * k;
    ctx.lineJoin = "round";
    ctx.beginPath();
    path.forEach((p, i) => (i ? ctx.lineTo(p.x * c.width, p.y * c.height) : ctx.moveTo(p.x * c.width, p.y * c.height)));
    ctx.stroke();
  }
  if (!o.showSkeleton || !o.pose.length) return;
  const pf = o.pose[nearestIndex(o.pose, o.t)];
  if (!pf.lm || Math.abs(pf.t - o.t) >= 60) return;
  const lm = pf.lm;
  ctx.strokeStyle = "rgba(245,242,234,0.9)";
  ctx.lineWidth = 2.5 * k;
  ctx.lineCap = "round";
  for (const [a, b] of BONES) {
    if (lm[a].v < 0.35 || lm[b].v < 0.35) continue;
    ctx.beginPath();
    ctx.moveTo(lm[a].x * c.width, lm[a].y * c.height);
    ctx.lineTo(lm[b].x * c.width, lm[b].y * c.height);
    ctx.stroke();
  }
  const lh = o.hand === "R" ? L.leftHip : L.rightHip;
  const lk = o.hand === "R" ? L.leftKnee : L.rightKnee;
  const la = o.hand === "R" ? L.leftAnkle : L.rightAnkle;
  if (lm[lh].v > 0.4 && lm[lk].v > 0.4 && lm[la].v > 0.4) {
    const P = (i: number) => ({ x: lm[i].x * c.width, y: lm[i].y * c.height });
    const [h, kn, an] = [P(lh), P(lk), P(la)];
    ctx.strokeStyle = "rgba(240,205,120,0.95)";
    ctx.lineWidth = 3.5 * k;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(kn.x, kn.y);
    ctx.lineTo(an.x, an.y);
    ctx.stroke();
    const v1 = { x: h.x - kn.x, y: h.y - kn.y };
    const v2 = { x: an.x - kn.x, y: an.y - kn.y };
    const deg = Math.round((Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))))) * 180) / Math.PI);
    const label = `${deg}°`;
    ctx.font = `700 ${13 * k}px system-ui, sans-serif`;
    const tw = ctx.measureText(label).width;
    const lx = kn.x + 10 * k;
    const ly = kn.y - 8 * k;
    ctx.fillStyle = "rgba(8,8,9,0.85)";
    ctx.fillRect(lx - 4 * k, ly - 13 * k, tw + 8 * k, 18 * k);
    ctx.fillStyle = "#F0CD78";
    ctx.fillText(label, lx, ly);
  }
  ctx.fillStyle = "#F0CD78";
  const gx = ((lm[L.leftWrist].x + lm[L.rightWrist].x) / 2) * c.width;
  const gy = ((lm[L.leftWrist].y + lm[L.rightWrist].y) / 2) * c.height;
  ctx.beginPath();
  ctx.arc(gx, gy, 5 * k, 0, Math.PI * 2);
  ctx.fill();
}
