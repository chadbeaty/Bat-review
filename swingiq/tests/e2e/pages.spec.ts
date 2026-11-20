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

test("first run: the landing page, then setup, then home shows the live session button", async ({ page }) => {
  const errors = errorsOf(page);
  // A new visitor gets the landing page at "/" (public/site), not the app.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Stop guessing\.\s*Start hitting/i })).toBeVisible();
  // Slow pitch is obvious up top ("Built for slowpitch." always in the lime), the platform line is there, and the
  // page is built around record, analyze, improve.
  const tagline = page.locator(".hero-sub");
  await expect(tagline).toHaveText("Built for slowpitch.");
  await expect(tagline).toHaveCSS("color", "rgb(196, 241, 53)");
  await expect(page.getByText(/performance analytics platform for the slow-pitch community/i).first()).toBeVisible();
  await expect(page.locator("#how .pillar")).toHaveCount(3);
  await page.getByRole("link", { name: "Analyze your swing" }).first().click();
  await expect(page).toHaveURL(/\/start$/);
  await page.getByLabel("Name").fill("Chad");
  await page.getByRole("radio", { name: "Left-handed" }).click();
  await page.getByLabel("Feet").fill("6");
  await page.getByLabel("Inches").fill("1");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByRole("link", { name: /Upload a video/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Hit live/ })).toBeVisible();
  await expect(page.getByText("Chad · Lefty")).toBeVisible();
  await noSideScroll(page);
  // Once a hitter exists, "/" is the app on every visit.
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Upload a video/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("landing page: see how it works, the tracked swing draws, the sample is labelled, and it ends on the button", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  await noSideScroll(page);
  await page.getByRole("link", { name: /See how it works/ }).click();
  await expect(page.locator("#how")).toBeInViewport();
  // The sample read is Gapper's real output on a stock clip, and says so.
  await expect(page.getByText("Sample read")).toBeVisible();
  await expect(page.getByText(/A stock clip of a real hitter, run through Gapper/)).toBeVisible();
  await expect(page.locator("[data-frames]")).toHaveText("6");
  // The tracked skeleton actually draws on the canvas.
  const read = page.locator('canvas[data-swing="read"]');
  await read.scrollIntoViewIfNeeded();
  await expect
    .poll(() => read.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
      return lit;
    }))
    .toBeGreaterThan(200);
  // Every measurement on the page carries a measured / estimated label.
  await expect(page.getByRole("row", { name: /Bat speed/ })).toContainText("Estimate");
  await expect(page.getByRole("row", { name: /Exit velocity/ })).toContainText("Slo-mo");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator(".close .cta")).toBeVisible();
  await expect(page.locator(".close .cta")).toHaveAttribute("href", "/start");
  expect(errors).toEqual([]);
});

test("a returning hitter without the cookie is sent from the site to the app", async ({ page, context }) => {
  await page.goto("/start");
  await page.getByLabel("Name").fill("Returning");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByRole("link", { name: /Upload a video/ })).toBeVisible();
  await context.clearCookies();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Upload a video/ })).toBeVisible();
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
  // A photo of the bat, from the camera or camera roll, shrunk and kept on the phone.
  await page.getByLabel("Add a photo of your bat").setInputFiles({ name: "bat.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAARElEQVR4nO3PQQ3AIADAQEAX/sMbRRPB47Kkp6Cd5+7xZ0sHvGpAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQPsAZoECFgzhXjwAAAAASUVORK5CYII=", "base64") });
  await expect(page.getByRole("img", { name: "Your bat" })).toBeVisible();
  await page.getByRole("button", { name: "Save bat" }).click();
  await expect(page.getByText("Miken Freak Primo").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Miken Freak Primo" })).toBeVisible();
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
    await expect(page.getByRole("link", { name: /Upload a video/ })).toBeVisible();
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
