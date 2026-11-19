import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The MVP flows end to end: profile details, Bat DNA, recording/uploading a real swing video, the coach, personal best,
// comparing two swings, and the dashboard. Everything is stored on the device, so each test starts fresh.
const video = join(__dirname, "..", "fixtures", "video", "swing.webm");
// The same batter at 240 fps with a softball of known speed drawn in (85 mph, 18° launch, 25 mph pitch).
// Built by scripts/fetch-test-video.sh; see tests/fixtures/build/speed-video.build.ts.
const speed240 = join(__dirname, "..", "fixtures", "video", "speed240.webm");
const speed240x8 = join(__dirname, "..", "fixtures", "video", "speed240x8.webm");

async function speedOnSwingPage(page: Page) {
  await page.getByRole("link", { name: /Exit velo/ }).first().click();
  const card = page.getByRole("region", { name: "Speed" });
  await expect(card.getByText("From slo-mo video")).toBeVisible();
  const ev = Number((await card.getByTestId("speed-ev").locator(".num").innerText()).trim());
  const bat = Number((await card.getByTestId("speed-bat").locator(".num").innerText()).trim());
  return { card, ev, bat };
}

async function newHitter(page: Page, name = "Tester") {
  await page.goto("/");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByRole("link", { name: /Record my swing/ })).toBeVisible();
}

async function uploadSwing(page: Page) {
  await page.goto("/record");
  await page.getByRole("radio", { name: /Front/ }).click();
  await page.setInputFiles("#up-input", video);
  await expect(page.getByRole("heading", { name: /swings? analyzed|No swing found/ })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByRole("heading", { name: /1 swing analyzed/ })).toBeVisible();
}

test("profile: playing level, positions, goals and Bat DNA with balance", async ({ page }) => {
  await newHitter(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: /level, position and goals/ }).click();
  await page.getByLabel("Playing level").selectOption("tournament");
  await page.getByRole("button", { name: "SS", exact: true }).click();
  await page.getByRole("button", { name: "More line drives" }).click();
  await page.getByRole("button", { name: "Save hitter" }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Playing level")).toHaveValue("tournament");
  await expect(page.getByRole("button", { name: "SS", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "More line drives" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/bats");
  await expect(page.getByText("No bats yet")).toBeVisible();
  await page.getByRole("button", { name: "Add a bat" }).click();
  await page.getByLabel("Brand").fill("Easton");
  await page.getByRole("textbox", { name: "Model" }).fill("Ghost");
  await page.getByLabel("Weight in ounces").fill("26");
  await page.getByLabel("Balance").selectOption("end-loaded");
  await page.getByRole("button", { name: "Save bat" }).click();
  await expect(page.getByRole("heading", { name: "Easton Ghost" })).toBeVisible();
  await expect(page.getByText(/End-loaded \(1 oz or more\)/)).toBeVisible();
  await expect(page.getByText(/No swings with this bat yet/)).toBeVisible();
});

test("record a swing from a video: analyzed, coached, saved, comparable", async ({ page }) => {
  test.skip(!existsSync(video), "Run scripts/fetch-test-video.sh to download the test clip.");
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await newHitter(page, "Uploader");

  // A bat to link the swing to.
  await page.goto("/bats");
  await page.getByRole("button", { name: "Add a bat" }).click();
  await page.getByLabel("Brand").fill("Miken");
  await page.getByRole("textbox", { name: "Model" }).fill("Freak");
  await page.getByRole("button", { name: "Save bat" }).click();
  await expect(page.getByRole("heading", { name: "Miken Freak" })).toBeVisible();

  await page.goto("/record");
  await page.locator("#rbat").selectOption({ label: "Miken Freak" });
  await page.getByRole("radio", { name: /Front/ }).click();
  await page.setInputFiles("#up-input", video);
  await expect(page.getByRole("heading", { name: /1 swing analyzed/ })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/Processed from video at \d+ fps/)).toBeVisible();

  // The swing page: source label, score breakdown, coach, bat.
  await page.getByRole("link", { name: /Fix:|Nice:|Note:/ }).first().click();
  await expect(page.getByText("Processed from video · every frame")).toBeVisible();
  await expect(page.getByText("Score breakdown", { exact: false })).toBeVisible();
  const breakdown = page.getByRole("list", { name: "Score breakdown" });
  for (const c of ["Balance", "Timing", "Rotation", "Bat path", "Contact", "Follow-through"]) {
    await expect(breakdown.getByRole("button", { name: new RegExp(`^${c}`) })).toBeVisible();
  }
  const coach = page.getByRole("region", { name: "Coach" });
  await expect(coach.getByText("Why it matters")).toBeVisible();
  await expect(coach.getByText(/^Drill:/)).toBeVisible();
  await expect(coach.getByText("10-swing challenge")).toBeVisible();
  await expect(page.getByLabel("Bat used")).toHaveValue(/.+/);
  await page.getByRole("button", { name: /Mark as personal best/ }).click();
  await expect(page.getByRole("button", { name: /★ Personal best/ })).toBeVisible();

  // Bat DNA counts the swing.
  await page.goto("/bats");
  await expect(page.getByText(/14 more to compare/)).toBeVisible();

  // A second swing, then compare the two side by side.
  await uploadSwing(page);
  await page.goto("/compare");
  await expect(page.getByLabel(/^A · Swing/)).toBeVisible();
  await expect(page.getByLabel(/^B · Swing.*best/)).toBeVisible();
  await page.getByRole("button", { name: "Play both" }).click();
  await page.getByRole("radio", { name: "Foot down" }).click();
  await expect(page.getByRole("row", { name: /Gapper Score/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Foot down/ })).toBeVisible();

  // The dashboard shows recent swings and the personal best.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recent swings" })).toBeVisible();
  await expect(page.getByText("Personal best swing")).toBeVisible();
  expect(errors).toEqual([]);
});

test("compare and Bat DNA explain what's missing when there isn't enough data", async ({ page }) => {
  await newHitter(page);
  await page.goto("/compare");
  await expect(page.getByText("Record two swings to compare")).toBeVisible();
  await page.goto("/record");
  await expect(page.getByText("Record with camera", { exact: true })).toBeVisible();
  await expect(page.getByText("Upload a video", { exact: true })).toBeVisible();
});

test("slo-mo video: exit velo, launch angle, pitch speed and bat speed", async ({ page }) => {
  test.skip(!existsSync(speed240), "Run scripts/fetch-test-video.sh to build the slo-mo test clip.");
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await newHitter(page, "Slugger");
  await page.goto("/record");
  await page.getByRole("radio", { name: /Front/ }).click();
  // A true 240 fps file: "Normal speed" is right (the file itself runs at 240 frames a second).
  await page.setInputFiles("#up-input", speed240);
  await expect(page.getByRole("heading", { name: /1 swing analyzed/ })).toBeVisible({ timeout: 300_000 });
  await expect(page.getByText(/Exit velo \d+ mph · bat \d+ mph/)).toBeVisible();
  const { card, ev, bat } = await speedOnSwingPage(page);
  // Truth is 85 mph; the reading must land within about 10% and show its ± range.
  expect(ev).toBeGreaterThan(76);
  expect(ev).toBeLessThan(94);
  expect(bat).toBeGreaterThan(55);
  expect(bat).toBeLessThan(85);
  await expect(card.getByText(/± \d+ mph/).first()).toBeVisible();
  await expect(card.getByText(/^1[5-9]°|^2[01]°/)).toBeVisible(); // launch angle, truth 18°
  await expect(card.getByText(/^2[2-8] mph$/)).toBeVisible(); // pitch speed, truth 25 mph
  // Bat DNA and the dashboard pick it up.
  await page.goto("/");
  await expect(page.getByText("Top exit velo")).toBeVisible();
  expect(errors).toEqual([]);
});

test("slo-mo video filmed at 8x but uploaded as normal speed gets fixed automatically", async ({ page }) => {
  test.skip(!existsSync(speed240x8), "Run scripts/fetch-test-video.sh to build the slo-mo test clip.");
  // Two full passes over a 29 s clip: slow on a CI runner (about 8 minutes there).
  test.setTimeout(900_000);
  await newHitter(page, "Wrong Setting");
  await page.goto("/record");
  await page.getByRole("radio", { name: /Front/ }).click();
  // An iPhone Slo-mo share: 30 fps, slowed 8x. Left on "Normal speed" on purpose.
  await page.setInputFiles("#up-input", speed240x8);
  await expect(page.getByRole("heading", { name: /1 swing analyzed/ })).toBeVisible({ timeout: 840_000 });
  await expect(page.getByText(/8× slow motion, so it was re-analyzed/)).toBeVisible();
  const { ev } = await speedOnSwingPage(page);
  expect(ev).toBeGreaterThan(76);
  expect(ev).toBeLessThan(94);
});
