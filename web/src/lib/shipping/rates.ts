// Choosing among quoted rates. Pure, so it can be unit tested.

import type { Rate } from "./types";

/** Available rates first, cheapest first (ties: faster first); unavailable ones after, with their reasons. */
export function sortRates(rates: Rate[]): Rate[] {
  return [...rates].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (a.amountCents !== b.amountCents) return a.amountCents - b.amountCents;
    return (a.estimatedDays ?? 99) - (b.estimatedDays ?? 99);
  });
}

/** The rate the buyer picked, if it exists and can be used; otherwise the cheapest available one; otherwise null. */
export function selectRate(rates: Rate[], chosenId?: string | null): Rate | null {
  if (chosenId) {
    const chosen = rates.find((r) => r.id === chosenId);
    return chosen && chosen.available ? chosen : null;
  }
  return sortRates(rates).find((r) => r.available) ?? null;
}

/**
 * When buying the label, finds the rate matching what the buyer paid for (same carrier and service) in a fresh
 * quote. Falls back to the cheapest available rate from the same carrier, then the cheapest overall.
 */
export function matchLabelRate(fresh: Rate[], paid: { carrier: string; serviceToken: string }): Rate | null {
  const usable = sortRates(fresh).filter((r) => r.available);
  return (
    usable.find((r) => r.serviceToken === paid.serviceToken) ??
    usable.find((r) => r.carrier.toLowerCase() === paid.carrier.toLowerCase()) ??
    usable[0] ??
    null
  );
}
