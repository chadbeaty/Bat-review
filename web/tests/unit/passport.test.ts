import { describe, expect, it } from "vitest";
import { SOURCE_LABELS, buildPassport, listingCheck, ownersCheck, priceCheck, stampCheck, type PassportInput } from "@/lib/passport";

const sale = (priceCents: number, saleDate = "2026-10-01", verified = true) => ({ priceCents, saleDate, weightOz: 26, conditionScore: 8, verified });

describe("stampCheck", () => {
  it("never claims verification the data doesn't support", () => {
    const c = stampCheck({ associations: ["USSSA"], status: "unverified", verifiedAt: null, source: null });
    expect(c.filled).toBe(false);
    expect(c.headline).toBe("Stamp not verified yet");
    expect(stampCheck({ associations: [], status: "association_listed", verifiedAt: null, source: null }).filled).toBe(false);
  });
  it("fills when the status is listed, and shows the verified date only if present", () => {
    const c = stampCheck({ associations: ["USSSA", "USA"], status: "association_listed", verifiedAt: "2026-10-05T00:00:00Z", source: null });
    expect(c.filled).toBe(true);
    expect(c.headline).toBe("USSSA / USA · listed by the association");
    expect(c.detail).toContain("verified on 2026-10-05");
    expect(stampCheck({ associations: ["USSSA"], status: "manufacturer_listed", verifiedAt: null, source: null }).detail).not.toContain("verified on");
  });
  it("does not fill for decertified bats", () => {
    expect(stampCheck({ associations: ["USSSA"], status: "decertified", verifiedAt: null, source: null }).filled).toBe(false);
  });
});

describe("priceCheck", () => {
  it("needs the configured number of verified sales", () => {
    const c = priceCheck([sale(10000), sale(12000), sale(9000, "2026-10-01", false)], { minSales: 5 });
    expect(c.filled).toBe(false);
    expect(c.headline).toBe("Not enough sales yet (2)");
  });
  it("shows the range and count at the threshold", () => {
    const c = priceCheck([10000, 12000, 15050, 9000, 11000].map((p) => sale(p)), { minSales: 5 });
    expect(c.filled).toBe(true);
    expect(c.headline).toBe("$90 to $150.50");
    expect(c.detail).toContain("5 verified sales");
  });
});

describe("ownersCheck", () => {
  it("reports when below the minimum", () => {
    expect(ownersCheck(null, 2, 3)).toMatchObject({ filled: false, headline: "Not enough owner reports yet (2)" });
  });
  it("shows median hits and cracks", () => {
    const c = ownersCheck({ reportingOwners: 6, ownersReportingFailure: 1, ownersCracked: 1, medianHitsIntact: 1200.4 }, 9, 3);
    expect(c.filled).toBe(true);
    expect(c.headline).toBe("Median 1200 hits on bats still intact");
    expect(c.detail).toBe("6 owners reporting, 1 reported cracks");
  });
});

describe("listingCheck", () => {
  const base = { conditionScore: 8, conditionLabel: "Normal light wear", structuralDisclosure: "no_known_damage" as const, damageAnswers: [false, false, null], photoCount: 5 };
  it("passes with condition, a disclosure and photos", () => {
    const c = listingCheck(base);
    expect(c.filled).toBe(true);
    expect(c.headline).toBe("Condition 8/10");
    expect(c.detail).toBe("2 of 3 damage questions answered, 5 photos");
  });
  it("does not pass without a condition, disclosure or photos", () => {
    expect(listingCheck({ ...base, conditionScore: null }).filled).toBe(false);
    expect(listingCheck({ ...base, structuralDisclosure: "unknown" }).filled).toBe(false);
    expect(listingCheck({ ...base, photoCount: 0 }).filled).toBe(false);
  });
});

describe("buildPassport", () => {
  it("counts filled checks", () => {
    const input: PassportInput = {
      stamp: { associations: ["USSSA"], status: "unverified", verifiedAt: null, source: null },
      sales: [],
      thresholds: { minSales: 5 },
      durability: null,
      publishedReports: 0,
      minOwners: 3,
      listing: { conditionScore: 9, conditionLabel: "Minimal wear", structuralDisclosure: "no_known_damage", damageAnswers: [false], photoCount: 1 },
    };
    const p = buildPassport(input);
    expect(p.checks.map((c) => c.key)).toEqual(["stamp", "price", "owners", "listing"]);
    expect(p.filledCount).toBe(1);
  });
});

describe("provenance sources", () => {
  const input: PassportInput = {
    stamp: { associations: ["USSSA"], status: "association_listed", verifiedAt: null, source: null },
    sales: [],
    thresholds: { minSales: 5 },
    durability: null,
    publishedReports: 0,
    minOwners: 3,
    listing: { conditionScore: 8, conditionLabel: null, structuralDisclosure: "no_known_damage", damageAnswers: [false], photoCount: 1 },
  };
  it("labels every check with where its data comes from", () => {
    const bySource = Object.fromEntries(buildPassport(input).checks.map((c) => [c.key, c.source]));
    expect(bySource).toEqual({ stamp: "verified", price: "verified", owners: "owners", listing: "seller" });
    expect(SOURCE_LABELS).toEqual({ verified: "Verified", seller: "Seller says", owners: "Owners report" });
  });
  it("keeps the source on empty checks too", () => {
    expect(priceCheck([], { minSales: 5 }).source).toBe("verified");
    expect(ownersCheck(null, 0, 3).source).toBe("owners");
  });
});
