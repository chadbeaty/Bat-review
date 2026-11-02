// Database tests for the admin migration: server-only admin functions, audit actors, fee history,
// settings validation, support messages and the email delivery log.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const suite = available ? describe : describe.skip;

suite("admin database functions", () => {
  const db = new TestDb();
  let admin: { id: string };
  let moderator: { id: string };
  let support: { id: string };
  let member: { id: string };
  let seller: { id: string };
  let batsCategory: string;

  const liveListing = async (owner: { id: string }) => {
    const [row] = await db.as<{ id: string }>(
      owner,
      `insert into equipment_listings (seller_id, category_id, title, asking_price_cents, condition_score, structural_disclosure,
        has_cracks, has_rattle, has_loose_end_cap, has_repairs, has_alterations, has_significant_damage,
        authenticity_declaration, ownership_declaration, shipping_weight_oz, package_length_inches, package_width_inches,
        package_height_inches, shipping_origin_postal_code)
       values ($1, $2, 'Admin test bat 26 oz', 20000, 8, 'no_known_damage', false, false, false, false, false, false,
        true, true, 48, 38, 5, 5, '37201') returning id`,
      [owner.id, batsCategory]
    );
    await db.as(owner, "insert into listing_images (listing_id, image_url, image_type) values ($1, 'https://img.test/1.jpg', 'full')", [row.id]);
    await db.as(owner, "update equipment_listings set listing_status = 'active' where id = $1", [row.id]);
    return row.id;
  };

  beforeAll(async () => {
    await db.setup();
    admin = await db.createUser();
    moderator = await db.createUser();
    support = await db.createUser();
    member = await db.createUser();
    seller = await db.createUser();
    await db.owner("insert into user_roles (user_id, role) values ($1, 'admin'), ($2, 'moderator'), ($3, 'support')", [
      admin.id,
      moderator.id,
      support.id,
    ]);
    [{ id: batsCategory }] = await db.owner<{ id: string }>("select id from product_categories where slug = 'bats'");
  });

  afterAll(async () => {
    await db.teardown();
  });

  describe("access", () => {
    it("keeps every admin function away from browsers", async () => {
      for (const actor of ["anon" as const, member, admin]) {
        await expect(db.as(actor, "select admin_overview()")).rejects.toThrow(/permission denied/);
        await expect(db.as(actor, "select admin_log($1, 'x.y', 'profile', null)", [admin.id])).rejects.toThrow(/permission denied/);
        await expect(db.as(actor, "select admin_set_role($1, $1, 'admin', true)", [admin.id])).rejects.toThrow(/permission denied/);
      }
    });

    it("refuses an actor without the right staff role", async () => {
      await expect(db.as("service", "select admin_log($1, 'test.action', 'profile', null)", [member.id])).rejects.toThrow(/Not allowed/);
      await expect(db.as("service", "select admin_set_role($1, $2, 'support', true)", [moderator.id, member.id])).rejects.toThrow(/Not allowed/);
      await expect(
        db.as("service", "select admin_update_setting($1, 'offer_expiry_hours', '24')", [moderator.id])
      ).rejects.toThrow(/Not allowed/);
    });

    it("refuses a suspended staff member", async () => {
      const staff = await db.createUser();
      await db.owner("insert into user_roles (user_id, role) values ($1, 'admin')", [staff.id]);
      await db.owner("update profiles set account_status = 'suspended' where id = $1", [staff.id]);
      await expect(db.as("service", "select admin_log($1, 'test.action', 'profile', null)", [staff.id])).rejects.toThrow(/Not allowed/);
    });

    it("writes audit entries with the staff member as the actor", async () => {
      const [{ admin_log: id }] = await db.as<{ admin_log: string }>("service", "select admin_log($1, 'test.action', 'profile', $2, '{\"a\":1}')", [
        support.id,
        member.id,
      ]);
      const [row] = await db.owner<{ actor_user_id: string; metadata: { a: number } }>("select actor_user_id, metadata from audit_logs where id = $1", [id]);
      expect(row.actor_user_id).toBe(support.id);
      expect(row.metadata.a).toBe(1);
    });
  });

  describe("members", () => {
    it("suspends and reactivates a member, audited", async () => {
      await db.as("service", "select admin_set_account_status($1, $2, 'suspended', 'spam')", [moderator.id, member.id]);
      expect((await db.owner("select account_status from profiles where id = $1", [member.id]))[0].account_status).toBe("suspended");
      await db.as("service", "select admin_set_account_status($1, $2, 'active', null)", [moderator.id, member.id]);
      const logs = await db.owner<{ action: string; actor_user_id: string }>(
        "select action, actor_user_id from audit_logs where entity_id = $1 and action like 'user.%' order by created_at",
        [member.id]
      );
      expect(logs.map((l) => l.action)).toEqual(["user.suspended", "user.reactivated"]);
      expect(logs.every((l) => l.actor_user_id === moderator.id)).toBe(true);
    });

    it("stops staff changing their own status, moderators changing admins, and moderators lifting bans", async () => {
      await expect(db.as("service", "select admin_set_account_status($1, $1, 'suspended')", [moderator.id])).rejects.toThrow(/your own/);
      await expect(db.as("service", "select admin_set_account_status($1, $2, 'suspended')", [moderator.id, admin.id])).rejects.toThrow(/another admin/);
      const target = await db.createUser();
      await db.as("service", "select admin_set_account_status($1, $2, 'banned', 'stolen bats')", [moderator.id, target.id]);
      await expect(db.as("service", "select admin_set_account_status($1, $2, 'active')", [moderator.id, target.id])).rejects.toThrow(/lift a ban/);
      await db.as("service", "select admin_set_account_status($1, $2, 'active')", [admin.id, target.id]);
    });

    it("grants and revokes roles, but an admin can't remove their own admin role", async () => {
      await db.as("service", "select admin_set_role($1, $2, 'support', true)", [admin.id, member.id]);
      expect(await db.owner("select role from user_roles where user_id = $1", [member.id])).toEqual([{ role: "support" }]);
      await db.as("service", "select admin_set_role($1, $2, 'support', false)", [admin.id, member.id]);
      expect(await db.owner("select role from user_roles where user_id = $1", [member.id])).toEqual([]);
      await expect(db.as("service", "select admin_set_role($1, $1, 'admin', false)", [admin.id])).rejects.toThrow(/your own admin/);
      const actions = await db.owner<{ action: string }>(
        "select action from audit_logs where entity_id = $1 and action like 'role.%' order by created_at",
        [member.id]
      );
      expect(actions.map((a) => a.action)).toEqual(["role.granted", "role.revoked"]);
    });
  });

  describe("listings", () => {
    it("removes a listing with a reason, notifies the seller and audits it", async () => {
      const id = await liveListing(seller);
      await expect(db.as("service", "select admin_remove_listing($1, $2, '')", [moderator.id, id])).rejects.toThrow(/reason/);
      await db.as("service", "select admin_remove_listing($1, $2, 'Counterfeit markings')", [moderator.id, id]);
      expect((await db.owner("select listing_status from equipment_listings where id = $1", [id]))[0].listing_status).toBe("removed");
      const notes = await db.as<{ title: string; message: string }>(seller, "select title, message from notifications where related_entity_id = $1", [id]);
      expect(notes).toHaveLength(1);
      expect(notes[0].message).toContain("Counterfeit markings");
      const [log] = await db.owner<{ metadata: { reason: string } }>(
        "select metadata from audit_logs where entity_id = $1 and action = 'listing.removed'",
        [id]
      );
      expect(log.metadata.reason).toBe("Counterfeit markings");
    });

    it("features an active listing until a future date and unfeatures it", async () => {
      const id = await liveListing(seller);
      await expect(db.as("service", "select admin_set_featured($1, $2, now() - interval '1 day')", [moderator.id, id])).rejects.toThrow(/future/);
      await db.as("service", "select admin_set_featured($1, $2, now() + interval '7 days')", [moderator.id, id]);
      expect((await db.owner("select featured from equipment_listings where id = $1", [id]))[0].featured).toBe(true);
      await db.as("service", "select admin_set_featured($1, $2, null)", [moderator.id, id]);
      const [row] = await db.owner("select featured, featured_until from equipment_listings where id = $1", [id]);
      expect(row).toEqual({ featured: false, featured_until: null });
    });
  });

  describe("reports and submissions", () => {
    it("needs notes to close a report and records who closed it", async () => {
      const [{ id }] = await db.as<{ id: string }>(
        member,
        "insert into reports (reporter_id, entity_type, entity_id, reason) values ($1, 'user', $2, 'spam') returning id",
        [member.id, seller.id]
      );
      await expect(db.as("service", "select admin_update_report($1, $2, 'dismissed', '')", [moderator.id, id])).rejects.toThrow(/notes/);
      await db.as("service", "select admin_update_report($1, $2, 'reviewing', null)", [moderator.id, id]);
      await db.as("service", "select admin_update_report($1, $2, 'dismissed', 'Not spam')", [moderator.id, id]);
      const [r] = await db.owner("select status, resolved_by, resolution_notes from reports where id = $1", [id]);
      expect(r).toEqual({ status: "dismissed", resolved_by: moderator.id, resolution_notes: "Not spam" });
    });

    it("approves a submission into a draft product with a bat spec, and rejects with notes", async () => {
      const [{ id }] = await db.as<{ id: string }>(
        member,
        "insert into product_submissions (submitted_by, category_id, manufacturer_name, model_name, model_year) values ($1, $2, 'Miken', 'Test Model', 2027) returning id",
        [member.id, batsCategory]
      );
      const [{ admin_review_submission: productId }] = await db.as<{ admin_review_submission: string }>(
        "service",
        "select admin_review_submission($1, $2, true, 'Looks right', $3, $4)",
        [
          moderator.id,
          id,
          { product_name: "2027 Miken Test Model", slug: "miken-test-model-2027-admin" },
          { weight_oz: 26, weighting_type: "endload" },
        ]
      );
      const [p] = await db.owner("select catalog_status, model_year from products where id = $1", [productId]);
      expect(p).toEqual({ catalog_status: "draft", model_year: 2027 });
      expect(await db.owner("select weighting_type from bat_specifications where product_id = $1", [productId])).toEqual([{ weighting_type: "endload" }]);
      const [s] = await db.owner("select status, created_product_id from product_submissions where id = $1", [id]);
      expect(s).toEqual({ status: "approved", created_product_id: productId });
      await expect(db.as("service", "select admin_review_submission($1, $2, false, 'again')", [moderator.id, id])).rejects.toThrow(/already reviewed/);

      const [{ id: second }] = await db.as<{ id: string }>(
        member,
        "insert into product_submissions (submitted_by, category_id, model_name) values ($1, $2, 'Duplicate') returning id",
        [member.id, batsCategory]
      );
      await expect(db.as("service", "select admin_review_submission($1, $2, false, '')", [moderator.id, second])).rejects.toThrow(/note/);
      await db.as("service", "select admin_review_submission($1, $2, false, 'Already in the catalog')", [moderator.id, second]);
      expect((await db.owner("select status from product_submissions where id = $1", [second]))[0].status).toBe("rejected");
    });
  });

  describe("fees", () => {
    it("never edits a fee that has taken effect", async () => {
      await expect(db.owner("update fee_configuration set fee_value = 5 where fee_name = 'seller_commission'")).rejects.toThrow(/cannot be edited/);
      await db.owner("update fee_configuration set description = 'Commission on the item price' where fee_name = 'seller_commission'");
    });

    it("creates a new version that takes over now and retires the old one, audited with the admin as actor", async () => {
      const [{ id: oldId }] = await db.owner<{ id: string }>("select id from current_fee('seller_commission')");
      const [{ ts }] = await db.owner<{ ts: Date }>("select clock_timestamp() as ts");
      const [{ admin_create_fee_version: newId }] = await db.as<{ admin_create_fee_version: string }>(
        "service",
        "select admin_create_fee_version($1, 'seller_commission', 'percentage', 8, 'Test change', null)",
        [admin.id]
      );
      const [current] = await db.owner<{ id: string; fee_value: string }>("select id, fee_value from current_fee('seller_commission')");
      expect(current.id).toBe(newId);
      expect(Number(current.fee_value)).toBe(8);
      expect((await db.owner("select active from fee_configuration where id = $1", [oldId]))[0].active).toBe(false);
      const logs = await db.owner<{ actor_user_id: string }>(
        "select actor_user_id from audit_logs where entity_type = 'fee_configuration' and entity_id in ($1, $2) and created_at >= $3",
        [oldId, newId, ts]
      );
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.every((l) => l.actor_user_id === admin.id)).toBe(true);
    });

    it("schedules a future version without changing today's fee, and can cancel it before it starts", async () => {
      const [{ id: before }] = await db.owner<{ id: string }>("select id from current_fee('featured_listing')");
      const [{ admin_create_fee_version: future }] = await db.as<{ admin_create_fee_version: string }>(
        "service",
        "select admin_create_fee_version($1, 'featured_listing', 'fixed_cents', 499, null, now() + interval '30 days')",
        [admin.id]
      );
      expect((await db.owner<{ id: string }>("select id from current_fee('featured_listing')"))[0].id).toBe(before);
      expect((await db.owner("select active from fee_configuration where id = $1", [before]))[0].active).toBe(true);
      await db.as("service", "select admin_cancel_fee_version($1, $2)", [admin.id, future]);
      await expect(db.as("service", "select admin_cancel_fee_version($1, $2)", [admin.id, before])).rejects.toThrow(/has not started/);
    });

    it("rejects backdated and invalid versions", async () => {
      await expect(
        db.as("service", "select admin_create_fee_version($1, 'seller_commission', 'percentage', 7, null, now() - interval '1 day')", [admin.id])
      ).rejects.toThrow(/past/);
      await expect(db.as("service", "select admin_create_fee_version($1, 'seller_commission', 'percentage', 150, null, null)", [admin.id])).rejects.toThrow(
        /check constraint/
      );
    });
  });

  describe("settings", () => {
    it("validates types and ranges for known keys", async () => {
      await expect(db.owner("update site_settings set value = '\"48\"' where key = 'offer_expiry_hours'")).rejects.toThrow(/whole number/);
      await expect(db.owner("update site_settings set value = '2.5' where key = 'offer_expiry_hours'")).rejects.toThrow(/whole number/);
      await expect(db.owner("update site_settings set value = '0' where key = 'listing_expiry_days'")).rejects.toThrow(/from 1 to 365/);
      await expect(db.owner("update site_settings set value = '1' where key = 'featured_listings_enabled'")).rejects.toThrow(/true or false/);
      await expect(db.owner("update site_settings set value = '3' where key = 'price_guide_full_sales'")).rejects.toThrow(/below the minimum/);
    });

    it("updates a setting through the admin function and records the admin", async () => {
      await db.as("service", "select admin_update_setting($1, 'offer_expiry_hours', '24')", [admin.id]);
      const [row] = await db.owner("select value, updated_by from site_settings where key = 'offer_expiry_hours'");
      expect(row).toEqual({ value: 24, updated_by: admin.id });
      const [log] = await db.owner<{ actor_user_id: string; metadata: { key: string } }>(
        "select actor_user_id, metadata from audit_logs where entity_type = 'site_settings' order by created_at desc limit 1"
      );
      expect(log.actor_user_id).toBe(admin.id);
      expect(log.metadata.key).toBe("offer_expiry_hours");
      await expect(db.as("service", "select admin_update_setting($1, 'no_such_key', '1')", [admin.id])).rejects.toThrow(/Unknown setting/);
    });
  });

  describe("overview", () => {
    it("counts from real tables", async () => {
      const [{ admin_overview: o }] = await db.as<{ admin_overview: Record<string, unknown> }>("service", "select admin_overview()");
      expect(Number(o.active_listings)).toBeGreaterThanOrEqual(1);
      expect(Number(o.active_sellers)).toBe(1);
      expect(Number(o.gmv_cents)).toBe(0);
      expect(Array.isArray(o.listings_by_category)).toBe(true);
    });
  });

  describe("support messages", () => {
    it("lets members send messages, rate-limited, and only support reads them all", async () => {
      const sender = await db.createUser();
      await expect(
        db.as(member, "insert into support_messages (user_id, topic, subject, body) values ($1, 'other', 'Hello there', 'A question about the site')", [sender.id])
      ).rejects.toThrow(/row-level security/);
      for (let i = 0; i < 5; i++) {
        await db.as(sender, "insert into support_messages (user_id, topic, subject, body) values ($1, 'other', 'Hello there', 'A question about the site')", [
          sender.id,
        ]);
      }
      await expect(
        db.as(sender, "insert into support_messages (user_id, topic, subject, body) values ($1, 'other', 'Hello there', 'A question about the site')", [sender.id])
      ).rejects.toThrow(/several messages/);
      await expect(
        db.as("anon", "insert into support_messages (user_id, topic, subject, body) values ($1, 'other', 'Hello there', 'A question about the site')", [sender.id])
      ).rejects.toThrow();
      expect(await db.as(member, "select id from support_messages where user_id = $1", [sender.id])).toEqual([]);
      expect(await db.as(sender, "select id from support_messages")).toHaveLength(5);
      expect(await db.as(support, "select id from support_messages where user_id = $1", [sender.id])).toHaveLength(5);
      await expect(db.as(sender, "update support_messages set status = 'closed'")).rejects.toThrow(/permission denied/);
      const [{ id }] = await db.as<{ id: string }>(sender, "select id from support_messages limit 1");
      await db.as("service", "select admin_close_support_message($1, $2, true)", [support.id, id]);
      expect((await db.owner("select status from support_messages where id = $1", [id]))[0].status).toBe("closed");
    });

    it("keeps audit entries when a staff member's account is deleted, clearing only the actor", async () => {
      const staff = await db.createUser();
      await db.owner("insert into user_roles (user_id, role) values ($1, 'support')", [staff.id]);
      const [{ admin_log: id }] = await db.as<{ admin_log: string }>("service", "select admin_log($1, 'test.deleted_actor', 'profile', null)", [staff.id]);
      await expect(db.owner("update audit_logs set actor_user_id = null where id = $1", [id])).rejects.toThrow(/cannot be changed/);
      await db.owner("delete from auth.users where id = $1", [staff.id]);
      const [row] = await db.owner("select actor_user_id, action from audit_logs where id = $1", [id]);
      expect(row).toEqual({ actor_user_id: null, action: "test.deleted_actor" });
    });

    it("hides the email delivery log from browsers", async () => {
      await db.as("service", "insert into email_deliveries (template, category, to_email, subject, provider, status) values ('welcome', 'transactional', 'a@b.co', 'Hi', 'dev', 'not_sent')");
      await expect(db.as(admin, "select * from email_deliveries")).rejects.toThrow(/permission denied/);
      expect(await db.as("service", "select id from email_deliveries")).toHaveLength(1);
    });
  });
});
