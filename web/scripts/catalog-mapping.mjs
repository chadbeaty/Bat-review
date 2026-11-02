// Converts researched catalog fields to database values. Unknown stays unknown; nothing is guessed.

export function weightingType(bat) {
  if (/mid[\s-]?load/i.test(bat.loadName || "")) return "midload";
  if (bat.load === "balanced") return "balanced";
  if (bat.load === "endload" || bat.load === "heavy") return "endload";
  return "unknown";
}

export function endloadOz(bat) {
  const name = bat.loadName || "";
  if (/½/.test(name)) return 0.5;
  const m = name.match(/(\d*\.?\d+)\s*oz/i);
  return m ? Number(m[1]) : null;
}

export const MATERIAL = { composite: "composite", alloy: "alloy", hybrid: "hybrid", "wood-composite": "wood_composite" };
export const BUILD = { "1pc": "one_piece", "2pc": "two_piece" };
