// The shipping provider interface. ShippoProvider talks to Shippo's REST API; FakeShippingProvider returns
// clearly labeled test data when SHIPPO_API_TOKEN isn't set. Checkout, labels and tracking only use this
// interface, so the rest of the app doesn't know which one is running.

export type Address = {
  name: string;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: "US";
  phone?: string | null;
  email?: string | null;
};

/** Origin for a rate quote: the listing's ship-from ZIP and public city/state. A full address is only needed for the label. */
export type RateOrigin = { zip: string; city?: string | null; state?: string | null; country: "US" };

export type Parcel = { lengthIn: number; widthIn: number; heightIn: number; weightOz: number };

export type AddressValidation = {
  valid: boolean;
  /** Messages to show the buyer (for example "street number not found"). */
  messages: string[];
  providerAddressId: string | null;
  /** Corrected address suggested by the provider, if any. */
  suggested?: Partial<Address> | null;
};

export type Rate = {
  /** Our id for the option within a quote. For Shippo, the rate object id. */
  id: string;
  carrier: string;
  service: string;
  serviceToken: string;
  amountCents: number;
  estimatedDays: number | null;
  available: boolean;
  /** Why the option can't be used (too long, too heavy, carrier message). */
  unavailableReason: string | null;
  /** Shippo rate object id, used to buy the label. */
  providerRateId: string | null;
  billableWeightOz: number | null;
};

export type RateQuote = { rates: Rate[]; messages: string[]; providerShipmentId: string | null };

export type Label = {
  providerTransactionId: string;
  providerShipmentId: string | null;
  carrier: string;
  service: string;
  trackingNumber: string;
  trackingUrl: string | null;
  labelUrl: string;
  costCents: number;
};

export type TrackingStatus = "pre_transit" | "in_transit" | "out_for_delivery" | "delivered" | "returned" | "failure" | "unknown";

export type TrackingEvent = {
  eventId: string;
  status: TrackingStatus;
  description: string | null;
  at: string | null;
  location: string | null;
};

export type TrackingUpdate = {
  carrier: string;
  trackingNumber: string;
  current: TrackingEvent | null;
  history: TrackingEvent[];
  test: boolean;
};

export interface ShippingProvider {
  readonly name: "shippo" | "fake";
  /** True for the fake provider: everything it returns is test data. */
  readonly isTest: boolean;
  validateAddress(address: Address): Promise<AddressValidation>;
  getRates(from: RateOrigin, to: Address, parcel: Parcel): Promise<RateQuote>;
  /** Buys a label for a rate. `from` is the seller's full return address. */
  buyLabel(input: { rate: Rate; from: Address; to: Address; parcel: Parcel; metadata: string }): Promise<Label>;
  getTracking(carrier: string, trackingNumber: string): Promise<TrackingUpdate>;
  /** Asks the provider to send tracking webhooks for a number (Shippo does this automatically for its own labels). */
  registerTracking?(carrier: string, trackingNumber: string, metadata: string): Promise<void>;
}

export class ShippingError extends Error {
  constructor(
    message: string,
    public detail?: unknown
  ) {
    super(message);
  }
}
