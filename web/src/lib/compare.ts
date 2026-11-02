// Side-by-side comparison. A category supplies a field list (label + how to read the value); the diff logic is
// shared, so gloves or bags can reuse it later with their own fields. No performance fields, only facts we hold.

export type CompareField<T> = {
  key: string;
  label: string;
  /** Display value. Use "Not listed" (or similar) for unknown values; unknowns don't count as a difference. */
  value: (item: T) => string;
  group?: string;
};

export type CompareRow = { key: string; label: string; group?: string; values: string[]; differs: boolean };

export const UNKNOWN_VALUES = new Set(["Not listed", "Not on file", "Unknown", "—", ""]);

/** One row per field. A row differs when at least two items have different known values. */
export function compareRows<T>(items: T[], fields: CompareField<T>[]): CompareRow[] {
  return fields.map((f) => {
    const values = items.map((i) => f.value(i));
    const known = values.filter((v) => !UNKNOWN_VALUES.has(v));
    const differs = items.length > 1 && new Set(known.map((v) => v.toLowerCase())).size > 1;
    return { key: f.key, label: f.label, group: f.group, values, differs };
  });
}

export function differenceCount(rows: CompareRow[]): number {
  return rows.filter((r) => r.differs).length;
}

export const MAX_COMPARE = 3;

/** Parses ?models=a,b,c into at most MAX_COMPARE distinct, well-formed slugs. */
export function parseCompareSlugs(param: string | string[] | undefined): string[] {
  const raw = Array.isArray(param) ? param.join(",") : (param ?? "");
  const slugs = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]{3,120}$/.test(s));
  return [...new Set(slugs)].slice(0, MAX_COMPARE);
}

/** The query string for a set of models, used by the add/remove pickers. */
export function compareHref(slugs: string[]): string {
  return slugs.length ? `/compare?models=${slugs.join(",")}` : "/compare";
}
