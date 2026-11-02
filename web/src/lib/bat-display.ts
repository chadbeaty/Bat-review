// Display helpers for the bat database: labels, release-maturity copy, comparison fields and similarity.
// Pure (no database access), so pages, client components and unit tests can share them.

import { WEIGHTING_LABELS, formatPrice } from "@/lib/format";
import type { CompareField } from "@/lib/compare";

export const CONSTRUCTION_LABELS: Record<string, string> = { one_piece: "One-piece", two_piece: "Two-piece", unknown: "Not listed" };
export const MATERIAL_LABELS: Record<string, string> = {
  composite: "Composite",
  alloy: "Alloy",
  hybrid: "Hybrid",
  wood: "Wood",
  wood_composite: "Wood composite",
  unknown: "Not listed",
};
export const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence: an assumption",
  low: "Low confidence: an assumption",
};
export const RELATION_LABELS: Record<string, string> = {
  predecessor: "Previous version",
  same_platform: "Same platform",
  variant: "Variant (same specs)",
};
export const REVIEW_KIND_LABELS: Record<string, string> = {
  expert: "Tested review",
  site: "Review site",
  retailer: "Retailer write-up",
  customer: "Customer ratings",
  video: "Review video",
};

export type Maturity = "new_release" | "early_reports" | "established" | "limited_data" | null;

export function maturityInfo(m: Maturity, opts: { windowDays: number; threshold: number }): { label: string; explanation: string } {
  switch (m) {
    case "new_release":
      return {
        label: "New release",
        explanation: `Announced, on pre-order or released in the last ${opts.windowDays} days, and fewer than ${opts.threshold} owners have reported on it here. Expect little independent evidence yet.`,
      };
    case "early_reports":
      return {
        label: "Early reports",
        explanation: `Released in the last ${opts.windowDays} days and at least ${opts.threshold} owners have reported. Early impressions, not long-term results.`,
      };
    case "established":
      return {
        label: "Established",
        explanation: `Out for more than ${opts.windowDays} days, with at least ${opts.threshold} owners reporting here.`,
      };
    case "limited_data":
      return {
        label: "Limited owner data",
        explanation: `Out for more than ${opts.windowDays} days, but fewer than ${opts.threshold} owners have reported here, so there isn't much to go on.`,
      };
    default:
      return {
        label: "Release date not on file",
        explanation: "We don't have a documented release date for this model, so we can't say how new it is.",
      };
  }
}

export function formatWeights(weights: number[]): string {
  return weights.length ? weights.map((w) => `${Number(w)} oz`).join(", ") : "Not listed";
}

export function formatInches(v: number | null | undefined): string {
  return v == null ? "Not listed" : `${Number(v)}"`;
}

export function weightingText(type: string, endloadOz: number | null): string {
  const base = WEIGHTING_LABELS[type] ?? "Weighting not listed";
  if (type === "unknown") return "Not listed";
  return endloadOz ? `${base} (${Number(endloadOz)} oz)` : base;
}

export function formatRange(minCents: number, maxCents: number): string {
  return minCents === maxCents ? formatPrice(minCents) : `${formatPrice(minCents)} – ${formatPrice(maxCents)}`;
}

/** What the comparison and similarity logic need to know about a bat. */
export type ComparableBat = {
  slug: string;
  manufacturer: string;
  modelName: string;
  modelYear: number | null;
  stamps: string[];
  weights: number[];
  weightingType: string;
  endloadOz: number | null;
  barrelLengthInches: number | null;
  barrelDiameterInches: number | null;
  lengthInches: number | null;
  constructionType: string;
  material: string;
  warranty: string | null;
  maturity: Maturity;
  activeListings: number;
  askingMinCents: number | null;
  askingMaxCents: number | null;
  verifiedSales: number;
};

export function batCompareFields(maturityOpts = { windowDays: 120, threshold: 5 }): CompareField<ComparableBat>[] {
  return [
  { key: "manufacturer", label: "Manufacturer", group: "Model", value: (b) => b.manufacturer },
  { key: "model", label: "Model", group: "Model", value: (b) => b.modelName },
  { key: "year", label: "Model year", group: "Model", value: (b) => (b.modelYear ? String(b.modelYear) : "Not listed") },
  { key: "stamps", label: "Stamps", group: "Model", value: (b) => (b.stamps.length ? [...b.stamps].sort().join(" / ") : "Not listed") },
  { key: "weights", label: "Listed weights", group: "Specs", value: (b) => formatWeights(b.weights) },
  { key: "weighting", label: "Weighting", group: "Specs", value: (b) => weightingText(b.weightingType, b.endloadOz) },
  { key: "barrel_length", label: "Barrel length", group: "Specs", value: (b) => formatInches(b.barrelLengthInches) },
  { key: "barrel_diameter", label: "Barrel diameter", group: "Specs", value: (b) => formatInches(b.barrelDiameterInches) },
  { key: "length", label: "Bat length", group: "Specs", value: (b) => formatInches(b.lengthInches) },
  { key: "construction", label: "Construction", group: "Specs", value: (b) => CONSTRUCTION_LABELS[b.constructionType] ?? "Not listed" },
  { key: "material", label: "Material", group: "Specs", value: (b) => MATERIAL_LABELS[b.material] ?? "Not listed" },
  { key: "warranty", label: "Warranty", group: "Ownership", value: (b) => b.warranty ?? "Not on file" },
  {
    key: "release",
    label: "Release status",
    group: "Ownership",
    value: (b) => maturityInfo(b.maturity, maturityOpts).label,
  },
  { key: "listings", label: "Active listings", group: "Market", value: (b) => String(b.activeListings) },
  {
    key: "asking",
    label: "Current asking-price range",
    group: "Market",
    value: (b) => (b.askingMinCents != null && b.askingMaxCents != null ? formatRange(b.askingMinCents, b.askingMaxCents) : "None listed"),
  },
  { key: "sales", label: "Number of verified sales", group: "Market", value: (b) => String(b.verifiedSales) },
  ];
}

export type SimilarityInput = Pick<ComparableBat, "slug" | "stamps" | "weightingType" | "constructionType" | "barrelLengthInches">;

/**
 * Reviewed alternatives: same stamp (at least one shared), same weighting, same construction and a barrel within
 * half an inch. Unknown values never match, so we don't suggest a bat on a guess. This says nothing about
 * performance, only that the listed specs are alike.
 */
export function isSimilar(a: SimilarityInput, b: SimilarityInput): boolean {
  if (a.slug === b.slug) return false;
  if (!a.stamps.some((s) => b.stamps.includes(s))) return false;
  if (a.weightingType === "unknown" || a.weightingType !== b.weightingType) return false;
  if (a.constructionType === "unknown" || a.constructionType !== b.constructionType) return false;
  if (a.barrelLengthInches == null || b.barrelLengthInches == null) return false;
  return Math.abs(a.barrelLengthInches - b.barrelLengthInches) <= 0.5 + 1e-9;
}
