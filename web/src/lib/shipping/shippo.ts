// Shippo REST client (https://docs.goshippo.com). Uses the platform's Shippo account: labels are bought and
// paid for by the marketplace, from the shipping money the buyer paid.
//
// NOT TESTED AGAINST THE REAL SHIPPO API: api.goshippo.com isn't reachable from the machine this was built on.
// The request and response shapes follow Shippo's public API reference; run a test-mode label purchase with a
// real test token before going live (docs/tracks/payments.md, go-live checklist).

import { createHash } from "node:crypto";
import { CARRIER_RULES, SERVICES, billableWeightOz, unavailableReason } from "./package";
import {
  ShippingError,
  type Address,
  type AddressValidation,
  type Label,
  type Parcel,
  type Rate,
  type RateOrigin,
  type RateQuote,
  type ShippingProvider,
  type TrackingEvent,
  type TrackingStatus,
  type TrackingUpdate,
} from "./types";

type Json = Record<string, unknown>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const BASE = "https://api.goshippo.com";

function toShippoAddress(a: Address | RateOrigin): Json {
  if ("street1" in a) {
    return {
      name: a.name,
      street1: a.street1,
      street2: a.street2 ?? "",
      city: a.city,
      state: a.state,
      zip: a.zip,
      country: a.country,
      phone: a.phone ?? "",
      email: a.email ?? "",
    };
  }
  return { zip: a.zip, city: a.city ?? "", state: a.state ?? "", country: a.country };
}

function toShippoParcel(p: Parcel): Json {
  return {
    length: String(p.lengthIn),
    width: String(p.widthIn),
    height: String(p.heightIn),
    distance_unit: "in",
    weight: String(p.weightOz),
    mass_unit: "oz",
  };
}

const CARRIER_KEYS: Record<string, keyof typeof CARRIER_RULES> = { usps: "usps", ups: "ups", fedex: "fedex" };

export function dollarsToCents(amount: unknown): number {
  const s = String(amount ?? "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new ShippingError(`Unexpected amount from Shippo: ${s}`);
  const [w, f = ""] = s.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

/** Maps a Shippo tracking status (and substatus) to ours. */
export function mapShippoStatus(status: unknown, substatus?: unknown): TrackingStatus {
  const sub = typeof substatus === "object" && substatus ? String((substatus as Json).code ?? "") : "";
  switch (String(status ?? "").toUpperCase()) {
    case "PRE_TRANSIT":
      return "pre_transit";
    case "TRANSIT":
      return sub === "out_for_delivery" ? "out_for_delivery" : "in_transit";
    case "DELIVERED":
      return "delivered";
    case "RETURNED":
      return "returned";
    case "FAILURE":
      return "failure";
    default:
      return "unknown";
  }
}

function locationText(loc: unknown): string | null {
  if (!loc || typeof loc !== "object") return null;
  const l = loc as Json;
  const parts = [l.city, l.state, l.zip].filter((v) => typeof v === "string" && v);
  return parts.length ? parts.join(", ") : null;
}

/** A stable id for a tracking event: Shippo's object id, or a hash of what makes the event unique. */
export function trackingEventId(carrier: string, trackingNumber: string, ev: Json): string {
  if (typeof ev.object_id === "string" && ev.object_id) return `shippo:${ev.object_id}`;
  const basis = [carrier, trackingNumber, ev.status, ev.status_date, ev.status_details].map((v) => String(v ?? "")).join("|");
  return `shippo:h:${createHash("sha256").update(basis).digest("hex").slice(0, 32)}`;
}

function toEvent(carrier: string, trackingNumber: string, ev: unknown): TrackingEvent | null {
  if (!ev || typeof ev !== "object") return null;
  const e = ev as Json;
  return {
    eventId: trackingEventId(carrier, trackingNumber, e),
    status: mapShippoStatus(e.status, e.substatus),
    description: typeof e.status_details === "string" ? e.status_details : null,
    at: typeof e.status_date === "string" ? e.status_date : null,
    location: locationText(e.location),
  };
}

/** Parses a Shippo track object (from GET /tracks or a track_updated webhook's data). */
export function parseTrack(data: unknown, test = false): TrackingUpdate {
  if (!data || typeof data !== "object") throw new ShippingError("Tracking data is missing");
  const d = data as Json;
  const carrier = String(d.carrier ?? "");
  const trackingNumber = String(d.tracking_number ?? "");
  if (!trackingNumber) throw new ShippingError("Tracking number is missing");
  const history = Array.isArray(d.tracking_history)
    ? (d.tracking_history.map((e) => toEvent(carrier, trackingNumber, e)).filter(Boolean) as TrackingEvent[])
    : [];
  return { carrier, trackingNumber, current: toEvent(carrier, trackingNumber, d.tracking_status), history, test };
}

export class ShippoProvider implements ShippingProvider {
  readonly name = "shippo" as const;
  readonly isTest: boolean;

  constructor(
    private token: string,
    private fetchImpl: FetchLike = fetch,
    private baseUrl = BASE
  ) {
    // Shippo test tokens start with shippo_test_; their labels are free and not real.
    this.isTest = token.startsWith("shippo_test_");
  }

  private async call(method: "GET" | "POST", path: string, body?: Json): Promise<Json> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `ShippoToken ${this.token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: Json = {};
    try {
      json = text ? (JSON.parse(text) as Json) : {};
    } catch {
      throw new ShippingError(`Shippo returned a non-JSON response (${res.status})`);
    }
    if (!res.ok) throw new ShippingError(`Shippo request failed (${res.status})`, json);
    return json;
  }

  async validateAddress(address: Address): Promise<AddressValidation> {
    const a = await this.call("POST", "/addresses/", { ...toShippoAddress(address), validate: true });
    const results = (a.validation_results ?? {}) as Json;
    const messages = Array.isArray(results.messages) ? results.messages.map((m) => String((m as Json).text ?? "")).filter(Boolean) : [];
    return {
      valid: results.is_valid === true,
      messages,
      providerAddressId: typeof a.object_id === "string" ? a.object_id : null,
      suggested: {
        street1: a.street1 as string,
        city: a.city as string,
        state: a.state as string,
        zip: a.zip as string,
      },
    };
  }

  async getRates(from: RateOrigin, to: Address, parcel: Parcel): Promise<RateQuote> {
    const shipment = await this.call("POST", "/shipments/", {
      address_from: toShippoAddress(from),
      address_to: toShippoAddress(to),
      parcels: [toShippoParcel(parcel)],
      async: false,
    });
    const raw = Array.isArray(shipment.rates) ? (shipment.rates as Json[]) : [];
    const rates: Rate[] = raw.map((r) => {
      const level = (r.servicelevel ?? {}) as Json;
      const provider = String(r.provider ?? "");
      const key = CARRIER_KEYS[provider.toLowerCase()];
      return {
        id: String(r.object_id),
        carrier: provider,
        service: String(level.name ?? level.token ?? "Shipping"),
        serviceToken: String(level.token ?? ""),
        amountCents: dollarsToCents(r.amount),
        estimatedDays: typeof r.estimated_days === "number" ? r.estimated_days : null,
        available: true,
        unavailableReason: null,
        providerRateId: String(r.object_id),
        billableWeightOz: key ? billableWeightOz(parcel, CARRIER_RULES[key]) : null,
      };
    });
    // Services Shippo didn't quote: explain why when our package rules know.
    for (const s of SERVICES) {
      if (rates.some((r) => r.serviceToken === s.token)) continue;
      const reason = unavailableReason(parcel, s);
      if (reason) {
        rates.push({
          id: `unavailable_${s.token}`,
          carrier: CARRIER_RULES[s.carrier].label,
          service: s.service,
          serviceToken: s.token,
          amountCents: 0,
          estimatedDays: null,
          available: false,
          unavailableReason: reason,
          providerRateId: null,
          billableWeightOz: billableWeightOz(parcel, CARRIER_RULES[s.carrier]),
        });
      }
    }
    const messages = Array.isArray(shipment.messages)
      ? (shipment.messages as Json[]).map((m) => [m.source, m.text].filter(Boolean).join(": ")).filter(Boolean)
      : [];
    return { rates, messages, providerShipmentId: typeof shipment.object_id === "string" ? shipment.object_id : null };
  }

  async buyLabel(input: { rate: Rate; from: Address; to: Address; parcel: Parcel; metadata: string }): Promise<Label> {
    if (!input.rate.providerRateId) throw new ShippingError("This rate can't be used to buy a label");
    const tx = await this.call("POST", "/transactions/", {
      rate: input.rate.providerRateId,
      label_file_type: "PDF_4x6",
      async: false,
      metadata: input.metadata.slice(0, 100),
    });
    if (tx.status !== "SUCCESS") {
      const msgs = Array.isArray(tx.messages) ? (tx.messages as Json[]).map((m) => String(m.text ?? "")).join("; ") : "";
      throw new ShippingError(`The carrier didn't issue the label${msgs ? `: ${msgs}` : ""}`, tx);
    }
    return {
      providerTransactionId: String(tx.object_id),
      providerShipmentId: null,
      carrier: input.rate.carrier,
      service: input.rate.service,
      trackingNumber: String(tx.tracking_number ?? ""),
      trackingUrl: typeof tx.tracking_url_provider === "string" ? tx.tracking_url_provider : null,
      labelUrl: String(tx.label_url ?? ""),
      costCents: input.rate.amountCents,
    };
  }

  async getTracking(carrier: string, trackingNumber: string): Promise<TrackingUpdate> {
    const t = await this.call("GET", `/tracks/${encodeURIComponent(carrier.toLowerCase())}/${encodeURIComponent(trackingNumber)}`);
    return parseTrack(t, this.isTest);
  }

  async registerTracking(carrier: string, trackingNumber: string, metadata: string): Promise<void> {
    await this.call("POST", "/tracks/", { carrier: carrier.toLowerCase(), tracking_number: trackingNumber, metadata: metadata.slice(0, 100) });
  }
}
