// Marketplace fee math. Rates come from the fee_configuration table, never from constants in code.
// Payment processing and Stripe Connect costs are not estimated here: they are recorded from the actual
// charge when the payment settles (Phase 3), so this only covers the platform commission.

export type FeeRule = { fee_name: string; fee_type: "percentage" | "fixed_cents"; fee_value: number };

/** Commission in cents on the item price, rounded to the nearest cent. Shipping and tax are never included. */
export function commissionCents(itemPriceCents: number, rule: FeeRule): number {
  if (!Number.isInteger(itemPriceCents) || itemPriceCents < 0) throw new Error("Item price must be a whole number of cents");
  if (rule.fee_type === "percentage") {
    if (rule.fee_value < 0 || rule.fee_value > 100) throw new Error("Percentage fee must be between 0 and 100");
    return Math.round((itemPriceCents * rule.fee_value) / 100);
  }
  return Math.min(Math.round(rule.fee_value), itemPriceCents);
}

/** What the seller sees before payment processing: item price minus the marketplace commission. */
export function sellerProceedsBeforeProcessing(itemPriceCents: number, rule: FeeRule) {
  const commission = commissionCents(itemPriceCents, rule);
  return { itemPriceCents, commissionCents: commission, beforeProcessingCents: itemPriceCents - commission };
}
