// Database tests for the payments and shipping migration: the atomic checkout hold, payment confirmation,
// tracking events, completion with price history, refunds, chargebacks, and RLS on the new tables.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const suite = available ? describe : describe.skip;

type Order = {
  id: string;
  order_status: string;
  subtotal_cents: number;
  shipping_cost_cents: number;
  tax_amount_cents: number;
  total_amount_cents: number;
  platform_fee_cents: number;
  seller_payout_cents: number;
  fee_snapshot: Record<string, unknown>;
  checkout_expires_at: string;
};

suite("payments and shipping database", () => {
  const db = new TestDb();
  let seller: { id: string };
  let buyer: { id: string };
  let buyer2: { id: string };
  let support: { id: string };
  let admin: { id: string };
  let batsCategory: string;
  let productId: string;

  const RATES = JSON.stringify([
    { id: "fake_usps_ground_advantage", carrier: "USPS", service: "Ground Advantage", serviceToken: "usps_ground_advantage", amountCents: 1899, available: true },
    { id: "fake_usps_priority", carrier: "USPS", service: "Priority Mail", serviceToken: "usps_priority", amountCents: 0, available: false, unavailableReason: "too big" },
  ]);

  const liveListing = async (owner = seller, price = 22000) => {
    const [row] = await db.as<{ id: string }>(
      owner,
      `insert into equipment_listings (seller_id, category_id, product_id, title, asking_price_cents, condition_score, structural_disclosure,
        has_cracks, has_rattle, has_loose_end_cap, has_repairs, has_alterations, has_significant_damage,
        authenticity_declaration, ownership_declaration, shipping_weight_oz, package_length_inches, package_width_inches,
        package_height_inches, shipping_origin_postal_code, attributes)
       values ($1, $2, $3, 'Payments test bat 26 oz', $4, 8, 'no_known_damage', false, false, false, false, false, false,
        true, true, 48, 38, 5, 5, '37201', '{"weight_oz": 26, "certification": ["USSSA"], "model_year": 2026}') returning id`,
      [owner.id, batsCategory, productId, price]
    );
    await db.as(owner, "insert into listing_images (listing_id, image_url, image_type) values ($1, 'https://img.test/1.jpg', 'full')", [row.id]);
    await db.as(owner, "update equipment_listings set listing_status = 'active' where id = $1", [row.id]);
    return row.id;
  };

  const address = async (user: { id: string }) => {
    const [a] = await db.as<{ id: string }>(
      user,
      "insert into addresses (user_id, full_name, street_address, city, state, postal_code) values ($1, 'Pat Buyer', '1 Main St', 'Austin', 'TX', '78701') returning id",
      [user.id]
    );
    return a.id;
  };

  const quote = async (user: { id: string }, listing: string, addr: string, expiresIn = "30 minutes") => {
    const [q] = await db.as<{ id: string }>(
      "service",
      `insert into shipping_quotes (buyer_id, listing_id, address_id, provider, is_test, package, rates, expires_at)
       values ($1, $2, $3, 'fake', true, '{"weightOz":48}', $4::jsonb, now() + $5::interval) returning id`,
      [user.id, listing, addr, RATES, expiresIn]
    );
    return q.id;
  };

  const createOrder = async (user: { id: string }, listing: string, opts: { rate?: string; tax?: number; addr?: string; quoteId?: string } = {}) => {
    const addr = opts.addr ?? (await address(user));
    const q = opts.quoteId ?? (await quote(user, listing, addr));
    const [o] = await db.as<Order>("service", "select * from checkout_create_order($1, $2, $3, $4, $5, $6, null, 35)", [
      user.id,
      listing,
      addr,
      q,
      opts.rate ?? "fake_usps_ground_advantage",
      opts.tax ?? 0,
    ]);
    return o;
  };

  const paidOrder = async (listing?: string) => {
    const l = listing ?? (await liveListing());
    const o = await createOrder(buyer, l);
    const [{ payments_mark_paid: r }] = await db.as<{ payments_mark_paid: string }>("service", "select payments_mark_paid($1, $4, $2, 'ch_1', $3)", [
      o.id,
      `pi_${o.id.slice(0, 8)}`,
      o.total_amount_cents,
      `cs_${o.id}`,
    ]);
    expect(r).toBe("paid");
    return { order: o, listing: l };
  };

  const listingStatus = async (id: string) => (await db.owner<{ listing_status: string }>("select listing_status from equipment_listings where id = $1", [id]))[0].listing_status;
  const orderRow = async (id: string) => (await db.owner<Record<string, unknown>>("select * from orders where id = $1", [id]))[0];

  beforeAll(async () => {
    await db.setup();
    seller = await db.createUser();
    buyer = await db.createUser();
    buyer2 = await db.createUser();
    support = await db.createUser();
    admin = await db.createUser();
    await db.owner("insert into user_roles (user_id, role) values ($1, 'support'), ($2, 'admin')", [support.id, admin.id]);
    [{ id: batsCategory }] = await db.owner<{ id: string }>("select id from product_categories where slug = 'bats'");
    [{ id: productId }] = await db.owner<{ id: string }>("select id from products where category_id = $1 limit 1", [batsCategory]);
    await db.owner(
      "insert into seller_payment_accounts (seller_id, stripe_connected_account_id, onboarding_status, payouts_enabled) values ($1, 'acct_test_seller', 'complete', true)",
      [seller.id]
    );
    await db.owner("update site_settings set value = 'true' where key = 'checkout_enabled'");
  });

  afterAll(async () => {
    await db.teardown();
  });

  describe("settings and fees", () => {
    it("adds the payment settings with safe defaults and type checks", async () => {
      const rows = await db.owner<{ key: string; value: unknown }>("select key, value from site_settings where key in ('tax_collection_enabled', 'inspection_window_days')");
      expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual({ tax_collection_enabled: false, inspection_window_days: 2 });
      await expect(db.owner("update site_settings set value = '\"yes\"' where key = 'checkout_enabled'")).rejects.toThrow(/true or false/);
      await expect(db.owner("update site_settings set value = '0' where key = 'inspection_window_days'")).rejects.toThrow(/1 to 30/);
      const [fee] = await db.owner<{ fee_value: string }>("select fee_value from current_fee('seller_processing_passthrough_percent')");
      expect(Number(fee.fee_value)).toBe(0);
    });
  });

  describe("checkout order function", () => {
    it("creates the order and holds the listing atomically, with totals and a fee snapshot", async () => {
      const listing = await liveListing();
      const o = await createOrder(buyer, listing, { tax: 0 });
      expect(o.order_status).toBe("awaiting_payment");
      expect(o.subtotal_cents).toBe(22000);
      expect(o.shipping_cost_cents).toBe(1899);
      expect(o.total_amount_cents).toBe(23899);
      expect(o.platform_fee_cents).toBe(1540);
      expect(o.seller_payout_cents).toBe(20460);
      expect(o.fee_snapshot).toMatchObject({ commission_cents: 1540, passthrough_cents: 0, passthrough_base: "order_total" });
      expect(new Date(o.checkout_expires_at).getTime()).toBeGreaterThan(Date.now() + 30 * 60 * 1000);
      const items = await db.owner<{ holds_listing: boolean; unit_price_cents: number }>("select holds_listing, unit_price_cents from order_items where order_id = $1", [o.id]);
      expect(items).toEqual([{ holds_listing: true, unit_price_cents: 22000 }]);
      // The listing stays visible as active until payment; the hold blocks other buyers.
      expect(await listingStatus(listing)).toBe("active");
    });

    it("applies the processing passthrough to the order total when set", async () => {
      await db.owner("insert into fee_configuration (fee_name, fee_type, fee_value, effective_from) values ('seller_processing_passthrough_percent', 'percentage', 2.9, now())");
      try {
        const listing = await liveListing(seller, 20000);
        const o = await createOrder(buyer, listing);
        // 2.9% of 218.99 = 6.35071 -> 635
        expect(o.fee_snapshot).toMatchObject({ passthrough_cents: 635 });
        expect(o.seller_payout_cents).toBe(20000 - 1400 - 635);
      } finally {
        await db.owner("update fee_configuration set active = false where fee_name = 'seller_processing_passthrough_percent' and fee_value = 2.9");
      }
    });

    it("blocks a second buyer while the first holds the listing", async () => {
      const listing = await liveListing();
      await createOrder(buyer, listing);
      await expect(createOrder(buyer2, listing)).rejects.toThrow(/Someone else is checking out/);
    });

    it("refuses the seller's own listing, inactive listings and unready sellers", async () => {
      const listing = await liveListing();
      const sellerAddr = await address(seller);
      const q = await quote(seller, listing, sellerAddr);
      await expect(createOrder(seller, listing, { addr: sellerAddr, quoteId: q })).rejects.toThrow(/your own listing/);

      const removed = await liveListing();
      await db.as(seller, "update equipment_listings set listing_status = 'removed' where id = $1", [removed]);
      await expect(createOrder(buyer, removed)).rejects.toThrow(/isn't for sale/);

      const other = await db.createUser();
      const otherListing = await liveListing(other);
      await expect(createOrder(buyer, otherListing)).rejects.toThrow(/hasn't finished setting up payouts/);
    });

    it("refuses expired quotes, unavailable rates, someone else's address and negative tax", async () => {
      const listing = await liveListing();
      const addr = await address(buyer);
      const old = await quote(buyer, listing, addr, "-1 minute");
      await expect(createOrder(buyer, listing, { addr, quoteId: old })).rejects.toThrow(/expired/);
      await expect(createOrder(buyer, listing, { rate: "fake_usps_priority" })).rejects.toThrow(/available shipping option/);
      await expect(createOrder(buyer, listing, { rate: "made_up" })).rejects.toThrow(/available shipping option/);
      const theirs = await address(buyer2);
      const q = await quote(buyer, listing, theirs);
      await expect(createOrder(buyer, listing, { addr: theirs, quoteId: q })).rejects.toThrow(/shipping address/);
      await expect(createOrder(buyer, listing, { tax: -5 })).rejects.toThrow(/Invalid tax/);
    });

    it("refuses everything while checkout is switched off", async () => {
      const listing = await liveListing();
      await db.owner("update site_settings set value = 'false' where key = 'checkout_enabled'");
      try {
        await expect(createOrder(buyer, listing)).rejects.toThrow(/not open yet/);
      } finally {
        await db.owner("update site_settings set value = 'true' where key = 'checkout_enabled'");
      }
    });

    it("releases the hold when the checkout expires, so another buyer can check out", async () => {
      const listing = await liveListing();
      const first = await createOrder(buyer, listing);
      const [{ checkout_release_order: released }] = await db.as<{ checkout_release_order: boolean }>("service", "select checkout_release_order($1, 'Checkout expired')", [first.id]);
      expect(released).toBe(true);
      expect((await orderRow(first.id)).order_status).toBe("cancelled");
      const [{ checkout_release_order: again }] = await db.as<{ checkout_release_order: boolean }>("service", "select checkout_release_order($1)", [first.id]);
      expect(again).toBe(false);
      const second = await createOrder(buyer2, listing);
      expect(second.order_status).toBe("awaiting_payment");
    });

    it("is server-only", async () => {
      const listing = await liveListing();
      for (const actor of ["anon" as const, buyer]) {
        await expect(db.as(actor, "select checkout_create_order($1, $2, $1, $1, 'x')", [buyer.id, listing])).rejects.toThrow(/permission denied/);
        await expect(db.as(actor, "select payments_mark_paid($1, 'x', 'x', 'x', 1)", [buyer.id])).rejects.toThrow(/permission denied/);
        await expect(db.as(actor, "select payments_complete_order($1, 'tr', 1)", [buyer.id])).rejects.toThrow(/permission denied/);
        await expect(db.as(actor, "select admin_payments_overview()")).rejects.toThrow(/permission denied/);
      }
      const [{ seller_can_accept_payments: ok }] = await db.as<{ seller_can_accept_payments: boolean }>("anon", "select seller_can_accept_payments($1)", [seller.id]);
      expect(ok).toBe(true);
    });
  });

  describe("payment confirmation", () => {
    it("marks the order paid, reserves the listing and notifies both parties, once", async () => {
      const { order, listing } = await paidOrder();
      const row = await orderRow(order.id);
      expect(row.order_status).toBe("paid");
      expect(row.paid_at).not.toBeNull();
      expect(await listingStatus(listing)).toBe("reserved");
      const notes = await db.owner<{ user_id: string }>("select user_id from notifications where related_entity_id = $1", [order.id]);
      expect(notes.map((n) => n.user_id).sort()).toEqual([buyer.id, seller.id].sort());
      const [{ payments_mark_paid: again }] = await db.as<{ payments_mark_paid: string }>("service", "select payments_mark_paid($1, 'cs_1', 'pi_x', 'ch_1', $2)", [
        order.id,
        order.total_amount_cents,
      ]);
      expect(again).toBe("already_paid");
      expect((await db.owner("select 1 from notifications where related_entity_id = $1", [order.id])).length).toBe(2);
    });

    it("refuses a payment that doesn't match the order total", async () => {
      const listing = await liveListing();
      const o = await createOrder(buyer, listing);
      const [{ payments_mark_paid: r }] = await db.as<{ payments_mark_paid: string }>("service", "select payments_mark_paid($1, null, 'pi_mm', null, 100)", [o.id]);
      expect(r).toBe("amount_mismatch");
      const row = await orderRow(o.id);
      expect(row.order_status).toBe("awaiting_payment");
      expect(row.payment_issue).toMatch(/does not match/);
    });

    it("accepts a late payment if the hold is still free, and asks for a refund if not", async () => {
      const listing = await liveListing();
      const late = await createOrder(buyer, listing);
      await db.as("service", "select checkout_release_order($1)", [late.id]);
      const [{ payments_mark_paid: ok }] = await db.as<{ payments_mark_paid: string }>("service", "select payments_mark_paid($1, null, 'pi_late1', null, $2)", [
        late.id,
        late.total_amount_cents,
      ]);
      expect(ok).toBe("paid");

      const listing2 = await liveListing();
      const lost = await createOrder(buyer, listing2);
      await db.as("service", "select checkout_release_order($1)", [lost.id]);
      await createOrder(buyer2, listing2);
      const [{ payments_mark_paid: r }] = await db.as<{ payments_mark_paid: string }>("service", "select payments_mark_paid($1, null, 'pi_late2', null, $2)", [
        lost.id,
        lost.total_amount_cents,
      ]);
      expect(r).toBe("needs_refund");
      expect((await orderRow(lost.id)).order_status).toBe("cancelled");
    });
  });

  describe("tracking, completion and price history", () => {
    it("records tracking once, moves the order forward and completes after the window", async () => {
      const { order, listing } = await paidOrder();
      const [s] = await db.as<{ id: string }>(
        "service",
        "insert into shipping_shipments (order_id, seller_id, buyer_id, shipment_status, tracking_number, is_test) values ($1, $2, $3, 'label_purchased', 'TEST123', true) returning id",
        [order.id, seller.id, buyer.id]
      );
      const record = async (id: string, status: string, at = new Date().toISOString()) =>
        (await db.as<{ r: Record<string, unknown> }>("service", "select shipping_record_event($1, $2, $3, 'desc', $4, 'Austin, TX') as r", [s.id, id, status, at]))[0].r;

      expect(await record("e1", "in_transit")).toMatchObject({ order_status: "shipped", order_changed: true });
      expect(await record("e1", "in_transit")).toEqual({ duplicate: true });
      expect((await orderRow(order.id)).order_status).toBe("shipped");
      const delivered = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(await record("e2", "delivered", delivered)).toMatchObject({ order_status: "delivered" });
      // An older scan arriving late doesn't move tracking backwards.
      expect(await record("e0", "pre_transit")).toMatchObject({ changed: false });
      expect((await db.owner<{ shipment_status: string }>("select shipment_status from shipping_shipments where id = $1", [s.id]))[0].shipment_status).toBe("delivered");

      const ready = await db.as<{ id: string }>("service", "select id from orders_ready_to_complete(50, $1)", [order.id]);
      expect(ready.map((r) => r.id)).toEqual([order.id]);
      const [{ payments_complete_order: done }] = await db.as<{ payments_complete_order: string }>("service", "select payments_complete_order($1, 'tr_1', 20460)", [order.id]);
      expect(done).toBe("completed");
      const row = await orderRow(order.id);
      expect(row).toMatchObject({ order_status: "completed", stripe_transfer_id: "tr_1", transfer_amount_cents: 20460 });
      expect(await listingStatus(listing)).toBe("sold");
      const [ph] = await db.as<Record<string, unknown>>("anon", "select * from price_history where transaction_id = $1", [order.id]);
      expect(ph).toMatchObject({ product_id: productId, sold_price_cents: 22000, condition_score: 8, model_year: 2026, verified_transaction: true, data_source: "marketplace" });
      expect(Number(ph.weight_oz)).toBe(26);
      expect(ph.certification).toEqual(["USSSA"]);
      const [{ payments_complete_order: again }] = await db.as<{ payments_complete_order: string }>("service", "select payments_complete_order($1, 'tr_1', 20460)", [order.id]);
      expect(again).toBe("already_completed");
    });

    it("waits for the inspection window, and an open dispute holds the payout", async () => {
      const { order } = await paidOrder();
      await db.owner("update orders set order_status = 'delivered', delivered_at = now() - interval '1 day' where id = $1", [order.id]);
      expect(await db.as("service", "select id from orders_ready_to_complete(50, $1)", [order.id])).toHaveLength(0);
      const [{ payments_complete_order: early }] = await db.as<{ payments_complete_order: string }>("service", "select payments_complete_order($1, null, 0)", [order.id]);
      expect(early).toBe("transfer_recorded_not_ready");

      await db.owner("update orders set delivered_at = now() - interval '3 days' where id = $1", [order.id]);
      await db.as(buyer, "insert into disputes (order_id, opened_by, dispute_type, description) values ($1, $2, 'not_as_described', 'The barrel has a crack.')", [
        order.id,
        buyer.id,
      ]);
      expect(await db.as("service", "select id from orders_ready_to_complete(50, $1)", [order.id])).toHaveLength(0);
    });

    it("lets the buyer confirm receipt to complete early", async () => {
      const { order } = await paidOrder();
      await expect(db.as("service", "select orders_buyer_confirm_received($1, $2)", [buyer.id, order.id])).rejects.toThrow(/once the order has shipped/);
      await db.owner("update orders set order_status = 'shipped', shipped_at = now() where id = $1", [order.id]);
      await expect(db.as("service", "select orders_buyer_confirm_received($1, $2)", [buyer2.id, order.id])).rejects.toThrow(/not found/);
      await db.as("service", "select orders_buyer_confirm_received($1, $2)", [buyer.id, order.id]);
      expect(await db.as("service", "select id from orders_ready_to_complete(50, $1)", [order.id])).toHaveLength(1);
    });
  });

  describe("refunds and chargebacks", () => {
    it("records a staff refund with an audit entry and releases an unshipped listing on a full refund", async () => {
      const { order, listing } = await paidOrder();
      const [{ admin_record_refund: partial }] = await db.as<{ admin_record_refund: string }>(
        "service",
        "select admin_record_refund($1, $2, 1000, 'Scuff not disclosed', 're_1')",
        [support.id, order.id]
      );
      expect(partial).toBe("partially_refunded");
      const [{ admin_record_refund: dup }] = await db.as<{ admin_record_refund: string }>("service", "select admin_record_refund($1, $2, 1000, 'Again', 're_1')", [
        support.id,
        order.id,
      ]);
      expect(dup).toBe("already_recorded");
      const [{ admin_record_refund: full }] = await db.as<{ admin_record_refund: string }>(
        "service",
        "select admin_record_refund($1, $2, $3, 'Seller cancelled', 're_2')",
        [support.id, order.id, order.total_amount_cents - 1000]
      );
      expect(full).toBe("refunded");
      expect(await orderRow(order.id)).toMatchObject({ order_status: "refunded", refunded_amount_cents: order.total_amount_cents });
      expect(await listingStatus(listing)).toBe("active");
      const audit = await db.owner<{ actor_user_id: string; action: string }>("select actor_user_id, action from audit_logs where entity_id = $1", [order.id]);
      expect(audit.filter((a) => a.action === "order.refunded").map((a) => a.actor_user_id)).toEqual([support.id, support.id]);
    });

    it("lets only admins record a transfer reversal and checks amounts", async () => {
      const { order } = await paidOrder();
      await expect(db.as("service", "select admin_record_refund($1, $2, 100, 'reason', 're_x', 'trr_1', 100)", [support.id, order.id])).rejects.toThrow(/Only an admin/);
      await expect(db.as("service", "select admin_record_refund($1, $2, 100, 'reason', 're_y')", [buyer.id, order.id])).rejects.toThrow(/Not allowed/);
      await expect(db.as("service", "select admin_record_refund($1, $2, 99999999, 'reason', 're_z')", [support.id, order.id])).rejects.toThrow(/Invalid refund amount/);
      await db.as("service", "select admin_record_refund($1, $2, 500, 'Partial after payout', 're_adm', 'trr_1', 500)", [admin.id, order.id]);
      expect((await orderRow(order.id)).transfer_reversed_cents).toBe(500);
    });

    it("never lowers the refunded total from a webhook", async () => {
      const { order } = await paidOrder();
      await db.as("service", "select payments_apply_refund_total($1, 3000)", [order.id]);
      await db.as("service", "select payments_apply_refund_total($1, 1000)", [order.id]);
      expect((await orderRow(order.id)).refunded_amount_cents).toBe(3000);
    });

    it("opens a chargeback dispute, holds the order and restores it when won", async () => {
      const { order } = await paidOrder();
      const [{ payments_record_chargeback: opened }] = await db.as<{ payments_record_chargeback: string }>(
        "service",
        "select payments_record_chargeback($1, 'dp_1', 'fraudulent', 'needs_response')",
        [order.id]
      );
      expect(opened).toBe("under_review");
      expect(await orderRow(order.id)).toMatchObject({ order_status: "disputed", status_before_dispute: "paid" });
      await db.as("service", "select payments_record_chargeback($1, 'dp_1', 'fraudulent', 'needs_response')", [order.id]);
      expect(await db.owner("select 1 from disputes where stripe_dispute_id = 'dp_1'")).toHaveLength(1);
      await db.as("service", "select payments_record_chargeback($1, 'dp_1', 'fraudulent', 'won')", [order.id]);
      expect((await orderRow(order.id)).order_status).toBe("paid");
      const [d] = await db.owner<{ status: string; opened_by: string }>("select status, opened_by from disputes where stripe_dispute_id = 'dp_1'");
      expect(d).toEqual({ status: "resolved_seller", opened_by: buyer.id });
    });
  });

  describe("row level security on new tables", () => {
    it("shows shipping quotes only to their buyer and blocks browser writes", async () => {
      const listing = await liveListing();
      const addr = await address(buyer);
      const q = await quote(buyer, listing, addr);
      expect(await db.as(buyer, "select id from shipping_quotes where id = $1", [q])).toHaveLength(1);
      expect(await db.as(buyer2, "select id from shipping_quotes where id = $1", [q])).toHaveLength(0);
      expect(await db.as("anon", "select id from shipping_quotes where id = $1", [q])).toHaveLength(0);
      await expect(
        db.as(buyer, "insert into shipping_quotes (buyer_id, listing_id, address_id, provider, package, rates) values ($1, $2, $3, 'fake', '{}', '[]')", [buyer.id, listing, addr])
      ).rejects.toThrow(/permission denied|row-level security/);
      await expect(db.as(buyer, "update shipping_quotes set rates = '[]' where id = $1", [q])).rejects.toThrow(/permission denied/);
    });

    it("shows refunds to the order's parties and support only", async () => {
      const { order } = await paidOrder();
      await db.as("service", "select admin_record_refund($1, $2, 100, 'Small refund', 're_rls')", [support.id, order.id]);
      expect(await db.as(buyer, "select id from payment_refunds where order_id = $1", [order.id])).toHaveLength(1);
      expect(await db.as(seller, "select id from payment_refunds where order_id = $1", [order.id])).toHaveLength(1);
      expect(await db.as(support, "select id from payment_refunds where order_id = $1", [order.id])).toHaveLength(1);
      expect(await db.as(buyer2, "select id from payment_refunds where order_id = $1", [order.id])).toHaveLength(0);
      await expect(db.as(buyer, "insert into payment_refunds (order_id, stripe_refund_id, amount_cents, reason) values ($1, 're_fake', 1, 'xyz')", [order.id])).rejects.toThrow(
        /permission denied/
      );
    });

    it("shows seller payouts only to that seller and support", async () => {
      await db.as("service", "insert into seller_payouts (seller_id, stripe_account_id, stripe_payout_id, amount_cents, status) values ($1, 'acct_test_seller', 'po_1', 5000, 'paid')", [
        seller.id,
      ]);
      expect(await db.as(seller, "select id from seller_payouts")).toHaveLength(1);
      expect(await db.as(buyer, "select id from seller_payouts")).toHaveLength(0);
      expect(await db.as(support, "select id from seller_payouts")).toHaveLength(1);
      await expect(db.as(seller, "update seller_payouts set status = 'failed'")).rejects.toThrow(/permission denied/);
    });

    it("lets the seller see the ship-to address only once the order is paid", async () => {
      const listing = await liveListing();
      const o = await createOrder(buyer, listing);
      const addr = (await orderRow(o.id)).shipping_address_id as string;
      expect(await db.as(seller, "select id from addresses where id = $1", [addr])).toHaveLength(0);
      await db.as("service", "select payments_mark_paid($1, null, 'pi_rls', null, $2)", [o.id, o.total_amount_cents]);
      expect(await db.as(seller, "select id from addresses where id = $1", [addr])).toHaveLength(1);
      expect(await db.as(buyer2, "select id from addresses where id = $1", [addr])).toHaveLength(0);
    });
  });
  describe("accepted offers at checkout", () => {
    // A real offer: the buyer makes it, the seller accepts it through respond_to_offer (which sets the payment window).
    const acceptedOffer = async (who: { id: string }, listing: string, amount = 18000) => {
      const [o] = await db.as<{ id: string }>(
        who,
        "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, $4) returning id",
        [listing, who.id, seller.id, amount]
      );
      await db.as("service", "select respond_to_offer($1, $2, 'accept', null, null)", [seller.id, o.id]);
      return o.id;
    };

    const orderWithOffer = async (who: { id: string }, listing: string, offerId: string | null) => {
      const addr = await address(who);
      const q = await quote(who, listing, addr);
      const [o] = await db.as<Order & { offer_id: string | null }>(
        "service",
        "select * from checkout_create_order($1, $2, $3, $4, 'fake_usps_ground_advantage', 0, null, 35, $5)",
        [who.id, listing, addr, q, offerId]
      );
      return o;
    };

    const reservation = (actor: Parameters<typeof db.as>[0], listing: string) =>
      db.as<{ reserved: boolean; held_by_me: boolean; reserved_until: string; offer_id: string | null }>(actor, "select * from listing_offer_reservation($1)", [listing]);

    it("charges the offer amount instead of the list price, with fees computed on it", async () => {
      const listing = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing, 18000);
      const o = await orderWithOffer(buyer, listing, offerId);
      expect(o.subtotal_cents).toBe(18000);
      expect(o.total_amount_cents).toBe(18000 + 1899);
      expect(o.platform_fee_cents).toBe(1260); // 7% of 18000, not of 22000
      expect(o.seller_payout_cents).toBe(18000 - 1260);
      expect(o.fee_snapshot).toMatchObject({ commission_cents: 1260, list_price_cents: 22000, offer_id: offerId });
      expect(await orderRow(o.id)).toMatchObject({ offer_id: offerId });
      const items = await db.owner<{ unit_price_cents: number }>("select unit_price_cents from order_items where order_id = $1", [o.id]);
      expect(items).toEqual([{ unit_price_cents: 18000 }]);
    });

    it("uses the offer up once the order is paid", async () => {
      const listing = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing, 17000);
      const o = await orderWithOffer(buyer, listing, offerId);
      await db.as("service", "select payments_mark_paid($1, null, 'pi_offer', null, $2)", [o.id, o.total_amount_cents]);
      const [offer] = await db.owner<{ status: string }>("select status from offers where id = $1", [offerId]);
      expect(offer.status).toBe("completed");
    });

    it("rejects a buyer who is not the offer's buyer, and an offer for another listing", async () => {
      const listing = await liveListing(seller, 22000);
      const other = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing);
      await expect(orderWithOffer(buyer2, listing, offerId)).rejects.toThrow(/reserved for another buyer/);
      await expect(orderWithOffer(buyer2, other, offerId)).rejects.toThrow(/Offer not found/);
      await expect(orderWithOffer(buyer, other, offerId)).rejects.toThrow(/Offer not found/);
      expect(await db.owner("select 1 from orders where offer_id = $1", [offerId])).toHaveLength(0);
    });

    it("rejects an offer that is not accepted", async () => {
      const listing = await liveListing(seller, 22000);
      const [pending] = await db.as<{ id: string }>(
        buyer,
        "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, 15000) returning id",
        [listing, buyer.id, seller.id]
      );
      await expect(orderWithOffer(buyer, listing, pending.id)).rejects.toThrow(/offer is pending/);
    });

    it("rejects an offer past its payment window, before and after the sweep marks it expired", async () => {
      const listing = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing);
      await db.owner("update offers set expires_at = now() - interval '1 minute' where id = $1", [offerId]);
      await expect(orderWithOffer(buyer, listing, offerId)).rejects.toThrow(/payment window/);
      await db.as("service", "select * from expire_offers()");
      await expect(orderWithOffer(buyer, listing, offerId)).rejects.toThrow(/offer is expired/);
      expect(await db.owner("select 1 from orders where offer_id = $1", [offerId])).toHaveLength(0);
    });

    it("reserves the listing for the offer's buyer: other buyers are blocked, the buyer is not", async () => {
      const listing = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing);
      await expect(orderWithOffer(buyer2, listing, null)).rejects.toThrow(/reserved for another buyer/);
      const mine = await reservation(buyer, listing);
      expect(mine).toMatchObject([{ reserved: true, held_by_me: true, offer_id: offerId }]);
      const theirs = await reservation(buyer2, listing);
      expect(theirs).toMatchObject([{ reserved: true, held_by_me: false, offer_id: null }]);
      expect(await reservation("anon", listing)).toMatchObject([{ reserved: true, held_by_me: false, offer_id: null }]);
      const o = await orderWithOffer(buyer, listing, offerId);
      expect(o.subtotal_cents).toBe(18000);
    });

    it("releases the reservation when the payment window lapses, even before the sweep runs", async () => {
      const listing = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing);
      await expect(orderWithOffer(buyer2, listing, null)).rejects.toThrow(/reserved for another buyer/);
      await db.owner("update offers set expires_at = now() - interval '1 second' where id = $1", [offerId]);
      expect(await reservation(buyer2, listing)).toHaveLength(0);
      const o = await orderWithOffer(buyer2, listing, null);
      expect(o.subtotal_cents).toBe(22000);
    });

    it("releases the reservation when the offer is withdrawn, by either member", async () => {
      const listing = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing);
      const [{ respond_to_offer: r }] = await db.as<{ respond_to_offer: { status: string; notify: string } }>("service", "select respond_to_offer($1, $2, 'withdraw', null, null)", [seller.id, offerId]);
      expect(r).toMatchObject({ status: "withdrawn", notify: buyer.id });
      expect(await reservation(buyer2, listing)).toHaveLength(0);
      const o = await orderWithOffer(buyer2, listing, null);
      expect(o.subtotal_cents).toBe(22000);

      const second = await liveListing(seller, 22000);
      const secondOffer = await acceptedOffer(buyer, second);
      await db.as("service", "select respond_to_offer($1, $2, 'withdraw', null, null)", [buyer.id, secondOffer]);
      expect(await reservation(buyer2, second)).toHaveLength(0);
      await expect(db.as("service", "select respond_to_offer($1, $2, 'withdraw', null, null)", [buyer2.id, secondOffer])).rejects.toThrow(/Offer not found|can no longer be changed/);
    });

    it("does not let an accepted offer be withdrawn while its payment is in progress, and does not accept over a checkout hold", async () => {
      const listing = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing);
      await orderWithOffer(buyer, listing, offerId);
      await expect(db.as("service", "select respond_to_offer($1, $2, 'withdraw', null, null)", [buyer.id, offerId])).rejects.toThrow(/payment for this offer is in progress/);

      const held = await liveListing(seller, 22000);
      await createOrder(buyer2, held);
      const [pending] = await db.as<{ id: string }>(
        buyer,
        "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, 15000) returning id",
        [held, buyer.id, seller.id]
      );
      await expect(db.as("service", "select respond_to_offer($1, $2, 'accept', null, null)", [seller.id, pending.id])).rejects.toThrow(/checking out this item/);
    });

    it("keeps checkout_create_order server-only", async () => {
      const listing = await liveListing(seller, 22000);
      const offerId = await acceptedOffer(buyer, listing);
      await expect(db.as(buyer, "select checkout_create_order($1, $2, $1, $1, 'x', 0, null, 35, $3)", [buyer.id, listing, offerId])).rejects.toThrow(/permission denied/);
    });
  });
});
