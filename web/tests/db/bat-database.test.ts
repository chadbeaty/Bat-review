// Database tests for the bat database migration and its generated seed: product lines, lineage links and notes,
// published reviews (public read, server-only writes), manufacturer warranty terms and the market summary view.
// Runs the real migrations and seeds on a throwaway Postgres database (see harness.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const suite = available ? describe : describe.skip;

const DATA = join(__dirname, "..", "..", "..", "data");
const json = (f: string) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
const { bats } = json("bats.json") as { bats: { id: string; family: string }[] };
const { families } = json("families.json") as { families: { id: string }[] };
const { entries } = json("lineage.json") as {
  entries: { bat_id: string; predecessor: { bat_id: string | null; name: string | null }; siblings: string[]; confidence: string }[];
};
const { reviews } = json("reviews.json") as { reviews: { id: string; bats: string[]; families: string[] }[] };

suite("bat database", () => {
  const db = new TestDb();
  let member: { id: string };
  let moderator: { id: string };

  beforeAll(async () => {
    await db.setup();
    member = await db.createUser({ username: "member_mo" });
    moderator = await db.createUser({ username: "mod_mia" });
    await db.owner("insert into user_roles (user_id, role) values ($1, 'moderator')", [moderator.id]);
  });
  afterAll(async () => {
    await db.teardown();
  });

  const count = async (sql: string, params: unknown[] = []) => Number((await db.owner<{ n: string }>(sql, params))[0].n);

  describe("seed integrity", () => {
    it("loads every product line and gives every bat its line", async () => {
      expect(await count("select count(*) n from product_lines")).toBe(families.length);
      const rows = await db.owner<{ slug: string; product_line_id: string | null }>("select slug, product_line_id from products");
      const lineBySlug = new Map(rows.map((r) => [r.slug, r.product_line_id]));
      for (const b of bats) expect(lineBySlug.get(b.id), b.id).toBe(b.family);
      expect(await count("select count(*) n from product_lines where manufacturer_id is null")).toBe(0);
    });

    it("links each in-catalog predecessor and sibling, unverified, with the file's confidence", async () => {
      const links = await db.owner<{ a: string; b: string; relation: string; confidence: string; verified: boolean; basis: string }>(
        `select pa.slug a, pb.slug b, l.relation, l.confidence, l.verified, l.basis
         from product_lineage l join products pa on pa.id = l.product_id join products pb on pb.id = l.related_product_id`
      );
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((l) => !l.verified && l.basis.length >= 3)).toBe(true);
      for (const e of entries.filter((x) => x.predecessor.bat_id)) {
        const link = links.find((l) => l.a === e.bat_id && l.b === e.predecessor.bat_id && l.relation === "predecessor");
        expect(link, e.bat_id).toBeDefined();
        expect(link!.confidence).toBe(e.confidence);
      }
      const pair = (x: string, y: string) => [x, y].sort().join("|");
      const siblingPairs = new Set(entries.flatMap((e) => e.siblings.map((s) => pair(e.bat_id, s))));
      const linkedPairs = new Set(links.filter((l) => l.relation !== "predecessor").map((l) => pair(l.a, l.b)));
      expect(linkedPairs).toEqual(siblingPairs);
    });

    it("stores lineage notes, including predecessors that aren't in the catalog", async () => {
      const notes = await db.owner<{ slug: string; lineage_note: Record<string, unknown> }>("select slug, lineage_note from products where lineage_note is not null");
      expect(notes).toHaveLength(entries.length);
      const bySlug = new Map(notes.map((n) => [n.slug, n.lineage_note]));
      for (const e of entries) {
        const n = bySlug.get(e.bat_id)!;
        expect(n.predecessor_name).toBe(e.predecessor.name);
        expect(n.predecessor_in_catalog).toBe(Boolean(e.predecessor.bat_id));
        expect(n.confidence).toBe(e.confidence);
        expect((n.changes as string[]).includes("unknown")).toBe(false);
      }
      expect(notes.filter((n) => n.lineage_note.predecessor_name && !n.lineage_note.predecessor_in_catalog).length).toBeGreaterThan(0);
    });

    it("loads every published review with links that resolve", async () => {
      expect(await count("select count(*) n from published_reviews")).toBe(reviews.length);
      const productLinks = await db.owner<{ key: string; slug: string }>(
        "select r.source_key key, p.slug from published_review_products x join published_reviews r on r.id = x.review_id join products p on p.id = x.product_id"
      );
      const lineLinks = await db.owner<{ key: string; line: string }>(
        "select r.source_key key, x.product_line_id line from published_review_lines x join published_reviews r on r.id = x.review_id"
      );
      expect(productLinks).toHaveLength(reviews.reduce((n, r) => n + r.bats.length, 0));
      expect(lineLinks).toHaveLength(reviews.reduce((n, r) => n + r.families.length, 0));
      for (const r of reviews) {
        for (const b of r.bats) expect(productLinks.some((l) => l.key === r.id && l.slug === b), `${r.id} → ${b}`).toBe(true);
        for (const f of r.families) expect(lineLinks.some((l) => l.key === r.id && l.line === f), `${r.id} → ${f}`).toBe(true);
      }
      expect(productLinks.some((l) => l.slug === "miken-kp23-maxload-usa-2026")).toBe(true);
    });

    it("records warranty terms only for brands documented in the research", async () => {
      const rows = await db.owner<{ slug: string; warranty_summary: string | null }>("select slug, warranty_summary from manufacturers order by slug");
      const w = new Map(rows.map((r) => [r.slug, r.warranty_summary]));
      for (const slug of ["easton", "miken", "worth"]) expect(w.get(slug)).toMatch(/one year.*one-time repair or replacement.*receipt/i);
      expect(w.get("demarini")).toMatch(/senior bats are excluded/i);
      expect(w.get("monsta")).toMatch(/without a manufacturer warranty/i);
      expect(rows.filter((r) => r.warranty_summary).map((r) => r.slug).sort()).toEqual(["demarini", "easton", "miken", "monsta", "worth"]);
    });

    it("writes no release dates without a documented source", async () => {
      expect(await count("select count(*) n from products where release_date is not null and release_date_source is null")).toBe(0);
    });

    it("can be applied again without duplicating anything", async () => {
      const before = await db.owner(
        "select (select count(*) from product_lineage) l, (select count(*) from published_reviews) r, (select count(*) from published_review_products) rp, (select count(*) from published_review_lines) rl, (select count(*) from product_lines) pl"
      );
      const root = join(__dirname, "..", "..", "supabase");
      await db.owner(readFileSync(join(root, "migrations", "20261102000300_bat_database.sql"), "utf8"));
      await db.owner(readFileSync(join(root, "seed", "bat-database.sql"), "utf8"));
      const after = await db.owner(
        "select (select count(*) from product_lineage) l, (select count(*) from published_reviews) r, (select count(*) from published_review_products) rp, (select count(*) from published_review_lines) rl, (select count(*) from product_lines) pl"
      );
      expect(after).toEqual(before);
    });
  });

  describe("published reviews: public read, server-only write", () => {
    it("visitors and members read reviews, links and lines", async () => {
      for (const actor of ["anon", member] as const) {
        expect((await db.as(actor, "select id from published_reviews")).length).toBe(reviews.length);
        expect((await db.as(actor, "select * from published_review_products")).length).toBeGreaterThan(0);
        expect((await db.as(actor, "select * from published_review_lines")).length).toBeGreaterThan(0);
        expect((await db.as(actor, "select * from product_lines")).length).toBe(families.length);
      }
    });

    it("hides hidden reviews and their links from the public, not from moderators", async () => {
      await db.owner("update published_reviews set status = 'hidden' where source_key = 'r032'");
      const visible = async (actor: "anon" | { id: string }) =>
        (await db.as(actor, "select source_key from published_reviews where source_key = 'r032'")).length;
      const links = async (actor: "anon" | { id: string }) =>
        (
          await db.as(
            actor,
            "select 1 from published_review_products x where x.review_id = (select id from published_reviews where source_key = 'r032')"
          )
        ).length;
      expect(await visible("anon")).toBe(0);
      expect(await visible(member)).toBe(0);
      expect(await visible(moderator)).toBe(1);
      expect(await links("anon")).toBe(0);
      await db.owner("update published_reviews set status = 'published' where source_key = 'r032'");
      expect(await visible("anon")).toBe(1);
    });

    it("hides links to unpublished models", async () => {
      await db.owner("update products set catalog_status = 'draft' where slug = 'miken-kp23-maxload-usa-2026'");
      const rows = await db.as("anon", "select 1 from published_review_products x join products p on p.id = x.product_id where p.slug = 'miken-kp23-maxload-usa-2026'");
      const viaJoinless = await db.as(
        "anon",
        "select 1 from published_review_products where product_id = (select id from products where slug = 'miken-kp23-maxload-usa-2026')"
      );
      await db.owner("update products set catalog_status = 'published' where slug = 'miken-kp23-maxload-usa-2026'");
      expect(rows).toHaveLength(0);
      expect(viaJoinless).toHaveLength(0);
    });

    it("blocks writes from visitors and members", async () => {
      const attempts = [
        "insert into published_reviews (kind, title, url, source) values ('site', 'My fake review', 'https://example.com', 'Me')",
        "update published_reviews set title = 'Changed' where source_key = 'r001'",
        "delete from published_reviews where source_key = 'r001'",
        "insert into published_review_products (review_id, product_id) select (select id from published_reviews limit 1), (select id from products limit 1 offset 50)",
        "delete from published_review_lines",
        "insert into product_lines (id, name) values ('fake-line', 'Fake')",
        "update product_lines set name = 'Changed'",
      ];
      for (const actor of ["anon", member] as const) {
        for (const sql of attempts) await expect(db.as(actor, sql), `${JSON.stringify(actor)}: ${sql}`).rejects.toThrow();
        // Catalog tables have no write policies, so these change nothing (or are refused outright).
        for (const sql of ["update products set lineage_note = '{}'::jsonb", "update manufacturers set warranty_summary = 'Lifetime warranty!'"]) {
          await db.as(actor, sql).catch(() => undefined);
        }
      }
      expect(await count("select count(*) n from products where lineage_note = '{}'::jsonb")).toBe(0);
      expect(await count("select count(*) n from published_reviews where title = 'Changed'")).toBe(0);
      expect(await count("select count(*) n from manufacturers where warranty_summary = 'Lifetime warranty!'")).toBe(0);
    });

    it("lets the server write", async () => {
      await db.as("service", "insert into published_reviews (source_key, kind, title, url, source) values ('t1', 'site', 'Server review', 'https://example.com/r', 'Example')");
      expect(await count("select count(*) n from published_reviews where source_key = 't1'")).toBe(1);
      await db.as("service", "delete from published_reviews where source_key = 't1'");
    });

    it("rejects malformed rows", async () => {
      await expect(db.owner("insert into published_reviews (kind, title, url, source) values ('ranking', 'Title here', 'https://x.com', 'Src')")).rejects.toThrow();
      await expect(db.owner("insert into published_reviews (kind, title, url, source) values ('site', 'Title here', 'javascript:alert(1)', 'Src')")).rejects.toThrow();
      await expect(db.owner("update manufacturers set warranty_source_url = 'ftp://x' where slug = 'miken'")).rejects.toThrow();
      await expect(db.owner("update products set lineage_note = '[]'::jsonb where slug = 'miken-kp23-maxload-usa-2026'")).rejects.toThrow();
    });
  });

  describe("market summary", () => {
    it("counts live listings and verified sales separately, per product", async () => {
      const [p] = await db.owner<{ id: string; category_id: string }>("select id, category_id from products where slug = 'easton-alpha-2pc-loaded-usssa-2026'");
      const seller = await db.createUser({ username: "seller_sam" });
      const listing = async (price: number, live: boolean) => {
        const [l] = await db.as<{ id: string }>(
          "service",
          `insert into equipment_listings (seller_id, product_id, category_id, title, asking_price_cents, condition_score, structural_disclosure,
             has_cracks, has_rattle, has_loose_end_cap, has_repairs, has_alterations, has_significant_damage, authenticity_declaration,
             ownership_declaration, shipping_weight_oz, package_length_inches, package_width_inches, package_height_inches, shipping_origin_postal_code)
           values ($1, $2, $3, 'Used Easton Alpha', $4, 8, 'no_known_damage', false, false, false, false, false, false, true, true, 48, 38, 5, 5, '37201')
           returning id`,
          [seller.id, p.id, p.category_id, price]
        );
        if (live) {
          await db.as("service", "insert into listing_images (listing_id, image_url) values ($1, 'https://example.com/a.jpg')", [l.id]);
          await db.as("service", "update equipment_listings set listing_status = 'active' where id = $1", [l.id]);
        }
      };
      await listing(20000, true);
      await listing(26000, true);
      await listing(99900, false); // a draft never counts

      await db.as(
        "service",
        `insert into price_history (product_id, sold_price_cents, sale_date, verified_transaction, data_source, source_reference)
         values ($1, 15000, '2026-08-01', true, 'licensed', 'test'), ($1, 17000, '2026-09-01', true, 'licensed', 'test'),
                ($1, 90000, '2026-09-02', false, 'licensed', 'unverified test row')`,
        [p.id]
      );

      const [row] = await db.as<Record<string, unknown>>("anon", "select * from product_market_summary where product_id = $1", [p.id]);
      expect(row).toMatchObject({
        active_listings: 2,
        asking_min_cents: 20000,
        asking_max_cents: 26000,
        asking_avg_cents: 23000,
        verified_sales: 2,
      });
      expect(String(row.first_sale_date)).toContain("2026");
      // No column ever blends asking and sold prices.
      expect(Object.keys(row).sort()).toEqual(
        ["active_listings", "asking_avg_cents", "asking_max_cents", "asking_min_cents", "first_sale_date", "last_sale_date", "product_id", "verified_sales"].sort()
      );

      const [other] = await db.as<Record<string, unknown>>(
        "anon",
        "select * from product_market_summary where product_id = (select id from products where slug = 'easton-alpha-2pc-loaded-usa-2026')"
      );
      expect(other).toMatchObject({ active_listings: 0, asking_min_cents: null, verified_sales: 0 });
    });

    it("covers published products only", async () => {
      await db.owner("update products set catalog_status = 'draft' where slug = 'easton-alpha-2pc-loaded-usa-2026'");
      const rows = await db.as("anon", "select 1 from product_market_summary where product_id = (select id from products where slug = 'easton-alpha-2pc-loaded-usa-2026')");
      await db.owner("update products set catalog_status = 'published' where slug = 'easton-alpha-2pc-loaded-usa-2026'");
      expect(rows).toHaveLength(0);
    });
  });
});
