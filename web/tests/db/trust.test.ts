// Database tests for the trust migration: offer rules and state changes, inbox summary, blocks, reports,
// reviews, dispute messages and the admin dispute functions.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const suite = available ? describe : describe.skip;

suite("trust database rules", () => {
  const db = new TestDb();
  let seller: { id: string };
  let buyer: { id: string };
  let buyer2: { id: string };
  let stranger: { id: string };
  let support: { id: string };
  let listingId: string;
  let orderId: string;
  let batsCategory: string;

  const makeListing = async (owner: { id: string }, price = 20000) => {
    const [row] = await db.as<{ id: string }>(
      owner,
      `insert into equipment_listings (seller_id, category_id, title, asking_price_cents, condition_score, structural_disclosure,
        has_cracks, has_rattle, has_loose_end_cap, has_repairs, has_alterations, has_significant_damage,
        authenticity_declaration, ownership_declaration, shipping_weight_oz, package_length_inches, package_width_inches,
        package_height_inches, shipping_origin_postal_code)
       values ($1, $2, 'Trust test bat 26 oz', $3, 8, 'no_known_damage', false, false, false, false, false, false,
        true, true, 48, 38, 5, 5, '37201') returning id`,
      [owner.id, batsCategory, price]
    );
    await db.as(owner, "insert into listing_images (listing_id, image_url, image_type) values ($1, 'https://img.test/1.jpg', 'full')", [row.id]);
    await db.as(owner, "update equipment_listings set listing_status = 'active' where id = $1", [row.id]);
    return row.id;
  };

  const offer = (actor: { id: string }, amount: number, listing = listingId) =>
    db.as<{ id: string; expires_at: string }>(
      actor,
      `insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, $4) returning id, expires_at`,
      [listing, actor.id, seller.id, amount]
    );

  const respond = (actor: { id: string }, offerId: string, action: string, amount: number | null = null) =>
    db.as<{ respond_to_offer: Record<string, unknown> }>("service", "select respond_to_offer($1, $2, $3, $4, null)", [actor.id, offerId, action, amount]);

  beforeAll(async () => {
    await db.setup();
    seller = await db.createUser();
    buyer = await db.createUser();
    buyer2 = await db.createUser();
    stranger = await db.createUser();
    support = await db.createUser();
    await db.owner("insert into user_roles (user_id, role) values ($1, 'support')", [support.id]);
    [{ id: batsCategory }] = await db.owner<{ id: string }>("select id from product_categories where slug = 'bats'");
    listingId = await makeListing(seller);
    [{ id: orderId }] = await db.owner<{ id: string }>(
      `insert into orders (buyer_id, seller_id, order_status, subtotal_cents, total_amount_cents)
       values ($1, $2, 'completed', 20000, 20000) returning id`,
      [buyer.id, seller.id]
    );
  });

  afterAll(async () => {
    await db.teardown();
  });

  describe("offers", () => {
    it("sets the expiry from the offer_expiry_hours setting", async () => {
      await db.owner("update site_settings set value = to_jsonb(24) where key = 'offer_expiry_hours'");
      const [o] = await offer(buyer, 15000);
      const hours = (new Date(o.expires_at).getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(23.9);
      expect(hours).toBeLessThan(24.1);
      await respond(buyer, o.id, "withdraw");
    });

    it("rejects offers at or above the asking price", async () => {
      await expect(offer(buyer, 20000)).rejects.toThrow(/below the asking price/);
      await expect(offer(buyer, 30000)).rejects.toThrow(/below the asking price/);
    });

    it("allows one open offer per buyer and listing", async () => {
      const [o] = await offer(buyer, 15000);
      await expect(offer(buyer, 16000)).rejects.toThrow(/offers_one_open_per_buyer|duplicate key/);
      await respond(buyer, o.id, "withdraw");
    });

    it("hides offers from strangers and keeps respond_to_offer server-only", async () => {
      const [o] = await offer(buyer, 15000);
      expect(await db.as(stranger, "select id from offers where id = $1", [o.id])).toHaveLength(0);
      expect(await db.as(seller, "select id from offers where id = $1", [o.id])).toHaveLength(1);
      await expect(db.as(seller, "select respond_to_offer($1, $2, 'accept', null, null)", [seller.id, o.id])).rejects.toThrow(/permission denied/);
      // No update policy exists, so a direct update touches nothing.
      expect(await db.as(seller, "update offers set status = 'accepted' where id = $1 returning id", [o.id])).toHaveLength(0);
      await respond(buyer, o.id, "withdraw");
    });

    it("lets only the other party respond, and only the maker withdraw", async () => {
      const [o] = await offer(buyer, 15000);
      await expect(respond(buyer, o.id, "accept")).rejects.toThrow(/own offer/);
      await expect(respond(seller, o.id, "withdraw")).rejects.toThrow(/Only the member who made/);
      await expect(respond(stranger, o.id, "accept")).rejects.toThrow(/not found/i);
      await respond(seller, o.id, "reject");
      await expect(respond(seller, o.id, "accept")).rejects.toThrow(/rejected/);
    });

    it("counters, accepts, auto-rejects other pending offers and allows only one accepted offer", async () => {
      const [first] = await offer(buyer, 14000);
      const [second] = await offer(buyer2, 13000);
      const [countered] = await respond(seller, first.id, "counter", 17000);
      const newId = countered.respond_to_offer.new_offer_id as string;
      const rows = await db.owner<{ id: string; status: string; made_by: string; amount_cents: number; parent_offer_id: string }>(
        "select id, status, made_by, amount_cents, parent_offer_id from offers where id in ($1, $2)",
        [first.id, newId]
      );
      expect(rows.find((r) => r.id === first.id)?.status).toBe("countered");
      const counter = rows.find((r) => r.id === newId)!;
      expect(counter).toMatchObject({ status: "pending", made_by: seller.id, amount_cents: 17000, parent_offer_id: first.id });

      const [accepted] = await respond(buyer, newId, "accept");
      expect(accepted.respond_to_offer.status).toBe("accepted");
      expect(accepted.respond_to_offer.auto_rejected).toEqual([second.id]);
      const after = await db.owner<{ status: string }>("select status from offers where id = $1", [second.id]);
      expect(after[0].status).toBe("rejected");

      // A second accepted offer on the same listing is refused by the database.
      await expect(db.owner("update offers set status = 'accepted' where id = $1", [second.id])).rejects.toThrow(/offers_one_accepted_per_listing|duplicate key/);
      // And buyer2 cannot make a new offer that the seller could accept while one is accepted.
      const [third] = await offer(buyer2, 12000);
      await expect(respond(seller, third.id, "accept")).rejects.toThrow(/already accepted/);
      await respond(buyer2, third.id, "withdraw");
    });

    it("rejects counters at or above the asking price", async () => {
      const other = await makeListing(seller, 10000);
      const [o] = await db.as<{ id: string }>(
        buyer,
        "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, 5000) returning id",
        [other, buyer.id, seller.id]
      );
      await expect(respond(seller, o.id, "counter", 10000)).rejects.toThrow(/below the asking price/);
    });

    it("expires open and accepted offers past their time, and does it once", async () => {
      const other = await makeListing(seller, 9000);
      const [o] = await db.as<{ id: string }>(
        buyer,
        "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, 5000) returning id",
        [other, buyer.id, seller.id]
      );
      await db.owner("update offers set expires_at = now() - interval '1 minute' where id = $1", [o.id]);
      const first = await db.as<{ offer_id: string }>("service", "select * from expire_offers()");
      expect(first.map((r) => r.offer_id)).toContain(o.id);
      expect((await db.as("service", "select * from expire_offers()")).length).toBe(0);
      expect((await db.owner<{ status: string }>("select status from offers where id = $1", [o.id]))[0].status).toBe("expired");
      await expect(respond(seller, o.id, "accept")).rejects.toThrow(/expired/);
      await expect(db.as(buyer, "select * from expire_offers()")).rejects.toThrow(/permission denied/);
    });
  });

  describe("messaging", () => {
    let convoId: string;

    it("starts a conversation and summarizes the inbox with unread counts", async () => {
      [{ id: convoId }] = await db.as<{ id: string }>(
        buyer,
        "insert into conversations (listing_id, buyer_id, seller_id) values ($1, $2, $3) returning id",
        [listingId, buyer.id, seller.id]
      );
      await db.as(buyer, "insert into messages (conversation_id, sender_id, recipient_id, message_text) values ($1, $2, $2, 'Is it still available?')", [convoId, buyer.id]);
      const sellerView = await db.as<{ conversation_id: string; unread: number; last_body: string }>(seller, "select * from inbox_summary()");
      expect(sellerView).toEqual([expect.objectContaining({ conversation_id: convoId, unread: 1, last_body: "Is it still available?" })]);
      const buyerView = await db.as<{ unread: number }>(buyer, "select * from inbox_summary()");
      expect(buyerView[0].unread).toBe(0);
      expect(await db.as(stranger, "select * from inbox_summary()")).toHaveLength(0);
      await db.as(seller, "update messages set read_at = now() where conversation_id = $1", [convoId]);
      expect((await db.as<{ unread: number }>(seller, "select * from inbox_summary()"))[0].unread).toBe(0);
    });

    it("blocks messages from a blocked member", async () => {
      await db.as(seller, "insert into user_blocks (blocker_id, blocked_id) values ($1, $2)", [seller.id, buyer.id]);
      await expect(
        db.as(buyer, "insert into messages (conversation_id, sender_id, recipient_id, message_text) values ($1, $2, $2, 'hello?')", [convoId, buyer.id])
      ).rejects.toThrow(/not accepting messages/);
      await expect(
        db.as(buyer, "insert into offers (listing_id, buyer_id, seller_id, made_by, amount_cents) values ($1, $2, $3, $2, 5000)", [listingId, buyer.id, seller.id])
      ).rejects.toThrow(/row-level security/);
      await db.as(seller, "delete from user_blocks where blocker_id = $1 and blocked_id = $2", [seller.id, buyer.id]);
    });

    it("stops a blocked member from starting a conversation", async () => {
      await db.as(seller, "insert into user_blocks (blocker_id, blocked_id) values ($1, $2)", [seller.id, buyer2.id]);
      await expect(
        db.as(buyer2, "insert into conversations (listing_id, buyer_id, seller_id) values ($1, $2, $3)", [listingId, buyer2.id, seller.id])
      ).rejects.toThrow(/row-level security/);
      await db.as(seller, "delete from user_blocks where blocker_id = $1", [seller.id]);
      await db.as(buyer2, "insert into conversations (listing_id, buyer_id, seller_id) values ($1, $2, $3)", [listingId, buyer2.id, seller.id]);
    });
  });

  describe("reports", () => {
    it("lets members file reports but not mark them automatic", async () => {
      await db.as(buyer, "insert into reports (reporter_id, entity_type, entity_id, reason) values ($1, 'conversation', gen_random_uuid(), 'harassment')", [buyer.id]);
      await expect(
        db.as(buyer, "insert into reports (reporter_id, entity_type, entity_id, reason, source) values ($1, 'message', gen_random_uuid(), 'off_platform_payment', 'auto')", [buyer.id])
      ).rejects.toThrow(/row-level security/);
      await db.as("service", "insert into reports (reporter_id, entity_type, entity_id, reason, source) values ($1, 'message', gen_random_uuid(), 'off_platform_payment', 'auto')", [buyer.id]);
      const auto = await db.owner("select 1 from reports where source = 'auto'");
      expect(auto).toHaveLength(1);
    });
  });

  describe("reviews", () => {
    it("lets each party of a completed order review once, and the reviewed member respond once", async () => {
      await db.as(buyer, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating, review_text) values ($1, $2, $3, 'buyer', 5, 'Great seller')", [orderId, buyer.id, seller.id]);
      await expect(
        db.as(buyer, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating) values ($1, $2, $3, 'buyer', 4)", [orderId, buyer.id, seller.id])
      ).rejects.toThrow(/duplicate key/);
      await db.as(seller, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating) values ($1, $2, $3, 'seller', 5)", [orderId, seller.id, buyer.id]);
      await expect(
        db.as(stranger, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating) values ($1, $2, $3, 'buyer', 1)", [orderId, stranger.id, seller.id])
      ).rejects.toThrow(/buyer and seller/);
      const res = await db.as(seller, "update reviews set response_text = 'Thanks!' where reviewed_user_id = $1 and reviewer_id = $2 returning id", [seller.id, buyer.id]);
      expect(res).toHaveLength(1);
      await expect(db.as(seller, "update reviews set rating = 1 where reviewed_user_id = $1", [seller.id])).rejects.toThrow(/Only the reviewed member/);
    });

    it("refuses reviews on orders that are not completed", async () => {
      const [o] = await db.owner<{ id: string }>(
        `insert into orders (buyer_id, seller_id, order_status, subtotal_cents, total_amount_cents) values ($1, $2, 'paid', 100, 100) returning id`,
        [buyer.id, seller.id]
      );
      await expect(
        db.as(buyer, "insert into reviews (order_id, reviewer_id, reviewed_user_id, reviewer_role, rating) values ($1, $2, $3, 'buyer', 5)", [o.id, buyer.id, seller.id])
      ).rejects.toThrow(/completed/);
    });
  });

  describe("disputes", () => {
    let disputeId: string;

    it("lets order parties open a case and hides it from strangers", async () => {
      [{ id: disputeId }] = await db.as<{ id: string }>(
        buyer,
        "insert into disputes (order_id, opened_by, dispute_type, description, evidence_urls) values ($1, $2, 'not_as_described', 'The bat has a crack near the cap.', array['x/y/1.jpg']) returning id",
        [orderId, buyer.id]
      );
      expect(await db.as(stranger, "select id from disputes where id = $1", [disputeId])).toHaveLength(0);
      expect(await db.as(seller, "select id from disputes where id = $1", [disputeId])).toHaveLength(1);
      expect(await db.as(support, "select id from disputes where id = $1", [disputeId])).toHaveLength(1);
    });

    it("lets parties and support read dispute messages, and only parties write them", async () => {
      await db.as(seller, "insert into dispute_messages (dispute_id, author_id, author_role, body) values ($1, $2, 'buyer', 'It was not cracked when shipped.')", [disputeId, seller.id]);
      const [m] = await db.as<{ author_role: string }>(buyer, "select author_role from dispute_messages where dispute_id = $1", [disputeId]);
      expect(m.author_role).toBe("seller"); // the database sets the role, not the client
      expect(await db.as(stranger, "select 1 from dispute_messages where dispute_id = $1", [disputeId])).toHaveLength(0);
      expect(await db.as(support, "select 1 from dispute_messages where dispute_id = $1", [disputeId])).toHaveLength(1);
      await expect(
        db.as(stranger, "insert into dispute_messages (dispute_id, author_id, author_role, body) values ($1, $2, 'buyer', 'hi')", [disputeId, stranger.id])
      ).rejects.toThrow(/not part of this case|row-level security/);
      expect(await db.as(seller, "update dispute_messages set body = 'edited' where dispute_id = $1 returning id", [disputeId])).toHaveLength(0);
      await expect(db.owner("update dispute_messages set body = 'edited' where dispute_id = $1", [disputeId])).rejects.toThrow(/cannot be changed/);
    });

    it("keeps admin dispute functions server-only, role-checked and audited", async () => {
      await expect(db.as(buyer, "select admin_update_dispute($1, $2, 'under_review')", [support.id, disputeId])).rejects.toThrow(/permission denied/);
      await expect(db.as("service", "select admin_update_dispute($1, $2, 'under_review')", [buyer.id, disputeId])).rejects.toThrow(/Not allowed/);
      await db.as("service", "select admin_update_dispute($1, $2, 'under_review', 'Looks like transit damage')", [support.id, disputeId]);
      await expect(db.as("service", "select admin_update_dispute($1, $2, 'resolved_seller')", [support.id, disputeId])).rejects.toThrow(/resolution/);
      const [parties] = await db.as<{ admin_update_dispute: { buyer_id: string } }>(
        "service",
        "select admin_update_dispute($1, $2, 'resolved_seller', null, 'Carrier damage; refund via carrier claim.')",
        [support.id, disputeId]
      );
      expect(parties.admin_update_dispute.buyer_id).toBe(buyer.id);
      await db.as("service", "select admin_add_dispute_message($1, $2, 'We have closed this case.')", [support.id, disputeId]);
      const audit = await db.owner<{ action: string; actor_user_id: string }>("select action, actor_user_id from audit_logs where entity_id = $1 order by created_at", [disputeId]);
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["dispute.under_review", "dispute.resolved_seller", "dispute.message"]));
      expect(audit.every((a) => a.actor_user_id === support.id)).toBe(true);
      const [d] = await db.owner<{ status: string; resolved_at: string | null; admin_notes: string }>("select status, resolved_at, admin_notes from disputes where id = $1", [disputeId]);
      expect(d.status).toBe("resolved_seller");
      expect(d.resolved_at).not.toBeNull();
      expect(d.admin_notes).toBe("Looks like transit damage");
    });

    it("refuses new member messages once the case is resolved", async () => {
      await expect(
        db.as(buyer, "insert into dispute_messages (dispute_id, author_id, author_role, body) values ($1, $2, 'buyer', 'one more thing')", [disputeId, buyer.id])
      ).rejects.toThrow(/closed/);
    });
  });
});
