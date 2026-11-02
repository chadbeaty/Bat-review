import { describe, expect, it } from "vitest";
import {
  askingBreakdown,
  askingStats,
  byProduct,
  conditionBand,
  monthlyTrend,
  normalizeThresholds,
  soldBreakdown,
  soldStats,
  verifiedOnly,
  type SaleRecord,
} from "@/lib/price-stats";
import { compareHref, compareRows, differenceCount, parseCompareSlugs, type CompareField } from "@/lib/compare";
import { batCompareFields, isSimilar, maturityInfo, type ComparableBat } from "@/lib/bat-display";
import { hitsLabel, ownerReportErrorMessage, summarizeOwnerReports, type OwnerReport } from "@/lib/owner-reports";
import { batModelPath, modelSegment } from "@/lib/paths";
import fallback from "@/data/catalog-fallback.json";

const T = { minSales: 5, fullSales: 10 };
const sale = (priceCents: number, extra: Partial<SaleRecord> = {}): SaleRecord => ({
  priceCents,
  saleDate: "2026-09-01",
  weightOz: 26,
  conditionScore: 8,
  verified: true,
  ...extra,
});
const sales = (n: number, base = 20000) => Array.from({ length: n }, (_, i) => sale(base + i * 1000, { saleDate: `2026-0${1 + (i % 9)}-15` }));

describe("price guide thresholds", () => {
  it("reads settings defensively", () => {
    expect(normalizeThresholds(5, 10)).toEqual(T);
    expect(normalizeThresholds("3", "8")).toEqual({ minSales: 3, fullSales: 8 });
    expect(normalizeThresholds(null, undefined)).toEqual(T);
    expect(normalizeThresholds(0, -1)).toEqual(T);
    // Full can never be below min.
    expect(normalizeThresholds(12, 4)).toEqual({ minSales: 12, fullSales: 12 });
  });

  it("shows nothing below the minimum", () => {
    expect(soldStats([], T)).toEqual({ tier: "insufficient", count: 0, needed: 5 });
    const s = soldStats(sales(4), T);
    expect(s.tier).toBe("insufficient");
    expect(s).not.toHaveProperty("minCents");
    expect(s).not.toHaveProperty("averageCents");
  });

  it("gives an indicative range without an average from min to full-1", () => {
    for (const n of [5, 9]) {
      const s = soldStats(sales(n), T);
      expect(s.tier).toBe("indicative");
      expect(s).not.toHaveProperty("averageCents");
      if (s.tier === "indicative") {
        expect(s.count).toBe(n);
        expect(s.minCents).toBe(20000);
        expect(s.maxCents).toBe(20000 + (n - 1) * 1000);
        expect(s.needed).toBe(10 - n);
      }
    }
  });

  it("gives the average, range and date range from the full threshold", () => {
    const s = soldStats(sales(10), T);
    expect(s.tier).toBe("full");
    if (s.tier === "full") {
      expect(s.averageCents).toBe(24500);
      expect(s.minCents).toBe(20000);
      expect(s.maxCents).toBe(29000);
      expect(s.firstDate).toBe("2026-01-15");
      expect(s.lastDate).toBe("2026-09-15");
    }
  });

  it("ignores unverified sales entirely", () => {
    const mixed = [...sales(4), ...Array.from({ length: 20 }, () => sale(99900, { verified: false }))];
    expect(verifiedOnly(mixed)).toHaveLength(4);
    expect(soldStats(mixed, T).tier).toBe("insufficient");
    const enough = [...sales(10), sale(99900, { verified: false })];
    const s = soldStats(enough, T);
    expect(s.tier === "full" && s.maxCents).toBe(29000);
  });
});

describe("asking prices are kept apart from sold prices", () => {
  it("summarises live listings only", () => {
    expect(askingStats([])).toBeNull();
    const a = askingStats([
      { priceCents: 20000, weightOz: 26, conditionScore: 8 },
      { priceCents: 26000, weightOz: 27, conditionScore: 9 },
    ]);
    expect(a).toEqual({ count: 2, minCents: 20000, maxCents: 26000, averageCents: 23000 });
  });

  it("asking listings never change sold statistics and vice versa", () => {
    const listings = [{ priceCents: 50000, weightOz: 26, conditionScore: 10 }];
    const s = soldStats(sales(10), T);
    expect(askingStats(listings)?.averageCents).toBe(50000);
    expect(s.tier === "full" && s.averageCents).toBe(24500);
  });
});

describe("grouping", () => {
  it("never mixes products", () => {
    const rows = [sale(10000, { productId: "a" }), sale(30000, { productId: "b" }), sale(12000, { productId: "a" }), sale(1, { productId: undefined })];
    const groups = byProduct(rows);
    expect([...groups.keys()].sort()).toEqual(["a", "b"]);
    expect(groups.get("a")!.map((r) => r.priceCents)).toEqual([10000, 12000]);
  });

  it("breaks out sold prices by weight and condition, each with its own threshold", () => {
    const rows = [...Array.from({ length: 10 }, () => sale(20000, { weightOz: 26 })), ...Array.from({ length: 3 }, () => sale(30000, { weightOz: 27 }))];
    const w = soldBreakdown(rows, "weight", T);
    expect(w.map((g) => g.label)).toEqual(["26 oz", "27 oz"]);
    expect(w[0].stats.tier).toBe("full");
    expect(w[1].stats.tier).toBe("insufficient");
    const c = soldBreakdown([sale(1000, { conditionScore: 10 }), sale(1000, { conditionScore: null }), sale(1000, { conditionScore: 5 })], "condition", T);
    expect(c.map((g) => g.label)).toEqual(["6 and below (heavy wear)", "9–10 (like new, minimal wear)", "Condition not stated"]);
    expect(conditionBand(7)).toMatch(/^7–8/);
  });

  it("breaks out asking prices by weight", () => {
    const b = askingBreakdown(
      [
        { priceCents: 100, weightOz: 27, conditionScore: 8 },
        { priceCents: 300, weightOz: 26, conditionScore: 8 },
        { priceCents: 200, weightOz: null, conditionScore: 8 },
      ],
      "weight"
    );
    expect(b.map((g) => g.label)).toEqual(["26 oz", "27 oz", "Weight not stated"]);
  });

  it("builds a monthly trend from verified sales, oldest first", () => {
    const t = monthlyTrend([sale(100, { saleDate: "2026-03-02" }), sale(300, { saleDate: "2026-03-20" }), sale(500, { saleDate: "2026-01-05" }), sale(9, { verified: false })]);
    expect(t).toEqual([
      { month: "2026-01", count: 1, averageCents: 500, minCents: 500, maxCents: 500 },
      { month: "2026-03", count: 2, averageCents: 200, minCents: 100, maxCents: 300 },
    ]);
  });
});

const bat = (over: Partial<ComparableBat> = {}): ComparableBat => ({
  slug: "a",
  manufacturer: "Miken",
  modelName: "Freak",
  modelYear: 2026,
  stamps: ["USSSA"],
  weights: [],
  weightingType: "endload",
  endloadOz: null,
  barrelLengthInches: 12,
  barrelDiameterInches: null,
  lengthInches: 34,
  constructionType: "two_piece",
  material: "composite",
  warranty: null,
  maturity: null,
  activeListings: 0,
  askingMinCents: null,
  askingMaxCents: null,
  verifiedSales: 0,
  ...over,
});

describe("comparison", () => {
  it("flags only rows whose known values differ", () => {
    const rows = compareRows([bat(), bat({ slug: "b", manufacturer: "Easton", barrelLengthInches: 13, warranty: "One year" })], batCompareFields());
    const differs = Object.fromEntries(rows.map((r) => [r.key, r.differs]));
    expect(differs.manufacturer).toBe(true);
    expect(differs.barrel_length).toBe(true);
    expect(differs.year).toBe(false);
    expect(differs.stamps).toBe(false);
    // "Not on file" vs a known warranty isn't a difference we can claim.
    expect(differs.warranty).toBe(false);
    expect(differs.weights).toBe(false);
    expect(differenceCount(rows)).toBe(2);
  });

  it("treats stamp order as the same value", () => {
    const rows = compareRows([bat({ stamps: ["USA", "USSSA"] }), bat({ slug: "b", stamps: ["USSSA", "USA"] })], batCompareFields());
    expect(rows.find((r) => r.key === "stamps")!.differs).toBe(false);
  });

  it("never flags a single item and has no performance fields", () => {
    expect(compareRows([bat()], batCompareFields()).some((r) => r.differs)).toBe(false);
    const labels = batCompareFields().map((f) => f.label.toLowerCase()).join(" ");
    expect(labels).not.toMatch(/pop|distance|exit|performance|rating|score/);
  });

  it("works for any category's field list (e.g. gloves)", () => {
    type Glove = { size: number; hand: string };
    const fields: CompareField<Glove>[] = [
      { key: "size", label: "Size", value: (g) => `${g.size}"` },
      { key: "hand", label: "Throwing hand", value: (g) => g.hand },
    ];
    const rows = compareRows([{ size: 13, hand: "Right" }, { size: 14, hand: "right" }], fields);
    expect(rows.map((r) => r.differs)).toEqual([true, false]);
  });

  it("parses and builds the models query string", () => {
    expect(parseCompareSlugs("a-b-2026, c-d-2026,a-b-2026,BAD SLUG,e-f-2026,g-h-2026")).toEqual(["a-b-2026", "c-d-2026", "e-f-2026"]);
    expect(parseCompareSlugs(undefined)).toEqual([]);
    expect(parseCompareSlugs(["x-y-2026", "z-z-2027"])).toEqual(["x-y-2026", "z-z-2027"]);
    expect(compareHref([])).toBe("/compare");
    expect(compareHref(["a", "b"])).toBe("/compare?models=a,b");
  });
});

describe("reviewed alternatives", () => {
  const base = { slug: "a", stamps: ["USA"], weightingType: "endload", constructionType: "two_piece", barrelLengthInches: 12 };
  it("needs a shared stamp, same weighting and construction, and barrel within half an inch", () => {
    expect(isSimilar(base, { ...base, slug: "b", barrelLengthInches: 12.5 })).toBe(true);
    expect(isSimilar(base, { ...base, slug: "b", barrelLengthInches: 12.75 })).toBe(false);
    expect(isSimilar(base, { ...base, slug: "b", stamps: ["USSSA"] })).toBe(false);
    expect(isSimilar(base, { ...base, slug: "b", stamps: ["USSSA", "USA"] })).toBe(true);
    expect(isSimilar(base, { ...base, slug: "b", weightingType: "balanced" })).toBe(false);
    expect(isSimilar(base, { ...base, slug: "b", constructionType: "one_piece" })).toBe(false);
    expect(isSimilar(base, base)).toBe(false);
  });
  it("never matches on unknown values", () => {
    const unknown = { ...base, weightingType: "unknown" };
    expect(isSimilar(unknown, { ...unknown, slug: "b" })).toBe(false);
    expect(isSimilar({ ...base, barrelLengthInches: null }, { ...base, slug: "b", barrelLengthInches: null })).toBe(false);
  });
});

describe("release maturity copy", () => {
  it("labels every state, including unknown", () => {
    const o = { windowDays: 120, threshold: 5 };
    expect(maturityInfo("new_release", o).label).toBe("New release");
    expect(maturityInfo("early_reports", o).label).toBe("Early reports");
    expect(maturityInfo("established", o).label).toBe("Established");
    expect(maturityInfo("limited_data", o).label).toBe("Limited owner data");
    expect(maturityInfo(null, o).label).toBe("Release date not on file");
    expect(maturityInfo("new_release", o).explanation).toContain("120 days");
  });
});

describe("First Swings summary", () => {
  const r = (userId: string, createdAt: string, extra: Partial<OwnerReport> = {}): OwnerReport => ({
    userId,
    createdAt,
    ownershipVerified: false,
    popVsPreviousGamer: "not_sure",
    sting: null,
    ballType: "unknown",
    temperatureF: null,
    durabilityStatus: "intact",
    ...extra,
  });
  it("counts each owner once, using their latest check-in", () => {
    const s = summarizeOwnerReports(
      [
        r("u1", "2026-09-01", { popVsPreviousGamer: "worse", sting: 5 }),
        r("u1", "2026-09-10", { popVsPreviousGamer: "better", sting: 1, ballType: "44/375", ownershipVerified: true }),
        r("u2", "2026-09-05", { popVsPreviousGamer: "same", sting: 3, ballType: "44/375", temperatureF: 70 }),
        r("u3", "2026-09-06", { ballType: "52/300", temperatureF: 80 }),
      ],
      5
    );
    expect(s.owners).toBe(3);
    expect(s.reports).toBe(4);
    expect(s.verifiedOwners).toBe(1);
    expect(s.pop).toEqual({ better: 1, same: 1, worse: 0, not_sure: 1 });
    expect(s.stingAverage).toBe(2);
    expect(s.ballTypes[0]).toEqual({ value: "44/375", count: 2 });
    expect(s.medianTemperatureF).toBe(75);
    expect(s.smallSample).toBe(true);
  });
  it("flags small samples against the threshold", () => {
    const five = ["a", "b", "c", "d", "e"].map((u) => r(u, "2026-09-01"));
    expect(summarizeOwnerReports(five, 5).smallSample).toBe(false);
    expect(summarizeOwnerReports([], 5)).toMatchObject({ owners: 0, stingAverage: null, medianTemperatureF: null, smallSample: true });
  });
  it("turns database errors into friendly messages", () => {
    expect(ownerReportErrorMessage({ code: "54000", message: "You can check in on this bat once every 7 days" }, 7)).toMatch(/last 7 days/);
    expect(ownerReportErrorMessage({ code: "42501" }, 7)).toMatch(/can't file reports/);
    expect(ownerReportErrorMessage(null, 7)).toMatch(/Try again/);
    expect(hitsLabel(300)).toBe("250 to 499");
    expect(hitsLabel(null)).toBe("Hits not stated");
  });
});

describe("model page URLs", () => {
  it("every catalog bat has a unique model page path that resolves back to it", () => {
    const paths = fallback.bats.map((b) => batModelPath({ manufacturerSlug: b.manufacturerSlug, productSlug: b.slug, modelYear: b.modelYear }));
    expect(new Set(paths).size).toBe(paths.length);
    for (const b of fallback.bats) {
      const seg = modelSegment(b.slug, b.modelYear);
      const matches = fallback.bats.filter((o) => o.manufacturerSlug === b.manufacturerSlug && o.modelYear === b.modelYear && modelSegment(o.slug, o.modelYear) === seg);
      expect(matches.map((m) => m.slug)).toEqual([b.slug]);
    }
  });
});
