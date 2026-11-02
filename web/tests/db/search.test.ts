// Database tests for the shop search (supabase/migrations/20261102000100_shop_search.sql). They run on a
// throwaway database built from the real migrations and seeds, calling the functions as a visitor would.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";
import { normalizeSearchText, parseSearchParams, searchRpcArgs } from "@/lib/search";

const available = await canConnect();
const suite = available ? describe : describe.skip;

type Row = { id: string; title: string; asking_price_cents: number; total_count: string };

suite("shop search", () => {
  const db = new TestDb();
  let seller: { id: string };
  let other: { id: string };
  let bats: string;
  let gloves: string;
  const ids: Record<string, string> = {};

  const product = async (slug: string) =>
    (await db.owner<{ id: string; manufacturer_id: string }>("select id, manufacturer_id from products where slug = $1", [slug]))[0];

  const listing = async (
    owner: { id: string },
    opts: { title: string; price: number; attributes?: object; productSlug?: string; category?: string; condition?: number; state?: string; live?: boolean; description?: string }
  ) => {
    const p = opts.productSlug ? await product(opts.productSlug) : null;
    const [row] = await db.as<{ id: string }>(
      owner,
      `insert into equipment_listings (seller_id, product_id, manufacturer_id, category_id, title, description, attributes, asking_price_cents,
         condition_score, structural_disclosure, has_cracks, has_rattle, has_loose_end_cap, has_repairs, has_alterations, has_significant_damage,
         authenticity_declaration, ownership_declaration, shipping_weight_oz, package_length_inches, package_width_inches, package_height_inches,
         shipping_origin_postal_code, location_city, location_state)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'no_known_damage', false, false, false, false, false, false, true, true, 48, 38, 5, 5, '37201', 'Nashville', $10)
       returning id`,
      [
        owner.id,
        p?.id ?? null,
        p?.manufacturer_id ?? null,
        opts.category ?? bats,
        opts.title,
        opts.description ?? null,
        opts.attributes ?? {},
        opts.price,
        opts.condition ?? 8,
        opts.state ?? "TN",
      ]
    );
    if (opts.live !== false) {
      await db.as(owner, "insert into listing_images (listing_id, image_url, image_type) values ($1, 'https://img.test/1.jpg', 'full')", [row.id]);
      await db.as(owner, "update equipment_listings set listing_status = 'active' where id = $1", [row.id]);
    }
    return row.id;
  };

  const search = async (actor: "anon" | { id: string }, params: Record<string, string | string[]>, scope: { category?: string; sellerId?: string } = {}) => {
    const args = searchRpcArgs(parseSearchParams(params), scope);
    const keys = Object.keys(args);
    const rows = await db.as<Row>(
      actor,
      `select * from search_listings(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`,
      keys.map((k) => {
        const v = (args as Record<string, unknown>)[k];
        return v != null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
      })
    );
    return rows;
  };
  const titles = (rows: Row[]) => rows.map((r) => r.title).sort();

  beforeAll(async () => {
    await db.setup();
    seller = await db.createUser({ username: "search_seller" });
    other = await db.createUser({ username: "other_seller" });
    bats = (await db.owner<{ id: string }>("select id from product_categories where slug = 'bats'"))[0].id;
    gloves = (await db.owner<{ id: string }>("select id from product_categories where slug = 'gloves'"))[0].id;

    ids.freak = await listing(seller, {
      title: "Miken Freak Black Maxload 26 oz",
      price: 22000,
      productSlug: "miken-freak-black-maxload-usssa-2026",
      attributes: { weight_oz: 26, certification: ["USSSA"], weighting_type: "endload", model_year: 2026 },
      condition: 9,
    });
    ids.tantrum = await listing(seller, {
      title: "Easton bat, great pop",
      price: 15000,
      productSlug: "easton-tantrum-1pc-balanced-usa-2026",
      attributes: { weight_oz: 27, certification: ["USA"], weighting_type: "balanced", construction_type: "one_piece", model_year: 2026 },
      condition: 7,
      state: "TX",
    });
    ids.demarini = await listing(other, {
      title: "DeMarini Flipper 28 oz end-loaded",
      price: 30000,
      productSlug: "demarini-flipper-usa-2027",
      attributes: { weight_oz: 28, certification: ["USSSA", "NSA"], weighting_type: "endload" },
      condition: 10,
    });
    ids.glove = await listing(other, {
      title: "Left-hand outfield glove 13 inch",
      price: 6000,
      category: gloves,
      attributes: { size_inches: 13, throwing_hand: "left", position: "outfield" },
    });
    ids.draft = await listing(seller, { title: "Secret draft Freak listing", price: 10000, live: false });
  });

  afterAll(async () => {
    await db.teardown();
  });

  it("keeps the SQL normalizer in step with the TypeScript one", async () => {
    const samples = ["End-Loaded ASA bat", "one piece 2-PIECE 1pc", "Miken \"Freak\" 26.5 oz!", "mid loaded, single-piece", "nasa asap"];
    for (const s of samples) {
      const [row] = await db.owner<{ n: string }>("select search_normalize($1) as n", [s]);
      expect(row.n).toBe(normalizeSearchText(s));
    }
  });

  it("returns only active listings, never drafts, even to their seller", async () => {
    const anonRows = await search("anon", {});
    expect(anonRows.map((r) => r.id)).not.toContain(ids.draft);
    expect(anonRows).toHaveLength(4);
    const own = await search(seller, { q: "secret draft" });
    expect(own).toHaveLength(0);
  });

  it("finds partial words, catalog names, manufacturer aliases and misspellings", async () => {
    expect(titles(await search("anon", { q: "fre" }))).toEqual(["Miken Freak Black Maxload 26 oz"]);
    // The title doesn't say Tantrum; the catalog product does.
    expect(titles(await search("anon", { q: "tantrum" }))).toEqual(["Easton bat, great pop"]);
    expect(titles(await search("anon", { q: "tantrm" }))).toEqual(["Easton bat, great pop"]);
    expect(titles(await search("anon", { q: "demarni" }))).toEqual(["DeMarini Flipper 28 oz end-loaded"]);
    expect(titles(await search("anon", { q: "mikn freak" }))).toEqual(["Miken Freak Black Maxload 26 oz"]);
    expect(await search("anon", { q: "zzqxv" })).toHaveLength(0);
  });

  it("matches softball terms however they are written", async () => {
    const endloaded = ["DeMarini Flipper 28 oz end-loaded", "Miken Freak Black Maxload 26 oz"];
    expect(titles(await search("anon", { q: "endloaded" }))).toEqual(endloaded);
    expect(titles(await search("anon", { q: "end load" }))).toEqual(endloaded);
    expect(titles(await search("anon", { q: "ASA" }))).toEqual(["Easton bat, great pop"]);
    expect(titles(await search("anon", { q: "one-piece" }))).toEqual(["Easton bat, great pop"]);
  });

  it("combines filters", async () => {
    expect(titles(await search("anon", { weight: "26" }))).toEqual(["Miken Freak Black Maxload 26 oz"]);
    expect(titles(await search("anon", { weight: ["26", "28"], stamp: "NSA" }))).toEqual(["DeMarini Flipper 28 oz end-loaded"]);
    expect(titles(await search("anon", { stamp: "USSSA", max: "250" }))).toEqual(["Miken Freak Black Maxload 26 oz"]);
    expect(titles(await search("anon", { min: "100", max: "250" }))).toEqual(["Easton bat, great pop", "Miken Freak Black Maxload 26 oz"]);
    expect(titles(await search("anon", { condition: "9", load: "endload" }))).toEqual(endloadedTitles());
    expect(titles(await search("anon", { state: "TX" }))).toEqual(["Easton bat, great pop"]);
    expect(titles(await search("anon", { brand: "miken" }))).toEqual(["Miken Freak Black Maxload 26 oz"]);
    expect(titles(await search("anon", { model: "demarini-flipper-usa-2027" }))).toEqual(["DeMarini Flipper 28 oz end-loaded"]);
    expect(titles(await search("anon", { year: "2026", load: "balanced" }))).toEqual(["Easton bat, great pop"]);
    expect(titles(await search("anon", {}, { category: "gloves" }))).toEqual(["Left-hand outfield glove 13 inch"]);
    expect(titles(await search("anon", {}, { sellerId: other.id }))).toEqual(["DeMarini Flipper 28 oz end-loaded", "Left-hand outfield glove 13 inch"]);
  });

  function endloadedTitles() {
    return ["DeMarini Flipper 28 oz end-loaded", "Miken Freak Black Maxload 26 oz"];
  }

  it("filters on category attributes", async () => {
    const args = searchRpcArgs(parseSearchParams({ "a.throwing_hand": "left" }, { attributeKeys: ["throwing_hand"] }), { category: "gloves" });
    const rows = await db.as<Row>("anon", "select * from search_listings(p_category => $1, p_attributes => $2)", [args.p_category, JSON.stringify(args.p_attributes)]);
    expect(rows.map((r) => r.title)).toEqual(["Left-hand outfield glove 13 inch"]);
    const none = await db.as<Row>("anon", "select * from search_listings(p_attributes => $1)", [JSON.stringify({ throwing_hand: ["right"] })]);
    expect(none).toHaveLength(0);
  });

  it("filters on seller rating from published reviews", async () => {
    expect(await search("anon", { rating: "4" })).toHaveLength(0);
  });

  it("sorts and paginates with a total count", async () => {
    const asc = await search("anon", { sort: "price_asc" });
    expect(asc.map((r) => r.asking_price_cents)).toEqual([6000, 15000, 22000, 30000]);
    const desc = await search("anon", { sort: "price_desc" });
    expect(desc[0].asking_price_cents).toBe(30000);
    const byCondition = await search("anon", { sort: "condition" }, { category: "bats" });
    expect(byCondition[0].title).toBe("DeMarini Flipper 28 oz end-loaded");
    const page = await db.as<Row>("anon", "select * from search_listings(p_sort => 'price_asc', p_limit => 2, p_offset => 2)");
    expect(page.map((r) => r.asking_price_cents)).toEqual([22000, 30000]);
    expect(Number(page[0].total_count)).toBe(4);
  });

  it("hides listings of banned sellers and sold listings", async () => {
    const banned = await db.createUser({ username: "banned_seller" });
    const id = await listing(banned, { title: "Banned seller Freak", price: 9000 });
    expect((await search("anon", { q: "banned" })).map((r) => r.id)).toEqual([id]);
    await db.owner("update profiles set account_status = 'banned' where id = $1", [banned.id]);
    expect(await search("anon", { q: "banned" })).toHaveLength(0);
    await db.owner("update profiles set account_status = 'active' where id = $1", [banned.id]);
    await db.owner("update equipment_listings set listing_status = 'sold' where id = $1", [id]);
    expect(await search("anon", { q: "banned" })).toHaveLength(0);
  });

  it("suggests spellings and catalog models", async () => {
    const spelling = await db.as<{ term: string; suggestion: string }>("anon", "select * from search_spelling($1)", [["tantrm", "demarni", "freak", "26"]]);
    expect(Object.fromEntries(spelling.map((s) => [s.term, s.suggestion]))).toEqual({ tantrm: "tantrum", demarni: "demarini" });
    const models = await db.as<{ suggestion: string }>("anon", "select * from search_suggestions('tantrm', 3)");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.suggestion.includes("Tantrum"))).toBe(true);
  });

  it("counts facets of live listings only", async () => {
    const facets = await db.as<{ facet: string; value: string; listings: string }>("anon", "select * from search_listing_facets('bats')");
    const weights = facets.filter((f) => f.facet === "weight").map((f) => [f.value, Number(f.listings)]);
    expect(Object.fromEntries(weights)).toEqual({ "26": 1, "27": 1, "28": 1 });
  });

  it("lets only the server count views", async () => {
    await expect(db.as("anon", "select increment_listing_views($1)", [ids.freak])).rejects.toThrow(/permission denied/);
    await expect(db.as(seller, "select increment_listing_views($1)", [ids.freak])).rejects.toThrow(/permission denied/);
    const [row] = await db.as<{ increment_listing_views: number }>("service", "select increment_listing_views($1)", [ids.freak]);
    expect(row.increment_listing_views).toBe(1);
    const [draft] = await db.as<{ increment_listing_views: number | null }>("service", "select increment_listing_views($1)", [ids.draft]);
    expect(draft.increment_listing_views).toBeNull();
  });
});
