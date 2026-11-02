// Formatting helpers shared by pages and emails.

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export const WEIGHTING_LABELS: Record<string, string> = {
  balanced: "Balanced",
  endload: "End-loaded",
  midload: "Mid-loaded",
  other: "Other",
  unknown: "Weighting not listed",
};

export const CONDITION_LABELS: Record<number, string> = {
  10: "Like new",
  9: "Minimal wear",
  8: "Normal light wear",
  7: "Noticeable cosmetic wear",
};

/** Cosmetic condition label for a 1–10 score (6 and below is heavy wear). */
export function conditionLabel(score: number | null | undefined): string | null {
  if (score == null) return null;
  return CONDITION_LABELS[score] ?? "Heavy wear";
}
