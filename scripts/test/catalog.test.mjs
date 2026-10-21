import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankBats } from "../../assets/js/finder.js";

const { bats } = JSON.parse(readFileSync(new URL("../../data/bats.json", import.meta.url)));
const { families } = JSON.parse(readFileSync(new URL("../../data/families.json", import.meta.url)));
const familyIds = new Set(families.map((f) => f.id));

test("catalog entries are complete and consistent", () => {
  const ids = new Set();
  for (const b of bats) {
    assert.ok(!ids.has(b.id), `duplicate id ${b.id}`);
    ids.add(b.id);
    assert.match(b.id, /^[a-z0-9-]+$/, `id must be a bare token: ${b.id}`);
    assert.ok(familyIds.has(b.family), `${b.id} has unknown family ${b.family}`);
    assert.ok(b.stamps.length && b.stamps.every((s) => ["USSSA", "USA", "NSA", "ISA", "SSUSA"].includes(s)), `${b.id} stamps`);
    assert.ok(["1pc", "2pc"].includes(b.build), `${b.id} build`);
    assert.ok(["composite", "alloy", "wood-composite", "hybrid"].includes(b.material), `${b.id} material`);
    assert.ok(b.load === null || ["balanced", "endload", "heavy"].includes(b.load), `${b.id} load`);
    if (b.source) assert.doesNotThrow(() => new URL(b.source), `${b.id} source`);
  }
});

test("every family is used by at least one bat", () => {
  const used = new Set(bats.map((b) => b.family));
  for (const f of families) assert.ok(used.has(f.id), `family ${f.id} has no bats`);
});

const prepared = bats.map((b) => ({
  ...b,
  dual: b.stamps.includes("USA") && b.stamps.includes("USSSA"),
  effectivePrice: b.salePrice ?? b.price ?? null,
  score: null,
  mentions: 0,
}));

test("finder only suggests legal bats", () => {
  const usa = rankBats(prepared, { league: "USA", hitter: "power", feel: "any", budget: "any", priority: "pop" }, 50);
  assert.ok(usa.length > 0);
  assert.ok(usa.every((r) => r.bat.stamps.includes("USA")));
  const unsure = rankBats(prepared, { league: "UNSURE", hitter: "gap", feel: "any", budget: "any", priority: "balance" }, 50);
  assert.ok(unsure.every((r) => r.bat.dual));
});

test("finder respects budget and durability", () => {
  const cheap = rankBats(prepared, { league: "USSSA", hitter: "contact", feel: "any", budget: "150", priority: "durability" });
  assert.ok(cheap.length > 0);
  assert.ok(cheap.every((r) => r.bat.effectivePrice == null || r.bat.effectivePrice <= 150));
  assert.notEqual(cheap[0].bat.material, "composite");
});

test("finder power picks favor end-loaded bats", () => {
  const power = rankBats(prepared, { league: "USSSA", hitter: "power", feel: "2pc", budget: "any", priority: "pop" });
  assert.ok(power.slice(0, 5).every((r) => r.bat.load !== "balanced"));
});
