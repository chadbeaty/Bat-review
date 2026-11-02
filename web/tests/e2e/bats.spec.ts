// Browser tests for the bat database: model pages, First Swings, alerts and watchlist, the price guide,
// comparison and manufacturer pages. Needs the local Supabase stack with the bat database seed applied.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, createLiveListing, hasSupabase, serviceClient, signIn } from "./helpers";

const KP23 = "/bats/miken/kp23-maxload-usa/2026";
const TANTRUM = "/bats/easton/tantrum-black-loaded-usa/2026";

test.skip(!hasSupabase(), "needs the local Supabase stack");

// Listings this file creates are taken down afterwards, so other test files on the shared database don't see them.
const createdListings: string[] = [];
test.afterAll(async () => {
  if (createdListings.length) await serviceClient().from("equipment_listings").update({ listing_status: "removed" }).in("id", createdListings);
});

async function noSidewaysScroll(page: Page, path: string) {
  await page.goto(path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, path).toBeLessThanOrEqual(0);
}

test.describe("model page", () => {
  test("shows specs with their verification status, warranty and release status", async ({ page }) => {
    await page.goto(KP23);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("2026 Miken KP23 Maxload");
    await expect(page).toHaveTitle(/2026 Miken KP23 Maxload USA/);
    const specs = page.locator("section", { has: page.getByRole("heading", { name: "Specs" }) });
    await expect(specs.getByRole("row", { name: /Barrel length/ })).toContainText('12"');
    await expect(specs.getByRole("row", { name: /Available weights/ })).toContainText("Not listed");
    await expect(specs.getByText("Unverified retailer listing").first()).toBeVisible();
    await expect(specs.getByRole("link", { name: "View the source listing" })).toHaveAttribute("href", /^https:\/\//);
    await expect(page.getByTestId("warranty")).toContainText("One year from purchase, one-time repair or replacement");
    await expect(page.getByTestId("release-badge")).toHaveText("Release date not on file");

    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toContain(KP23);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
    expect(ld["@type"]).toBe("Product");
    expect(ld.brand.name).toBe("Miken");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("offers");
  });

  test("shows the lineage card with a named predecessor and its sources", async ({ page }) => {
    await page.goto(KP23);
    const card = page.getByTestId("lineage");
    await expect(card.getByRole("heading", { name: "What changed from last year" })).toBeVisible();
    await expect(card).toContainText("2025 Miken KP23");
    await expect(card).toContainText("not in our catalog yet");
    await expect(card).toContainText("Medium confidence: an assumption");
    await expect(card.getByRole("link").first()).toHaveAttribute("href", /^https?:\/\//);
  });

  test("links an in-catalog predecessor and labels its reviews", async ({ page }) => {
    await page.goto(TANTRUM);
    const card = page.getByTestId("lineage");
    const link = card.getByRole("link", { name: "2025 Easton Tantrum" });
    await expect(link.first()).toBeVisible();
    await link.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("2025 Easton Tantrum");
    await expect(page.getByTestId("lineage")).toContainText("Newer version");
  });

  test("lists published reviews for the bat, then for its line", async ({ page }) => {
    await page.goto(KP23);
    const own = page.getByTestId("reviews-model");
    await expect(own.getByRole("heading", { name: "Reviews of the 2026 Miken KP23 Maxload" })).toBeVisible();
    await expect(own.getByRole("link", { name: "2026 Miken KP23 2-Piece Maxload USA/ASA Review" })).toHaveAttribute("href", /youtube\.com/);
    await expect(page.getByTestId("reviews-line")).toContainText("not necessarily this exact model");
  });

  test("says there aren't enough verified sales instead of guessing a price", async ({ page }) => {
    await page.goto(KP23);
    const sold = page.getByTestId("sold-prices");
    await expect(sold.getByText("Not enough verified sales yet")).toBeVisible();
    await expect(sold).toContainText("at least 5 verified sales");
    await expect(page.getByText("A price trend chart appears here once there are enough verified sales.")).toBeVisible();
    await expect(page.getByText("Actual average completed sale price")).toHaveCount(0);
  });

  test("shows a new live listing with the asking-price stats", async ({ page }) => {
    const seller = await createConfirmedUser("batseller");
    const title = `Test Worth KReCHeR ${randomUUID().slice(0, 6)}`;
    const id = await createLiveListing(seller, {
      productSlug: "worth-krecher-xl-usssa-2026",
      title,
      priceCents: 23457,
      attributes: { weight_oz: 26, certification: ["USSSA"], weighting_type: "endload", model_year: 2026 },
    });
    createdListings.push(id);
    await page.goto("/bats/worth/krecher-xl-usssa/2026");
    const card = page.locator(`a[href="/listings/${id}"]`);
    await expect(card).toContainText(title);
    await expect(card).toContainText("$234.57");
    const asking = page.getByTestId("asking-prices");
    await expect(asking.getByText("Current asking-price range")).toBeVisible();
    await expect(asking.getByText("Average current asking price")).toBeVisible();
    // Asking prices never show up as sold prices.
    await expect(page.getByTestId("sold-prices")).not.toContainText("$234.57");

    await page.goto("/price-guide?q=krecher");
    await expect(page.getByTestId("price-guide-list").getByRole("link", { name: /krecher xl/i }).first()).not.toContainText("None listed");
  });

  test("returns 404 for an unknown model, year or manufacturer", async ({ request }) => {
    expect((await request.get("/bats/miken/not-a-real-bat/2026")).status()).toBe(404);
    expect((await request.get("/bats/miken/kp23-maxload-usa/1999")).status()).toBe(404);
    expect((await request.get("/bats/nobody/kp23-maxload-usa/2026")).status()).toBe(404);
    expect((await request.get("/manufacturers/not-a-brand")).status()).toBe(404);
  });
});

test.describe("members on a model page", () => {
  test("files a First Swings report and is told about the 7-day rule on a second try", async ({ page }) => {
    const member = await createConfirmedUser("swinger");
    const path = "/bats/miken/freak-black-maxload-usssa/2026";
    await signIn(page, member, path);
    await expect(page).toHaveURL(new RegExp(path));
    const form = page.getByRole("form", { name: "First Swings report" });
    await expect(form).toContainText("One check-in per bat every 7 days");
    await form.getByLabel("Weight you swing").selectOption("26");
    await form.getByLabel("Hits so far (roughly)").selectOption("100");
    await form.getByLabel("Ball you mostly hit").selectOption("44/375");
    await form.getByLabel("Compared with your previous gamer").selectOption("better");
    await form.getByLabel("Sting on mishits").selectOption("2");
    await form.getByLabel("Typical temperature (°F, optional)").fill("78");
    const note = `E2E check-in ${randomUUID().slice(0, 8)}`;
    await form.getByLabel(/Anything else owners should know/).fill(note);
    await form.getByRole("button", { name: "Publish my check-in" }).click();
    await expect(form.getByRole("status")).toContainText("Your check-in is published");

    await page.reload();
    await expect(page.getByTestId("latest-reports")).toContainText(note);
    await expect(page.getByTestId("latest-reports").locator("li", { hasText: note })).toContainText("Owner");
    await expect(page.getByTestId("latest-reports")).not.toContainText(member.username);
    await expect(page.getByTestId("first-swings-summary")).toContainText("Owners reporting");
    await expect(page.getByText(/Your next one opens on/)).toBeVisible();

    const again = page.getByRole("form", { name: "First Swings report" });
    await again.getByRole("button", { name: "Publish my check-in" }).click();
    await expect(again.getByRole("alert")).toContainText("already checked in on this bat in the last 7 days");
  });

  test("validates the report form with friendly errors", async ({ page }) => {
    const member = await createConfirmedUser("validator");
    await signIn(page, member, "/bats/miken/freak-black-maxload-usssa/2026");
    const form = page.getByRole("form", { name: "First Swings report" });
    await form.getByLabel("Previous gamer (optional)").fill("x");
    await form.getByRole("button", { name: "Publish my check-in" }).click();
    await expect(form.getByRole("alert")).toContainText("Check the highlighted answers");
    await expect(form).toContainText("at least 2 characters");
  });

  test("sets review alerts and watches a bat with a target price", async ({ page }) => {
    const member = await createConfirmedUser("watcher");
    await signIn(page, member, KP23);
    const alerts = page.getByRole("form", { name: "Review alerts" });
    await alerts.getByLabel("When it gets its first published review").check();
    await alerts.getByLabel("When one is listed for sale").check();
    await alerts.getByRole("button", { name: "Save alerts" }).click();
    await expect(alerts.getByRole("status")).toHaveText("Alerts saved for this bat.");

    const watch = page.getByRole("form", { name: "Watchlist" });
    await watch.getByLabel("Target price (optional, $)").fill("180");
    await watch.getByRole("button", { name: "Add to watchlist" }).click();
    await expect(page.getByText("On your watchlist with a target price of $180.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("form", { name: "Review alerts" }).getByLabel("When it gets its first published review")).toBeChecked();
    await expect(page.getByRole("form", { name: "Review alerts" }).getByLabel("When one is listed for sale")).toBeChecked();
    await expect(page.getByRole("form", { name: "Review alerts" }).getByLabel(/enough owners have reported/)).not.toBeChecked();
    await expect(page.getByRole("form", { name: "Watchlist" }).getByLabel("Target price (optional, $)")).toHaveValue("180");
    await expect(page.getByRole("button", { name: "Update watch" })).toBeVisible();
    await page.getByRole("button", { name: "Remove from watchlist" }).click();
    await expect(page.getByText("Removed from your watchlist.")).toBeVisible();
  });

  test("asks visitors to sign in instead of showing member forms", async ({ page }) => {
    await page.goto(KP23);
    await expect(page.getByRole("form", { name: "First Swings report" })).toHaveCount(0);
    await expect(page.getByText("Own this bat? Sign in to file a First Swings check-in.")).toBeVisible();
    await expect(page.locator("#first-swings").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /sign-in\?next=%2Fbats%2Fmiken/);
  });
});

test.describe("price guide", () => {
  test("explains asking vs sold and the thresholds, and lists every model", async ({ page }) => {
    await page.goto("/price-guide");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bat price guide");
    await expect(page.getByTestId("thresholds")).toContainText("Under 5 verified sales");
    await expect(page.getByTestId("thresholds")).toContainText("10 or more");
    await expect(page.getByTestId("result-count")).toHaveText("121 models");
    await expect(page.getByTestId("price-guide-list").getByText("Not enough verified sales yet").first()).toBeVisible();
  });

  test("filters by brand, year, stamp and search", async ({ page }) => {
    await page.goto("/price-guide");
    await page.getByLabel("Brand").selectOption("miken");
    await page.getByLabel("Stamp").selectOption("USA");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/brand=miken/);
    const items = page.getByTestId("price-guide-list").locator("li");
    const n = await items.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(items.nth(i)).toContainText("Miken");
      await expect(items.nth(i)).toContainText("USA");
    }
    await page.goto("/price-guide?q=kp23&year=2026");
    await expect(page.getByTestId("price-guide-list").getByRole("link", { name: /KP23 Maxload/ }).first()).toBeVisible();
    await page.getByTestId("price-guide-list").getByRole("link", { name: /KP23 Maxload/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("KP23");
    await page.goto("/price-guide?q=zzzz-no-such-bat");
    await expect(page.getByText("No models match those filters.")).toBeVisible();
  });
});

test.describe("compare", () => {
  test("highlights differences and adds or removes models", async ({ page }) => {
    await page.goto("/compare?models=miken-kp23-maxload-usa-2026,easton-alpha-2pc-loaded-usssa-2026");
    const table = page.getByTestId("compare-table");
    await expect(table.getByRole("columnheader", { name: "2026 Miken KP23 Maxload" })).toBeVisible();
    const manufacturer = table.getByRole("row", { name: /^Manufacturer/ });
    await expect(manufacturer).toHaveAttribute("data-differs", "true");
    await expect(manufacturer).toContainText("Differs");
    await expect(table.getByRole("row", { name: /^Model year/ })).toHaveAttribute("data-differs", "false");
    await expect(table.getByRole("row", { name: /^Stamps/ })).toHaveAttribute("data-differs", "true");
    await expect(table.getByRole("row", { name: /^Warranty/ })).toContainText("One year from purchase");
    await expect(table).not.toContainText(/hits farther|more pop|best bat/i);

    await page.getByRole("combobox", { name: "Add a model" }).selectOption("demarini-the-standard-usssa-2027");
    await page.getByRole("button", { name: "Add to comparison" }).click();
    await expect(page).toHaveURL(/models=miken-kp23-maxload-usa-2026,easton-alpha-2pc-loaded-usssa-2026,demarini-the-standard-usssa-2027/);
    await expect(page.getByTestId("compare-table").getByRole("columnheader", { name: /\d{4} / })).toHaveCount(3);
    await expect(page.getByText("You're comparing the maximum of 3 models.")).toBeVisible();

    await page.getByRole("link", { name: "Remove 2026 Miken KP23 Maxload" }).click();
    await expect(page.getByTestId("compare-table").getByRole("columnheader", { name: /\d{4} / })).toHaveCount(2);
  });

  test("starts from a model page", async ({ page }) => {
    await page.goto(KP23);
    await page.getByRole("link", { name: "Compare with other bats" }).click();
    await expect(page).toHaveURL(/\/compare\?models=miken-kp23-maxload-usa-2026/);
    await expect(page.getByText("Add one more model to compare.")).toBeVisible();
  });
});

test.describe("manufacturers", () => {
  test("directory links to brand pages with models by year and line", async ({ page }) => {
    await page.goto("/manufacturers");
    await page.getByRole("link", { name: /^Miken/ }).click();
    await expect(page).toHaveURL(/\/manufacturers\/miken$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Miken");
    await expect(page.getByRole("heading", { name: "2026", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "KP23", level: 3 }).first()).toBeVisible();
    await expect(page.getByTestId("warranty")).toContainText("One year");
    await page.getByRole("link", { name: /KP23 Maxload/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("KP23");
  });

  test("says when warranty terms aren't on file", async ({ page }) => {
    await page.goto("/manufacturers/marucci");
    await expect(page.getByTestId("warranty")).toContainText("Warranty terms not on file");
  });
});

test("sitemap lists model and manufacturer pages", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/bats/miken/kp23-maxload-usa/2026");
  expect(xml).toContain("/manufacturers/miken");
  expect(xml).toContain("/price-guide");
  expect((xml.match(/\/bats\/[a-z0-9-]+\/[a-z0-9-]+\/\d{4}/g) ?? []).length).toBeGreaterThanOrEqual(121);
});

test("model page, price guide and compare fit a 390px phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [KP23, TANTRUM, "/price-guide", "/compare?models=miken-kp23-maxload-usa-2026,easton-alpha-2pc-loaded-usssa-2026,demarini-the-standard-usssa-2027", "/manufacturers/miken"]) {
    await noSidewaysScroll(page, path);
  }
});
