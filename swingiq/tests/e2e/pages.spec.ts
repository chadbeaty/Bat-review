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

test("first run: the scroll site, then setup, then home shows the live session button", async ({ page }) => {
  const errors = errorsOf(page);
  // A new visitor gets the scroll site at "/" (public/site), not the app.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "You see a swing." })).toBeVisible();
  await expect(page.locator("main section[data-sc-act]")).toHaveCount(6);
  await page.getByRole("link", { name: "Start swinging" }).first().click();
  await expect(page).toHaveURL(/\/start$/);
  await page.getByLabel("Name").fill("Chad");
  await page.getByRole("radio", { name: "Left-handed" }).click();
  await page.getByLabel("Feet").fill("6");
  await page.getByLabel("Inches").fill("1");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByRole("link", { name: /Record my swing/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start live analysis/ })).toBeVisible();
  await expect(page.getByText("Chad · Lefty")).toBeVisible();
  await noSideScroll(page);
  // Once a hitter exists, "/" is the app on every visit.
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Record my swing/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("scroll site: the swing scrubs, the heel catch counts frames, and the page ends on the button", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  await noSideScroll(page);
  const gap = page.locator("#gap");
  await gap.scrollIntoViewIfNeeded();
  // Scroll to the end of the gap (contact): the counter shows the six frames from heel down to contact.
  await page.evaluate(() => {
    const el = document.getElementById("gap")!;
    const top = el.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + (el.offsetHeight - innerHeight) * 0.82);
  });
  await expect(page.locator("[data-frames]")).toHaveText("6");
  await expect(page.locator("#rail")).toHaveClass(/is-stamped|is-peak/);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("#start .cta")).toBeVisible();
  await expect(page.locator("#start .cta")).toHaveAttribute("href", "/start");
  expect(errors).toEqual([]);
});

test("a returning hitter without the cookie is sent from the site to the app", async ({ page, context }) => {
  await page.goto("/start");
  await page.getByLabel("Name").fill("Returning");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByRole("link", { name: /Record my swing/ })).toBeVisible();
  await context.clearCookies();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Record my swing/ })).toBeVisible();
});

test("validates the hitter form", async ({ page }) => {
  await page.goto("/start");
  await page.getByLabel("Feet").fill("9");
  await page.getByLabel("Name").fill("X");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByText(/Height should be between/)).toBeVisible();
});

test("profile: add a bat, change settings, add a second hitter", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/start");
  await page.getByLabel("Name").fill("Sam");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByRole("main").getByRole("link", { name: /Bat DNA/ }).click();
  await page.getByRole("button", { name: "Add a bat" }).click();
  await page.getByLabel("Brand").fill("Miken");
  await page.getByRole("textbox", { name: "Model" }).fill("Freak Primo");
  await page.getByLabel("Weight in ounces").fill("27");
  await page.getByRole("button", { name: "Save bat" }).click();
  await expect(page.getByText("Miken Freak Primo")).toBeVisible();
  await expect(page.getByText(/34 in · 27 oz · drop -7/)).toBeVisible();
  await page.getByRole("link", { name: "Profile" }).click();

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

for (const path of ["/swings", "/progress", "/guide", "/how-it-works", "/privacy", "/sign-in", "/live", "/record", "/bats", "/compare"]) {
  test(`renders ${path}`, async ({ page }) => {
    const errors = errorsOf(page);
    await page.goto("/start");
    await page.getByLabel("Name").fill("Pat");
    await page.getByRole("button", { name: "Let's hit" }).click();
    await expect(page.getByRole("link", { name: /Record my swing/ })).toBeVisible();
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await noSideScroll(page);
    expect(errors).toEqual([]);
  });
}

test("how-it-works is honest about bat speed and exit velo", async ({ page }) => {
  await page.goto("/how-it-works");
  // Not from live mode; from slo-mo video, bat speed is labeled an estimate.
  const bat = page.getByRole("row", { name: /Bat speed/ });
  await expect(bat).toContainText("No");
  await expect(bat).toContainText("Estimate");
  await expect(page.getByRole("row", { name: /Exit velocity/ })).toContainText("±");
  await expect(page.getByRole("heading", { name: /Exit velo and bat speed from slo-mo/ })).toBeVisible();
});
