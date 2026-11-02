// Order money math, in whole cents with exact integer arithmetic. The database function
// checkout_create_order does the same sums (public.fee_amount_cents) and is the source of truth for an order;
// this module is used to show the numbers before the order exists and is unit tested against the same rules.
//
// Rules (docs/decisions/0001-payments-funds-flow.md):
//   - The buyer pays item + shipping + tax.
//   - Commission is a percentage of the item price only. Shipping and tax never count toward it.
//   - Processing passthrough (default 0%) is a percentage of the order total, charged to the seller.
//   - The seller's transfer = item price − commission − passthrough, never below zero.
//   - Percentages round half up to the nearest cent.

export type FeeRule = { fee_type: "percentage" | "fixed_cents"; fee_value: number };

function assertCents(n: number, label: string) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} must be a whole number of cents`);
}

/** A percentage of a cent amount, rounded half up, using integer math (percent kept to 4 decimal places). */
export function percentOfCents(cents: number, percent: number): number {
  assertCents(cents, "Amount");
  if (!(percent >= 0 && percent <= 100)) throw new Error("Percentage must be between 0 and 100");
  const scaled = Math.round(percent * 10_000); // 7.25% -> 72500
  // cents * percent / 100, with percent scaled by 10^4: divide by 10^6. Round half up.
  return Math.floor((cents * scaled + 500_000) / 1_000_000);
}

/** The fee in cents for a base amount: percentage (rounded half up) or a fixed amount capped at the base. */
export function feeCents(base: number, rule: FeeRule | null | undefined): number {
  assertCents(base, "Amount");
  if (!rule) return 0;
  if (rule.fee_type === "percentage") return percentOfCents(base, Number(rule.fee_value));
  return Math.min(Math.round(Number(rule.fee_value)), base);
}

export type OrderTotals = {
  itemCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  commissionCents: number;
  passthroughCents: number;
  sellerPayoutCents: number;
};

export function orderTotals(input: {
  itemCents: number;
  shippingCents: number;
  taxCents: number;
  commission: FeeRule | null;
  passthrough: FeeRule | null;
}): OrderTotals {
  assertCents(input.itemCents, "Item price");
  assertCents(input.shippingCents, "Shipping");
  assertCents(input.taxCents, "Tax");
  const totalCents = input.itemCents + input.shippingCents + input.taxCents;
  const commissionCents = feeCents(input.itemCents, input.commission);
  const passthroughCents = feeCents(totalCents, input.passthrough);
  return {
    itemCents: input.itemCents,
    shippingCents: input.shippingCents,
    taxCents: input.taxCents,
    totalCents,
    commissionCents,
    passthroughCents,
    sellerPayoutCents: Math.max(0, input.itemCents - commissionCents - passthroughCents),
  };
}

/**
 * What the seller is transferred when the order completes. Refunds issued before completion come out of the
 * seller's share (the platform keeps its commission on the part that sold), and a full refund means no transfer.
 */
export function transferAmountCents(order: { seller_payout_cents: number | null; refunded_amount_cents: number; total_amount_cents: number }): number {
  if (order.refunded_amount_cents >= order.total_amount_cents) return 0;
  return Math.max(0, (order.seller_payout_cents ?? 0) - order.refunded_amount_cents);
}

/** Parses a dollar amount typed by staff ("12.50", "$1,200") into cents, or null if it isn't a valid amount. */
export function parseDollarsToCents(raw: string): number | null {
  const s = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
