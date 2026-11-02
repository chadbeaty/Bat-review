// Integration tests against stripe-mock (the official Stripe test double) and the local Supabase stack:
// Checkout Session creation, signed webhooks (including duplicate delivery and a bad signature), connected
// accounts and onboarding links, the completion transfer, refunds with and without a transfer reversal, and
// the fake shipping provider's label and tracking webhook.
//
// stripe-mock returns fixture objects (it doesn't keep state), so these tests check the requests we make and
// how our database reacts, not Stripe's own behavior. Skipped when stripe-mock or Supabase isn't running.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { RenderedEmail } from "@/lib/email/layout";
import { FakeShippingProvider } from "@/lib/shipping/fake";
import type { Deps } from "@/lib/payments/deps";
import { createCheckoutSession, closeUnpaidCheckout, createShippingQuote } from "@/lib/payments/checkout";
import { processStripeWebhook } from "@/lib/payments/webhooks";
import { completeOrder } from "@/lib/payments/completion";
import { refundOrder } from "@/lib/payments/refunds";
import { createOnboardingLink, ensureConnectedAccount, syncConnectedAccount } from "@/lib/payments/connect";
import { buyLabel } from "@/lib/shipping/labels";
import { processShippoWebhook } from "@/lib/shipping/webhook";
import {
  WEBHOOK_SECRET,
  cleanupUsers,
  createMember,
  insertOrder,
  liveListing,
  makeSellerReady,
  mockStripe,
  service,
  stripeMockUp,
  supabaseUp,
  type Member,
} from "./helpers";

const ready = (await stripeMockUp()) && (await supabaseUp());
const suite = ready ? describe : describe.skip;

suite("payments against stripe-mock", () => {
  const sent: { to: string; email: RenderedEmail }[] = [];
  let deps: Deps;
  let stripe: Stripe;
  let seller: Member;
  let buyer: Member;
  let staffAdmin: Member;
  let staffSupport: Member;

  const sign = (payload: string, secret = WEBHOOK_SECRET) => stripe.webhooks.generateTestHeaderString({ payload, secret });
  const event = (type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ id: `evt_${randomUUID().replace(/-/g, "")}`, object: "event", type, api_version: "2026-09-30", created: Math.floor(Date.now() / 1000), data: { object }, livemode: false, ...extra });
  const order = async (id: string) => (await service().from("orders").select("*").eq("id", id).single()).data!;

  beforeAll(async () => {
    stripe = mockStripe();
    deps = { db: service(), stripe, shipping: new FakeShippingProvider(), mail: async (to, email) => void sent.push({ to, email }), siteUrl: "http://localhost:3105" };
    [seller, buyer, staffAdmin, staffSupport] = await Promise.all([createMember("pay_seller"), createMember("pay_buyer"), createMember("pay_admin"), createMember("pay_support")]);
    await service().from("user_roles").insert([
      { user_id: staffAdmin.id, role: "admin" },
      { user_id: staffSupport.id, role: "support" },
    ]);
    await makeSellerReady(seller.id);
  });

  afterAll(async () => {
    await cleanupUsers([seller?.id, buyer?.id, staffAdmin?.id, staffSupport?.id]);
  });

  it("creates a hosted Checkout Session for an order", async () => {
    const session = await createCheckoutSession(stripe, deps.siteUrl, {
      orderId: randomUUID(),
      orderNumber: "ORD-TEST",
      listingId: randomUUID(),
      title: "Test bat",
      itemCents: 22000,
      shippingCents: 1899,
      shippingLabel: "USPS Ground Advantage",
      taxCents: 0,
      totalCents: 23899,
      buyerEmail: buyer.email,
    });
    expect(session.id).toMatch(/^cs_/);
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });

  it("quotes shipping with the fake provider and stores the quote for the buyer", async () => {
    const listing = await liveListing(seller);
    const { data: addr } = await service()
      .from("addresses")
      .insert({ user_id: buyer.id, full_name: "Pat Buyer", street_address: "1 Main St", city: "Austin", state: "TX", postal_code: "78701" })
      .select("id")
      .single();
    const quote = await createShippingQuote(deps, { buyerId: buyer.id, listingId: listing, addressId: addr!.id });
    expect(quote.is_test).toBe(true);
    expect(quote.rates.length).toBeGreaterThan(1);
    expect(quote.rates[0].available).toBe(true);
    await expect(createShippingQuote(deps, { buyerId: seller.id, listingId: listing, addressId: addr!.id })).rejects.toThrow(/your own listing/);
  });

  describe("webhooks", () => {
    it("rejects a bad signature and an unsigned request", async () => {
      const body = event("checkout.session.completed", { id: "cs_x", object: "checkout.session" });
      expect((await processStripeWebhook(deps, body, sign(body, "whsec_wrong"), [WEBHOOK_SECRET])).status).toBe(400);
      expect((await processStripeWebhook(deps, body, null, [WEBHOOK_SECRET])).status).toBe(400);
      expect((await processStripeWebhook(deps, body + " ", sign(body), [WEBHOOK_SECRET])).status).toBe(400);
      expect((await processStripeWebhook(deps, body, sign(body), [])).status).toBe(503);
    });

    it("marks the order paid from checkout.session.completed, once, and ignores the duplicate delivery", async () => {
      const listing = await liveListing(seller);
      const o = await insertOrder(buyer, seller, listing);
      const pi = `pi_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const body = event("checkout.session.completed", {
        id: `cs_${randomUUID().replace(/-/g, "")}`,
        object: "checkout.session",
        payment_status: "paid",
        status: "complete",
        amount_total: o.total_amount_cents,
        payment_intent: pi,
        client_reference_id: o.id,
        metadata: { order_id: o.id },
      });
      const first = await processStripeWebhook(deps, body, sign(body), [WEBHOOK_SECRET]);
      expect(first).toMatchObject({ status: 200, body: { outcome: "paid" } });
      const row = await order(o.id);
      expect(row.order_status).toBe("paid");
      expect(row.stripe_payment_intent_id).toBe(pi);
      const { data: l } = await service().from("equipment_listings").select("listing_status").eq("id", listing).single();
      expect(l!.listing_status).toBe("reserved");
      expect(sent.filter((m) => m.email.template === "purchase_confirmation" && m.to === buyer.email)).toHaveLength(1);
      expect(sent.filter((m) => m.email.template === "seller_order" && m.to === seller.email)).toHaveLength(1);

      const again = await processStripeWebhook(deps, body, sign(body), [WEBHOOK_SECRET]);
      expect(again).toMatchObject({ status: 200, body: { duplicate: true } });
      // payment_intent.succeeded for the same payment arrives too: no second set of emails.
      const piBody = event("payment_intent.succeeded", { id: pi, object: "payment_intent", amount_received: o.total_amount_cents, metadata: { order_id: o.id } });
      expect(await processStripeWebhook(deps, piBody, sign(piBody), [WEBHOOK_SECRET])).toMatchObject({ body: { outcome: "already_paid" } });
      expect(sent.filter((m) => m.email.template === "purchase_confirmation" && m.to === buyer.email)).toHaveLength(1);
      const { count } = await service().from("webhook_events").select("id", { count: "exact", head: true }).eq("provider", "stripe").in("event_id", [JSON.parse(body).id]);
      expect(count).toBe(1);
    });

    it("releases the hold on checkout.session.expired and records chargebacks and payouts", async () => {
      const listing = await liveListing(seller);
      const o = await insertOrder(buyer, seller, listing);
      const expired = event("checkout.session.expired", { id: "cs_exp", object: "checkout.session", metadata: { order_id: o.id } });
      expect(await processStripeWebhook(deps, expired, sign(expired), [WEBHOOK_SECRET])).toMatchObject({ body: { outcome: "released" } });
      expect((await order(o.id)).order_status).toBe("cancelled");

      const listing2 = await liveListing(seller);
      const pi = `pi_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const paid = await insertOrder(buyer, seller, listing2, { status: "paid", paymentIntent: pi });
      const dispute = event("charge.dispute.created", { id: `dp_${randomUUID().slice(0, 8)}`, object: "dispute", payment_intent: pi, charge: "ch_x", reason: "fraudulent", status: "needs_response" });
      expect(await processStripeWebhook(deps, dispute, sign(dispute), [WEBHOOK_SECRET])).toMatchObject({ body: { outcome: "dispute_under_review" } });
      expect((await order(paid.id)).order_status).toBe("disputed");

      const { data: acct } = await service().from("seller_payment_accounts").select("stripe_connected_account_id").eq("seller_id", seller.id).single();
      const payout = event(
        "payout.failed",
        { id: `po_${randomUUID().slice(0, 8)}`, object: "payout", amount: 20460, currency: "usd", status: "failed", arrival_date: 1800000000, failure_code: "account_closed", failure_message: "The bank account has been closed" },
        { account: acct!.stripe_connected_account_id }
      );
      expect(await processStripeWebhook(deps, payout, sign(payout), [WEBHOOK_SECRET])).toMatchObject({ body: { outcome: "payout_failed" } });
      const { data: po } = await service().from("seller_payouts").select("status, failure_message").eq("seller_id", seller.id).single();
      expect(po).toEqual({ status: "failed", failure_message: "The bank account has been closed" });
    });

    it("updates the seller's account from account.updated", async () => {
      const { data: acct } = await service().from("seller_payment_accounts").select("stripe_connected_account_id").eq("seller_id", seller.id).single();
      const body = event("account.updated", {
        id: acct!.stripe_connected_account_id,
        object: "account",
        details_submitted: true,
        charges_enabled: false,
        payouts_enabled: false,
        capabilities: { transfers: "inactive" },
        requirements: { currently_due: ["external_account"], past_due: [], disabled_reason: "requirements.past_due" },
      });
      expect(await processStripeWebhook(deps, body, sign(body), [WEBHOOK_SECRET])).toMatchObject({ body: { outcome: "account_restricted" } });
      const { data } = await service().from("seller_payment_accounts").select("onboarding_status, requirements_due").eq("seller_id", seller.id).single();
      expect(data).toEqual({ onboarding_status: "restricted", requirements_due: ["external_account"] });
      await makeSellerReady(seller.id, acct!.stripe_connected_account_id);
    });
  });

  describe("connected accounts", () => {
    it("creates an Express account and a hosted onboarding link", async () => {
      const newSeller = await createMember("pay_onboard");
      try {
        const row = await ensureConnectedAccount(deps, { id: newSeller.id, email: newSeller.email });
        expect(row.stripe_connected_account_id).toMatch(/^acct_/);
        // A second call reuses the stored account.
        expect((await ensureConnectedAccount(deps, { id: newSeller.id, email: newSeller.email })).stripe_connected_account_id).toBe(row.stripe_connected_account_id);
        const url = await createOnboardingLink(deps, row.stripe_connected_account_id);
        expect(url).toMatch(/^https:\/\//);
        const status = await syncConnectedAccount(deps, row.stripe_connected_account_id);
        expect(["in_progress", "complete", "restricted"]).toContain(status.onboarding_status);
      } finally {
        await cleanupUsers([newSeller.id]);
      }
    });
  });

  describe("completion and refunds", () => {
    it("creates the transfer from the charge once the window has passed, and is safe to rerun", async () => {
      const listing = await liveListing(seller);
      const o = await insertOrder(buyer, seller, listing, { status: "delivered", paymentIntent: `pi_${randomUUID().slice(0, 8)}`, charge: "ch_1PgafyB7WZ01zgkW" });
      await service().from("orders").update({ delivered_at: new Date(Date.now() - 3 * 86400000).toISOString() }).eq("id", o.id);
      const result = await completeOrder(deps, o.id);
      expect(result.outcome).toBe("completed");
      expect(result.transferId).toMatch(/^tr_/);
      const row = await order(o.id);
      expect(row).toMatchObject({ order_status: "completed", stripe_transfer_id: result.transferId, transfer_amount_cents: 20460 });
      const { data: ph } = await service().from("price_history").select("sold_price_cents, verified_transaction").eq("transaction_id", o.id).single();
      expect(ph).toEqual({ sold_price_cents: 22000, verified_transaction: true });
      expect(sent.filter((m) => m.email.template === "review_request").length).toBeGreaterThanOrEqual(2);
      expect((await completeOrder(deps, o.id)).outcome).toBe("already_completed");
    });

    it("doesn't pay the seller before the window passes", async () => {
      const listing = await liveListing(seller);
      const o = await insertOrder(buyer, seller, listing, { status: "delivered", paymentIntent: `pi_${randomUUID().slice(0, 8)}`, charge: "ch_x" });
      await service().from("orders").update({ delivered_at: new Date().toISOString() }).eq("id", o.id);
      expect((await completeOrder(deps, o.id)).outcome).toBe("not_ready");
      expect((await order(o.id)).stripe_transfer_id).toBeNull();
    });

    it("refunds before the transfer without any confirmation", async () => {
      const listing = await liveListing(seller);
      const o = await insertOrder(buyer, seller, listing, { status: "paid", paymentIntent: `pi_${randomUUID().slice(0, 8)}` });
      const r = await refundOrder(deps, {
        actorId: staffSupport.id,
        actorIsAdmin: false,
        orderId: o.id,
        amountCents: o.total_amount_cents,
        reason: "Seller can't ship",
        reverseTransfer: false,
        confirmation: "",
        nonce: randomUUID(),
      });
      expect(r.refundId).toMatch(/^re_/);
      expect(r.reversalId).toBeNull();
      expect((await order(o.id)).order_status).toBe("refunded");
      expect(sent.some((m) => m.email.template === "refund_issued" && m.to === buyer.email)).toBe(true);
      const { data: audit } = await service().from("audit_logs").select("actor_user_id").eq("entity_id", o.id).eq("action", "order.refunded");
      expect(audit).toEqual([{ actor_user_id: staffSupport.id }]);
    });

    it("after the transfer, needs the typed order number, and only an admin can reverse the transfer", async () => {
      const listing = await liveListing(seller);
      const o = await insertOrder(buyer, seller, listing, { status: "paid", paymentIntent: `pi_${randomUUID().slice(0, 8)}` });
      await service().from("orders").update({ order_status: "completed", stripe_transfer_id: "tr_1PgafyB7WZ01zgkW", transfer_amount_cents: 20460 }).eq("id", o.id);
      const base = { orderId: o.id, amountCents: 5000, reason: "Not as described", nonce: randomUUID() };
      await expect(refundOrder(deps, { ...base, actorId: staffAdmin.id, actorIsAdmin: true, reverseTransfer: true, confirmation: "" })).rejects.toThrow(/Type the order number/);
      await expect(
        refundOrder(deps, { ...base, actorId: staffSupport.id, actorIsAdmin: false, reverseTransfer: true, confirmation: o.order_number })
      ).rejects.toThrow(/Only an admin/);
      await expect(refundOrder(deps, { ...base, actorId: staffAdmin.id, actorIsAdmin: true, reverseTransfer: false, confirmation: "", amountCents: 999999 })).rejects.toThrow(
        /can still be refunded/
      );
      const r = await refundOrder(deps, { ...base, actorId: staffAdmin.id, actorIsAdmin: true, reverseTransfer: true, confirmation: o.order_number });
      expect(r.reversalId).toMatch(/^trr_/);
      expect(r.reversalCents).toBe(5000);
      expect(await order(o.id)).toMatchObject({ refunded_amount_cents: 5000, transfer_reversed_cents: 5000, order_status: "completed" });
    });
  });

  describe("expiry sweep", () => {
    it("expires the Stripe session first, then releases the hold", async () => {
      const listing = await liveListing(seller);
      const o = await insertOrder(buyer, seller, listing);
      await service().from("orders").update({ stripe_checkout_session_id: `cs_test_${randomUUID().slice(0, 8)}` }).eq("id", o.id);
      const row = await order(o.id);
      expect(await closeUnpaidCheckout(deps, row, "Checkout expired")).toBe("released");
      expect((await order(o.id)).order_status).toBe("cancelled");
      const { data: items } = await service().from("order_items").select("holds_listing").eq("order_id", o.id);
      expect(items).toEqual([{ holds_listing: false }]);
    });
  });

  describe("shipping", () => {
    it("buys one test label on the platform account and updates the order from a tracking webhook", async () => {
      const listing = await liveListing(seller);
      const o = await insertOrder(buyer, seller, listing, { status: "paid", paymentIntent: `pi_${randomUUID().slice(0, 8)}` });
      const from = { name: "Sam Seller", street1: "5 Oak St", city: "Nashville", state: "TN", zip: "37201", country: "US" as const };
      const label = await buyLabel(deps, { sellerId: seller.id, orderId: o.id, from });
      expect(label.isTest).toBe(true);
      expect(label.buyerPaidCents).toBe(1899);
      expect((await order(o.id)).order_status).toBe("processing");
      await expect(buyLabel(deps, { sellerId: seller.id, orderId: o.id, from })).rejects.toThrow(/only be bought for a paid order|already been bought/);
      await expect(buyLabel(deps, { sellerId: buyer.id, orderId: o.id, from })).rejects.toThrow(/not found/);

      const payload = JSON.stringify({
        event: "track_updated",
        test: true,
        data: {
          carrier: "usps",
          tracking_number: label.trackingNumber,
          tracking_status: { status: "DELIVERED", status_details: "Delivered", status_date: new Date().toISOString(), object_id: `ev_${randomUUID().slice(0, 8)}` },
          tracking_history: [{ status: "TRANSIT", status_details: "Accepted", status_date: new Date(Date.now() - 86400000).toISOString(), object_id: `ev_${randomUUID().slice(0, 8)}` }],
        },
      });
      const r = await processShippoWebhook(deps, payload);
      expect(r.body).toMatchObject({ received: true, changed: 2, delivered: true });
      expect((await order(o.id)).order_status).toBe("delivered");
      expect((await processShippoWebhook(deps, payload)).body).toMatchObject({ changed: 0 });
      expect(sent.some((m) => m.email.template === "delivered" && m.to === buyer.email)).toBe(true);
    });
  });
});
