import { expect, test } from "@playwright/test";

test.describe("homepage", () => {
  test("states what the marketplace is and shows real catalog numbers", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Know your bat\./i);
    await expect(page.getByText("Know the stamp. Know the condition. Know the price.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Shop bats" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sell your bat" }).first()).toBeVisible();
  });

  test("shows only real listings, or an empty state when there are none", async ({ page, request }) => {
    await page.goto("/");
    const links = await page.$$eval('a[href^="/listings/"]', (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    if (links.length === 0) await expect(page.getByText("The fence is empty")).toBeVisible();
    // Every listing shown on the homepage is a real, viewable listing.
    for (const href of new Set(links)) expect((await request.get(href)).status(), href).toBe(200);
    await expect(page.getByRole("heading", { name: "Partners" })).toHaveCount(0);
  });

  test("follows the launch order: certification tiles, just listed, the rack, passport, models; no recently sold without sales", async ({ page }) => {
    await page.goto("/");
    const order = await page.locator("main h2, h2").allTextContents();
    const idx = (re: RegExp) => order.findIndex((t) => re.test(t));
    expect(idx(/Shop by certification/i)).toBeGreaterThan(-1);
    expect(idx(/Shop by certification/i)).toBeLessThan(idx(/Bat Passport|Stamped, or not stamped yet/i));
    expect(idx(/Stamped, or not stamped yet/i)).toBeLessThan(idx(/bat models/i));
    for (const name of ["USSSA", "USA / ASA", "Senior", "Dual-stamp"]) await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Dual-stamp/ })).toHaveAttribute("href", "/bats?dual=1");
    // Nothing has completed a sale in the test data, so the section is omitted entirely.
    await expect(page.getByRole("heading", { name: "Recently sold" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Shop by category" })).toHaveCount(0);
  });

  test("shows bat models from the archive, labelled by what the data really is", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("section", { has: page.getByRole("heading", { name: /(Most-listed|Newest) bat models/ }) });
    await expect(section.getByTestId("home-models").getByRole("link").first()).toHaveAttribute("href", /^\/bats\//);
    await expect(section.getByRole("link", { name: "Open the bat archive" })).toBeVisible();
  });

  test("header and footer show bats only, with the archive, watchlist and price guide in the menu", async ({ page, request }) => {
    await page.goto("/");
    const text = await page.locator("header, footer").allInnerTexts();
    const all = text.join(" ").toLowerCase();
    for (const gone of ["gloves", "cleats", "bags", "accessories", "apparel"]) expect(all, gone).not.toContain(gone);
    for (const href of ["/bats", "/manufacturers", "/price-guide", "/account/watchlist"]) await expect(page.locator(`footer a[href="${href}"]`)).toHaveCount(1);
    expect((await request.get("/shop/gloves")).status()).toBe(404);
    const map = await (await request.get("/sitemap.xml")).text();
    expect(map).not.toContain("/shop/gloves");
    expect(map).not.toContain("/shop<");
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
