import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAN, chivoLine, wordmark } from "@/brand/geometry";
import { brandFiles } from "@/brand/svg";

const DIR = join(__dirname, "../../public/brand");

describe("Gapper brand assets", () => {
  it("public/brand matches the logo geometry (run with UPDATE_BRAND=1 to regenerate)", () => {
    const files = brandFiles();
    if (process.env.UPDATE_BRAND) {
      mkdirSync(DIR, { recursive: true });
      for (const [name, svg] of Object.entries(files)) writeFileSync(join(DIR, name), `${svg}\n`);
    }
    for (const [name, svg] of Object.entries(files)) {
      const path = join(DIR, name);
      expect(existsSync(path), `${name} is missing; run UPDATE_BRAND=1 npx vitest run tests/unit/brand.test.ts`).toBe(true);
      expect(readFileSync(path, "utf8").trim(), `${name} is stale; regenerate it`).toBe(svg);
    }
  });

  it("the wordmark is six drawn letters leaning forward, straight lines only", () => {
    const w = wordmark();
    expect(w.w).toBeGreaterThan(450);
    expect(LEAN).toBeGreaterThan(0.1);
    // Polygons only: the lean is an exact shear, so no arcs or curves may sneak in.
    expect(w.paths.join("")).toMatch(/^[ML0-9.\s-Z]+$/);
  });

  it("taglines are baked Chivo outlines, not live text", () => {
    const t = chivoLine("OWN THE GAPS");
    expect(t.w).toBeGreaterThan(600);
    expect(t.paths.join("")).toMatch(/^[MLQZ0-9.\s-]+$/); // path commands only, no live text
    expect(() => chivoLine("é")).toThrow();
  });
});

describe("Gapper emblem", () => {
  it("the Gap Mark is four outfield blocks with three gaps, the ball out past the wall through the wide one", async () => {
    const { gapMark, gapAngles, MARK_GEOM } = await import("@/brand/emblem");
    const m = gapMark();
    expect(m.shapes.map((s) => s.role)).toEqual(["ink", "accent", "accent"]);
    const ink = m.shapes[0].d;
    // Four blocks (each with an outer and an inner arc) plus two splinters.
    expect((ink.match(/A/g) ?? []).length).toBe(8);
    expect(gapAngles()).toHaveLength(3);
    const g = MARK_GEOM;
    expect(g.ballAt - g.ballR).toBeGreaterThan(g.rOut); // the ball clears the wall
    expect(g.breakW).toBeGreaterThan(g.gapW * 2); // the gap it broke through reads wider than the other two
    expect(g.breakW).toBeGreaterThan(g.ballR * 1.2);
    // Everything fits the 200-unit box.
    const nums = [...m.shapes.map((s) => s.d).join(" ").matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((x) => [Number(x[1]), Number(x[2])]);
    for (const [x, y] of nums) {
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(201);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200);
    }
  });

  it("the bag tag is a badge (ground, keyline, art) with a grommet hole punched through it", async () => {
    const { crest } = await import("@/brand/emblem");
    const c = crest();
    const roles = new Set(c.shapes.map((s) => s.role));
    expect([...roles].sort()).toEqual(["accent", "ground", "ink"]);
    const ground = c.shapes.find((s) => s.role === "ground")!.d;
    expect((ground.match(/M/g) ?? []).length).toBe(2); // the tag and the hole
  });

  it("every colorway renders, and one-color badges knock the art out with masks", async () => {
    const { artSvg } = await import("@/brand/svg");
    const { crest, patch } = await import("@/brand/emblem");
    for (const art of [crest(), patch()]) {
      expect(artSvg(art, "black", "x")).toContain("<mask");
      expect(artSvg(art, "white", "x")).not.toContain("#0B0C0E");
      expect(artSvg(art, "dark", "x")).toContain("#C4F135");
    }
  });
});
