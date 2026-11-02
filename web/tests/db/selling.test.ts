// Rules added for the listing flow (supabase/migrations/20261102000200_selling.sql).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const suite = available ? describe : describe.skip;

suite("selling rules", () => {
  const db = new TestDb();
  let seller: { id: string };
  let other: { id: string };
  let bats: string;

  const ready = {
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
    package_length_inches: 36,
    package_width_inches: 5,
    package_height_inches: 5,
    shipping_origin_postal_code: "37201",
  };

  const draft = async (extra: Record<string, unknown> = {}) => {
    const fields: Record<string, unknown> = { category_id: bats, title: "2026 Miken Freak Black", ...extra };
    const keys = Object.keys(fields);
    const [row] = await db.as<{ id: string }>(
      seller,
      `insert into equipment_listings (seller_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
      [seller.id, ...Object.values(fields)]
    );
    return row.id;
  };

  const addPhoto = (listingId: string, path: string | null) =>
    db.as(seller, "insert into listing_images (listing_id, image_url, storage_path, image_type) values ($1, 'https://img.test/x.jpg', $2, 'full')", [
      listingId,
      path,
    ]);

  beforeAll(async () => {
    await db.setup();
    seller = await db.createUser({ username: "seller_one" });
    other = await db.createUser({ username: "other_one" });
    [{ id: bats }] = await db.owner<{ id: string }>("select id from product_categories where slug = 'bats'");
  });
  afterAll(() => db.teardown());

  it("saves a draft without a price", async () => {
    const id = await draft();
    const [row] = await db.as<{ asking_price_cents: number | null; listing_status: string }>(
      seller,
      "select asking_price_cents, listing_status from equipment_listings where id = $1",
      [id]
    );
    expect(row).toEqual({ asking_price_cents: null, listing_status: "draft" });
  });

  it("won't publish without a price, with a plain message", async () => {
    const id = await draft(ready);
    await addPhoto(id, `${seller.id}/${id}/a.jpg`);
    await expect(db.as(seller, "update equipment_listings set listing_status = 'active' where id = $1", [id])).rejects.toThrow(
      "Set an asking price before publishing"
    );
    await db.as(seller, "update equipment_listings set asking_price_cents = 15000, listing_status = 'active' where id = $1", [id]);
  });

  it("doesn't let a priceless listing leave draft even from the server", async () => {
    const id = await draft();
    await expect(db.owner("update equipment_listings set listing_status = 'removed' where id = $1", [id])).rejects.toThrow();
  });

  it("keeps photos in the seller's own listing folder", async () => {
    const id = await draft();
    await expect(addPhoto(id, `${other.id}/${id}/a.jpg`)).rejects.toThrow("own listing folder");
    await expect(addPhoto(id, `${seller.id}/someone-else/a.jpg`)).rejects.toThrow("own listing folder");
    await expect(addPhoto(id, `${seller.id}/${id}/../../x.jpg`)).rejects.toThrow("own listing folder");
    await addPhoto(id, `${seller.id}/${id}/ok-1.jpg`);
    await addPhoto(id, null);
  });

  it("allows at most 12 photos", async () => {
    const id = await draft();
    for (let i = 0; i < 12; i++) await addPhoto(id, `${seller.id}/${id}/p${i}.jpg`);
    await expect(addPhoto(id, `${seller.id}/${id}/p12.jpg`)).rejects.toThrow("up to 12 photos");
  });

  it("keeps the last photo on a live listing, but not on a draft", async () => {
    const live = await draft({ ...ready, asking_price_cents: 20000 });
    await addPhoto(live, `${seller.id}/${live}/a.jpg`);
    await addPhoto(live, `${seller.id}/${live}/b.jpg`);
    await db.as(seller, "update equipment_listings set listing_status = 'active' where id = $1", [live]);
    const photos = await db.as<{ id: string }>(seller, "select id from listing_images where listing_id = $1 order by storage_path", [live]);
    await db.as(seller, "delete from listing_images where id = $1", [photos[0].id]);
    await expect(db.as(seller, "delete from listing_images where id = $1", [photos[1].id])).rejects.toThrow("at least one photo");

    const d = await draft();
    await addPhoto(d, `${seller.id}/${d}/a.jpg`);
    await db.as(seller, "delete from listing_images where listing_id = $1", [d]);
    // Deleting a draft removes its photos with it.
    await addPhoto(d, `${seller.id}/${d}/b.jpg`);
    await db.as(seller, "delete from equipment_listings where id = $1", [d]);
  });

  it("is safe to run again", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sql = readFileSync(join(__dirname, "..", "..", "supabase", "migrations", "20261102000200_selling.sql"), "utf8");
    await db.owner(sql);
    await db.owner(sql);
  });
});
