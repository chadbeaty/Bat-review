import { expect, test } from "@playwright/test";

const PAGES = ["/", "/sign-up", "/sign-in", "/manufacturers", "/bats"];

test("pages fit the screen without sideways scrolling", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("main navigation is reachable", async ({ page }) => {
  await page.goto("/");
  const width = page.viewportSize()!.width;
  if (width < 1024) {
    await page.locator(`summary[aria-label="Menu"]`).click();
  }
  await expect(page.getByRole("link", { name: "Price guide" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Bat archive" }).first()).toBeVisible();
  // On wide screens the watchlist link lives in the account menu and footer; phones and tablets have it in Menu.
  if (width < 1024) await expect(page.getByRole("link", { name: "Watchlist" }).first()).toBeVisible();
  else await expect(page.locator('footer a[href="/account/watchlist"]')).toBeVisible();
  await expect(page.getByRole("searchbox").first()).toBeVisible();
});
