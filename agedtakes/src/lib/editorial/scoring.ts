// Transparent, separate measures — never a single reputation score. Unresolved predictions are not failures.

export type PersonStats = {
  predictions_resolved: number;
  predictions_correct: number;
  predictions_incorrect: number;
  predictions_partial: number;
  predictions_open: number;
  predictions_unscorable: number;
  predictions_disputed: number;
  cases_published: number;
  contradiction_cases: number;
  statements_reviewed: number;
  last_updated_at: string | null;
};

export function normalizeStats(row: Partial<Record<keyof PersonStats, unknown>> | null | undefined): PersonStats {
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
  return {
    predictions_resolved: n(row?.predictions_resolved),
    predictions_correct: n(row?.predictions_correct),
    predictions_incorrect: n(row?.predictions_incorrect),
    predictions_partial: n(row?.predictions_partial),
    predictions_open: n(row?.predictions_open),
    predictions_unscorable: n(row?.predictions_unscorable),
    predictions_disputed: n(row?.predictions_disputed),
    cases_published: n(row?.cases_published),
    contradiction_cases: n(row?.contradiction_cases),
    statements_reviewed: n(row?.statements_reviewed),
    last_updated_at: typeof row?.last_updated_at === "string" ? row.last_updated_at : null,
  };
}

/** "7 correct out of 12 resolved predictions" — always with the denominator. */
export function accuracySentence(s: PersonStats): string {
  if (s.predictions_resolved === 0) {
    return s.predictions_open > 0 ? `No resolved predictions yet (${s.predictions_open} open).` : "No scored predictions yet.";
  }
  const parts = [`${s.predictions_correct} correct out of ${s.predictions_resolved} resolved prediction${s.predictions_resolved === 1 ? "" : "s"}`];
  if (s.predictions_partial) parts.push(`${s.predictions_partial} partially correct`);
  return parts.join(", ") + ".";
}

/** Share of resolved predictions that were fully correct, or null when nothing is resolved (never 0%). */
export function accuracyRate(s: PersonStats): number | null {
  return s.predictions_resolved > 0 ? s.predictions_correct / s.predictions_resolved : null;
}

export function excludedSentence(s: PersonStats): string | null {
  const bits: string[] = [];
  if (s.predictions_open) bits.push(`${s.predictions_open} open`);
  if (s.predictions_unscorable) bits.push(`${s.predictions_unscorable} unscorable`);
  if (s.predictions_disputed) bits.push(`${s.predictions_disputed} disputed`);
  return bits.length ? `Not counted: ${bits.join(", ")}.` : null;
}
