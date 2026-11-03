// The optional "about how many hits" bat field (supabase/migrations/20261105000100_bat_hits.sql).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";
import { attributesSchema, coerceAttributes, parseAttributeSchema } from "@/lib/sell/attributes";

const available = await canConnect();
const suite = available ? describe : describe.skip;

suite("bat hits field", () => {
  const db = new TestDb();
  beforeAll(() => db.setup());
  afterAll(() => db.teardown());

  const schemaRow = async () => (await db.client.query("select attribute_schema from product_categories where slug = 'bats'")).rows[0].attribute_schema as Record<string, unknown>[];

  it("adds one optional approx_hits field to the bats schema, and only to bats", async () => {
    const fields = await schemaRow();
    const hits = fields.filter((f) => f.key === "approx_hits");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ label: "About how many hits?", type: "number", required: false, min: 0, max: 10000 });
    expect(String(hits[0].help)).toContain("150–200 hits");
    const others = (await db.client.query("select count(*)::int as n from product_categories where slug <> 'bats' and attribute_schema @> '[{\"key\":\"approx_hits\"}]'")).rows[0].n;
    expect(others).toBe(0);
  });

  it("is safe to run again and keeps the other fields", async () => {
    const before = await schemaRow();
    await db.client.query(readFileSync(join(__dirname, "..", "..", "supabase", "migrations", "20261105000100_bat_hits.sql"), "utf8"));
    const after = await schemaRow();
    expect(after).toEqual(before);
    expect(after.map((f) => f.key)).toEqual(expect.arrayContaining(["weight_oz", "certification", "weighting_type", "barrel_length_inches", "model_year"]));
  });

  it("is read by the app's validation straight from the database schema", async () => {
    const fields = parseAttributeSchema(await schemaRow());
    const schema = attributesSchema(fields);
    const base = { weight_oz: "26", certification: ["USSSA"], weighting_type: "endload", model_year: "2026" };
    expect(schema.safeParse(coerceAttributes(fields, base)).success).toBe(true);
    expect(schema.safeParse(coerceAttributes(fields, { ...base, approx_hits: "400" })).data).toMatchObject({ approx_hits: 400 });
    expect(schema.safeParse(coerceAttributes(fields, { ...base, approx_hits: "20000" })).success).toBe(false);
  });

  it("stores approx_hits in a listing's attributes and reads it back", async () => {
    const seller = await db.createUser({ username: "hitter" });
    const [cat] = (await db.client.query("select id from product_categories where slug = 'bats'")).rows;
    const [row] = await db.as<{ id: string }>(
      seller,
      "insert into equipment_listings (seller_id, category_id, title, attributes) values ($1, $2, '2026 Miken Freak Black', $3) returning id",
      [seller.id, cat.id, { weight_oz: 26, approx_hits: 400 }]
    );
    const [got] = await db.as<{ hits: number }>(seller, "select (attributes ->> 'approx_hits')::int as hits from equipment_listings where id = $1", [row.id]);
    expect(got.hits).toBe(400);
  });
});
