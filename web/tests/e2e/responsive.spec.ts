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
    await page.getByText("Menu", { exact: true }).click();
  }
  await expect(page.getByRole("link", { name: "Bat price guide" }).first()).toBeVisible();
  await expect(page.getByRole("searchbox").first()).toBeVisible();
});
