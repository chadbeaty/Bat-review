import { describe, expect, it } from "vitest";
import { csvCell, csvFilename, toCsv } from "@/lib/admin/csv";
import { SETTING_RULES, parseSetting } from "@/lib/admin/settings-rules";
import { describeFee, feeStatuses, parseFeeVersion, parseLocalDateTime, workedExample, type FeeRow } from "@/lib/admin/fees";
import { ADMIN_AREAS, hasAccess } from "@/lib/admin/roles";
import { parseAttributeSchema, parseHttpsUrl, parseSlug } from "@/lib/admin/validation";

describe("CSV export", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(" padded ")).toBe('" padded "');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(["USSSA", "USA"])).toBe("USSSA; USA");
    expect(csvCell(new Date("2026-11-02T10:00:00Z"))).toBe("2026-11-02T10:00:00.000Z");
  });

  it("neutralises spreadsheet formulas in text cells", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell("a=b")).toBe("a=b");
  });

  it("builds a document with a header row and CRLF line endings", () => {
    const csv = toCsv(
      [
        { key: "name", header: "Name" },
        { key: "price", header: "Price (cents)" },
      ],
      [
        { name: "Freak, Black", price: 22000 },
        { name: "=cmd", price: null },
      ]
    );
    expect(csv).toBe('Name,Price (cents)\r\n"Freak, Black",22000\r\n\'=cmd,\r\n');
    expect(csvFilename("listings", new Date("2026-11-02T00:00:00Z"))).toBe("listings-2026-11-02.csv");
    expect(csvFilename("../etc", new Date("2026-11-02T00:00:00Z"))).toBe("etc-2026-11-02.csv");
  });
});

describe("site settings validation", () => {
  it("covers every setting the dashboard edits", () => {
    expect(SETTING_RULES.map((r) => r.key).sort()).toEqual(
      [
        "durability_min_owners",
        "early_report_threshold",
        "featured_listings_enabled",
        "listing_expiry_days",
        "messages_per_minute_limit",
        "new_release_window_days",
        "offer_expiry_hours",
        "owner_report_interval_days",
        "premium_seller_enabled",
        "price_guide_full_sales",
        "price_guide_min_sales",
        // Track D (payments)
        "checkout_enabled",
        "tax_collection_enabled",
        "inspection_window_days",
      ].sort()
    );
  });

  it("accepts whole numbers in range and rejects everything else", () => {
    expect(parseSetting("offer_expiry_hours", " 24 ")).toEqual({ ok: true, value: 24 });
    expect(parseSetting("offer_expiry_hours", "0").ok).toBe(false);
    expect(parseSetting("offer_expiry_hours", "721").ok).toBe(false);
    expect(parseSetting("offer_expiry_hours", "2.5").ok).toBe(false);
    expect(parseSetting("offer_expiry_hours", "abc")).toEqual({ ok: false, error: "Enter a whole number from 1 to 720." });
    expect(parseSetting("offer_expiry_hours", "").ok).toBe(false);
    expect(parseSetting("listing_expiry_days", "1e2").ok).toBe(false);
  });

  it("accepts only true or false for switches", () => {
    expect(parseSetting("featured_listings_enabled", "true")).toEqual({ ok: true, value: true });
    expect(parseSetting("featured_listings_enabled", "false")).toEqual({ ok: true, value: false });
    expect(parseSetting("featured_listings_enabled", "yes").ok).toBe(false);
  });

  it("keeps the price guide thresholds in order and refuses unknown keys", () => {
    expect(parseSetting("price_guide_full_sales", "4", { price_guide_min_sales: 5 }).ok).toBe(false);
    expect(parseSetting("price_guide_min_sales", "11", { price_guide_full_sales: 10 }).ok).toBe(false);
    expect(parseSetting("price_guide_min_sales", "6", { price_guide_full_sales: 10 })).toEqual({ ok: true, value: 6 });
    expect(parseSetting("stripe_secret", "1").ok).toBe(false);
  });
});

describe("fee versions", () => {
  const now = new Date("2026-11-02T12:00:00Z");

  it("parses a percentage version starting now", () => {
    const r = parseFeeVersion({ fee_name: "seller_commission", fee_type: "percentage", fee_value: "7.5", description: " Launch rate " }, now);
    expect(r).toEqual({ ok: true, value: { feeName: "seller_commission", feeType: "percentage", feeValue: 7.5, description: "Launch rate", effectiveFrom: null } });
  });

  it("converts fixed fees from dollars to cents and schedules future versions", () => {
    const r = parseFeeVersion(
      { fee_name: "featured_listing", fee_type: "fixed_cents", fee_value: "4.99", effective_from: "2026-12-01T09:00", tz_offset_minutes: "300" },
      now
    );
    expect(r.ok && r.value.feeValue).toBe(499);
    expect(r.ok && r.value.effectiveFrom?.toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("rejects past dates, bad values and bad names", () => {
    const r = parseFeeVersion({ fee_name: "Seller Fee", fee_type: "percentage", fee_value: "101", effective_from: "2026-10-01T09:00" }, now);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["effective_from", "fee_name", "fee_value"]);
      expect(r.errors.effective_from).toMatch(/future/);
    }
    expect(parseFeeVersion({ fee_name: "x_fee", fee_type: "percentage", fee_value: "7.123" }, now).ok).toBe(false);
    expect(parseFeeVersion({ fee_name: "x_fee", fee_type: "other", fee_value: "7" }, now).ok).toBe(false);
    expect(parseFeeVersion({ fee_name: "x_fee", fee_type: "percentage", fee_value: "-1" }, now).ok).toBe(false);
  });

  it("parses datetime-local values with the browser's offset", () => {
    expect(parseLocalDateTime("2026-12-01T00:00", 0)?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(parseLocalDateTime("2026-12-01T00:00", -60)?.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(parseLocalDateTime("2026-13-01T00:00", 0)).toBeNull();
    expect(parseLocalDateTime("tomorrow", 0)).toBeNull();
  });

  it("labels each version the way current_fee() picks them", () => {
    const row = (id: string, effective: string, active = true, name = "seller_commission"): FeeRow => ({
      id,
      fee_name: name,
      fee_type: "percentage",
      fee_value: 7,
      description: null,
      active,
      effective_from: effective,
      created_at: effective,
    });
    const s = feeStatuses(
      [
        row("old", "2026-01-01T00:00:00Z", false),
        row("current", "2026-06-01T00:00:00Z"),
        row("superseded-still-active", "2026-03-01T00:00:00Z"),
        row("future", "2027-01-01T00:00:00Z"),
        row("cancelled", "2027-02-01T00:00:00Z", false),
        row("other", "2026-01-01T00:00:00Z", true, "featured_listing"),
      ],
      now
    );
    expect(Object.fromEntries(s)).toEqual({
      old: "retired",
      current: "in_force",
      "superseded-still-active": "retired",
      future: "scheduled",
      cancelled: "cancelled",
      other: "in_force",
    });
  });

  it("shows the $200 worked example", () => {
    expect(workedExample({ fee_name: "seller_commission", fee_type: "percentage", fee_value: 7 })).toEqual({
      itemPriceCents: 20000,
      commissionCents: 1400,
      sellerBeforeProcessingCents: 18600,
    });
    expect(describeFee({ fee_type: "percentage", fee_value: 7 })).toBe("7%");
    expect(describeFee({ fee_type: "fixed_cents", fee_value: 399 })).toBe("$3.99");
  });
});

describe("staff access", () => {
  it("gives admins everything and other staff only their areas", () => {
    expect(hasAccess(["admin"], ["moderator"])).toBe(true);
    expect(hasAccess(["moderator"], ["moderator"])).toBe(true);
    expect(hasAccess(["support"], ["moderator"])).toBe(false);
    expect(hasAccess(["support"], "any")).toBe(true);
    expect(hasAccess([], "any")).toBe(false);
    const fees = ADMIN_AREAS.find((a) => a.href === "/admin/fees")!;
    expect(hasAccess(["moderator", "support"], fees.access)).toBe(false);
  });
});

describe("catalog validation", () => {
  it("accepts a valid attribute schema and explains what's wrong with a bad one", () => {
    const good = parseAttributeSchema('[{"key":"weight_oz","label":"Weight","type":"number","required":true}]');
    expect(good.ok).toBe(true);
    expect(parseAttributeSchema("{not json").ok).toBe(false);
    expect(parseAttributeSchema('{"key":"x"}')).toEqual({ ok: false, error: "The schema must be a JSON list of fields." });
    const bad = parseAttributeSchema('[{"key":"Bad Key","label":"x","type":"number"}]');
    expect(bad.ok).toBe(false);
    expect(parseAttributeSchema('[{"key":"a","label":"A","type":"select"}]').ok).toBe(false);
    expect(parseAttributeSchema('[{"key":"a","label":"A","type":"text"},{"key":"a","label":"B","type":"text"}]').ok).toBe(false);
  });

  it("accepts only https destinations and simple slugs", () => {
    expect(parseHttpsUrl("https://sponsor.example/page")).toBe("https://sponsor.example/page");
    expect(parseHttpsUrl("http://sponsor.example")).toBeNull();
    expect(parseHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpsUrl("https://")).toBeNull();
    expect(parseSlug("Miken Freak 2026")).toBe("miken-freak-2026");
    expect(parseSlug("--")).toBeNull();
  });
});
