// The eBay "Elsewhere right now" section is OFF unless EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_CAMPAIGN_ID are
// set. The test server runs without them, so these pages must show no trace of eBay. (The section itself is covered by
// unit tests with a mocked fetch; no test here talks to eBay.)
import { expect, test } from "@playwright/test";

test.describe("eBay section is absent when eBay isn't configured", () => {
  test("home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Know your bat." })).toBeVisible();
    await expect(page.getByText("Elsewhere right now")).toHaveCount(0);
    await expect(page.getByTestId("ebay-home-strip")).toHaveCount(0);
  });

  test("bat model page", async ({ page, request }) => {
    await page.goto("/bats/miken/freak-black-maxload-usssa/2026");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Freak Black Maxload");
    await expect(page.getByText("Elsewhere right now")).toHaveCount(0);
    await expect(page.getByTestId("ebay-elsewhere")).toHaveCount(0);
    const html = await (await request.get("/bats/miken/freak-black-maxload-usssa/2026")).text();
    expect(html).not.toMatch(/ebayimg|ebay\.com|Listings from eBay/i);
  });
});
