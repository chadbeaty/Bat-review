// Fee versions for the admin fee screen. A fee is never edited in place: a change is a new version with a
// start date (now or later), and versions it supersedes are retired. The database enforces the same rules.

import { commissionCents, type FeeRule } from "@/lib/fees";

export type FeeRow = {
  id: string;
  fee_name: string;
  fee_type: "percentage" | "fixed_cents";
  fee_value: number;
  description: string | null;
  active: boolean;
  effective_from: string;
  created_at: string;
};

export type FeeVersionInput = {
  feeName: string;
  feeType: "percentage" | "fixed_cents";
  /** Percent for percentage fees (7.5 = 7.5%), whole cents for fixed fees. */
  feeValue: number;
  description: string | null;
  /** Null means "starts now". */
  effectiveFrom: Date | null;
};

export type FeeVersionResult = { ok: true; value: FeeVersionInput } | { ok: false; errors: Record<string, string> };

/**
 * Validates the "new fee version" form. Percentages are entered as percent (0–100, up to 2 decimals);
 * fixed fees as dollars (converted to whole cents). The start date may be blank (now) or in the future.
 */
export function parseFeeVersion(form: Record<string, string | undefined>, now = new Date()): FeeVersionResult {
  const errors: Record<string, string> = {};
  const feeName = (form.fee_name ?? "").trim();
  if (!/^[a-z0-9_]{2,60}$/.test(feeName)) errors.fee_name = "Use lowercase letters, numbers and underscores.";
  const feeType = form.fee_type === "percentage" || form.fee_type === "fixed_cents" ? form.fee_type : null;
  if (!feeType) errors.fee_type = "Choose percentage or fixed amount.";

  const rawValue = (form.fee_value ?? "").trim();
  let feeValue = NaN;
  if (!/^\d+(\.\d{1,2})?$/.test(rawValue)) {
    errors.fee_value = "Enter a number with up to 2 decimal places.";
  } else if (feeType === "percentage") {
    feeValue = Number(rawValue);
    if (feeValue > 100) errors.fee_value = "A percentage can't be more than 100.";
  } else if (feeType === "fixed_cents") {
    feeValue = Math.round(Number(rawValue) * 100);
    if (feeValue > 10_000_000) errors.fee_value = "That amount is too large.";
  }

  let effectiveFrom: Date | null = null;
  const rawDate = (form.effective_from ?? "").trim();
  if (rawDate) {
    // datetime-local values have no zone; the form sends the browser's offset alongside.
    const offset = Number(form.tz_offset_minutes ?? "0");
    const parsed = parseLocalDateTime(rawDate, Number.isFinite(offset) ? offset : 0);
    if (!parsed) errors.effective_from = "Enter a valid date and time.";
    else if (parsed.getTime() < now.getTime() - 60_000) errors.effective_from = "Choose now or a future time. Past fees can't be changed.";
    else effectiveFrom = parsed.getTime() <= now.getTime() ? null : parsed;
  }

  const description = (form.description ?? "").trim().slice(0, 300) || null;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { feeName, feeType: feeType!, feeValue, description, effectiveFrom } };
}

/** Parses "2026-12-01T09:30" as local time at the given offset (minutes, as Date.getTimezoneOffset returns). */
export function parseLocalDateTime(value: string, tzOffsetMinutes: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi) + tzOffsetMinutes * 60_000;
  return new Date(utc);
}

export type FeeStatus = "in_force" | "scheduled" | "retired" | "cancelled";

/** What each version is doing right now, mirroring current_fee(): the active started row with the latest start. */
export function feeStatuses(rows: FeeRow[], now = new Date()): Map<string, FeeStatus> {
  const out = new Map<string, FeeStatus>();
  const byName = new Map<string, FeeRow[]>();
  for (const r of rows) byName.set(r.fee_name, [...(byName.get(r.fee_name) ?? []), r]);
  for (const list of byName.values()) {
    const started = list
      .filter((r) => r.active && new Date(r.effective_from) <= now)
      .sort((a, b) => +new Date(b.effective_from) - +new Date(a.effective_from));
    const current = started[0]?.id;
    for (const r of list) {
      const future = new Date(r.effective_from) > now;
      if (r.id === current) out.set(r.id, "in_force");
      else if (future) out.set(r.id, r.active ? "scheduled" : "cancelled");
      else out.set(r.id, "retired");
    }
  }
  return out;
}

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  in_force: "In force",
  scheduled: "Scheduled",
  retired: "Retired",
  cancelled: "Cancelled before it started",
};

/** "7%" or "$3.99". */
export function describeFee(rule: Pick<FeeRule, "fee_type" | "fee_value">): string {
  if (rule.fee_type === "percentage") return `${Number(rule.fee_value)}%`;
  const cents = Math.round(Number(rule.fee_value));
  return `$${(cents / 100).toFixed(2)}`;
}

/** The worked example on the fee screen: what the commission does to a $200 sale. */
export function workedExample(rule: FeeRule, itemPriceCents = 20000) {
  const commission = commissionCents(itemPriceCents, rule);
  return { itemPriceCents, commissionCents: commission, sellerBeforeProcessingCents: itemPriceCents - commission };
}
