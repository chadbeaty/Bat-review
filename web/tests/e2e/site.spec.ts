import { expect, test } from "@playwright/test";

test.describe("homepage", () => {
  test("states what the marketplace is and shows real catalog numbers", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Know the stamp, the price and the hits before you buy/i);
    await expect(page.getByText("Bat models in the catalog")).toBeVisible();
    await expect(page.getByText("121", { exact: true })).toBeVisible();
    await expect(page.getByText("7% commission on the item price")).toBeVisible();
    await expect(page.getByRole("link", { name: "Shop equipment" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sell your gear" }).first()).toBeVisible();
  });

  test("shows only real listings, or an empty state when there are none", async ({ page, request }) => {
    await page.goto("/");
    const links = await page.$$eval('a[href^="/listings/"]', (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    if (links.length === 0) await expect(page.getByText("The fence is empty")).toBeVisible();
    // Every listing shown on the homepage is a real, viewable listing.
    for (const href of new Set(links)) expect((await request.get(href)).status(), href).toBe(200);
    await expect(page.getByRole("heading", { name: "Partners" })).toHaveCount(0);
  });

  test("lists every equipment category with bats first", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("section", { has: page.getByRole("heading", { name: "Shop by category" }) });
    await expect(section.getByRole("link")).toHaveCount(10);
    await expect(section.getByRole("link").nth(1)).toContainText("Slow-pitch bats");
  });

  test("mixes brands in the newest bat models", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("section", { has: page.getByRole("heading", { name: /bat models/i }) });
    const brands = await section.locator("li > span:first-child").allTextContents();
    expect(brands.length).toBeGreaterThan(0);
    expect(new Set(brands).size).toBeGreaterThanOrEqual(Math.min(3, brands.length));
  });

  test("every internal link resolves", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.$$eval("a[href^='/']", (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!.split("#")[0]))]);
    expect(hrefs.length).toBeGreaterThan(20);
    for (const href of hrefs) {
      const res = await request.get(href, { maxRedirects: 0 });
      expect(res.status(), href).toBeLessThan(400);
    }
  });

  test("joins the newsletter", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email").last().fill(`fan-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Get updates" }).click();
    await expect(page.getByText("Almost there")).toBeVisible();
  });
});

test.describe("pages and security", () => {
  test("unknown category returns 404", async ({ request }) => {
    expect((await request.get("/shop/not-a-category")).status()).toBe(404);
  });

  test("sends security headers", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
  });

  test("keeps private areas out of search engines", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const path of ["/account", "/admin", "/checkout", "/messages"]) expect(robots).toContain(`Disallow: ${path}`);
  });

  test("sends signed-out visitors from the account page to sign-in", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount/);
  });
});
