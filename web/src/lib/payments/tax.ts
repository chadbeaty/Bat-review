// Sales tax. Marketplace-facilitator laws likely make the platform responsible for collecting it (decision 0001),
// but collection stays off until an accountant confirms registrations. The interface is here so a provider
// (for example the Stripe Tax calculation API) can be plugged in without changing checkout; no provider is
// called today.

export type TaxInput = {
  itemCents: number;
  shippingCents: number;
  shipTo: { state: string; postalCode: string; city: string; line1: string; country: "US" };
  shipFromPostalCode: string | null;
};

export type TaxQuote = {
  amountCents: number;
  collected: boolean;
  /** Shown on the review step and stored on the order. */
  label: string;
  jurisdiction: Record<string, unknown> | null;
};

export interface TaxProvider {
  readonly name: string;
  quote(input: TaxInput): Promise<TaxQuote>;
}

export class TaxNotConfiguredError extends Error {
  constructor() {
    super("Sales tax collection is switched on, but no tax provider is connected. Checkout is paused until one is.");
  }
}

export const TAX_NOT_COLLECTED: TaxQuote = { amountCents: 0, collected: false, label: "Sales tax not collected", jurisdiction: null };

/** The tax for an order: nothing when collection is off; the provider's figure when it is on. */
export async function quoteTax(enabled: boolean, input: TaxInput, provider: TaxProvider | null): Promise<TaxQuote> {
  if (!enabled) return TAX_NOT_COLLECTED;
  if (!provider) throw new TaxNotConfiguredError();
  const q = await provider.quote(input);
  if (!Number.isInteger(q.amountCents) || q.amountCents < 0) throw new Error("The tax provider returned an invalid amount");
  return q;
}

/** No provider is wired up yet. Returns null so checkout refuses to run with tax switched on. */
export function taxProviderFromEnv(): TaxProvider | null {
  return null;
}
