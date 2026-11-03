import { describe, expect, it } from "vitest";
import { cardStatus } from "@/components/ListingBits";
import { BAT_PHOTO_SLOTS, slotDisplayOrder, slotSummary } from "@/lib/sell/listing";
import { parseView, withView, VIEW_MODES } from "@/lib/view-mode-shared";
import { parseSettingForTest } from "./launch-helpers";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe("card status", () => {
  it("says Just listed under 72 hours, and not after", () => {
    expect(cardStatus({ publishedAt: hoursAgo(5), acceptsOffers: false }, NOW)).toEqual({ label: "Just listed", tone: "new" });
    expect(cardStatus({ publishedAt: hoursAgo(71), acceptsOffers: false }, NOW)?.label).toBe("Just listed");
    expect(cardStatus({ publishedAt: hoursAgo(73), acceptsOffers: false }, NOW)).toBeNull();
  });
  it("falls back to Offers, and Sold/Reserved win over everything", () => {
    expect(cardStatus({ publishedAt: hoursAgo(200), acceptsOffers: true }, NOW)?.label).toBe("Offers");
    expect(cardStatus({ publishedAt: hoursAgo(1), acceptsOffers: true, status: "reserved" }, NOW)?.label).toBe("Reserved");
    expect(cardStatus({ publishedAt: hoursAgo(1), acceptsOffers: true, status: "sold" }, NOW)?.label).toBe("Sold");
    expect(cardStatus({ publishedAt: null, acceptsOffers: false }, NOW)).toBeNull();
  });
});

describe("bat photo slots", () => {
  it("lists the labeled slots with the full bat required", () => {
    expect(BAT_PHOTO_SLOTS.map((s) => s.label)).toEqual(["Full bat", "Barrel", "End cap", "Knob", "Certification stamp", "Damage / wear"]);
    expect(BAT_PHOTO_SLOTS.find((s) => s.type === "full")?.need).toBe("required");
    expect(BAT_PHOTO_SLOTS.find((s) => s.type === "markings")?.need).toBe("encouraged");
    expect(BAT_PHOTO_SLOTS.find((s) => s.type === "damage")).toMatchObject({ need: "optional", multiple: true });
  });
  it("orders photos by slot so the full bat is always the cover", () => {
    expect(slotDisplayOrder("full", 0)).toBeLessThan(slotDisplayOrder("barrel", 0));
    expect(slotDisplayOrder("damage", 0)).toBeGreaterThan(slotDisplayOrder("markings", 0));
    expect(slotDisplayOrder("damage", 1)).toBeGreaterThan(slotDisplayOrder("damage", 0));
  });
  it("reports which main slots are still empty", () => {
    expect(slotSummary([{ imageType: "full" }, { imageType: "barrel" }]).missingEncouraged).toEqual(["end_cap", "knob", "markings"]);
    expect(slotSummary([]).filled).toEqual([]);
  });
});

describe("browse views and the bats-only setting", () => {
  it("offers grid, list and rack, with grid as a valid choice", () => {
    expect(VIEW_MODES).toEqual(["grid", "list", "rack"]);
    expect(parseView("grid")).toBe("grid");
    expect(withView("/bats", "grid")).toBe("/bats?view=grid");
  });
  it("edits bats_only_mode as an on/off setting", () => {
    expect(parseSettingForTest("true")).toEqual({ ok: true, value: true });
    expect(parseSettingForTest("false")).toEqual({ ok: true, value: false });
    expect(parseSettingForTest("maybe").ok).toBe(false);
  });
});
