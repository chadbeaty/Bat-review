import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const video = join(__dirname, "..", "fixtures", "video", "swing.y4m");

// The real thing: a real batter's swing is fed in as the webcam. The app has to find the body, pass setup, catch the
// swing on its own, score it, save it with its clip, and play it back frame by frame.
test("catches a real swing from the camera with no taps", async ({ page }) => {
  test.skip(!existsSync(video), "Run scripts/fetch-test-video.sh to download the test clip.");
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/live");
  await page.getByLabel("Name").fill("Tester");
  await page.getByRole("button", { name: "Save and continue" }).click();
  // Upper-body clip: use side view and keep the mic on (fake mic gives a beep we must not mistake for contact).
  await page.getByRole("button", { name: "Turn on camera" }).click();

  // Setup screen with live checks. When every check passes the session starts on its own after two seconds,
  // so either the setup panel or the batting screen is fine here.
  const setup = page.getByRole("heading", { name: /Line up the shot|Looking good/ });
  const batting = page.getByRole("button", { name: "End session" });
  await expect(setup.or(batting)).toBeVisible({ timeout: 60_000 });
  if (await setup.isVisible()) await page.getByRole("button", { name: /Start (anyway|now)/ }).click({ timeout: 5000 }).catch(() => {});
  await expect(batting).toBeVisible();

  // Batting: wait for the first swing to be captured (the clip loops every ~4.6 s).
  await expect(page.getByLabel(/^[1-9]\d* swings?$/)).toBeVisible({ timeout: 60_000 });
  // Result card with a cue.
  await expect(page.getByText(/^Swing 1$/).first()).toBeVisible();

  await page.getByRole("button", { name: "Review last" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel(/Swing frame \d+ of \d+/)).toBeVisible();
  await page.getByRole("button", { name: "Next frame" }).click();
  await expect(page.getByText("Bat speed").first()).toBeVisible();
  await page.getByRole("button", { name: "Back to batting" }).click();

  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: /swings? logged/ })).toBeVisible();
  await page.getByRole("button", { name: "Review swings" }).click();
  await page.getByRole("link", { name: /#1/ }).click();
  await expect(page.getByRole("heading", { name: "Swing 1" })).toBeVisible();
  // The clip's frames were saved on the device.
  await expect(page.getByText("Video not saved for this swing")).toHaveCount(0);
  await expect(page.getByText(/Not available/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
