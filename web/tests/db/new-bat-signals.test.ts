// Database tests for new-bat signals: product lineage, release dates and review maturity, owner reports
// ("first swings"), the durability tracker and review alerts. Same approach as security.test.ts: the real
// migrations on a throwaway Postgres database, queried as visitors, members and the server.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const suite = available ? describe : describe.skip;

suite("new bat signals", () => {
  const db = new TestDb();
  let seller: { id: string };
  let buyer: { id: string };
  let stranger: { id: string };
  let moderator: { id: string };
  let batsCategory: string;
  // Published catalog products, each used by one group of tests so counts don't interfere.
  let products: string[];
  const product = (n: number) => products[n];

  type Report = Record<string, unknown>;
  const daysAgo = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
  const fileReport = async (who: { id: string }, productId: string, extra: Report = {}) => {
    const fields: Report = { product_id: productId, user_id: who.id, hits_so_far: 100, ball_type: "44/375", ...extra };
    const keys = Object.keys(fields);
    const [row] = await db.as<{ id: string; ownership_verified: boolean; status: string }>(
      who,
      `insert into owner_reports (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})
       returning id, ownership_verified, status`,
      Object.values(fields)
    );
    return row;
  };

  /** Inserts a report as the server, which may backdate it (members cannot). */
  const serverReport = async (who: { id: string }, productId: string, extra: Report = {}) => {
    const fields: Report = { product_id: productId, user_id: who.id, ...extra };
    const keys = Object.keys(fields);
    await db.as(
      "service",
      `insert into owner_reports (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(fields)
    );
  };

  /** A marketplace order from `buyer` for one listing of the given product. */
  const orderFor = async (productId: string, status: string) => {
    const [l] = await db.as<{ id: string }>(
      "service",
      "insert into equipment_listings (seller_id, product_id, category_id, title, asking_price_cents) values ($1, $2, $3, 'Used bat for sale', 20000) returning id",
      [seller.id, productId, batsCategory]
    );
    const [o] = await db.as<{ id: string }>(
      "service",
      `insert into orders (buyer_id, seller_id, order_status, subtotal_cents, total_amount_cents)
       values ($1, $2, $3, 20000, 20000) returning id`,
      [buyer.id, seller.id, status]
    );
    await db.as(
      "service",
      "insert into order_items (order_id, listing_id, product_id, seller_id, product_title_snapshot, unit_price_cents) values ($1, $2, $3, $4, 'Bat', 20000)",
      [o.id, l.id, productId, seller.id]
    );
    return o.id;
  };

  const maturity = async (productId: string) => {
    const [row] = await db.as<{ maturity: string | null; reporting_owners: number }>(
      "anon",
      "select maturity, reporting_owners from product_review_maturity where product_id = $1",
      [productId]
    );
    return row;
  };

  beforeAll(async () => {
    await db.setup();
    seller = await db.createUser({ username: "seller_sue" });
    buyer = await db.createUser({ username: "buyer_ben" });
    stranger = await db.createUser();
    moderator = await db.createUser({ username: "mod_max" });
    await db.owner("insert into user_roles (user_id, role) values ($1, 'moderator')", [moderator.id]);
    [{ id: batsCategory }] = await db.owner<{ id: string }>("select id from product_categories where slug = 'bats'");
    products = (
      await db.owner<{ id: string }>("select id from products where catalog_status = 'published' order by slug limit 10")
    ).map((r) => r.id);
  }, 60_000);

  afterAll(async () => {
    await db.teardown();
  });

  it("turns on Row Level Security for every new table", async () => {
    const rows = await db.owner<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('product_lineage', 'owner_reports', 'review_alerts') order by tablename"
    );
    expect(rows).toEqual([
      { tablename: "owner_reports", rowsecurity: true },
      { tablename: "product_lineage", rowsecurity: true },
      { tablename: "review_alerts", rowsecurity: true },
    ]);
  });

  it("seeds the new settings with their defaults", async () => {
    const rows = await db.as<{ key: string; value: number }>(
      "anon",
      "select key, value from site_settings where key in ('new_release_window_days', 'early_report_threshold', 'durability_min_owners', 'owner_report_interval_days') order by key"
    );
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual({
      durability_min_owners: 3,
      early_report_threshold: 5,
      new_release_window_days: 120,
      owner_report_interval_days: 7,
    });
  });

  describe("product lineage", () => {
    it("is public for published products", async () => {
      await db.as(
        "service",
        "insert into product_lineage (product_id, related_product_id, relation, confidence, basis, verified) values ($1, $2, 'predecessor', 'high', 'Same barrel per manufacturer', true)",
        [product(0), product(1)]
      );
      const rows = await db.as<{ relation: string }>("anon", "select relation from product_lineage where product_id = $1", [product(0)]);
      expect(rows).toEqual([{ relation: "predecessor" }]);
    });

    it("hides links to unpublished products from visitors", async () => {
      await db.owner("update products set catalog_status = 'draft' where id = $1", [product(1)]);
      expect(await db.as("anon", "select id from product_lineage where product_id = $1", [product(0)])).toEqual([]);
      expect((await db.as(moderator, "select id from product_lineage where product_id = $1", [product(0)])).length).toBe(1);
      await db.owner("update products set catalog_status = 'published' where id = $1", [product(1)]);
    });

    it("blocks member writes", async () => {
      await expect(
        db.as(buyer, "insert into product_lineage (product_id, related_product_id, relation, basis) values ($1, $2, 'variant', 'I think so')", [
          product(2),
          product(3),
        ])
      ).rejects.toThrow(/row-level security/);
      await db.as(buyer, "update product_lineage set verified = false, confidence = 'low' where product_id = $1", [product(0)]);
      await db.as(buyer, "delete from product_lineage where product_id = $1", [product(0)]);
      const [row] = await db.owner<{ confidence: string }>("select confidence from product_lineage where product_id = $1", [product(0)]);
      expect(row.confidence).toBe("high");
    });

    it("rejects self-links and duplicate pairs in either direction", async () => {
      await expect(
        db.as("service", "insert into product_lineage (product_id, related_product_id, relation, basis) values ($1, $1, 'variant', 'Self link')", [product(0)])
      ).rejects.toThrow(/check constraint/);
      await expect(
        db.as("service", "insert into product_lineage (product_id, related_product_id, relation, basis) values ($1, $2, 'predecessor', 'Duplicate')", [
          product(0),
          product(1),
        ])
      ).rejects.toThrow(/duplicate key/);
      await expect(
        db.as("service", "insert into product_lineage (product_id, related_product_id, relation, basis) values ($2, $1, 'predecessor', 'Reversed')", [
          product(0),
          product(1),
        ])
      ).rejects.toThrow(/duplicate key/);
      await db.as("service", "insert into product_lineage (product_id, related_product_id, relation, basis) values ($1, $2, 'same_platform', 'Same platform')", [
        product(0),
        product(1),
      ]);
    });
  });

  describe("owner reports", () => {
    it("lets members file a report on a published bat", async () => {
      const r = await fileReport(stranger, product(2), { durability_status: "intact", sting: 2, notes: "Hot out of the wrapper" });
      expect(r.status).toBe("published");
      expect(r.ownership_verified).toBe(false);
    });

    it("does not let members set ownership_verified, status or the date, or report for someone else", async () => {
      await expect(fileReport(buyer, product(3), { ownership_verified: true })).rejects.toThrow(/permission denied/);
      await expect(fileReport(buyer, product(3), { ownership_verified_via: "staff_photo_review" })).rejects.toThrow(/permission denied/);
      await expect(fileReport(buyer, product(3), { status: "hidden" })).rejects.toThrow(/permission denied/);
      await expect(fileReport(buyer, product(3), { created_at: "2020-01-01" })).rejects.toThrow(/permission denied/);
      await expect(fileReport(buyer, product(3), { user_id: stranger.id })).rejects.toThrow(/row-level security/);
      await expect(
        db.as("anon", "insert into owner_reports (product_id, user_id) values ($1, $2)", [product(3), buyer.id])
      ).rejects.toThrow(/permission denied/);
    });

    it("does not let members edit or delete reports after filing", async () => {
      const [r] = await db.owner<{ id: string }>("select id from owner_reports where user_id = $1 and product_id = $2", [stranger.id, product(2)]);
      await expect(db.as(stranger, "update owner_reports set ownership_verified = true where id = $1", [r.id])).rejects.toThrow(/permission denied/);
      await expect(db.as(stranger, "update owner_reports set notes = 'edited' where id = $1", [r.id])).rejects.toThrow(/permission denied/);
      await expect(db.as(stranger, "delete from owner_reports where id = $1", [r.id])).rejects.toThrow(/permission denied/);
    });

    it("rejects proof photos outside the member's own folder", async () => {
      await expect(fileReport(buyer, product(3), { proof_photo_path: `${stranger.id}/receipt.jpg` })).rejects.toThrow(/own folder/);
      await fileReport(buyer, product(3), { proof_photo_path: `${buyer.id}/receipt.jpg` });
    });

    it("allows one check-in per bat every 7 days", async () => {
      await expect(fileReport(buyer, product(3), { hits_so_far: 250 })).rejects.toThrow(/once every 7 days/);
      // A different bat is fine.
      await fileReport(buyer, product(4));
      // A week later the member can check in again.
      await db.owner("update owner_reports set created_at = now() - interval '8 days' where user_id = $1 and product_id = $2", [buyer.id, product(3)]);
      await fileReport(buyer, product(3), { hits_so_far: 250, durability_status: "dented" });
      const rows = await db.as(buyer, "select id from owner_reports where user_id = $1 and product_id = $2", [buyer.id, product(3)]);
      expect(rows).toHaveLength(2);
    });

    it("verifies ownership automatically for a buyer with a completed order for that bat", async () => {
      await orderFor(product(5), "completed");
      expect((await fileReport(buyer, product(5))).ownership_verified).toBe(true);
      const [row] = await db.owner<{ ownership_verified_via: string }>(
        "select ownership_verified_via from owner_reports where user_id = $1 and product_id = $2",
        [buyer.id, product(5)]
      );
      expect(row.ownership_verified_via).toBe("marketplace_order");
      // Someone else reporting the same bat is not verified by the buyer's order.
      expect((await fileReport(stranger, product(5))).ownership_verified).toBe(false);
    });

    it("stays unverified until the order completes, then flips automatically", async () => {
      const orderId = await orderFor(product(6), "delivered");
      expect((await fileReport(buyer, product(6))).ownership_verified).toBe(false);
      // An order for a different bat does not verify this one.
      expect((await fileReport(buyer, product(7))).ownership_verified).toBe(false);
      await db.as("service", "update orders set order_status = 'completed' where id = $1", [orderId]);
      const rows = await db.owner<{ product_id: string; ownership_verified: boolean }>(
        "select product_id, ownership_verified from owner_reports where user_id = $1 and product_id in ($2, $3)",
        [buyer.id, product(6), product(7)]
      );
      expect(Object.fromEntries(rows.map((r) => [r.product_id, r.ownership_verified]))).toEqual({ [product(6)]: true, [product(7)]: false });
    });

    it("lets the server verify ownership from a staff-checked photo", async () => {
      await db.as(
        "service",
        "update owner_reports set ownership_verified = true, ownership_verified_via = 'staff_photo_review' where user_id = $1 and product_id = $2 and proof_photo_path is not null",
        [buyer.id, product(3)]
      );
      await expect(
        db.as("service", "update owner_reports set ownership_verified = true where user_id = $1 and product_id = $2", [stranger.id, product(2)])
      ).rejects.toThrow(/check constraint/);
    });

    it("shows published reports to visitors but hidden ones only to the owner and moderators", async () => {
      const [r] = await db.owner<{ id: string }>("select id from owner_reports where user_id = $1 and product_id = $2", [stranger.id, product(2)]);
      expect((await db.as("anon", "select id from owner_reports where id = $1", [r.id])).length).toBe(1);
      await db.as("service", "update owner_reports set status = 'hidden' where id = $1", [r.id]);
      expect(await db.as("anon", "select id from owner_reports where id = $1", [r.id])).toEqual([]);
      expect(await db.as(buyer, "select id from owner_reports where id = $1", [r.id])).toEqual([]);
      expect((await db.as(stranger, "select id from owner_reports where id = $1", [r.id])).length).toBe(1);
      expect((await db.as(moderator, "select id from owner_reports where id = $1", [r.id])).length).toBe(1);
    });

    it("blocks reports on unpublished bats", async () => {
      await db.owner("update products set catalog_status = 'draft' where id = $1", [product(8)]);
      await expect(fileReport(stranger, product(8))).rejects.toThrow(/row-level security/);
      await db.owner("update products set catalog_status = 'published' where id = $1", [product(8)]);
    });
  });

  describe("durability tracker", () => {
    let owners: { id: string }[];

    beforeAll(async () => {
      owners = [];
      for (let i = 0; i < 5; i++) owners.push(await db.createUser());
      const [a, b, c, d, e] = owners;
      // Product 8: three owners with published reports, one owner whose only report is hidden.
      await serverReport(a, product(8), { durability_status: "intact", hits_so_far: 100, created_at: daysAgo(20) });
      await fileReport(a, product(8), { durability_status: "cracked", hits_so_far: 450 });
      await fileReport(b, product(8), { durability_status: "intact", hits_so_far: 300 });
      await fileReport(c, product(8), { durability_status: "intact", hits_so_far: 500 });
      await serverReport(d, product(8), { durability_status: "cracked", hits_so_far: 50, status: "hidden" });
      // Product 9: only two owners, below the minimum.
      await fileReport(d, product(9), { durability_status: "rattle", hits_so_far: 200 });
      await fileReport(e, product(9), { durability_status: "intact", hits_so_far: 300 });
    });

    it("reports each owner's latest status, failures and hit counts for bats with enough owners", async () => {
      const [row] = await db.as<Record<string, unknown>>("anon", "select * from owner_report_durability where product_id = $1", [product(8)]);
      expect(row).toMatchObject({
        reporting_owners: 3,
        verified_owners: 0,
        owners_intact: 2,
        owners_cracked: 1,
        owners_rattle: 0,
        owners_reporting_failure: 1,
        median_hits_intact: 400,
        median_hits_at_failure: 450,
        hits_at_failure: [450],
      });
    });

    it("hides bats with fewer than 3 owners", async () => {
      expect(await db.as("anon", "select product_id from owner_report_durability where product_id = $1", [product(9)])).toEqual([]);
      expect(await db.as(buyer, "select product_id from owner_report_durability where product_id = $1", [product(9)])).toEqual([]);
    });

    it("follows the durability_min_owners setting", async () => {
      await db.owner("update site_settings set value = '2' where key = 'durability_min_owners'");
      expect((await db.as("anon", "select product_id from owner_report_durability where product_id = $1", [product(9)])).length).toBe(1);
      await db.owner("update site_settings set value = '3' where key = 'durability_min_owners'");
    });

    it("exposes no user ids", async () => {
      const cols = await db.owner<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'owner_report_durability'"
      );
      expect(cols.map((c) => c.column_name).filter((c) => /user|owner_id|reporter/.test(c))).toEqual([]);
      const all = JSON.stringify(await db.as("anon", "select * from owner_report_durability"));
      for (const u of [...owners, buyer, stranger]) expect(all).not.toContain(u.id);
    });
  });

  describe("review maturity", () => {
    // Uses its own products so reports from other tests don't count.
    let fresh: string;
    let undated: string;
    let upcoming: string;

    beforeAll(async () => {
      [fresh, undated, upcoming] = (
        await db.owner<{ id: string }>("select id from products where catalog_status = 'published' order by slug offset 20 limit 3")
      ).map((r) => r.id);
      await db.owner("update products set release_date = current_date - 10, release_status = 'released' where id = $1", [fresh]);
      await db.owner("update products set release_date = current_date + 30, release_status = 'pre_order' where id = $1", [upcoming]);
    });

    it("leaves bats without a release date unclassified", async () => {
      expect(await maturity(undated)).toEqual({ maturity: null, reporting_owners: 0 });
    });

    it("calls a bat released in the window with fewer than 5 owners a new release", async () => {
      expect(await maturity(fresh)).toEqual({ maturity: "new_release", reporting_owners: 0 });
      expect((await maturity(upcoming)).maturity).toBe("new_release");
    });

    it("counts distinct owners with published reports only, then moves to early reports at 5", async () => {
      const reporters: { id: string }[] = [];
      for (let i = 0; i < 5; i++) reporters.push(await db.createUser());
      for (const r of reporters.slice(0, 4)) await fileReport(r, fresh);
      // A second check-in by the same owner and a hidden report do not count.
      await serverReport(reporters[0], fresh, { created_at: daysAgo(30) });
      await serverReport(reporters[4], fresh, { status: "hidden" });
      expect(await maturity(fresh)).toEqual({ maturity: "new_release", reporting_owners: 4 });

      await db.as("service", "update owner_reports set status = 'published' where user_id = $1 and product_id = $2", [reporters[4].id, fresh]);
      expect(await maturity(fresh)).toEqual({ maturity: "early_reports", reporting_owners: 5 });
    });

    it("calls a bat established once it is past the 120-day window", async () => {
      await db.owner("update products set release_date = current_date - 121 where id = $1", [fresh]);
      expect((await maturity(fresh)).maturity).toBe("established");
      await db.owner("update products set release_date = current_date - 120 where id = $1", [fresh]);
      expect((await maturity(fresh)).maturity).toBe("early_reports");
    });

    it("follows the window and threshold settings", async () => {
      await db.owner("update site_settings set value = '6' where key = 'early_report_threshold'");
      expect((await maturity(fresh)).maturity).toBe("new_release");
      await db.owner("update site_settings set value = '5' where key = 'early_report_threshold'");
      await db.owner("update site_settings set value = '30' where key = 'new_release_window_days'");
      expect((await maturity(fresh)).maturity).toBe("established");
      await db.owner("update site_settings set value = '120' where key = 'new_release_window_days'");
    });

    it("lists only published products", async () => {
      await db.owner("update products set catalog_status = 'draft' where id = $1", [undated]);
      expect(await db.as("anon", "select product_id from product_review_maturity where product_id = $1", [undated])).toEqual([]);
      await db.owner("update products set catalog_status = 'published' where id = $1", [undated]);
    });
  });

  describe("review alerts", () => {
    it("are private to their owner", async () => {
      await db.as(buyer, "insert into review_alerts (user_id, product_id, notify_on) values ($1, $2, 'first_published_review')", [buyer.id, product(0)]);
      expect((await db.as(buyer, "select id from review_alerts")).length).toBe(1);
      expect(await db.as(stranger, "select id from review_alerts")).toEqual([]);
      expect(await db.as("anon", "select id from review_alerts")).toEqual([]);
      await db.as(stranger, "delete from review_alerts where user_id = $1", [buyer.id]);
      expect((await db.owner("select id from review_alerts where user_id = $1", [buyer.id])).length).toBe(1);
    });

    it("cannot be created for someone else, and only once per bat and event", async () => {
      await expect(
        db.as(stranger, "insert into review_alerts (user_id, product_id, notify_on) values ($1, $2, 'first_listing')", [buyer.id, product(0)])
      ).rejects.toThrow(/row-level security/);
      await expect(
        db.as(buyer, "insert into review_alerts (user_id, product_id, notify_on) values ($1, $2, 'first_published_review')", [buyer.id, product(0)])
      ).rejects.toThrow(/duplicate key/);
      await db.as(buyer, "insert into review_alerts (user_id, product_id, notify_on) values ($1, $2, 'early_reports_threshold')", [buyer.id, product(0)]);
    });

    it("let members remove their own alerts", async () => {
      await db.as(buyer, "delete from review_alerts where notify_on = 'early_reports_threshold'");
      expect((await db.as(buyer, "select notify_on from review_alerts")).map((r) => r.notify_on)).toEqual(["first_published_review"]);
    });
  });
});
