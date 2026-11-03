// The bats-only launch pass: the site setting, mobile header, homepage, cards and view modes, filters, photo slots,
// passport provenance labels and the watchlist. Needs the local Supabase stack, like the other browser tests.
import { expect, test } from "@playwright/test";
import { createConfirmedUser, createLiveListing, hasSupabase, serviceClient, signIn, type TestUser } from "./helpers";

test.skip(!hasSupabase(), "needs the local Supabase stack");

const created: TestUser[] = [];
test.afterAll(async () => {
  for (const u of created) await serviceClient().auth.admin.deleteUser(u.id);
});
async function member(prefix: string) {
  const u = await createConfirmedUser(prefix);
  created.push(u);
  return u;
}
const word = () => `zq${Math.random().toString(36).slice(2, 9)}`;

const ATTRS = { weight_oz: 26, length_inches: 34, certification: ["USSSA"], weighting_type: "endload", model_year: 2026 };

test.describe("bats-only setting", () => {
  test("switching it off brings the other categories back, switching it on hides them again", async ({ page, request }) => {
    const db = serviceClient();
    try {
      const off = await db.from("site_settings").update({ value: false }).eq("key", "bats_only_mode");
      expect(off.error).toBeNull();
      expect((await request.get("/shop/gloves")).status()).toBe(200);
      await page.goto("/");
      await expect(page.locator("footer").getByRole("link", { name: "Gloves", exact: true })).toBeVisible();
      await page.goto("/shop");
      await expect(page).toHaveURL(/\/shop$/);
    } finally {
      await db.from("site_settings").update({ value: true }).eq("key", "bats_only_mode");
    }
    expect((await request.get("/shop/gloves")).status()).toBe(404);
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/bats$/);
  });

  test("a listing in a hidden category does not surface anywhere while it is hidden", async ({ request }) => {
    const seller = await member("hidc");
    const db = serviceClient();
    const { data: gloves } = await db.from("product_categories").select("id").eq("slug", "gloves").single();
    const id = await createLiveListing(seller, { title: `Hidden category ${word()} glove` });
    await db.from("equipment_listings").update({ category_id: gloves!.id }).eq("id", id);
    expect((await request.get(`/listings/${id}`)).status()).toBe(404);
  });
});

test.describe("mobile header", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test("is short, sticky, never clips the search and keeps Menu and Account reachable", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header").first();
    const box = (await header.boundingBox())!;
    expect(box.height).toBeLessThan(125);
    const input = page.getByRole("searchbox").first();
    const ib = (await input.boundingBox())!;
    expect(ib.height).toBeGreaterThanOrEqual(44);
    expect(ib.width).toBeGreaterThan(200);
    expect(await input.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("header")!).position)).toBe("sticky");
    for (const name of ["Menu", "Sign in or join"]) {
      const b = (await page.locator(`summary[aria-label="${name}"]`).boundingBox())!;
      expect(b.width, name).toBeGreaterThanOrEqual(44);
      expect(b.height, name).toBeGreaterThanOrEqual(44);
    }
    await page.locator('summary[aria-label="Menu"]').click();
    await expect(page.getByRole("link", { name: "Bat archive" }).first()).toBeVisible();
    await page.locator('summary[aria-label="Sign in or join"]').click();
    // Opening the account menu closes the other one.
    await expect(page.getByRole("link", { name: "Join" })).toBeVisible();
    await expect(page.locator('details[data-header-menu][open]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator('details[data-header-menu][open]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("cards, filters and views", () => {
  test("cards show the real photo, status, passport badge and a save button; filters narrow by length, offers, newly listed and dual stamp", async ({ page }) => {
    const seller = await member("cardf");
    const w = word();
    const fresh = await createLiveListing(seller, { title: `Fresh ${w} 26 oz`, attributes: { ...ATTRS, length_inches: 34 } });
    const old = await createLiveListing(seller, { title: `Old ${w} 27 oz`, attributes: { ...ATTRS, weight_oz: 27, length_inches: 32, certification: ["USSSA", "USA"] } });
    const db = serviceClient();
    await db.from("equipment_listings").update({ accepts_offers: false, published_at: new Date(Date.now() - 10 * 86400_000).toISOString() }).eq("id", old);
    await db.from("equipment_listings").update({ accepts_offers: true }).eq("id", fresh);

    await page.goto(`/bats?q=${w}`);
    const cards = page.getByTestId("listing-card");
    await expect(cards).toHaveCount(2);
    const first = cards.filter({ hasText: `Fresh ${w}` });
    await expect(first.locator("img").first()).toHaveAttribute("src", /placehold|storage/);
    await expect(first).toContainText("Just listed");
    await expect(first).toContainText("$220");
    await expect(first).toContainText("8/10");
    await expect(first).toContainText("Nashville, TN");
    await expect(first).toContainText("26 oz");
    await expect(first.getByRole("img", { name: /Bat Passport: \d of 4/ })).toBeVisible();
    await expect(first.getByRole("link", { name: /Sign in to save/ })).toBeVisible();

    const titles = async (qs: string) => {
      await page.goto(`/bats?q=${w}${qs}`);
      return (await page.getByTestId("listing-card").locator("h3").allTextContents()).map((t) => t.trim().split(" ")[0]).sort();
    };
    expect(await titles("&minlen=33")).toEqual(["Fresh"]);
    expect(await titles("&maxlen=33")).toEqual(["Old"]);
    expect(await titles("&new=1")).toEqual(["Fresh"]);
    expect(await titles("&offers=1")).toEqual(["Fresh"]);
    expect(await titles("&dual=1")).toEqual(["Old"]);
    expect(await titles("&sort=price_desc")).toHaveLength(2);

    // The active filter chips can be removed one by one or cleared all at once.
    await page.goto(`/bats?q=${w}&offers=1&new=1`);
    const chips = page.getByTestId("active-filters");
    await expect(chips).toContainText("Accepts offers");
    await expect(chips).toContainText("Listed this week");
    await chips.getByRole("link", { name: "Remove filter: Accepts offers" }).click();
    await expect(page).toHaveURL(/new=1/);
    await expect(page).not.toHaveURL(/offers=1/);
    await chips.getByRole("link", { name: "Clear all" }).click();
    await expect(page).toHaveURL(/\/bats$/);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("filters live in a slide-up sheet with Apply, and the grid has two columns", async ({ page }) => {
      const seller = await member("sheet");
      const w = word();
      await createLiveListing(seller, { title: `Sheet ${w} 26 oz`, attributes: ATTRS });
      await createLiveListing(seller, { title: `Sheet ${w} 27 oz`, attributes: { ...ATTRS, weight_oz: 27 } });
      await page.goto(`/bats?q=${w}`);
      const cards = page.getByTestId("listing-card");
      await expect(cards).toHaveCount(2);
      const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(4);
      expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + 1);

      await page.getByTestId("open-filters").click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      await expect(sheet).toBeVisible();
      const sb = (await sheet.boundingBox())!;
      expect(sb.y + sb.height).toBeGreaterThan(800); // anchored to the bottom
      await sheet.getByLabel("Seller accepts offers").check();
      await page.getByTestId("apply-filters").click();
      await expect(page).toHaveURL(/offers=1/);
      await expect(page.getByTestId("active-filters")).toContainText("Accepts offers");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  });

  test("the rack shows round photo thumbnails on tags that link to the listing, with 3+ bats in a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const seller = await member("rackm");
    const w = word();
    const ids = [];
    for (const n of [1, 2, 3, 4]) ids.push(await createLiveListing(seller, { title: `Rack ${w} ${n}`, attributes: ATTRS }));
    await page.goto(`/bats?q=${w}&view=rack`);
    const items = page.getByTestId("rack-item");
    await expect(items).toHaveCount(4);
    let visible = 0;
    for (let i = 0; i < 4; i++) {
      const b = (await items.nth(i).boundingBox())!;
      if (b.x >= 0 && b.x + b.width <= 392) visible++;
    }
    expect(visible).toBeGreaterThanOrEqual(3);
    await expect(items.first().locator("img.thumb")).toBeVisible();
    expect((await items.first().boundingBox())!.width).toBeGreaterThanOrEqual(100);
    await expect(items.first()).toHaveAttribute("href", /\/listings\//);
  });
});

test.describe("listing page", () => {
  test("photo slots are labeled in the gallery and every passport line says where it comes from", async ({ page }) => {
    const seller = await member("slot");
    const id = await createLiveListing(seller, { title: `Slots ${word()} 26 oz`, attributes: ATTRS });
    const db = serviceClient();
    await db.from("listing_images").insert([
      { listing_id: id, image_url: "https://placehold.co/800x600/png?text=Barrel", image_type: "barrel", display_order: 20 },
      { listing_id: id, image_url: "https://placehold.co/800x600/png?text=Stamp", image_type: "markings", display_order: 80 },
    ]);
    await page.goto(`/listings/${id}`);
    await expect(page.getByTestId("photo-caption")).toContainText("Full bat");
    await expect(page.getByRole("tab", { name: /Barrel/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Certification stamp/ })).toBeVisible();
    await page.getByRole("tab", { name: /Certification stamp/ }).click();
    await expect(page.getByTestId("photo-caption")).toContainText("Certification stamp");

    const passport = page.getByTestId("bat-passport");
    await expect(passport).toBeVisible();
    // A source tag only appears on checks that are stamped, so an empty check never reads "Verified".
    const expected = { stamp: "Verified", price: "Verified", owners: "Owners report", listing: "Seller says" } as const;
    for (const [check, label] of Object.entries(expected)) {
      const slot = passport.locator(`[data-check="${check}"]`);
      const filled = (await slot.getAttribute("data-filled")) === "true";
      const tag = slot.locator("[data-source]:not(.stamp-slot)");
      if (filled) await expect(tag).toHaveText(label);
      else await expect(tag).toHaveCount(0);
    }
  });
});

test.describe("recently sold and the watchlist", () => {
  test("Recently sold appears only once a bat has really sold, and shows no price", async ({ page }) => {
    const seller = await member("sold");
    const w = word();
    const id = await createLiveListing(seller, { title: `Sold ${w} 26 oz`, attributes: ATTRS });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Recently sold" })).toHaveCount(0);
    await serviceClient().from("equipment_listings").update({ listing_status: "sold", sold_at: new Date().toISOString() }).eq("id", id);
    await page.goto("/");
    const section = page.getByTestId("recently-sold");
    await expect(section).toContainText(`Sold ${w}`);
    await expect(section).not.toContainText("$");
  });

  test("the watchlist needs sign-in, then gathers saved listings, saved searches and watched models", async ({ page }) => {
    await page.goto("/account/watchlist");
    await expect(page).toHaveURL(/sign-in\?next=%2Faccount%2Fwatchlist/);
    const m = await member("watch");
    await signIn(page, m, "/account/watchlist");
    await expect(page.getByRole("heading", { level: 1, name: "Watchlist" })).toBeVisible();
    for (const h of ["Saved listings", "Saved searches", "Watched bat models", "New-model review alerts"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  });
});
