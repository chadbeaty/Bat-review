import { describe, expect, it } from "vitest";
import { batPath, batSpecFrom, brandColors, DEFAULT_BARREL_IN, DEFAULT_LENGTH_IN, describeBat, parseBarrel, DEFAULT_BAT_COLORS } from "@/lib/bat-drawing";
import { LIFE_ZONES, lifeSummary, markerPercent, parseHits, zoneFor } from "@/lib/life-meter";
import { buildMrz } from "@/lib/mrz";
import { parseView, withView } from "@/lib/view-mode-shared";

describe("bat drawing specs", () => {
  it("uses real fields and defaults only when unknown", () => {
    const real = batSpecFrom({ length_inches: 33, barrel_length_inches: 13, construction_type: "two_piece", weighting_type: "endload", weight_oz: 26 }, "Miken");
    expect(real).toMatchObject({ lengthIn: 33, barrelIn: 13, twoPiece: true, load: "end", weightOz: 26, assumed: false, lengthKnown: true });
    const unknown = batSpecFrom({}, null);
    expect(unknown).toMatchObject({ lengthIn: DEFAULT_LENGTH_IN, barrelIn: DEFAULT_BARREL_IN, twoPiece: false, load: "balanced", assumed: true, lengthKnown: false });
  });
  it("parses barrel lengths", () => {
    expect(parseBarrel(12.75)).toBe(12.75);
    expect(parseBarrel('13"')).toBe(13);
    expect(parseBarrel("12 3/4 in")).toBe(12.75);
    expect(parseBarrel(40)).toBeNull();
    expect(parseBarrel("n/a")).toBeNull();
  });
  it("picks deterministic decorative colors per brand", () => {
    expect(brandColors("Miken")).toEqual(brandColors("miken"));
    expect(brandColors("Louisville Slugger")).not.toEqual(DEFAULT_BAT_COLORS);
    expect(brandColors("Unknown Co")).toEqual(DEFAULT_BAT_COLORS);
    expect(brandColors(null)).toEqual(DEFAULT_BAT_COLORS);
  });
  it("draws a closed path to scale and describes the bat", () => {
    expect(batPath(34, 12.75, 10, 0)).toMatch(/^M0 [\s\S]* Z$/);
    expect(batPath(34, 12.75, 10, 0)).toContain("Q340 ");
    expect(describeBat(batSpecFrom({ length_inches: 34, barrel_length_inches: 12.75, construction_type: "two_piece", weighting_type: "endload" }))).toContain("two-piece, end-loaded");
  });
});

describe("life meter", () => {
  it("places hits on the track and names the zone", () => {
    expect(zoneFor(0)).toBe("break-in");
    expect(zoneFor(199)).toBe("break-in");
    expect(zoneFor(400)).toBe("prime");
    expect(zoneFor(2500)).toBe("late");
    expect(markerPercent(300)).toBeCloseTo(10);
    expect(markerPercent(9000)).toBe(100);
    expect(LIFE_ZONES.map((z) => z.key)).toEqual(["break-in", "prime", "late"]);
  });
  it("reads hit counts safely", () => {
    expect(parseHits(400)).toBe(400);
    expect(parseHits("250")).toBe(250);
    expect(parseHits(-1)).toBeNull();
    expect(parseHits(10001)).toBeNull();
    expect(parseHits(undefined)).toBeNull();
    expect(lifeSummary(null)).toContain("didn't give a hit count");
    expect(lifeSummary(400)).toContain("prime");
  });
});

describe("passport MRZ line", () => {
  it("builds two 44-character lines from real fields", () => {
    const [a, b] = buildMrz({ brand: "Miken", model: "Miken Freak Black Maxload", listingId: "9c5adea2-62f4", modelYear: 2026, lengthIn: 34, weightOz: 26, twoPiece: true, load: "end", stamps: ["USSSA"], hits: 400 });
    expect(a).toHaveLength(44);
    expect(b).toHaveLength(44);
    expect(a).toMatch(/^P<GBMIKEN<<FREAK<BLACK<MAXLOAD<<34<26/);
    expect(b).toMatch(/^9C5ADE<2026<2PC<END<USSSA<H0400/);
    expect(a + b).toMatch(/^[A-Z0-9<]+$/);
  });
  it("leaves out what is unknown", () => {
    const [, b] = buildMrz({ listingId: "abc123def", stamps: [] });
    expect(b).toMatch(/^ABC123<+$/);
  });
});

describe("browse layout choice", () => {
  it("accepts only known views and keeps them on links", () => {
    expect(parseView("list")).toBe("list");
    expect(parseView(["rack"])).toBe("rack");
    expect(parseView("grid")).toBeNull();
    expect(withView("/bats?sort=price_asc", "list")).toBe("/bats?sort=price_asc&view=list");
    expect(withView("/bats", "list")).toBe("/bats?view=list");
    expect(withView("/bats", null)).toBe("/bats");
  });
});
