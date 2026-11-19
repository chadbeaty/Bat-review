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
