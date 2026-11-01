// Database security tests. They run the real migrations on a throwaway Postgres database and check that
// Row Level Security, column privileges and triggers block what they should.
// Requires a local Postgres (see README, "Running the tests"). Skipped when none is reachable.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const suite = available ? describe : describe.skip;

suite("database security", () => {
  const db = new TestDb();
  let seller: { id: string };
  let buyer: { id: string };
  let stranger: { id: string };
  let admin: { id: string };
  let batsCategory: string;

  const draftListing = async (owner: { id: string }, extra: Record<string, unknown> = {}) => {
    const fields = {
      category_id: batsCategory,
      title: "2026 Miken Freak Black Maxload 26 oz",
      asking_price_cents: 22000,
      condition_score: 8,
      structural_disclosure: "no_known_damage",
      has_cracks: false,
      has_rattle: false,
      has_loose_end_cap: false,
      has_repairs: false,
      has_alterations: false,
      has_significant_damage: false,
      authenticity_declaration: true,
      ownership_declaration: true,
      shipping_weight_oz: 48,
      package_length_inches: 38,
      package_width_inches: 5,
      package_height_inches: 5,
      shipping_origin_postal_code: "37201",
      location_city: "Nashville",
      location_state: "TN",
      ...extra,
    };
    const keys = Object.keys(fields);
    const [row] = await db.as<{ id: string }>(
      owner,
      `insert into equipment_listings (seller_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
      [owner.id, ...Object.values(fields)]
    );
    return row.id;
  };

  const liveListing = async (owner: { id: string }) => {
    const id = await draftListing(owner);
    await db.as(owner, "insert into listing_images (listing_id, image_url, image_type) values ($1, 'https://img.test/1.jpg', 'full')", [id]);
    await db.as(owner, "update equipment_listings set listing_status = 'active' where id = $1", [id]);
    return id;
  };

  const order = async (status = "paid", listingId?: string) => {
    const listing = listingId ?? (await liveListing(seller));
    const [o] = await db.as<{ id: string }>(
      "service",
      `insert into orders (buyer_id, seller_id, order_status, subtotal_cents, shipping_cost_cents, total_amount_cents)
       values ($1, $2, $3, 22000, 1500, 23500) returning id`,
      [buyer.id, seller.id, status]
    );
    await db.as("service", "insert into order_items (order_id, listing_id, seller_id, product_title_snapshot, unit_price_cents) values ($1, $2, $3, 'Bat', 22000)", [
      o.id,
      listing,
      seller.id,
    ]);
    return { orderId: o.id, listingId: listing };
  };

  beforeAll(async () => {
    await db.setup();
    seller = await db.createUser({ username: "Slugger_Sam" });
    buyer = await db.createUser({ username: "buyer_bo" });
    stranger = await db.createUser();
    admin = await db.createUser({ username: "site_admin" });
    await db.owner("insert into user_roles (user_id, role) values ($1, 'admin')", [admin.id]);
    [{ id: batsCategory }] = await db.owner<{ id: string }>("select id from product_categories where slug = 'bats'");
  }, 60_000);

  afterAll(async () => {
    await db.teardown();
  });

  it("has Row Level Security turned on for every table", async () => {
    const rows = await db.owner<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity"
    );
    expect(rows).toEqual([]);
  });

  describe("profiles", () => {
    it("creates a profile at sign-up, using the requested username when valid", async () => {
      const [p] = await db.owner<{ username: string }>("select username from profiles where id = $1", [seller.id]);
      expect(p.username).toBe("Slugger_Sam");
      const [generated] = await db.owner<{ username: string }>("select username from profiles where id = $1", [stranger.id]);
      expect(generated.username).toMatch(/^player_[0-9a-f]{10}$/);
    });

    it("falls back to a generated username when the requested one is taken, ignoring case", async () => {
      const dup = await db.createUser({ username: "slugger_sam" });
      const [p] = await db.owner<{ username: string }>("select username from profiles where id = $1", [dup.id]);
      expect(p.username).toMatch(/^player_/);
    });

    it("shows public profile fields to visitors but hides email and ZIP code", async () => {
      const rows = await db.as("anon", "select username, city from profiles where id = $1", [seller.id]);
      expect(rows).toHaveLength(1);
      await expect(db.as("anon", "select email from profiles where id = $1", [seller.id])).rejects.toThrow(/permission denied/);
      await expect(db.as(buyer, "select postal_code from profiles where id = $1", [seller.id])).rejects.toThrow(/permission denied/);
    });

    it("lets members read their own private fields through get_my_profile()", async () => {
      const [me] = await db.as<{ email: string }>(seller, "select email from get_my_profile()");
      expect(me.email).toContain("@example.test");
    });

    it("lets members edit their own profile but not verification or account status", async () => {
      await db.as(seller, "update profiles set display_name = 'Sam' where id = $1", [seller.id]);
      await expect(db.as(seller, "update profiles set seller_verified = true where id = $1", [seller.id])).rejects.toThrow(
        /permission denied/
      );
      await expect(db.as(seller, "update profiles set account_status = 'active' where id = $1", [seller.id])).rejects.toThrow(
        /permission denied/
      );
    });

    it("does not let members edit someone else's profile", async () => {
      await db.as(stranger, "update profiles set display_name = 'hacked' where id = $1", [seller.id]);
      const [p] = await db.owner<{ display_name: string }>("select display_name from profiles where id = $1", [seller.id]);
      expect(p.display_name).toBe("Sam");
    });
  });

  describe("catalog and configuration", () => {
    it("lets visitors browse the published catalog, categories, manufacturers and fees", async () => {
      const [{ n }] = await db.as<{ n: string }>("anon", "select count(*) n from products");
      expect(Number(n)).toBeGreaterThan(100);
      const [fee] = await db.as<{ fee_value: string }>("anon", "select fee_value from current_fee('seller_commission')");
      expect(Number(fee.fee_value)).toBe(7);
      expect((await db.as("anon", "select id from product_categories")).length).toBe(9);
    });

    it("keeps unpublished catalog entries hidden from visitors", async () => {
      await db.owner("update products set catalog_status = 'draft' where slug = 'worth-amp-alloy-dual-2026'");
      expect(await db.as("anon", "select id from products where slug = 'worth-amp-alloy-dual-2026'")).toEqual([]);
      expect((await db.as(admin, "select id from products where slug = 'worth-amp-alloy-dual-2026'")).length).toBe(1);
      await db.owner("update products set catalog_status = 'published' where slug = 'worth-amp-alloy-dual-2026'");
    });

    it("does not let members change fees or settings", async () => {
      await db.as(seller, "update fee_configuration set fee_value = 0 where fee_name = 'seller_commission'");
      await expect(db.as(seller, "insert into fee_configuration (fee_name, fee_type, fee_value) values ('x', 'percentage', 1)")).rejects.toThrow(
        /row-level security/
      );
      const [fee] = await db.owner<{ fee_value: string }>("select fee_value from current_fee('seller_commission')");
      expect(Number(fee.fee_value)).toBe(7);
    });

    it("records every fee change in the audit log", async () => {
      await db.as("service", "update fee_configuration set description = 'updated' where fee_name = 'featured_listing'");
      const rows = await db.owner<{ action: string }>(
        "select action from audit_logs where entity_type = 'fee_configuration' and action = 'update'"
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it("lets members request a missing catalog entry, but not approve it", async () => {
      await db.as(seller, "insert into product_submissions (submitted_by, category_id, model_name, model_year) values ($1, $2, 'Mystery Bat', 2026)", [
        seller.id,
        batsCategory,
      ]);
      await expect(
        db.as(seller, "insert into product_submissions (submitted_by, category_id, model_name, status) values ($1, $2, 'Sneaky', 'approved')", [
          seller.id,
          batsCategory,
        ])
      ).rejects.toThrow(/row-level security/);
      expect(await db.as(stranger, "select id from product_submissions")).toEqual([]);
    });
  });

  describe("listings", () => {
    it("keeps drafts private to the seller", async () => {
      const id = await draftListing(seller);
      expect(await db.as("anon", "select id from equipment_listings where id = $1", [id])).toEqual([]);
      expect(await db.as(stranger, "select id from equipment_listings where id = $1", [id])).toEqual([]);
      expect((await db.as(seller, "select id from equipment_listings where id = $1", [id])).length).toBe(1);
    });

    it("will not publish a listing without photos", async () => {
      const id = await draftListing(seller);
      await expect(db.as(seller, "update equipment_listings set listing_status = 'active' where id = $1", [id])).rejects.toThrow(/photo/);
    });

    it("will not publish until every damage question is answered and declarations are made", async () => {
      const id = await draftListing(seller, { has_rattle: null });
      await db.as(seller, "insert into listing_images (listing_id, image_url) values ($1, 'https://img.test/a.jpg')", [id]);
      await expect(db.as(seller, "update equipment_listings set listing_status = 'active' where id = $1", [id])).rejects.toThrow(/damage question/);
      await db.as(seller, "update equipment_listings set has_rattle = true where id = $1", [id]);
      await expect(db.as(seller, "update equipment_listings set listing_status = 'active' where id = $1", [id])).rejects.toThrow(
        /structural disclosure/
      );
      await db.as(seller, "update equipment_listings set structural_disclosure = 'damage_disclosed', authenticity_declaration = false where id = $1", [id]);
      await expect(db.as(seller, "update equipment_listings set listing_status = 'active' where id = $1", [id])).rejects.toThrow(/authenticity/);
    });

    it("cannot be published directly on creation", async () => {
      await expect(draftListing(seller, { listing_status: "active" })).rejects.toThrow(/draft/);
    });

    it("publishes a complete listing, sets its dates, and shows it to visitors", async () => {
      const id = await liveListing(seller);
      const [row] = await db.as<{ published_at: Date; expires_at: Date }>(
        "anon",
        "select published_at, expires_at from equipment_listings where id = $1",
        [id]
      );
      expect(row.published_at).toBeTruthy();
      const days = (row.expires_at.getTime() - row.published_at.getTime()) / 864e5;
      expect(Math.round(days)).toBe(90);
    });

    it("hides the seller's ship-from ZIP code from everyone else", async () => {
      const id = await liveListing(seller);
      await expect(db.as(buyer, "select shipping_origin_postal_code from equipment_listings where id = $1", [id])).rejects.toThrow(
        /permission denied/
      );
      const [own] = await db.as<{ zip: string }>(seller, "select get_listing_shipping_origin($1) zip", [id]);
      expect(own.zip).toBe("37201");
      const [other] = await db.as<{ zip: string | null }>(buyer, "select get_listing_shipping_origin($1) zip", [id]);
      expect(other.zip).toBeNull();
    });

    it("does not let sellers mark listings sold, feature them, or edit other sellers' listings", async () => {
      const id = await liveListing(seller);
      await expect(db.as(seller, "update equipment_listings set listing_status = 'sold' where id = $1", [id])).rejects.toThrow(/order system/);
      await expect(db.as(seller, "update equipment_listings set featured = true where id = $1", [id])).rejects.toThrow(/Featured/);
      await db.as(stranger, "update equipment_listings set asking_price_cents = 100 where id = $1", [id]);
      const [row] = await db.owner<{ asking_price_cents: number }>("select asking_price_cents from equipment_listings where id = $1", [id]);
      expect(row.asking_price_cents).toBe(22000);
    });

    it("lets the order system mark a listing sold, after which the seller cannot edit it", async () => {
      const id = await liveListing(seller);
      await db.as("service", "update equipment_listings set listing_status = 'sold' where id = $1", [id]);
      await expect(db.as(seller, "update equipment_listings set title = 'Changed title here' where id = $1", [id])).rejects.toThrow(
        /reserved or sold/
      );
      const [row] = await db.as<{ sold_at: Date }>("anon", "select sold_at from equipment_listings where id = $1", [id]);
      expect(row.sold_at).toBeTruthy();
    });

    it("blocks suspended sellers from publishing", async () => {
      const id = await draftListing(stranger);
      await db.as(stranger, "insert into listing_images (listing_id, image_url) values ($1, 'https://img.test/b.jpg')", [id]);
      await db.owner("update profiles set account_status = 'suspended' where id = $1", [stranger.id]);
      await expect(db.as(stranger, "update equipment_listings set listing_status = 'active' where id = $1", [id])).rejects.toThrow(
        /cannot publish/
      );
      await db.owner("update profiles set account_status = 'active' where id = $1", [stranger.id]);
    });
  });

  describe("orders and addresses", () => {
    it("never lets the same listing be held by two live orders", async () => {
      const { listingId } = await order("paid");
      await expect(order("awaiting_payment", listingId)).rejects.toThrow(/order_items_one_live_order_per_listing/);
    });

    it("releases a listing when its order item stops holding it", async () => {
      const { orderId, listingId } = await order("awaiting_payment");
      await db.as("service", "update order_items set holds_listing = false where order_id = $1", [orderId]);
      await expect(order("awaiting_payment", listingId)).resolves.toBeTruthy();
    });

    it("shows orders only to their buyer and seller, and lets no member create one", async () => {
      const { orderId } = await order();
      expect((await db.as(buyer, "select id from orders where id = $1", [orderId])).length).toBe(1);
      expect((await db.as(seller, "select id from orders where id = $1", [orderId])).length).toBe(1);
      expect(await db.as(stranger, "select id from orders where id = $1", [orderId])).toEqual([]);
      await expect(
        db.as(buyer, "insert into orders (buyer_id, seller_id, subtotal_cents, total_amount_cents) values ($1, $2, 1, 1)", [buyer.id, seller.id])
      ).rejects.toThrow(/row-level security/);
      await db.as(buyer, "update orders set order_status = 'completed' where id = $1", [orderId]);
      const [o] = await db.owner<{ order_status: string }>("select order_status from orders where id = $1", [orderId]);
      expect(o.order_status).toBe("paid");
    });

    it("rejects orders whose total doesn't add up", async () => {
      await expect(
        db.as("service", "insert into orders (buyer_id, seller_id, subtotal_cents, shipping_cost_cents, total_amount_cents) values ($1, $2, 100, 50, 999)", [
          buyer.id,
          seller.id,
        ])
      ).rejects.toThrow(/check constraint/);
    });

    it("lets a seller see the ship-to address only once the order is paid", async () => {
      const [addr] = await db.as<{ id: string }>(
        buyer,
        "insert into addresses (user_id, full_name, street_address, city, state, postal_code) values ($1, 'Bo Buyer', '1 Main St', 'Austin', 'TX', '78701') returning id",
        [buyer.id]
      );
      const { orderId } = await order("awaiting_payment");
      await db.as("service", "update orders set shipping_address_id = $2 where id = $1", [orderId, addr.id]);
      expect(await db.as(seller, "select id from addresses where id = $1", [addr.id])).toEqual([]);
      await db.as("service", "update orders set order_status = 'paid' where id = $1", [orderId]);
      expect((await db.as(seller, "select id from addresses where id = $1", [addr.id])).length).toBe(1);
      expect(await db.as(stranger, "select id from addresses where id = $1", [addr.id])).toEqual([]);
    });
  });

  describe("reviews", () => {
    it("only allows reviews between the two parties of a completed order, once each", async () => {
      const { orderId } = await order("delivered");
      await expect(
        db.as(buyer, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating) values ($1, $2, $3, 'buyer', 5)", [
          orderId,
          buyer.id,
          seller.id,
        ])
      ).rejects.toThrow(/completed orders/);

      await db.as("service", "update orders set order_status = 'completed' where id = $1", [orderId]);
      await db.as(buyer, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating, review_text) values ($1, $2, $3, 'seller', 5, 'Fast shipping')", [
        orderId,
        buyer.id,
        seller.id,
      ]);
      const [r] = await db.owner<{ reviewer_role: string }>("select reviewer_role from reviews where order_id = $1 and reviewer_id = $2", [orderId, buyer.id]);
      expect(r.reviewer_role).toBe("buyer");

      await expect(
        db.as(buyer, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating) values ($1, $2, $3, 'buyer', 1)", [
          orderId,
          buyer.id,
          seller.id,
        ])
      ).rejects.toThrow(/duplicate key/);
      await expect(
        db.as(stranger, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating) values ($1, $2, $3, 'buyer', 1)", [
          orderId,
          stranger.id,
          seller.id,
        ])
      ).rejects.toThrow(/buyer and seller/);
    });

    it("lets the reviewed member respond but nobody change the rating", async () => {
      const [r] = await db.owner<{ id: string }>("select id from reviews where reviewed_user_id = $1 limit 1", [seller.id]);
      await db.as(seller, "update reviews set response_text = 'Thanks!' where id = $1", [r.id]);
      await expect(db.as(seller, "update reviews set rating = 1 where id = $1", [r.id])).rejects.toThrow(/response/);
      await db.as(buyer, "update reviews set rating = 1 where id = $1", [r.id]);
      const [after] = await db.owner<{ rating: number; responded_at: Date }>("select rating, responded_at from reviews where id = $1", [r.id]);
      expect(after.rating).toBe(5);
      expect(after.responded_at).toBeTruthy();
    });

    it("publishes seller reputation as aggregates only", async () => {
      const [stats] = await db.as<{ completed_sales: number; average_rating: string; review_count: number }>(
        "anon",
        "select completed_sales, average_rating, review_count from seller_public_stats where user_id = $1",
        [seller.id]
      );
      expect(stats.completed_sales).toBe(1);
      expect(Number(stats.average_rating)).toBe(5);
      expect(stats.review_count).toBe(1);
    });
  });

  describe("messaging", () => {
    let conversationId: string;

    it("lets a buyer start a conversation about a listing and the seller reply", async () => {
      const listingId = await liveListing(seller);
      [{ id: conversationId }] = await db.as<{ id: string }>(
        buyer,
        "insert into conversations (listing_id, buyer_id, seller_id) values ($1, $2, $3) returning id",
        [listingId, buyer.id, seller.id]
      );
      await db.as(buyer, "insert into messages (conversation_id, sender_id, recipient_id, message_text) values ($1, $2, $2, 'Is this still available?')", [
        conversationId,
        buyer.id,
      ]);
      const [m] = await db.owner<{ recipient_id: string }>("select recipient_id from messages where conversation_id = $1", [conversationId]);
      expect(m.recipient_id).toBe(seller.id);
      await db.as(seller, "insert into messages (conversation_id, sender_id, recipient_id, message_text) values ($1, $2, $2, 'Yes')", [
        conversationId,
        seller.id,
      ]);
    });

    it("keeps conversations private to their participants", async () => {
      expect(await db.as(stranger, "select id from messages where conversation_id = $1", [conversationId])).toEqual([]);
      await expect(
        db.as(stranger, "insert into messages (conversation_id, sender_id, recipient_id, message_text) values ($1, $2, $2, 'hi')", [
          conversationId,
          stranger.id,
        ])
      ).rejects.toThrow(/not part of this conversation/);
    });

    it("lets recipients mark messages read but not edit them", async () => {
      await db.as(seller, "update messages set read_at = now() where conversation_id = $1 and recipient_id = $2", [conversationId, seller.id]);
      await expect(
        db.as(seller, "update messages set message_text = 'edited' where conversation_id = $1 and recipient_id = $2", [conversationId, seller.id])
      ).rejects.toThrow(/cannot be edited/);
    });

    it("stops blocked members from messaging", async () => {
      await db.as(seller, "insert into user_blocks (blocker_id, blocked_id) values ($1, $2)", [seller.id, buyer.id]);
      await expect(
        db.as(buyer, "insert into messages (conversation_id, sender_id, recipient_id, message_text) values ($1, $2, $2, 'hello?')", [
          conversationId,
          buyer.id,
        ])
      ).rejects.toThrow(/not accepting messages/);
      await db.as(seller, "delete from user_blocks where blocker_id = $1", [seller.id]);
    });

    it("rate-limits members who send too many messages", async () => {
      await db.owner("update site_settings set value = '3' where key = 'messages_per_minute_limit'");
      const send = () =>
        db.as(buyer, "insert into messages (conversation_id, sender_id, recipient_id, message_text) values ($1, $2, $2, 'spam')", [
          conversationId,
          buyer.id,
        ]);
      await send();
      await send();
      await expect(send()).rejects.toThrow(/too quickly/);
    });
  });

  describe("offers, disputes, notifications", () => {
    it("lets buyers make offers on live listings only, and never on their own", async () => {
      const live = await liveListing(seller);
      await db.as(buyer, "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, 18000)", [
        live,
        buyer.id,
        seller.id,
      ]);
      const draft = await draftListing(seller);
      await expect(
        db.as(buyer, "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, 18000)", [
          draft,
          buyer.id,
          seller.id,
        ])
      ).rejects.toThrow(/row-level security/);
      await expect(
        db.as(seller, "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $2, $2, 18000)", [live, seller.id])
      ).rejects.toThrow();
    });

    it("lets order parties open a dispute, but nobody else", async () => {
      const { orderId } = await order("shipped");
      await db.as(buyer, "insert into disputes (order_id, opened_by, dispute_type, description) values ($1, $2, 'not_received', 'Tracking shows nothing')", [
        orderId,
        buyer.id,
      ]);
      await expect(
        db.as(stranger, "insert into disputes (order_id, opened_by, dispute_type, description) values ($1, $2, 'other', 'Not my order at all')", [
          orderId,
          stranger.id,
        ])
      ).rejects.toThrow(/row-level security/);
    });

    it("lets members mark notifications read but not rewrite them", async () => {
      const [n] = await db.as<{ id: string }>(
        "service",
        "insert into notifications (user_id, notification_type, title) values ($1, 'order_paid', 'Order paid') returning id",
        [buyer.id]
      );
      await db.as(buyer, "update notifications set read_at = now() where id = $1", [n.id]);
      await expect(db.as(buyer, "update notifications set title = 'x' where id = $1", [n.id])).rejects.toThrow(/permission denied/);
      expect(await db.as(seller, "select id from notifications where id = $1", [n.id])).toEqual([]);
    });
  });

  describe("server-only data", () => {
    it("hides webhooks, newsletter emails and the audit log from members", async () => {
      await db.as("service", "insert into webhook_events (provider, event_id, event_type, payload) values ('stripe', 'evt_1', 'x', '{}')");
      await db.as("service", "insert into newsletter_subscribers (email) values ('fan@example.test')");
      expect(await db.as(buyer, "select id from webhook_events")).toEqual([]);
      expect(await db.as("anon", "select id from newsletter_subscribers")).toEqual([]);
      expect(await db.as(buyer, "select id from audit_logs")).toEqual([]);
      expect((await db.as(admin, "select id from audit_logs")).length).toBeGreaterThan(0);
    });

    it("processes each webhook event only once", async () => {
      await expect(
        db.as("service", "insert into webhook_events (provider, event_id, event_type, payload) values ('stripe', 'evt_1', 'x', '{}')")
      ).rejects.toThrow(/duplicate key/);
    });

    it("keeps the audit log append-only, even for the database owner", async () => {
      await expect(db.owner("delete from audit_logs")).rejects.toThrow(/cannot be changed or deleted/);
      await expect(db.owner("update audit_logs set action = 'x'")).rejects.toThrow(/cannot be changed or deleted/);
      await expect(db.as(buyer, "select log_audit('test', 'x', null)")).rejects.toThrow(/Not allowed/);
    });

    it("shows only verified sales in price history and only paid, running ads", async () => {
      const [p] = await db.owner<{ id: string }>("select id from products limit 1");
      await db.as("service", "insert into price_history (product_id, sold_price_cents, sale_date, verified_transaction, data_source) values ($1, 20000, current_date, false, 'licensed')", [
        p.id,
      ]);
      expect(await db.as("anon", "select id from price_history")).toEqual([]);
      await expect(
        db.as("service", "insert into price_history (product_id, sold_price_cents, sale_date, verified_transaction) values ($1, 20000, current_date, true)", [p.id])
      ).rejects.toThrow(/check constraint/);

      await db.as("service", "insert into advertising_campaigns (advertiser_name, campaign_name, placement, start_date, end_date, price_cents, active, paid) values ('A', 'B', 'homepage_partner', current_date, current_date, 0, true, false)");
      expect(await db.as("anon", "select id from advertising_campaigns")).toEqual([]);
    });

    it("does not let members grant themselves admin", async () => {
      await expect(db.as(buyer, "insert into user_roles (user_id, role) values ($1, 'admin')", [buyer.id])).rejects.toThrow(/row-level security/);
      const [r] = await db.as<{ admin: boolean }>(buyer, "select is_admin() admin");
      expect(r.admin).toBe(false);
    });
  });
});
