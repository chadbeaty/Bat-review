import { clamp } from "./geometry";
import type { CameraView, MetricKey, MetricValue, ScoreBreakdown } from "./types";

/** Maps x linearly from [x0,x1] onto [y0,y1], clamped. */
function ramp(x: number, x0: number, x1: number, y0: number, y1: number) {
  const t = clamp((x - x0) / (x1 - x0), 0, 1);
  return y0 + t * (y1 - y0);
}

type Component = { key: string; label: string; metric: MetricKey; weight: number; score: (v: number, mv: MetricValue) => number };

/**
 * The SwingIQ score is a 0–100 mechanics composite. It is NOT a prediction of how hard you hit the ball.
 * Each check only counts when the footage supported its metric, and each is weighted by how much we trust it.
 * Thresholds come from common slow-pitch coaching targets: quiet head, hands that stay up, stay back
 * (don't drift past the front foot), hold the finish, hips lead the shoulders.
 */
const COMPONENTS: Component[] = [
  { key: "head", label: "Quiet head", metric: "headMovement", weight: 1.2, score: (v) => ramp(v, 2, 8, 100, 20) },
  { key: "hands", label: "Hands stay up", metric: "handDrop", weight: 1, score: (v) => ramp(v, 1.5, 6, 100, 30) },
  { key: "balance", label: "Balanced finish", metric: "balance", weight: 1.1, score: (v) => v },
  {
    key: "stayBack",
    label: "Stay back",
    metric: "weightShift",
    weight: 1,
    // 40–85% at contact is ideal for slow pitch; drifting past the front foot is the classic roll-over / lunge.
    score: (v) => (v < 40 ? ramp(v, 0, 40, 55, 100) : v <= 85 ? 100 : ramp(v, 85, 115, 100, 30)),
  },
  {
    key: "stride",
    label: "Controlled stride",
    metric: "strideLength",
    weight: 0.5,
    // Scored as a share of height by the caller (see scoreSwing); kept simple here.
    score: (v) => v,
  },
  {
    key: "separation",
    label: "Hips lead shoulders",
    metric: "separation",
    weight: 0.7,
    score: (v) => (v < 20 ? ramp(v, 0, 20, 35, 100) : v <= 50 ? 100 : ramp(v, 50, 75, 100, 70)),
  },
  { key: "sequence", label: "Sequence", metric: "sequence", weight: 0.7, score: (v) => (v >= 2 ? 100 : v >= 1 ? 60 : 30) },
];

export function scoreSwing(m: Partial<Record<MetricKey, MetricValue>>, view: CameraView, heightIn = 70): ScoreBreakdown {
  void view;
  const parts: ScoreBreakdown["components"] = [];
  let sum = 0;
  let wsum = 0;
  for (const c of COMPONENTS) {
    const mv = m[c.metric];
    if (!mv || mv.source === "unavailable" || mv.value === null) continue;
    let s: number;
    if (c.key === "stride") {
      const pct = (mv.value / heightIn) * 100;
      // Minimal strides are fine in slow pitch; long ones move the head and invite lunging.
      s = pct <= 22 ? 100 : ramp(pct, 22, 36, 100, 45);
    } else {
      s = c.score(mv.value, mv);
    }
    const w = c.weight * (0.4 + 0.6 * mv.confidence);
    parts.push({ key: c.key, label: c.label, score: Math.round(s), weight: Math.round(w * 100) / 100 });
    sum += s * w;
    wsum += w;
  }
  return { overall: parts.length >= 2 ? Math.round(sum / wsum) : null, components: parts };
}
