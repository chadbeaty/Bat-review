import type { MetricKey } from "./types";

/** What each metric means, its unit, and exactly how it's measured. Shown next to every number in the app. */
export type MetricInfo = {
  label: string;
  unit: string;
  /** Short unit suffix for display. */
  suffix: string;
  explain: string;
  method: string;
  /** Lower is better / higher is better / neither (for historical comparison arrows). */
  better: "lower" | "higher" | "neither";
  decimals: number;
  group: "timing" | "power" | "body" | "contact";
};

export const METRICS: Record<MetricKey, MetricInfo> = {
  swingTime: {
    label: "Swing time",
    unit: "milliseconds",
    suffix: "ms",
    explain: "Time from when your hands start forward to contact. Shorter means more time to read the pitch.",
    method:
      "Start: the frame your grip speeds up past a still point, from body tracking. End: the bat-ball sound from the mic when heard, otherwise the frame of peak hand speed.",
    better: "lower",
    decimals: 0,
    group: "timing",
  },
  loadTime: {
    label: "Load time",
    unit: "milliseconds",
    suffix: "ms",
    explain: "Time from when your hands start back until they start forward.",
    method: "From body tracking: first rearward move of the grip to launch.",
    better: "neither",
    decimals: 0,
    group: "timing",
  },
  tempoRatio: {
    label: "Tempo",
    unit: "load : swing",
    suffix: ": 1",
    explain: "Load time divided by swing time. Most good hitters sit near 2–3 : 1. A steady tempo swing to swing matters more than the exact number.",
    method: "Load time ÷ swing time.",
    better: "neither",
    decimals: 1,
    group: "timing",
  },
  handSpeed: {
    label: "Hand speed",
    unit: "miles per hour",
    suffix: "mph",
    explain: "Peak speed of your grip. Related to bat speed but much lower: the barrel moves 2–3× faster than the hands.",
    method:
      "Grip movement between frames from body tracking, scaled to inches with your height. Only movement across the camera's view counts, so it reads low. Best for comparing your own swings.",
    better: "higher",
    decimals: 1,
    group: "power",
  },
  batSpeed: {
    label: "Bat speed",
    unit: "miles per hour",
    suffix: "mph",
    explain: "Speed of the barrel's sweet spot at contact.",
    method: "Needs bat tracking (native app, 120–240 fps, coming in Phase 2) or a bat sensor. You can enter a reading from your sensor or radar.",
    better: "higher",
    decimals: 1,
    group: "power",
  },
  exitVelocity: {
    label: "Exit velocity",
    unit: "miles per hour",
    suffix: "mph",
    explain: "Speed of the ball off the bat.",
    method: "Needs ball tracking with high-speed capture (Phase 2) or a radar. You can enter a radar reading.",
    better: "higher",
    decimals: 1,
    group: "contact",
  },
  launchAngle: {
    label: "Launch angle",
    unit: "degrees",
    suffix: "°",
    explain: "Vertical angle the ball leaves the bat. Slow-pitch line drives are roughly 10–25°.",
    method: "Needs ball tracking with high-speed capture (Phase 2) or a launch monitor. You can enter a reading.",
    better: "neither",
    decimals: 0,
    group: "contact",
  },
  attackAngle: {
    label: "Attack angle",
    unit: "degrees",
    suffix: "°",
    explain: "Whether the barrel moves up or down through contact.",
    method: "Needs bat tracking (Phase 2) or a bat sensor. You can enter a sensor reading.",
    better: "neither",
    decimals: 0,
    group: "contact",
  },
  strideLength: {
    label: "Stride",
    unit: "inches",
    suffix: "in",
    explain: "How far your front foot moves toward the pitcher.",
    method: "Front ankle movement from your stance to foot plant, from body tracking in side view, scaled with your height.",
    better: "neither",
    decimals: 1,
    group: "body",
  },
  strideTiming: {
    label: "Foot down",
    unit: "milliseconds before launch",
    suffix: "ms",
    explain: "How long before your hands go your front foot is down. Positive is early (good). Negative means you swung with the foot still moving.",
    method: "Front ankle stops moving (body tracking) compared with launch time.",
    better: "neither",
    decimals: 0,
    group: "timing",
  },
  headMovement: {
    label: "Head movement",
    unit: "inches",
    suffix: "in",
    explain: "How far your head moves from stance to contact. Less movement means steadier eyes on the ball.",
    method: "Nose position at contact vs. your stance, from body tracking, scaled with your height.",
    better: "lower",
    decimals: 1,
    group: "body",
  },
  handDrop: {
    label: "Hand drop",
    unit: "inches",
    suffix: "in",
    explain: "How far your hands sink during the load. A big drop makes the swing longer and loopier.",
    method: "Lowest grip height before launch vs. your stance, from body tracking, scaled with your height.",
    better: "lower",
    decimals: 1,
    group: "body",
  },
  weightShift: {
    label: "Weight shift",
    unit: "% toward front foot",
    suffix: "%",
    explain: "Where your hips are at contact: 0% over the back foot, 100% over the front foot. Past 100% means you drifted forward.",
    method: "Hip center between the two ankles at contact, from body tracking in side view.",
    better: "neither",
    decimals: 0,
    group: "body",
  },
  balance: {
    label: "Balance",
    unit: "score 0–100",
    suffix: "",
    explain: "How well you held your finish: head over your base and no stumbling.",
    method: "Head and hip position over your feet after contact, and how much your hips wobble, from body tracking.",
    better: "higher",
    decimals: 0,
    group: "body",
  },
  hipTurn: {
    label: "Hip turn",
    unit: "degrees",
    suffix: "°",
    explain: "How far your hips rotate from the loaded position to contact.",
    method: "3D estimate from one camera (body tracking world points). Depth is the weakest direction for a single camera, so treat it as rough.",
    better: "neither",
    decimals: 0,
    group: "body",
  },
  shoulderTurn: {
    label: "Shoulder turn",
    unit: "degrees",
    suffix: "°",
    explain: "How far your shoulders rotate from the loaded position to contact.",
    method: "3D estimate from one camera (body tracking world points). Treat it as rough.",
    better: "neither",
    decimals: 0,
    group: "body",
  },
  separation: {
    label: "Hip-shoulder separation",
    unit: "degrees",
    suffix: "°",
    explain: "How far your hips open ahead of your shoulders. That stretch is a big source of power.",
    method: "Largest gap between hip and shoulder rotation before contact, from 3D body tracking. Rough at 30 fps.",
    better: "higher",
    decimals: 0,
    group: "body",
  },
  sequence: {
    label: "Sequence",
    unit: "order of peak speed",
    suffix: "",
    explain: "Powerful swings speed up from the ground up: hips, then shoulders, then hands.",
    method: "Order of peak rotation speed of hips and shoulders and peak hand speed, from body tracking. The peaks are 10–30 ms apart, so a slow frame rate can blur the order.",
    better: "neither",
    decimals: 0,
    group: "body",
  },
  contact: {
    label: "Contact",
    unit: "",
    suffix: "",
    explain: "Whether the mic heard the bat hit the ball during this swing.",
    method: "A sharp sound spike from the microphone inside the swing window. Sounds outside your swing (other cages) are ignored.",
    better: "neither",
    decimals: 0,
    group: "contact",
  },
};

export const SOURCE_LABEL = {
  measured: "Measured",
  cv_estimated: "Camera estimate",
  sensor: "Sensor",
  unavailable: "Not available",
} as const;

export function formatMetric(key: MetricKey, value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const info = METRICS[key];
  return value.toFixed(info.decimals);
}

export function confidenceLabel(c: number): "High" | "Medium" | "Low" {
  return c >= 0.7 ? "High" : c >= 0.45 ? "Medium" : "Low";
}
