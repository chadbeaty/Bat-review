// Picks the shipping provider: Shippo when SHIPPO_API_TOKEN is set, otherwise the labeled fake.

import { FakeShippingProvider } from "./fake";
import { ShippoProvider } from "./shippo";
import type { ShippingProvider } from "./types";

export function shippingProviderFromEnv(env: Record<string, string | undefined> = process.env): ShippingProvider {
  const token = env.SHIPPO_API_TOKEN?.trim();
  return token ? new ShippoProvider(token) : new FakeShippingProvider();
}

/** The notice shown wherever fake rates, labels or tracking appear. */
export const TEST_DATA_NOTICE = "Test data — not a real label. Shipping isn't connected to a carrier yet.";
