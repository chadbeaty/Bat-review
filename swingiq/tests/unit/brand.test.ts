import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { G, GAP_FROM, mark, wordmark } from "@/brand/geometry";
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

  it("the ball sits inside the gap, clear of both ends of the arc", () => {
    const g = G(19);
    const b = g.ball!;
    const ang = (Math.atan2(b.cy - 50, b.cx - 52) * 180) / Math.PI + 360;
    expect(ang).toBeGreaterThan(GAP_FROM);
    expect(ang).toBeLessThan(360);
    // Clearance to the top end of the arc and to the bar, in units of the 100-unit cap height.
    const mid = Math.hypot(b.cx - 52, b.cy - 50);
    const toTop = mid * Math.sin(((ang - GAP_FROM) * Math.PI) / 180) - b.r;
    const toBar = 50 - b.cy - b.r;
    expect(toTop).toBeGreaterThan(6);
    expect(toBar).toBeGreaterThan(6);
  });

  it("wordmark has six letters and one ball", () => {
    const w = wordmark();
    expect(w.balls).toHaveLength(1);
    expect(w.w).toBeGreaterThan(400);
    expect(mark().paths.length).toBe(2);
  });
});

describe("Gapper emblem", () => {
  it("the Gap Mark has the field in ink and the ball + streak in the accent, ball out past the wall in the gap", async () => {
    const { gapMark, MARK_GEOM } = await import("@/brand/emblem");
    const m = gapMark();
    expect(m.shapes.map((s) => s.role)).toEqual(["ink", "accent", "accent"]);
    const g = MARK_GEOM;
    expect(g.ballAt - g.ballR).toBeGreaterThan(g.rOut); // the ball clears the wall
    expect(g.gapAt).toBeGreaterThan(225 + 10); // the gap is inside fair territory, left of center
    expect(g.gapAt).toBeLessThan(270);
    expect(g.gapW).toBeGreaterThan(g.ballR * 0.8); // wide enough to read as a gap at small sizes
  });

  it("the crest is a badge (ground, keyline, art) and the ball breaks out through its rim", async () => {
    const { crest } = await import("@/brand/emblem");
    const c = crest();
    const roles = new Set(c.shapes.map((s) => s.role));
    expect([...roles].sort()).toEqual(["accent", "ground", "ink"]);
    // Circles are drawn as "M x cy A r r ...": the topmost accent circle's top must clear the shield's flat top (y = 20).
    const tops = c.shapes
      .filter((s) => s.role === "accent")
      .map((s) => s.d.match(/^M([\d.-]+) ([\d.-]+)A([\d.-]+)/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => Number(m[2]) - Number(m[3]));
    expect(Math.min(...tops)).toBeLessThan(20);
  });

  it("every colorway renders, and one-color badges knock the art out with masks", async () => {
    const { artSvg } = await import("@/brand/svg");
    const { crest, patch } = await import("@/brand/emblem");
    for (const art of [crest(), patch()]) {
      expect(artSvg(art, "black", "x")).toContain("<mask");
      expect(artSvg(art, "white", "x")).not.toContain("#101827");
      expect(artSvg(art, "dark", "x")).toContain("#B7F34A");
    }
  });
});
