import { clamp } from "./geometry";
import type { CameraView, MetricKey, MetricValue, ScoreBreakdown, ScoreCategoryKey } from "./types";

/** Maps x linearly from [x0,x1] onto [y0,y1], clamped. */
function ramp(x: number, x0: number, x1: number, y0: number, y1: number) {
  const t = clamp((x - x0) / (x1 - x0), 0, 1);
  return y0 + t * (y1 - y0);
}

type Component = {
  key: string;
  label: string;
  metric: MetricKey;
  category: ScoreCategoryKey;
  weight: number;
  score: (v: number, mv: MetricValue) => number;
};

export const CATEGORY_LABEL: Record<ScoreCategoryKey, string> = {
  balance: "Balance",
  timing: "Timing",
  rotation: "Rotation",
  batPath: "Bat path",
  contact: "Contact",
  followThrough: "Follow-through",
};

const CATEGORY_GAP: Record<ScoreCategoryKey, string> = {
  balance: "Needs your head, hips and feet in view.",
  timing: "Needs your front foot in view to time foot-down against contact.",
  rotation: "Needs your front leg in view; hip timing needs 60 fps or faster.",
  batPath: "Needs your hands and shoulders in view.",
  contact: "Contact position shows from the side view.",
  followThrough: "Needs the finish of the swing in the clip.",
};

/**
 * The Gapper Score: a 0–100 grade of mechanics, NOT a prediction of how hard the ball is hit.
 * Six categories, each built only from checks the footage actually supported. A check counts more when its
 * measurement is more trustworthy. A category with no measurable checks is shown as "not measured", never guessed.
 * Thresholds follow slow-pitch coaching (see docs/reports/Slow pitch lower body mechanics.md).
 */
const COMPONENTS: Component[] = [
  // Balance
  { key: "head", label: "Quiet head", metric: "headMovement", category: "balance", weight: 1.2, score: (v) => ramp(v, 2, 8, 100, 20) },
  {
    key: "stayBack",
    label: "Stay back",
    metric: "weightShift",
    category: "balance",
    weight: 1,
    score: (v) => (v < 40 ? ramp(v, 0, 40, 55, 100) : v <= 85 ? 100 : ramp(v, 85, 115, 100, 30)),
  },
  { key: "planted", label: "Front foot planted", metric: "frontFootSlide", category: "balance", weight: 0.8, score: (v) => ramp(v, 2, 8, 100, 35) },
  { key: "shoulders", label: "Level shoulders", metric: "shoulderDrop", category: "balance", weight: 0.5, score: (v) => ramp(v, 25, 50, 100, 40) },
  // Timing
  {
    key: "footDown",
    label: "Foot down on time",
    metric: "strideTiming",
    category: "timing",
    weight: 1,
    // ms before contact. Skilled slow pitch ≈ 200 ms (Wu et al.); under ~100 the foot is still landing; long waits stall.
    score: (v) => (v < 140 ? ramp(v, 40, 140, 35, 100) : v <= 380 ? 100 : ramp(v, 380, 650, 100, 55)),
  },
  {
    key: "stride",
    label: "Controlled stride",
    metric: "strideLength",
    category: "timing",
    weight: 0.5,
    // Stance-to-plant width ratio (aux). Flag past ~1.6× the stance width.
    score: (_v, mv) => (mv.aux === undefined ? NaN : mv.aux <= 1.5 ? 100 : ramp(mv.aux, 1.5, 2.1, 100, 45)),
  },
  // Rotation
  { key: "frontLeg", label: "Firm front side", metric: "frontLegBlock", category: "rotation", weight: 1, score: (v) => (v >= 0 ? 100 : ramp(v, -20, 0, 35, 100)) },
  {
    key: "hipsFirst",
    label: "Hips start first",
    metric: "hipLead",
    category: "rotation",
    weight: 0.6,
    score: (v) => (v >= 20 ? 100 : v >= -20 ? 75 : ramp(v, -100, -20, 35, 75)),
  },
  {
    key: "backHeel",
    label: "Back foot turns over",
    metric: "backHeel",
    category: "rotation",
    weight: 0.5,
    score: (v) => (Math.abs(v) <= 150 ? 100 : v < 0 ? ramp(v, -450, -150, 55, 100) : ramp(v, 150, 400, 100, 65)),
  },
  // Bat path
  { key: "hands", label: "Hands stay up", metric: "handDrop", category: "batPath", weight: 1, score: (v) => ramp(v, 1.5, 6, 100, 30) },
  { key: "connected", label: "Hands stay connected", metric: "handCast", category: "batPath", weight: 0.7, score: (v) => ramp(v, 20, 70, 100, 35) },
  {
    key: "handPath",
    label: "Hand path through contact",
    metric: "handPathAngle",
    category: "batPath",
    weight: 0.7,
    // Slightly upward matches the falling slow-pitch ball; steep uppercuts pop up, chopping down rolls over.
    score: (v) => (v < 0 ? ramp(v, -25, 0, 45, 100) : v <= 22 ? 100 : ramp(v, 22, 45, 100, 45)),
  },
  // Contact
  {
    key: "contactSpot",
    label: "Contact out in front",
    metric: "contactPoint",
    category: "contact",
    weight: 1,
    // Hands at contact relative to the front hip (inches, + = in front). Behind = jammed / late; far out = reaching.
    score: (v) => (v < 0 ? ramp(v, -8, 0, 45, 100) : v <= 12 ? 100 : ramp(v, 12, 22, 100, 60)),
  },
  // Follow-through
  { key: "finish", label: "Balanced finish", metric: "balance", category: "followThrough", weight: 1.1, score: (v) => v },
  { key: "finishHigh", label: "Full finish", metric: "finishHeight", category: "followThrough", weight: 0.7, score: (v) => (v >= 0 ? 100 : ramp(v, -14, 0, 45, 100)) },
];

export function scoreSwing(m: Partial<Record<MetricKey, MetricValue>>, view: CameraView): ScoreBreakdown {
  void view;
  const parts: ScoreBreakdown["components"] = [];
  const byCat: Record<ScoreCategoryKey, { sum: number; w: number; inputs: string[] }> = {
    balance: { sum: 0, w: 0, inputs: [] },
    timing: { sum: 0, w: 0, inputs: [] },
    rotation: { sum: 0, w: 0, inputs: [] },
    batPath: { sum: 0, w: 0, inputs: [] },
    contact: { sum: 0, w: 0, inputs: [] },
    followThrough: { sum: 0, w: 0, inputs: [] },
  };
  for (const c of COMPONENTS) {
    const mv = m[c.metric];
    if (!mv || mv.source === "unavailable" || mv.value === null) continue;
    const s = c.score(mv.value, mv);
    if (!Number.isFinite(s)) continue;
    const w = c.weight * (0.4 + 0.6 * mv.confidence);
    parts.push({ key: c.key, label: c.label, score: Math.round(s), weight: Math.round(w * 100) / 100, category: c.category, metric: c.metric });
    const b = byCat[c.category];
    b.sum += s * w;
    b.w += w;
    b.inputs.push(c.label);
  }
  const categories = (Object.keys(byCat) as ScoreCategoryKey[]).map((k) => {
    const b = byCat[k];
    return b.w > 0
      ? { key: k, label: CATEGORY_LABEL[k], score: Math.round(b.sum / b.w), inputs: b.inputs }
      : { key: k, label: CATEGORY_LABEL[k], score: null, inputs: [], reason: CATEGORY_GAP[k] };
  });
  const scored = categories.filter((c) => c.score !== null);
  // At least two categories and three checks, or the "score" would really be one measurement.
  const overall = scored.length >= 2 && parts.length >= 3 ? Math.round(scored.reduce((a, c) => a + c.score!, 0) / scored.length) : null;
  return { overall, components: parts, categories };
}
