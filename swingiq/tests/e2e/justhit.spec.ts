import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const video = join(__dirname, "..", "fixtures", "video", "swing.y4m");

// Just Hit, the fast lane: a brand-new visitor taps "Just Hit", taps record, swings (a real batter clip fed in as the
// webcam), and gets one grade and one fix. No sign-up, no forms. Then the one profile question, "Again", the full
// breakdown, and the Simple/Full switch.
test("Just Hit: two taps to a recording camera, then a grade, one fix, one question, again, and the full breakdown", async ({ page }) => {
  test.skip(!existsSync(video), "Run scripts/fetch-test-video.sh to download the test clip.");
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const t0 = Date.now();
  await page.goto("/start");
  await page.getByRole("link", { name: /Just Hit/ }).click(); // tap 1
  await expect(page).toHaveURL(/\/hit$/);
  // No instruction screens: the camera, an outline to line up with, one hint and the record button.
  await expect(page.getByText("Side view · ~10 ft back")).toBeVisible();
  await page.getByRole("button", { name: "Record swing" }).click(); // tap 2
  const recording = page.locator('[data-state="recording"]');
  await expect(recording).toBeVisible({ timeout: 30_000 });
  const toRecording = Date.now() - t0;
  test.info().annotations.push({ type: "open to recording (ms)", description: String(toRecording) });
  console.log(`Just Hit: open to recording in ${toRecording} ms`);

  // The real swing (the clip loops every ~4.6 s).
  const fix = page.getByRole("region", { name: /Your one fix|Keep doing this/ });
  await expect(fix).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: /Gapper Score/ })).toBeVisible();
  await expect(page.getByText("Estimated", { exact: true })).toBeVisible();
  await expect(fix.locator("p.head")).not.toBeEmpty();
  await page.screenshot({ path: test.info().outputPath("justhit-result.png") });

  // One small question: height first. Saving it upgrades the guest without losing the swing.
  await expect(page.getByText("Add your height for sharper numbers.")).toBeVisible();
  await page.getByLabel("Feet").fill("6");
  await page.getByLabel("Inches").fill("1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. Your next swings use it.")).toBeVisible();

  // Again: straight back to the camera, already listening.
  await page.getByRole("button", { name: "Again" }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(page.getByText(/^Swing 2$|Couldn't grade this one/)).toBeVisible({ timeout: 60_000 });
  // One question per visit, max.
  await expect(page.getByRole("form", { name: "Sharpen your numbers" })).toHaveCount(0);

  // The full breakdown is the current swing page, unchanged apart from the Estimated tag.
  await page.getByRole("link", { name: "See full breakdown" }).click();
  await expect(page.getByRole("heading", { name: "Swing 2" })).toBeVisible();
  await expect(page.getByText("Estimated", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Legs and feet" }).first()).toBeVisible();

  // Both swings are still there after the guest became a normal hitter.
  await page.goto("/swings");
  await expect(page.getByText(/2 swings/).first()).toBeVisible();

  // Home is the Just Hit home; the setting switches to the full dashboard and back.
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Just Hit/ })).toBeVisible();
  await page.goto("/profile");
  const simple = page.getByRole("switch", { name: /Simple mode/ });
  await expect(simple).toBeChecked();
  await page.getByText("Simple mode", { exact: true }).click();
  await expect(simple).not.toBeChecked();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Hit live/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Just Hit/ })).toHaveCount(0);
  await page.goto("/profile");
  await page.getByText("Simple mode", { exact: true }).click();
  await expect(simple).toBeChecked();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Just Hit/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test("Just Hit: a guest's Full setup keeps the same hitter and opens the full app", async ({ page }) => {
  await page.goto("/hit");
  await expect(page.getByRole("button", { name: "Record swing" })).toBeVisible();
  await page.getByRole("link", { name: "Close" }).click();
  // Back home as a guest: Just Hit is the default, Full setup fills in the profile.
  await expect(page.getByRole("link", { name: /Just Hit/ })).toBeVisible();
  await page.getByRole("link", { name: "Full setup" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("");
  await page.getByLabel("Name").fill("Jo");
  await page.getByRole("button", { name: "Let's hit" }).click();
  await expect(page.getByRole("link", { name: /Hit live/ })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByText("Jo").first()).toBeVisible();
  // One hitter, not two: the guest was upgraded in place.
  await expect(page.getByRole("button", { name: /Jo Active/ })).toBeVisible();
  await expect(page.getByText(/Guest/)).toHaveCount(0);
});
