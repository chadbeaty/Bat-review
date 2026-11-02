// A stand-in shipping provider used when SHIPPO_API_TOKEN isn't set (development, tests, previews).
// Everything it returns is TEST DATA: rates are made up from the package and ZIP codes, labels are a PDF that
// says "not a real label", and tracking only changes when a test posts a webhook. The UI says so wherever
// this data appears.

import { randomUUID } from "node:crypto";
import { CARRIER_RULES, SERVICES, billableWeightOz, unavailableReason } from "./package";
import type { Address, AddressValidation, Label, Parcel, Rate, RateOrigin, RateQuote, ShippingProvider, TrackingUpdate } from "./types";

const PRICING: Record<string, { base: number; perLb: number; perZone: number }> = {
  usps_ground_advantage: { base: 650, perLb: 85, perZone: 45 },
  usps_priority: { base: 950, perLb: 120, perZone: 70 },
  ups_ground: { base: 1150, perLb: 95, perZone: 60 },
  fedex_home_delivery: { base: 1200, perLb: 90, perZone: 65 },
};

/** A rough distance zone (1–8) from the first three digits of two ZIP codes. */
export function fakeZone(fromZip: string, toZip: string): number {
  const a = Number(fromZip.slice(0, 3));
  const b = Number(toZip.slice(0, 3));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 4;
  return 1 + Math.min(7, Math.floor(Math.abs(a - b) / 100));
}

export const FAKE_LABEL_PATH = "/api/shipping/test-label/";

export class FakeShippingProvider implements ShippingProvider {
  readonly name = "fake" as const;
  readonly isTest = true;

  async validateAddress(address: Address): Promise<AddressValidation> {
    // Only basic shape checks; real validation needs Shippo.
    const messages: string[] = [];
    if (!/^\d{5}(-\d{4})?$/.test(address.zip)) messages.push("ZIP code should be 5 digits.");
    if (!/^[A-Z]{2}$/.test(address.state)) messages.push("State should be a 2-letter code.");
    return { valid: messages.length === 0, messages, providerAddressId: null };
  }

  async getRates(from: RateOrigin, to: Address, parcel: Parcel): Promise<RateQuote> {
    const zone = fakeZone(from.zip, to.zip);
    const rates: Rate[] = SERVICES.map((s) => {
      const reason = unavailableReason(parcel, s);
      const billable = billableWeightOz(parcel, CARRIER_RULES[s.carrier]);
      const p = PRICING[s.token];
      const lbs = Math.ceil(billable / 16);
      const amount = p.base + p.perLb * lbs + p.perZone * zone;
      return {
        id: `fake_${s.token}`,
        carrier: CARRIER_RULES[s.carrier].label,
        service: s.service,
        serviceToken: s.token,
        amountCents: reason ? 0 : amount,
        estimatedDays: s.estimatedDays + (zone > 5 ? 1 : 0),
        available: !reason,
        unavailableReason: reason,
        providerRateId: reason ? null : `fake_rate_${s.token}`,
        billableWeightOz: billable,
      };
    });
    return { rates, messages: ["Test data: these are not real carrier rates."], providerShipmentId: null };
  }

  async buyLabel(input: { rate: Rate; from: Address; to: Address; parcel: Parcel; metadata: string }): Promise<Label> {
    const id = `fake_tx_${randomUUID().replace(/-/g, "")}`;
    const digits = Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join("");
    return {
      providerTransactionId: id,
      providerShipmentId: null,
      carrier: input.rate.carrier,
      service: input.rate.service,
      trackingNumber: `TEST${digits}`,
      trackingUrl: null,
      labelUrl: `${FAKE_LABEL_PATH}${id}`,
      costCents: input.rate.amountCents,
    };
  }

  async getTracking(carrier: string, trackingNumber: string): Promise<TrackingUpdate> {
    return { carrier, trackingNumber, current: null, history: [], test: true };
  }
}

/** A one-page PDF that says, in large type, that it is test data and not a real shipping label. */
export function fakeLabelPdf(lines: string[]): Buffer {
  const safe = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1").slice(0, 90);
  const text = [
    "BT /F1 28 Tf 36 340 Td (TEST DATA - NOT A REAL LABEL) Tj ET",
    "BT /F1 12 Tf 36 310 Td (This label cannot be used to ship anything.) Tj ET",
    ...lines.map((l, i) => `BT /F1 11 Tf 36 ${280 - i * 16} Td (${safe(l)}) Tj ET`),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 432 432] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}
