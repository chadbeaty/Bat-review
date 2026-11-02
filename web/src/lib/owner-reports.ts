// "First Swings" owner reports: form options and the public summary. Pure functions (no database access).

export const HIT_BUCKETS = [
  { value: 0, label: "Under 100 hits" },
  { value: 100, label: "100 to 249" },
  { value: 250, label: "250 to 499" },
  { value: 500, label: "500 to 999" },
  { value: 1000, label: "1,000 to 2,499" },
  { value: 2500, label: "2,500 or more" },
] as const;

export const BALL_TYPES = [
  { value: "52/300", label: "52/300 (USA, most rec leagues)" },
  { value: "44/375", label: "44/375 (USSSA)" },
  { value: "40/325", label: "40/325 (senior)" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Not sure" },
] as const;

export const POP_OPTIONS = [
  { value: "better", label: "More pop than my previous gamer" },
  { value: "same", label: "About the same" },
  { value: "worse", label: "Less pop" },
  { value: "not_sure", label: "Not sure yet" },
] as const;

export const DURABILITY_OPTIONS = [
  { value: "intact", label: "Intact" },
  { value: "dented", label: "Dented" },
  { value: "cracked", label: "Cracked" },
  { value: "rattle", label: "Rattles" },
  { value: "returned_warranty", label: "Returned under warranty" },
] as const;

export const STING_LABELS: Record<number, string> = { 1: "No sting", 2: "Slight", 3: "Some", 4: "Noticeable", 5: "Painful" };

export function optionLabel(options: readonly { value: string | number; label: string }[], value: string | number | null): string {
  return options.find((o) => o.value === value)?.label ?? "Not stated";
}

export function hitsLabel(hits: number | null): string {
  if (hits == null) return "Hits not stated";
  const bucket = [...HIT_BUCKETS].reverse().find((b) => hits >= b.value);
  return bucket?.label ?? `${hits} hits`;
}

export type OwnerReport = {
  userId: string;
  createdAt: string;
  ownershipVerified: boolean;
  popVsPreviousGamer: string;
  sting: number | null;
  ballType: string;
  temperatureF: number | null;
  durabilityStatus: string;
};

export type OwnerReportSummary = {
  owners: number;
  verifiedOwners: number;
  reports: number;
  pop: Record<"better" | "same" | "worse" | "not_sure", number>;
  stingAverage: number | null;
  stingResponses: number;
  ballTypes: { value: string; count: number }[];
  medianTemperatureF: number | null;
  temperatureResponses: number;
  smallSample: boolean;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Summarises published reports. Each owner counts once, using their latest check-in, so repeat check-ins can't
 * inflate a result. `threshold` is the early-report threshold: below it the sample is flagged as small.
 */
export function summarizeOwnerReports(reports: OwnerReport[], threshold: number): OwnerReportSummary {
  const latest = new Map<string, OwnerReport>();
  for (const r of [...reports].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latest.set(r.userId, r);
  const owners = [...latest.values()];
  const verifiedOwners = new Set(reports.filter((r) => r.ownershipVerified).map((r) => r.userId)).size;

  const pop = { better: 0, same: 0, worse: 0, not_sure: 0 };
  for (const o of owners) if (o.popVsPreviousGamer in pop) pop[o.popVsPreviousGamer as keyof typeof pop]++;

  const stings = owners.map((o) => o.sting).filter((s): s is number => s != null);
  const temps = owners.map((o) => o.temperatureF).filter((t): t is number => t != null);
  const balls = new Map<string, number>();
  for (const o of owners) balls.set(o.ballType, (balls.get(o.ballType) ?? 0) + 1);

  return {
    owners: owners.length,
    verifiedOwners,
    reports: reports.length,
    pop,
    stingAverage: stings.length ? Math.round((stings.reduce((a, b) => a + b, 0) / stings.length) * 10) / 10 : null,
    stingResponses: stings.length,
    ballTypes: [...balls.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    medianTemperatureF: median(temps),
    temperatureResponses: temps.length,
    smallSample: owners.length < threshold,
  };
}

/** Friendly message for a database error raised while filing a report. */
export function ownerReportErrorMessage(err: { code?: string; message?: string } | null, intervalDays: number): string {
  if (!err) return "That didn't go through. Try again in a minute.";
  if (err.code === "54000" || /once every/i.test(err.message ?? ""))
    return `You've already checked in on this bat in the last ${intervalDays} days. Come back after a week of swings for your next check-in.`;
  if (err.code === "42501") return "Your account can't file reports right now. Contact support if you think that's wrong.";
  if (err.code === "23514") return "One of the answers is out of range. Check the form and try again.";
  return "That didn't go through. Try again in a minute.";
}
