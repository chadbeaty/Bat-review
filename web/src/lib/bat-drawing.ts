// Pure helpers behind <BatDrawing>: turn real bat fields into a drawable spec, pick decorative brand colors and build
// the outline path. Safe to import anywhere (no React, no database). The geometry is drawn to scale from the specs
// (length, barrel length, one vs two piece, end-loaded vs balanced); the colors are decorative only.

export const DEFAULT_LENGTH_IN = 34;
export const DEFAULT_BARREL_IN = 12.75;

export type BatLoad = "end" | "mid" | "balanced";

export type BatSpec = {
  lengthIn: number;
  barrelIn: number;
  twoPiece: boolean;
  load: BatLoad;
  weightOz: number | null;
  brand: string | null;
  /** True when length or barrel had to be filled in with a default (the drawing is then approximate). */
  assumed: boolean;
  /** True only when the length came from real data (so it is safe to print as a size). */
  lengthKnown: boolean;
};

/** Decorative paint jobs by brand: handle/knob color first, barrel color second. Not official brand colors. */
const BRAND_COLORS: { match: RegExp; colors: [string, string] }[] = [
  { match: /easton/i, colors: ["#1a1f2b", "#3c8ad6"] },
  { match: /demarini|de marini/i, colors: ["#efefef", "#d4234a"] },
  { match: /miken/i, colors: ["#c4361f", "#f29a21"] },
  { match: /worth/i, colors: ["#12386b", "#e8b923"] },
  { match: /louisville|slugger/i, colors: ["#7a1a1a", "#e6d8b8"] },
  { match: /monsta/i, colors: ["#101418", "#7ad03a"] },
  { match: /suncoast|sun coast/i, colors: ["#0e6b7a", "#f08a24"] },
  { match: /anderson/i, colors: ["#2b2b2b", "#c9a227"] },
  { match: /boombah/i, colors: ["#15181c", "#ff4f1f"] },
  { match: /dudley/i, colors: ["#0d2d6b", "#e4e6e8"] },
  { match: /rawlings/i, colors: ["#a31621", "#1b1b1b"] },
  { match: /mizuno/i, colors: ["#0a3d91", "#e6e8ea"] },
];
export const DEFAULT_BAT_COLORS: [string, string] = ["#5d656b", "#aab3b8"];

export function brandColors(brand: string | null | undefined): [string, string] {
  if (!brand) return DEFAULT_BAT_COLORS;
  return BRAND_COLORS.find((b) => b.match.test(brand))?.colors ?? DEFAULT_BAT_COLORS;
}

/** Reads a barrel length such as 12, "12.75", '13"' or "12 3/4 in". Returns null when it isn't a sensible barrel length. */
export function parseBarrel(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const mixed = v.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/);
    if (mixed) n = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    else {
      const m = v.match(/\d+(?:\.\d+)?/);
      n = m ? Number(m[0]) : null;
    }
  }
  return n != null && Number.isFinite(n) && n >= 10 && n <= 16 ? n : null;
}

export function parseLength(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.match(/\d+(?:\.\d+)?/)?.[0]) : NaN;
  return Number.isFinite(n) && n >= 26 && n <= 38 ? n : null;
}

function loadFrom(weighting: unknown): BatLoad {
  const w = String(weighting ?? "").toLowerCase();
  if (w === "endload" || w === "end_load" || w === "end-loaded") return "end";
  if (w === "midload" || w === "mid_load") return "mid";
  return "balanced";
}

/** Builds a drawing spec from a listing's attributes (see the bats attribute_schema) or a catalog row. */
export function batSpecFrom(
  fields: { length_inches?: unknown; barrel_length_inches?: unknown; construction_type?: unknown; weighting_type?: unknown; weight_oz?: unknown },
  brand?: string | null
): BatSpec {
  const length = parseLength(fields.length_inches);
  const barrel = parseBarrel(fields.barrel_length_inches);
  const w = Number(fields.weight_oz);
  return {
    lengthIn: length ?? DEFAULT_LENGTH_IN,
    barrelIn: barrel ?? DEFAULT_BARREL_IN,
    twoPiece: fields.construction_type === "two_piece" || fields.construction_type === "2pc",
    load: loadFrom(fields.weighting_type),
    weightOz: Number.isFinite(w) && w > 0 ? w : null,
    brand: brand ?? null,
    assumed: length == null || barrel == null,
    lengthKnown: length != null,
  };
}

/** The bat outline, laid out horizontally with the knob at x=0, centered on y=cy. `k` is drawing units per inch. */
export function batPath(L: number, B: number, k: number, cy: number): string {
  const x = (i: number) => +(i * k).toFixed(2);
  const r = (d: number) => +((d / 2) * k).toFixed(2);
  const knob = 1.0;
  const handleEnd = L - B - 7.5;
  const barrelStart = L - B;
  return `M${x(0)} ${cy - r(1.5)} L${x(knob * 0.6)} ${cy - r(1.5)} Q${x(knob)} ${cy - r(1.5)} ${x(knob)} ${cy - r(0.95)}
  L${x(handleEnd)} ${cy - r(1.0)} C${x(handleEnd + 4)} ${cy - r(1.05)} ${x(barrelStart - 2)} ${cy - r(2.25)} ${x(barrelStart)} ${cy - r(2.25)}
  L${x(L - 0.4)} ${cy - r(2.25)} Q${x(L)} ${cy - r(2.25)} ${x(L)} ${cy} Q${x(L)} ${cy + r(2.25)} ${x(L - 0.4)} ${cy + r(2.25)}
  L${x(barrelStart)} ${cy + r(2.25)} C${x(barrelStart - 2)} ${cy + r(2.25)} ${x(handleEnd + 4)} ${cy + r(1.05)} ${x(handleEnd)} ${cy + r(1.0)}
  L${x(knob)} ${cy + r(0.95)} Q${x(knob)} ${cy + r(1.5)} ${x(knob * 0.6)} ${cy + r(1.5)} L${x(0)} ${cy + r(1.5)} Z`;
}

/** Plain-language description for alt text, built only from the spec. */
export function describeBat(spec: BatSpec): string {
  const bits = [
    `${trim(spec.lengthIn)} inch`,
    `${trim(spec.barrelIn)} inch barrel`,
    spec.twoPiece ? "two-piece" : "one-piece or unknown construction",
    spec.load === "end" ? "end-loaded" : spec.load === "mid" ? "mid-loaded" : "balanced",
  ];
  return `Drawing of a ${bits.join(", ")} bat${spec.assumed ? " (length or barrel assumed)" : ""}`;
}

function trim(n: number) {
  return String(Number(n.toFixed(2)));
}

/** A drawing spec for a catalog bat (the bat database), from its listed specs. */
export function batSpecFromCatalog(bat: {
  lengthInches: number | null;
  barrelLengthInches: number | null;
  constructionType: string;
  weightingType: string;
  manufacturerName: string;
}): BatSpec {
  return batSpecFrom(
    { length_inches: bat.lengthInches, barrel_length_inches: bat.barrelLengthInches, construction_type: bat.constructionType, weighting_type: bat.weightingType },
    bat.manufacturerName
  );
}
