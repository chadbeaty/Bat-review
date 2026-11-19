import { expect, test } from "@playwright/test";

// Every page renders on a phone and a desktop without errors or sideways scrolling, and the first-run flow works.
const errorsOf = (page: import("@playwright/test").Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
};

async function noSideScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("first run: set up a hitter, then home shows the live session button", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Know your swing/ })).toBeVisible();
  await page.getByLabel("Name").fill("Chad");
  await page.getByRole("radio", { name: "Left-handed" }).click();
  await page.getByLabel("Feet").fill("6");
  await page.getByLabel("Inches").fill("1");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByRole("link", { name: /Start live session/ }).first()).toBeVisible();
  await expect(page.getByText("Chad · Lefty")).toBeVisible();
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test("validates the hitter form", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Feet").fill("9");
  await page.getByLabel("Name").fill("X");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByText(/Height should be between/)).toBeVisible();
});

test("profile: add a bat, change settings, add a second hitter", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  await page.getByLabel("Name").fill("Sam");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Add bat" }).click();
  await page.getByLabel("Brand").fill("Miken");
  await page.getByRole("textbox", { name: "Model" }).fill("Freak Primo");
  await page.getByLabel("Weight in ounces").fill("27");
  await page.getByRole("button", { name: "Save bat" }).click();
  await expect(page.getByText("Miken Freak Primo")).toBeVisible();
  await expect(page.getByText(/34 in · 27 oz · drop -7/)).toBeVisible();

  await page.getByText("Quiet mode", { exact: true }).click();
  await expect(page.getByRole("switch", { name: /Quiet mode/ })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: /Quiet mode/ })).toBeChecked();

  await page.getByRole("button", { name: "Add hitter" }).click();
  await page.getByLabel("Name").fill("Kid");
  await page.getByRole("button", { name: "Save hitter" }).click();
  await expect(page.getByText("Kid").first()).toBeVisible();
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

for (const path of ["/swings", "/progress", "/guide", "/how-it-works", "/privacy", "/sign-in", "/live"]) {
  test(`renders ${path}`, async ({ page }) => {
    const errors = errorsOf(page);
    await page.goto("/");
    await page.getByLabel("Name").fill("Pat");
    await page.getByRole("button", { name: "Let's hit" }).click();
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await noSideScroll(page);
    expect(errors).toEqual([]);
  });
}

test("how-it-works is honest about bat speed", async ({ page }) => {
  await page.goto("/how-it-works");
  const row = page.getByRole("row", { name: /Bat speed/ });
  await expect(row).toContainText("No");
});
