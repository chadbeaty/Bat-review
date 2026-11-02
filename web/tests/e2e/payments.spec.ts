// Track D end to end: checkout (address, live rates, review, redirect to Stripe Checkout), the signed Stripe
// webhook that marks the order paid, a second buyer being blocked, the seller buying a (fake) label, a signed
// tracking webhook, the completion job paying the seller, an admin refund, and the "Checkout opens soon" state.
//
// Needs the local Supabase stack, stripe-mock on :12111 and a production build whose .env.local points Stripe
// at stripe-mock (see docs/tracks/payments.md). The Stripe Checkout page itself is never loaded: the test
// intercepts the redirect to checkout.stripe.com and asserts the target. Everything created here is deleted.
//
// checkout_enabled is a shared site setting. The test switches it on only for the checkout steps and puts the
// previous value back straight after, so other test runs on the same database see the default.

import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import Stripe from "stripe";
import { signIn } from "./helpers";
import {
  WEBHOOK_SECRET,
  cleanupUsers,
  createMember,
  env,
  insertOrder,
  liveListing,
  makeSellerReady,
  service,
  stripeMockUp,
  supabaseUp,
  type Member,
} from "../integration/helpers";

const CRON_SECRET = env.CRON_SECRET || "cron_test_trackd_local_secret";
const SHIPPO_TOKEN = env.SHIPPO_WEBHOOK_SECRET || "shippo_test_trackd_local_token";
const stripe = new Stripe("sk_test_123");

// RFC 6238 TOTP so the test can act as the admin's authenticator app.
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret: string): string {
  while (Date.now() % 30_000 > 27_000) {
    // wait out the end of a time step
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function setCheckout(on: boolean) {
  const { error } = await service().from("site_settings").update({ value: on }).eq("key", "checkout_enabled");
  if (error) throw error;
}

test.describe("payments and shipping", () => {
  test.describe.configure({ mode: "serial" });

  let ready = false;
  let seller: Member;
  let buyer: Member;
  let buyer2: Member;
  let admin: Member;
  let listingId = "";
  let orderId = "";
  let previousCheckout: unknown = false;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ready = (await supabaseUp()) && (await stripeMockUp());
    if (!ready) return;
    const { data } = await service().from("site_settings").select("value").eq("key", "checkout_enabled").single();
    previousCheckout = data?.value ?? false;
    [seller, buyer, buyer2, admin] = await Promise.all([createMember("e2e_seller"), createMember("e2e_buyer"), createMember("e2e_buyer2"), createMember("e2e_admin")]);
    await makeSellerReady(seller.id);
    await service().from("user_roles").insert({ user_id: admin.id, role: "admin" });
    listingId = await liveListing(seller);
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    if (!ready) return;
    await setCheckout(previousCheckout === true);
    await context?.close();
    await cleanupUsers([seller?.id, buyer?.id, buyer2?.id, admin?.id]);
  });

  test.beforeEach(() => {
    test.skip(!ready, "Needs the local Supabase stack and stripe-mock");
  });

  test("with checkout switched off, buyers see 'Checkout opens soon'", async () => {
    await setCheckout(false);
    await signIn(page, buyer, `/listings/${listingId}`);
    const actions = page.getByTestId("listing-actions");
    await expect(actions.getByRole("button", { name: /Buy now/ })).toBeDisabled();
    await expect(actions.getByText("Checkout opens soon")).toBeVisible();
    await page.goto(`/checkout/${listingId}`);
    await expect(page.getByRole("heading", { name: "Checkout opens soon" })).toBeVisible();
  });

  test("buyer goes through address, rates and review, and is sent to Stripe Checkout", async () => {
    await setCheckout(true);
    try {
      await page.goto(`/listings/${listingId}`);
      await page.getByRole("link", { name: /Buy now/ }).click();
      await expect(page).toHaveURL(new RegExp(`/checkout/${listingId}$`));
      await expect(page.getByTestId("test-mode")).toBeVisible();

      // Validation, then a good address.
      await page.getByRole("button", { name: "Get shipping rates" }).click();
      await expect(page.locator("main [role=alert]")).toContainText("full name");
      await page.getByLabel("Full name").fill("Pat Buyer");
      await page.getByLabel("Street address").fill("1 Main St");
      await page.getByLabel("City").fill("Austin");
      await page.getByLabel("State").selectOption("TX");
      await page.getByLabel("ZIP code").fill("78701");
      await page.getByRole("button", { name: "Get shipping rates" }).click();

      await expect(page.getByTestId("chosen-address")).toContainText("Austin, TX 78701");
      await expect(page.getByTestId("test-rates")).toContainText("Test data — not a real label");
      await expect(page.getByText(/billed as \d+ lb/).first()).toBeVisible();
      await page.getByRole("button", { name: "Review order" }).click();

      const review = page.getByTestId("review");
      await expect(review.getByText("Sales tax not collected")).toBeVisible();
      await expect(review.getByTestId("damage-disclosure")).toBeVisible();
      await expect(review.getByTestId("checkout-total")).toContainText("$");

      let stripeUrl = "";
      await page.route("https://checkout.stripe.com/**", async (route) => {
        stripeUrl = route.request().url();
        await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Stripe Checkout (intercepted by the test)</h1>" });
      });
      await review.getByLabel(/read the seller/).check();
      await review.getByRole("button", { name: "Continue to secure payment" }).click();
      await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);
      expect(stripeUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);

      const { data: order } = await service()
        .from("orders")
        .select("id, order_status, stripe_checkout_session_id, total_amount_cents, order_items!inner(listing_id, holds_listing)")
        .eq("buyer_id", buyer.id)
        .eq("order_items.listing_id", listingId)
        .single();
      expect(order).toMatchObject({ order_status: "awaiting_payment", order_items: [{ holds_listing: true }] });
      expect(order!.stripe_checkout_session_id).toMatch(/^cs_/);
      orderId = order!.id;

      // Coming back to checkout shows the checkout in progress instead of a second order.
      await page.unroute("https://checkout.stripe.com/**");
      await page.goto(`/checkout/${listingId}`);
      await expect(page.getByRole("heading", { name: "You have a checkout in progress" })).toBeVisible();
    } finally {
      await setCheckout(false);
    }
  });

  test("a signed checkout.session.completed webhook marks the order paid; a second buyer can't check out", async ({ request }) => {
    const { data: o } = await service().from("orders").select("total_amount_cents, stripe_checkout_session_id").eq("id", orderId).single();
    const payload = JSON.stringify({
      id: `evt_${randomUUID().replace(/-/g, "")}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: {
        object: {
          id: o!.stripe_checkout_session_id,
          object: "checkout.session",
          status: "complete",
          payment_status: "paid",
          amount_total: o!.total_amount_cents,
          payment_intent: `pi_e2e_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
          client_reference_id: orderId,
          metadata: { order_id: orderId },
        },
      },
    });
    const post = (signature: string) =>
      request.post("/api/webhooks/stripe", { data: payload, headers: { "content-type": "application/json", "stripe-signature": signature } });

    const bad = await post(stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_not_the_secret" }));
    expect(bad.status()).toBe(400);
    const good = await post(stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }));
    expect(good.status()).toBe(200);
    expect(await good.json()).toMatchObject({ outcome: "paid" });
    const dup = await post(stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }));
    expect(await dup.json()).toMatchObject({ duplicate: true });

    const { data: paid } = await service().from("orders").select("order_status, paid_at").eq("id", orderId).single();
    expect(paid!.order_status).toBe("paid");
    const { data: listing } = await service().from("equipment_listings").select("listing_status").eq("id", listingId).single();
    expect(listing!.listing_status).toBe("reserved");

    await setCheckout(true);
    try {
      const ctx = await page.context().browser()!.newContext();
      const p2 = await ctx.newPage();
      await signIn(p2, buyer2, `/listings/${listingId}`);
      await expect(p2.getByTestId("listing-actions")).toContainText("reserved");
      await expect(p2.getByRole("link", { name: /Buy now/ })).toHaveCount(0);
      await p2.goto(`/checkout/${listingId}`);
      await expect(p2.getByTestId("checkout-blocked")).toContainText("reserved for another buyer");
      await ctx.close();
    } finally {
      await setCheckout(false);
    }

    await page.goto(`/account/purchases/${orderId}`);
    await expect(page.getByTestId("order-status")).toHaveText("Paid, waiting for the seller to ship");
  });

  test("the seller sees the ship-to address and buys one (test) label", async ({ browser, request }) => {
    const ctx = await browser.newContext();
    const sp = await ctx.newPage();
    await signIn(sp, seller, `/seller/orders/${orderId}`);
    await expect(sp.getByTestId("ship-to")).toContainText("1 Main St");
    // Return address first.
    await sp.getByLabel("Full name").fill("Sam Seller");
    await sp.getByLabel("Street address").fill("5 Oak St");
    await sp.getByLabel("City").fill("Nashville");
    await sp.getByLabel("State").selectOption("TN");
    await sp.getByLabel("ZIP code").fill("37201");
    await sp.getByRole("button", { name: "Save return address" }).click();
    await expect(sp.locator("main [role=status]")).toContainText("Return address saved");
    await sp.getByLabel(/package size and weight above are right/).check();
    await sp.getByRole("button", { name: "Buy shipping label" }).click();
    await expect(sp.locator("main [role=status]")).toContainText("Label bought");
    const label = sp.getByTestId("label");
    await expect(label).toContainText("Test data — not a real label");
    await expect(label).toContainText("You aren't charged for it");
    await expect(sp.getByRole("button", { name: "Buy shipping label" })).toHaveCount(0);

    const href = await label.getByRole("link", { name: "Download label (PDF)" }).getAttribute("href");
    const pdf = await sp.request.get(href!);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).toString("latin1")).toContain("TEST DATA - NOT A REAL LABEL");
    // Someone who isn't a party to the order can't download it.
    expect((await request.get(href!)).status()).toBe(404);
    await ctx.close();

    const { data: shipments } = await service().from("shipping_shipments").select("shipment_status, is_test").eq("order_id", orderId);
    expect(shipments).toEqual([{ shipment_status: "label_purchased", is_test: true }]);
  });

  test("a tracking webhook marks the order delivered", async ({ request }) => {
    const { data: s } = await service().from("shipping_shipments").select("tracking_number").eq("order_id", orderId).single();
    const payload = JSON.stringify({
      event: "track_updated",
      test: true,
      data: {
        carrier: "usps",
        tracking_number: s!.tracking_number,
        tracking_status: { status: "DELIVERED", status_details: "Delivered, front porch", status_date: new Date().toISOString(), location: { city: "Austin", state: "TX" }, object_id: `ev_${randomUUID().slice(0, 8)}` },
        tracking_history: [{ status: "TRANSIT", status_details: "Accepted at USPS facility", status_date: new Date(Date.now() - 86_400_000).toISOString(), object_id: `ev_${randomUUID().slice(0, 8)}` }],
      },
    });
    expect((await request.post("/api/webhooks/shippo?token=wrong", { data: payload, headers: { "content-type": "application/json" } })).status()).toBe(401);
    const res = await request.post(`/api/webhooks/shippo?token=${SHIPPO_TOKEN}`, { data: payload, headers: { "content-type": "application/json" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ delivered: true });

    await page.goto(`/account/purchases/${orderId}`);
    await expect(page.getByTestId("order-status")).toHaveText("Delivered");
    await expect(page.getByTestId("tracking-events")).toContainText("Delivered, front porch");
    await expect(page.getByRole("button", { name: "Confirm I received it" })).toBeVisible();
  });

  test("the completion job pays the seller after the inspection window and records the sale", async ({ request }) => {
    expect((await request.post("/api/cron/orders")).status()).toBe(401);
    expect((await request.get("/api/cron/orders", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
    // Not yet: delivered today.
    await request.get("/api/cron/orders", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect((await service().from("orders").select("order_status").eq("id", orderId).single()).data!.order_status).toBe("delivered");

    await service().from("orders").update({ delivered_at: new Date(Date.now() - 3 * 86_400_000).toISOString() }).eq("id", orderId);
    const res = await request.get("/api/cron/orders", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(res.status()).toBe(200);
    const summary = await res.json();
    expect(summary.completed).toEqual(expect.arrayContaining([expect.objectContaining({ orderId, outcome: "completed" })]));

    const { data: o } = await service().from("orders").select("order_status, stripe_transfer_id, transfer_amount_cents").eq("id", orderId).single();
    expect(o!.order_status).toBe("completed");
    expect(o!.stripe_transfer_id).toMatch(/^tr_/);
    expect(o!.transfer_amount_cents).toBe(20460);
    const { data: l } = await service().from("equipment_listings").select("listing_status").eq("id", listingId).single();
    expect(l!.listing_status).toBe("sold");
    const { data: ph } = await service().from("price_history").select("sold_price_cents, verified_transaction, sale_date").eq("transaction_id", orderId).single();
    expect(ph).toMatchObject({ sold_price_cents: 22000, verified_transaction: true });

    // Running it again changes nothing.
    const again = await (await request.get("/api/cron/orders", { headers: { authorization: `Bearer ${CRON_SECRET}` } })).json();
    expect(again.completed.find((c: { orderId: string }) => c.orderId === orderId)).toBeUndefined();

    const ctx = await page.context().browser()!.newContext();
    const sp = await ctx.newPage();
    await signIn(sp, seller, "/seller/payouts");
    await expect(sp.getByTestId("payout-account")).toContainText("Ready");
    await expect(sp.getByTestId("order-payout").first()).toContainText("$204.60");
    await ctx.close();
  });

  test("an admin refunds another order through Stripe", async ({ browser }) => {
    test.setTimeout(90_000);
    const otherListing = await liveListing(seller);
    const other = await insertOrder(buyer, seller, otherListing, { status: "paid", paymentIntent: `pi_e2e_${randomUUID().slice(0, 8)}` });

    const ctx = await browser.newContext();
    const ap = await ctx.newPage();
    await signIn(ap, admin, "/admin/refunds");
    await expect(ap).toHaveURL(/\/account\/security\?required=admin/);
    await ap.getByRole("button", { name: "Set up an authenticator app" }).click();
    const secret = (await ap.getByTestId("mfa-secret").textContent())!.trim();
    await ap.getByLabel("6-digit code").fill(totp(secret));
    await ap.getByRole("button", { name: "Confirm and turn on" }).click();
    await expect(ap).not.toHaveURL(/\/account\/security/);

    await ap.goto(`/admin/refunds?order=${other.id}`);
    const panel = ap.getByTestId("refund-order");
    await expect(panel).toContainText(other.order_number);
    await panel.getByLabel("Amount (USD)").fill("25.00");
    await panel.getByLabel(/Reason/).fill("Scuff the seller didn't disclose");
    await panel.getByRole("button", { name: "Refund through Stripe" }).click();
    await expect(ap.locator("main [role=status]")).toContainText("Refunded $25");
    await ctx.close();

    const { data: o } = await service().from("orders").select("order_status, refunded_amount_cents").eq("id", other.id).single();
    expect(o).toEqual({ order_status: "paid", refunded_amount_cents: 2500 });
    const { data: audit } = await service().from("audit_logs").select("actor_user_id, metadata").eq("entity_id", other.id).eq("action", "order.refunded").single();
    expect(audit!.actor_user_id).toBe(admin.id);
  });
});
