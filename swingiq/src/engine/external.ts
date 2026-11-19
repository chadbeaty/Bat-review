import type { MetricKey, MetricValue } from "./types";

/**
 * Integration point for external devices: radar guns, bat sensors, launch monitors.
 * Today values arrive by manual entry from the player's own device. The native app will add Bluetooth adapters that
 * produce the same shape, so nothing downstream changes.
 */
export type ExternalKey = Extract<MetricKey, "batSpeed" | "exitVelocity" | "launchAngle" | "attackAngle">;

export type ExternalMeasurement = {
  key: ExternalKey;
  value: number;
  /** Device name as the player typed it, e.g. "Pocket Radar" or "Blast Motion". */
  device: string;
  /** "manual" today; "bluetooth" from native adapters later. */
  via: "manual" | "bluetooth";
  enteredAt: number;
};

export const EXTERNAL_LIMITS: Record<ExternalKey, { min: number; max: number }> = {
  batSpeed: { min: 20, max: 120 },
  exitVelocity: { min: 20, max: 140 },
  launchAngle: { min: -60, max: 80 },
  attackAngle: { min: -40, max: 50 },
};

export function validExternal(m: Pick<ExternalMeasurement, "key" | "value">): boolean {
  const lim = EXTERNAL_LIMITS[m.key];
  return Number.isFinite(m.value) && m.value >= lim.min && m.value <= lim.max;
}

/** Overlays sensor readings on top of the camera metrics. Sensors win: they measure what the camera can't. */
export function applyExternal(
  metrics: Partial<Record<MetricKey, MetricValue>>,
  ext: ExternalMeasurement[] | undefined,
): Partial<Record<MetricKey, MetricValue>> {
  if (!ext?.length) return metrics;
  const out = { ...metrics };
  for (const e of ext) {
    if (!validExternal(e)) continue;
    out[e.key] = { key: e.key, source: "sensor", value: e.value, confidence: 0.9, text: `${e.device} (${e.via === "manual" ? "entered by you" : "Bluetooth"})` };
  }
  return out;
}
