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
    key: "footDown",
    label: "Foot down on time",
    metric: "strideTiming",
    weight: 1,
    // ms before contact. Elite slow pitch ≈ 200 ms (Wu et al.); under 100 the foot is still landing; long waits stall.
    score: (v) => (v < 140 ? ramp(v, 40, 140, 35, 100) : v <= 380 ? 100 : ramp(v, 380, 650, 100, 55)),
  },
  {
    key: "frontLeg",
    label: "Firm front side",
    metric: "frontLegBlock",
    weight: 0.8,
    // Degrees the front knee straightened from plant to contact. Collapsing (negative) is the fault.
    score: (v) => (v >= 0 ? 100 : ramp(v, -20, 0, 35, 100)),
  },
  {
    key: "stride",
    label: "Controlled stride",
    metric: "strideLength",
    weight: 0.5,
    // Scored from stance-to-plant width by the caller (see scoreSwing).
    score: (v) => v,
  },
];

export function scoreSwing(
  m: Partial<Record<MetricKey, MetricValue>>,
  view: CameraView,
  heightIn = 70,
  extras: { widthRatio?: number | null } = {},
): ScoreBreakdown {
  void view;
  void heightIn;
  const parts: ScoreBreakdown["components"] = [];
  let sum = 0;
  let wsum = 0;
  for (const c of COMPONENTS) {
    const mv = m[c.metric];
    if (!mv || mv.source === "unavailable" || mv.value === null) continue;
    let s: number;
    if (c.key === "stride") {
      // Minimal strides are fine in slow pitch; feet ending up much wider than the stance move the head and invite
      // lunging (coaching guide: flag past ~1.6× the stance width).
      if (!extras.widthRatio) continue;
      s = extras.widthRatio <= 1.5 ? 100 : ramp(extras.widthRatio, 1.5, 2.1, 100, 45);
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
