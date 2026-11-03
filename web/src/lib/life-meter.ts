// Life meter: where a bat's reported hit count falls on a break-in / prime / late-life track.
// The zone boundaries are typical guidance (composite bats usually break in over the first 150-200 hits), not
// measurements of any one bat. Pure functions, unit-tested.

export const LIFE_MAX = 3000;
export const BREAK_IN_END = 200;
export const PRIME_END = 1800;

export type LifeZoneKey = "break-in" | "prime" | "late";

export const LIFE_ZONES: { key: LifeZoneKey; label: string; from: number; to: number; note: string }[] = [
  { key: "break-in", label: "Break-in", from: 0, to: BREAK_IN_END, note: "about the first 150 to 200 hits" },
  { key: "prime", label: "Prime", from: BREAK_IN_END, to: PRIME_END, note: "after break-in, before wear shows" },
  { key: "late", label: "Late life", from: PRIME_END, to: LIFE_MAX, note: "past typical prime; varies a lot by model and hitter" },
];

/** Reads the seller's "about how many hits" answer. Null when it is missing or not a sensible number. */
export function parseHits(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.round(n) : null;
}

export function zoneFor(hits: number): LifeZoneKey {
  return hits < BREAK_IN_END ? "break-in" : hits < PRIME_END ? "prime" : "late";
}

/** Marker position along the track, 0 to 100 percent (clamped at the end of the track). */
export function markerPercent(hits: number): number {
  return Math.max(0, Math.min(100, (hits / LIFE_MAX) * 100));
}

export function hitsText(hits: number): string {
  return `${hits.toLocaleString("en-US")} hits`;
}

/** Plain-language summary for assistive tech and the page. */
export function lifeSummary(hits: number | null): string {
  if (hits == null) return "The seller didn't give a hit count.";
  const zone = LIFE_ZONES.find((z) => z.key === zoneFor(hits))!;
  return `The seller reports about ${hits.toLocaleString("en-US")} hits, which typically falls in the ${zone.label.toLowerCase()} zone.`;
}
