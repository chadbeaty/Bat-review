// Unit tests for Track D: money math, the order state machine, package and carrier rules, rate selection,
// tax gating, Shippo parsing, the fake provider, Checkout Session parameters and Connect status mapping.

import { describe, expect, it } from "vitest";
import { feeCents, orderTotals, parseDollarsToCents, percentOfCents, transferAmountCents } from "@/lib/payments/money";
import { ORDER_STATUSES, canBuyLabel, canConfirmReceipt, canTransition, orderTimeline, type OrderStatus } from "@/lib/payments/state";
import { quoteTax, TAX_NOT_COLLECTED, TaxNotConfiguredError, type TaxProvider } from "@/lib/payments/tax";
import { checkoutSessionParams, SESSION_MINUTES } from "@/lib/payments/checkout";
import { accountStatusFromStripe } from "@/lib/payments/connect";
import {
  CARRIER_RULES,
  SERVICES,
  billableWeightOz,
  dimensionalWeightOz,
  isLongPackage,
  lengthPlusGirth,
  parcelFromListing,
  unavailableReason,
} from "@/lib/shipping/package";
import { matchLabelRate, selectRate, sortRates } from "@/lib/shipping/rates";
import { FakeShippingProvider, fakeLabelPdf, fakeZone } from "@/lib/shipping/fake";
import { ShippoProvider, dollarsToCents, mapShippoStatus, parseTrack, trackingEventId } from "@/lib/shipping/shippo";
import { shippingProviderFromEnv } from "@/lib/shipping/provider";
import { parseAddressForm } from "@/lib/shipping/address";
import { tokenMatches } from "@/lib/shipping/webhook";
import { createStripe, isLiveKey, webhookSecrets } from "@/lib/payments/stripe-client";
import type { Rate } from "@/lib/shipping/types";

const pct = (v: number) => ({ fee_type: "percentage" as const, fee_value: v });

describe("money", () => {
  it("rounds percentages half up with exact integer math", () => {
    expect(percentOfCents(22000, 7)).toBe(1540);
    expect(percentOfCents(22050, 7)).toBe(1544); // 1543.5 -> 1544
    expect(percentOfCents(22049, 7)).toBe(1543); // 1543.43
    expect(percentOfCents(10001, 7.25)).toBe(725); // 725.0725
    expect(percentOfCents(1, 50)).toBe(1); // 0.5 -> 1
    expect(percentOfCents(0, 7)).toBe(0);
    expect(percentOfCents(2_500_000, 100)).toBe(2_500_000);
    // A float-prone value: 0.1 + 0.2 style errors must not leak into cents.
    expect(percentOfCents(1005, 2.9)).toBe(29); // 29.145
  });

  it("rejects bad inputs", () => {
    expect(() => percentOfCents(10.5, 7)).toThrow();
    expect(() => percentOfCents(-1, 7)).toThrow();
    expect(() => percentOfCents(100, 101)).toThrow();
  });

  it("caps fixed fees at the base and treats a missing rule as zero", () => {
    expect(feeCents(500, { fee_type: "fixed_cents", fee_value: 399 })).toBe(399);
    expect(feeCents(300, { fee_type: "fixed_cents", fee_value: 399 })).toBe(300);
    expect(feeCents(500, null)).toBe(0);
  });

  it("charges commission on the item only, never on shipping or tax", () => {
    const t = orderTotals({ itemCents: 22000, shippingCents: 1899, taxCents: 1500, commission: pct(7), passthrough: pct(0) });
    expect(t.totalCents).toBe(25399);
    expect(t.commissionCents).toBe(1540);
    expect(t.passthroughCents).toBe(0);
    expect(t.sellerPayoutCents).toBe(20460);
  });

  it("applies processing passthrough to the order total when switched on", () => {
    const t = orderTotals({ itemCents: 20000, shippingCents: 1500, taxCents: 0, commission: pct(7), passthrough: pct(2.9) });
    expect(t.passthroughCents).toBe(624); // 2.9% of 215.00 = 6.235 -> 6.24
    expect(t.sellerPayoutCents).toBe(20000 - 1400 - 624);
  });

  it("never pays the seller a negative amount", () => {
    const t = orderTotals({ itemCents: 100, shippingCents: 5000, taxCents: 0, commission: pct(50), passthrough: pct(10) });
    expect(t.sellerPayoutCents).toBe(0);
  });

  it("takes refunds before completion out of the transfer, and pays nothing after a full refund", () => {
    expect(transferAmountCents({ seller_payout_cents: 20460, refunded_amount_cents: 0, total_amount_cents: 23899 })).toBe(20460);
    expect(transferAmountCents({ seller_payout_cents: 20460, refunded_amount_cents: 2000, total_amount_cents: 23899 })).toBe(18460);
    expect(transferAmountCents({ seller_payout_cents: 20460, refunded_amount_cents: 23899, total_amount_cents: 23899 })).toBe(0);
    expect(transferAmountCents({ seller_payout_cents: 100, refunded_amount_cents: 500, total_amount_cents: 23899 })).toBe(0);
  });

  it("parses staff-typed dollar amounts", () => {
    expect(parseDollarsToCents("25")).toBe(2500);
    expect(parseDollarsToCents("25.5")).toBe(2550);
    expect(parseDollarsToCents("$1,200.05")).toBe(120005);
    expect(parseDollarsToCents("0.07")).toBe(7);
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
  });
});

describe("order state machine", () => {
  it("only lets a verified payment move an order out of awaiting_payment", () => {
    expect(canTransition("awaiting_payment", "paid")).toBe(true);
    expect(canTransition("awaiting_payment", "cancelled")).toBe(true);
    expect(canTransition("awaiting_payment", "shipped")).toBe(false);
    expect(canTransition("awaiting_payment", "completed")).toBe(false);
  });

  it("follows the fulfilment path and allows disputes and refunds", () => {
    const path: OrderStatus[] = ["awaiting_payment", "paid", "processing", "shipped", "delivered", "completed"];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
    expect(canTransition("delivered", "disputed")).toBe(true);
    expect(canTransition("completed", "refunded")).toBe(true);
    expect(canTransition("disputed", "completed")).toBe(true);
  });

  it("never moves backwards or out of refunded", () => {
    expect(canTransition("shipped", "paid")).toBe(false);
    expect(canTransition("completed", "delivered")).toBe(false);
    for (const s of ORDER_STATUSES) expect(canTransition("refunded", s)).toBe(false);
    expect(canTransition("cancelled", "shipped")).toBe(false);
  });

  it("decides when labels and receipt confirmation are offered", () => {
    expect(canBuyLabel("paid")).toBe(true);
    expect(canBuyLabel("processing")).toBe(true);
    expect(canBuyLabel("shipped")).toBe(false);
    expect(canBuyLabel("awaiting_payment")).toBe(false);
    expect(canConfirmReceipt("shipped", null)).toBe(true);
    expect(canConfirmReceipt("delivered", null)).toBe(true);
    expect(canConfirmReceipt("delivered", "2026-11-01T00:00:00Z")).toBe(false);
    expect(canConfirmReceipt("paid", null)).toBe(false);
  });

  it("builds a timeline from the order dates", () => {
    const steps = orderTimeline({ order_status: "shipped", created_at: "a", paid_at: "b", shipped_at: "c", delivered_at: null, completed_at: null, label_at: "d" });
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(["placed", "paid", "label", "shipped"]);
  });
});

describe("package rules", () => {
  const batBox = { lengthIn: 38, widthIn: 5, heightIn: 5, weightOz: 48 };

  it("computes length + girth and dimensional weight per carrier", () => {
    expect(lengthPlusGirth(batBox)).toBe(58);
    // 950 cubic inches: under USPS's 1 cubic foot threshold, so no USPS dimensional weight.
    expect(dimensionalWeightOz(batBox, CARRIER_RULES.usps)).toBe(0);
    // UPS/FedEx always apply it: 950 / 139 = 6.83 -> 7 lb.
    expect(dimensionalWeightOz(batBox, CARRIER_RULES.ups)).toBe(7 * 16);
    expect(billableWeightOz(batBox, CARRIER_RULES.usps)).toBe(48);
    expect(billableWeightOz(batBox, CARRIER_RULES.fedex)).toBe(112);
  });

  it("orders sides so a box entered sideways measures the same", () => {
    expect(lengthPlusGirth({ lengthIn: 5, widthIn: 38, heightIn: 5, weightOz: 1 })).toBe(58);
  });

  it("explains why a service can't take an oversized package", () => {
    const priority = SERVICES.find((s) => s.token === "usps_priority")!;
    const ground = SERVICES.find((s) => s.token === "usps_ground_advantage")!;
    const ups = SERVICES.find((s) => s.token === "ups_ground")!;
    const bagBox = { lengthIn: 40, widthIn: 18, heightIn: 18, weightOz: 400 }; // L+G = 112
    expect(unavailableReason(bagBox, priority)).toMatch(/Priority Mail.*112.*108/);
    expect(unavailableReason(bagBox, ground)).toBeNull();
    expect(unavailableReason({ lengthIn: 110, widthIn: 4, heightIn: 4, weightOz: 50 }, ups)).toMatch(/Too long for UPS/);
    expect(unavailableReason({ lengthIn: 30, widthIn: 30, heightIn: 30, weightOz: 50 }, ground)).toMatch(/length \+ girth is 150/);
    expect(unavailableReason({ lengthIn: 38, widthIn: 5, heightIn: 5, weightOz: 71 * 16 }, ground)).toMatch(/Too heavy for USPS/);
  });

  it("builds the parcel from a listing or says what's missing", () => {
    expect(parcelFromListing({ shipping_weight_oz: "48.00", package_length_inches: 38, package_width_inches: "5.0", package_height_inches: 5 })).toEqual({
      ok: true,
      parcel: batBox,
    });
    expect(parcelFromListing({ shipping_weight_oz: null, package_length_inches: 38, package_width_inches: 5, package_height_inches: 5 }).ok).toBe(false);
    expect(isLongPackage(batBox)).toBe(true);
  });
});

const rate = (id: string, amountCents: number, available = true, extra: Partial<Rate> = {}): Rate => ({
  id,
  carrier: "USPS",
  service: id,
  serviceToken: id,
  amountCents,
  estimatedDays: 3,
  available,
  unavailableReason: available ? null : "too big",
  providerRateId: available ? `r_${id}` : null,
  billableWeightOz: 48,
  ...extra,
});

describe("rate selection", () => {
  const rates = [rate("b", 1899), rate("x", 0, false), rate("a", 1299), rate("c", 1299, true, { estimatedDays: 2 })];

  it("sorts available rates cheapest first (faster wins ties), unavailable last", () => {
    expect(sortRates(rates).map((r) => r.id)).toEqual(["c", "a", "b", "x"]);
  });

  it("returns the chosen rate only if it is available", () => {
    expect(selectRate(rates, "b")?.id).toBe("b");
    expect(selectRate(rates, "x")).toBeNull();
    expect(selectRate(rates, "nope")).toBeNull();
    expect(selectRate(rates)?.id).toBe("c");
    expect(selectRate([rate("x", 0, false)])).toBeNull();
  });

  it("matches the service the buyer paid for when buying the label", () => {
    const fresh = [rate("usps_priority", 2100), rate("usps_ground_advantage", 1500), rate("ups_ground", 1700, true, { carrier: "UPS" })];
    expect(matchLabelRate(fresh, { carrier: "USPS", serviceToken: "usps_ground_advantage" })?.id).toBe("usps_ground_advantage");
    expect(matchLabelRate(fresh, { carrier: "UPS", serviceToken: "ups_2day" })?.id).toBe("ups_ground");
    expect(matchLabelRate(fresh, { carrier: "DHL", serviceToken: "dhl" })?.id).toBe("usps_ground_advantage");
    expect(matchLabelRate([], { carrier: "USPS", serviceToken: "x" })).toBeNull();
  });
});

describe("sales tax", () => {
  const input = { itemCents: 20000, shippingCents: 1500, shipTo: { state: "TN", postalCode: "37201", city: "Nashville", line1: "1 Main", country: "US" as const }, shipFromPostalCode: "30301" };

  it("collects nothing while tax collection is off", async () => {
    expect(await quoteTax(false, input, null)).toEqual(TAX_NOT_COLLECTED);
    expect(TAX_NOT_COLLECTED.label).toBe("Sales tax not collected");
  });

  it("refuses to run checkout with tax on and no provider", async () => {
    await expect(quoteTax(true, input, null)).rejects.toBeInstanceOf(TaxNotConfiguredError);
  });

  it("uses a provider's amount and rejects nonsense", async () => {
    const good: TaxProvider = { name: "t", quote: async () => ({ amountCents: 1913, collected: true, label: "TN sales tax", jurisdiction: { state: "TN" } }) };
    expect((await quoteTax(true, input, good)).amountCents).toBe(1913);
    const bad: TaxProvider = { name: "t", quote: async () => ({ amountCents: 1.5, collected: true, label: "x", jurisdiction: null }) };
    await expect(quoteTax(true, input, bad)).rejects.toThrow(/invalid amount/);
  });
});

describe("shippo parsing", () => {
  it("maps statuses including out for delivery", () => {
    expect(mapShippoStatus("PRE_TRANSIT")).toBe("pre_transit");
    expect(mapShippoStatus("TRANSIT")).toBe("in_transit");
    expect(mapShippoStatus("TRANSIT", { code: "out_for_delivery" })).toBe("out_for_delivery");
    expect(mapShippoStatus("DELIVERED")).toBe("delivered");
    expect(mapShippoStatus("RETURNED")).toBe("returned");
    expect(mapShippoStatus("FAILURE")).toBe("failure");
    expect(mapShippoStatus("SOMETHING")).toBe("unknown");
  });

  it("converts dollar strings exactly", () => {
    expect(dollarsToCents("12.5")).toBe(1250);
    expect(dollarsToCents("7")).toBe(700);
    expect(() => dollarsToCents("1e3")).toThrow();
  });

  it("parses a track_updated payload with stable event ids", () => {
    const data = {
      carrier: "usps",
      tracking_number: "9400",
      tracking_status: { status: "DELIVERED", status_details: "Delivered, front door", status_date: "2026-11-02T15:00:00Z", location: { city: "Nashville", state: "TN" }, object_id: "abc" },
      tracking_history: [{ status: "TRANSIT", status_details: "Accepted", status_date: "2026-10-30T15:00:00Z" }],
    };
    const t = parseTrack(data, true);
    expect(t.current).toMatchObject({ eventId: "shippo:abc", status: "delivered", location: "Nashville, TN" });
    expect(t.history[0].status).toBe("in_transit");
    expect(t.history[0].eventId).toBe(trackingEventId("usps", "9400", data.tracking_history[0]));
    expect(t.test).toBe(true);
    expect(() => parseTrack({ carrier: "usps" })).toThrow();
  });

  it("talks to Shippo's REST API with token auth (request shape only; untested against the real API)", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchStub = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          object_id: "shp_1",
          rates: [{ object_id: "rate_1", amount: "14.20", provider: "USPS", servicelevel: { name: "Ground Advantage", token: "usps_ground_advantage" }, estimated_days: 4 }],
          messages: [{ source: "UPS", text: "Package too large" }],
        }),
        { status: 201 }
      );
    };
    const shippo = new ShippoProvider("shippo_test_abc", fetchStub);
    expect(shippo.isTest).toBe(true);
    const q = await shippo.getRates(
      { zip: "37201", country: "US" },
      { name: "A", street1: "1 Main", city: "Austin", state: "TX", zip: "78701", country: "US" },
      { lengthIn: 40, widthIn: 18, heightIn: 18, weightOz: 400 }
    );
    expect(calls[0].url).toBe("https://api.goshippo.com/shipments/");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("ShippoToken shippo_test_abc");
    expect(q.rates.find((r) => r.id === "rate_1")?.amountCents).toBe(1420);
    // Priority Mail wasn't quoted, and our rules know why.
    expect(q.rates.find((r) => r.serviceToken === "usps_priority")?.unavailableReason).toMatch(/108/);
    expect(q.messages).toContain("UPS: Package too large");
  });

  it("uses the fake provider when no Shippo token is set", () => {
    expect(shippingProviderFromEnv({}).name).toBe("fake");
    expect(shippingProviderFromEnv({ SHIPPO_API_TOKEN: "shippo_live_x" }).name).toBe("shippo");
  });
});

describe("fake shipping provider", () => {
  const fake = new FakeShippingProvider();
  const to = { name: "Buyer", street1: "1 Main St", city: "Austin", state: "TX", zip: "78701", country: "US" as const };

  it("quotes every service, marking oversized ones unavailable with a reason", async () => {
    const q = await fake.getRates({ zip: "37201", country: "US" }, to, { lengthIn: 40, widthIn: 18, heightIn: 18, weightOz: 400 });
    expect(q.rates).toHaveLength(SERVICES.length);
    const priority = q.rates.find((r) => r.serviceToken === "usps_priority")!;
    expect(priority.available).toBe(false);
    expect(priority.unavailableReason).toMatch(/length \+ girth/);
    expect(q.messages[0]).toMatch(/Test data/);
  });

  it("prices by billable weight and distance, deterministically", async () => {
    const a = await fake.getRates({ zip: "37201", country: "US" }, to, { lengthIn: 38, widthIn: 5, heightIn: 5, weightOz: 48 });
    const b = await fake.getRates({ zip: "37201", country: "US" }, to, { lengthIn: 38, widthIn: 5, heightIn: 5, weightOz: 48 });
    expect(a.rates.map((r) => r.amountCents)).toEqual(b.rates.map((r) => r.amountCents));
    expect(a.rates.every((r) => r.available && r.amountCents > 0)).toBe(true);
    expect(fakeZone("372", "787")).toBeGreaterThan(fakeZone("372", "372"));
  });

  it("issues clearly labeled test labels", async () => {
    const q = await fake.getRates({ zip: "37201", country: "US" }, to, { lengthIn: 38, widthIn: 5, heightIn: 5, weightOz: 48 });
    const label = await fake.buyLabel({ rate: q.rates[0], from: to, to, parcel: { lengthIn: 38, widthIn: 5, heightIn: 5, weightOz: 48 }, metadata: "x" });
    expect(label.trackingNumber).toMatch(/^TEST\d{18}$/);
    expect(label.labelUrl).toMatch(/^\/api\/shipping\/test-label\/fake_tx_[a-f0-9]{32}$/);
    const pdf = fakeLabelPdf(["Order (ORD-1)"]).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("TEST DATA - NOT A REAL LABEL");
    expect(pdf).toContain("Order \\(ORD-1\\)");
  });
});

describe("checkout session parameters", () => {
  const input = {
    orderId: "11111111-1111-1111-1111-111111111111",
    orderNumber: "ORD-100001",
    listingId: "22222222-2222-2222-2222-222222222222",
    title: "2026 Miken Freak",
    itemCents: 22000,
    shippingCents: 1899,
    shippingLabel: "USPS Ground Advantage",
    taxCents: 0,
    totalCents: 23899,
    buyerEmail: "b@example.com",
  };

  it("keeps funds on the platform with the order as transfer group and expires in 30+ minutes", () => {
    const now = 1_800_000_000_000;
    const p = checkoutSessionParams("https://site.test/", input, now, null);
    expect(p.mode).toBe("payment");
    expect(p.payment_intent_data?.transfer_group).toBe(input.orderId);
    expect(p.payment_intent_data?.metadata?.order_id).toBe(input.orderId);
    expect(p.metadata?.order_id).toBe(input.orderId);
    expect(p.payment_intent_data).not.toHaveProperty("application_fee_amount");
    expect(p.payment_intent_data).not.toHaveProperty("transfer_data");
    expect(p.expires_at).toBe(now / 1000 + SESSION_MINUTES * 60);
    expect(SESSION_MINUTES).toBeGreaterThanOrEqual(30);
    expect(p.line_items).toHaveLength(1);
    expect(p.shipping_options?.[0].shipping_rate_data?.fixed_amount?.amount).toBe(1899);
    expect(p.success_url).toBe(`https://site.test/account/purchases/${input.orderId}?checkout=success`);
    expect(p).not.toHaveProperty("payment_method_configuration");
  });

  it("adds tax as its own line and refuses totals that don't add up", () => {
    const p = checkoutSessionParams("https://site.test", { ...input, taxCents: 150, totalCents: 24049 }, 0, "pmc_123");
    expect(p.line_items).toHaveLength(2);
    expect(p.payment_method_configuration).toBe("pmc_123");
    expect(() => checkoutSessionParams("https://site.test", { ...input, totalCents: 1 })).toThrow(/add up/);
  });
});

describe("connect account status", () => {
  const base = { details_submitted: true, charges_enabled: false, payouts_enabled: true, capabilities: { transfers: "active" as const }, requirements: null };

  it("is complete only with details, payouts and transfers active", () => {
    expect(accountStatusFromStripe(base as never).onboarding_status).toBe("complete");
    expect(accountStatusFromStripe({ ...base, payouts_enabled: false } as never).onboarding_status).toBe("in_progress");
    expect(accountStatusFromStripe({ ...base, details_submitted: false } as never).onboarding_status).toBe("in_progress");
  });

  it("reports restricted and rejected accounts with what is due", () => {
    const restricted = accountStatusFromStripe({
      ...base,
      payouts_enabled: false,
      requirements: { disabled_reason: "requirements.past_due", currently_due: ["external_account"], past_due: ["individual.ssn_last_4", "external_account"] },
    } as never);
    expect(restricted.onboarding_status).toBe("restricted");
    expect(restricted.requirements_due).toEqual(["individual.ssn_last_4", "external_account"]);
    expect(accountStatusFromStripe({ ...base, requirements: { disabled_reason: "rejected.fraud" } } as never).onboarding_status).toBe("rejected");
  });
});

describe("configuration helpers", () => {
  it("points the Stripe client at a test double only when asked", () => {
    expect(createStripe({})).toBeNull();
    expect(createStripe({ STRIPE_SECRET_KEY: "sk_test_123", STRIPE_API_HOST: "localhost", STRIPE_API_PORT: "12111", STRIPE_API_PROTOCOL: "http" })).not.toBeNull();
    expect(isLiveKey({ STRIPE_SECRET_KEY: "sk_live_x" })).toBe(true);
    expect(isLiveKey({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(webhookSecrets({ STRIPE_WEBHOOK_SECRET: "a", STRIPE_CONNECT_WEBHOOK_SECRET: " " })).toEqual(["a"]);
  });

  it("compares webhook tokens exactly", () => {
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abd", "abc")).toBe(false);
    expect(tokenMatches("ab", "abc")).toBe(false);
    expect(tokenMatches(null, "abc")).toBe(false);
    expect(tokenMatches("abc", undefined)).toBe(false);
  });

  it("validates shipping addresses", () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ full_name: "Pat Buyer", street_address: "1 Main St", city: "Austin", state: "tx", postal_code: "78701" })) f.set(k, v);
    const ok = parseAddressForm(f);
    expect(ok.ok && ok.value.state).toBe("TX");
    f.set("postal_code", "7870");
    expect(parseAddressForm(f)).toEqual({ ok: false, error: "Enter a 5-digit ZIP code." });
    f.set("postal_code", "78701");
    f.set("state", "ZZ");
    expect(parseAddressForm(f).ok).toBe(false);
  });
});
