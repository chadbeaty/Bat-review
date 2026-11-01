import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commissionCents, sellerProceedsBeforeProcessing } from "@/lib/fees";
import { safeNextPath, isProtectedPath } from "@/lib/routes";
import { signUpSchema, newPasswordSchema } from "@/lib/validation/auth";
import { brand, brandCssVariables } from "@/config/brand";
import { integrationStatus } from "@/lib/env";
import { conditionLabel, formatPrice } from "@/lib/format";
import { categories, manufacturers } from "@/data/reference";
import { weightingType, endloadOz } from "../../scripts/catalog-mapping.mjs";

const commission = { fee_name: "seller_commission", fee_type: "percentage" as const, fee_value: 7 };

describe("fees", () => {
  it("charges 7% of the item price on a $200 sale", () => {
    expect(commissionCents(20000, commission)).toBe(1400);
    expect(sellerProceedsBeforeProcessing(20000, commission)).toEqual({
      itemPriceCents: 20000,
      commissionCents: 1400,
      beforeProcessingCents: 18600,
    });
  });

  it("rounds to the nearest cent", () => {
    expect(commissionCents(12345, commission)).toBe(864); // 864.15
    expect(commissionCents(12350, { ...commission, fee_value: 7.5 })).toBe(926); // 926.25
  });

  it("uses whatever rate is configured", () => {
    expect(commissionCents(20000, { ...commission, fee_value: 5 })).toBe(1000);
    expect(commissionCents(20000, { fee_name: "flat", fee_type: "fixed_cents", fee_value: 399 })).toBe(399);
    expect(commissionCents(200, { fee_name: "flat", fee_type: "fixed_cents", fee_value: 399 })).toBe(200);
  });

  it("rejects invalid inputs", () => {
    expect(() => commissionCents(19.99, commission)).toThrow();
    expect(() => commissionCents(-1, commission)).toThrow();
    expect(() => commissionCents(100, { ...commission, fee_value: 120 })).toThrow();
  });
});

describe("routes", () => {
  it("only redirects within the site", () => {
    expect(safeNextPath("/account/orders")).toBe("/account/orders");
    expect(safeNextPath("//evil.com")).toBe("/account");
    expect(safeNextPath("/\\evil.com")).toBe("/account");
    expect(safeNextPath("https://evil.com")).toBe("/account");
    expect(safeNextPath(null)).toBe("/account");
  });

  it("protects account areas but not public pages", () => {
    expect(isProtectedPath("/account")).toBe(true);
    expect(isProtectedPath("/admin/fees")).toBe(true);
    expect(isProtectedPath("/sell/new")).toBe(true);
    expect(isProtectedPath("/sell")).toBe(false);
    expect(isProtectedPath("/accounting")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });
});

describe("validation", () => {
  const ok = { email: " Player@Example.com ", password: "long-enough-pw", terms: "on" };
  it("normalizes email and accepts a valid sign-up", () => {
    const r = signUpSchema.safeParse(ok);
    expect(r.success && r.data.email).toBe("player@example.com");
  });
  it("requires terms, a real email, a long password and a clean username", () => {
    expect(signUpSchema.safeParse({ ...ok, terms: undefined }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, username: "bad name!" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, username: "" }).success).toBe(true);
  });
  it("requires matching new passwords", () => {
    expect(newPasswordSchema.safeParse({ password: "long-enough-pw", confirm: "different-pw!" }).success).toBe(false);
  });
});

describe("brand configuration", () => {
  it("turns brand colors into CSS variables", () => {
    const css = brandCssVariables();
    expect(css).toContain(`--brand-ink:${brand.colors.ink}`);
    expect(css).toContain(`--brand-accent-ink:${brand.colors.accentInk}`);
  });
  it("uses valid hex colors", () => {
    for (const v of Object.values(brand.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("integrations", () => {
  it("reports which integrations have their keys", () => {
    const status = integrationStatus({ STRIPE_SECRET_KEY: "x", STRIPE_WEBHOOK_SECRET: "y", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "z" });
    expect(status.find((s) => s.id === "stripe")?.configured).toBe(true);
    expect(status.find((s) => s.id === "shippo")?.configured).toBe(false);
  });
});

describe("formatting", () => {
  it("formats prices and condition labels", () => {
    expect(formatPrice(22000)).toBe("$220");
    expect(formatPrice(22050)).toBe("$220.50");
    expect(conditionLabel(9)).toBe("Minimal wear");
    expect(conditionLabel(5)).toBe("Heavy wear");
    expect(conditionLabel(null)).toBeNull();
  });
});

describe("reference data", () => {
  const seed = readFileSync(join(__dirname, "..", "..", "supabase", "seed.sql"), "utf8");
  it("matches the categories in supabase/seed.sql", () => {
    for (const c of categories) expect(seed).toContain(`('${c.name}', '${c.slug}', '${c.description}', ${c.displayOrder}`);
    expect(categories).toHaveLength(9);
  });
  it("matches the manufacturers in supabase/seed.sql", () => {
    for (const m of manufacturers) expect(seed).toContain(`('${m.name}', '${m.slug}'`);
  });
});

describe("catalog seed conversion", () => {
  it("maps weighting names without guessing", () => {
    expect(weightingType({ load: "balanced" })).toBe("balanced");
    expect(weightingType({ load: "heavy" })).toBe("endload");
    expect(weightingType({ load: "balanced", loadName: "Mid-load" })).toBe("midload");
    expect(weightingType({ load: null })).toBe("unknown");
    expect(endloadOz({ loadName: "Maxload (0.5 oz)" })).toBe(0.5);
    expect(endloadOz({ loadName: "½ oz endload" })).toBe(0.5);
    expect(endloadOz({ loadName: "XL" })).toBeNull();
  });
});

import { batModelPath, modelSegment, productSlugPattern } from "@/lib/paths";

describe("paths", () => {
  it("builds bat model URLs from catalog slugs", () => {
    expect(modelSegment("miken-freak-black-maxload-usssa-2026", 2026)).toBe("freak-black-maxload-usssa");
    expect(batModelPath({ manufacturerSlug: "louisville-slugger", productSlug: "ls-genesis-12-balanced-usssa-2026", modelYear: 2026 })).toBe(
      "/bats/louisville-slugger/genesis-12-balanced-usssa/2026"
    );
    expect(productSlugPattern("genesis-12-balanced-usssa", "2026")).toBe("%-genesis-12-balanced-usssa-2026");
  });
});
