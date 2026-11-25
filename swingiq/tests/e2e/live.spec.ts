import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const video = join(__dirname, "..", "fixtures", "video", "swing.y4m");

// The real thing: a real batter, filmed head to toe from the pitcher's side, is fed in as the webcam. The app has to
// find the body (feet included), pass setup, catch the swing on its own, read the legs and feet, score it, save it with
// its clip, and play it back frame by frame.
test("catches a real swing from the camera with no taps", async ({ page }) => {
  test.skip(!existsSync(video), "Run scripts/fetch-test-video.sh to download the test clip.");
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/live");
  await page.getByLabel("Name").fill("Tester");
  await page.getByRole("button", { name: "Save and continue" }).click();
  // Filmed from the pitcher's side: front view. Keep the mic on (the fake mic beeps; that must not count as contact).
  await page.getByRole("radio", { name: /Front/ }).click();
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
  // Scoreboard mode is on by default: the big readout with the gap timer headline and the score.
  const board = page.getByRole("region", { name: "Scoreboard" });
  await expect(board).toBeVisible();
  await expect(board.getByText(/Swing 1 · live estimate/)).toBeVisible();
  // The gap is either a number in seconds with its ± and source tag, or a dash with a short reason. Never a guess.
  const gap = board.getByTestId("gap-value");
  await expect(gap).toHaveText(/^(\d\.\d\ds|—.+)$/);
  if (/^\d/.test((await gap.textContent()) ?? "")) {
    await expect(board.getByText(/Estimate ± 0\.\d\d s · (High|Medium) confidence · Camera estimate · one frame at \d+ fps/)).toBeVisible();
    await expect(board.getByText("Skilled hitters ≈ 0.20")).toBeVisible();
  }
  await expect(board.getByTestId("scoreboard-score")).toHaveText(/^(\d{1,3}|—)$/);
  // Live mode never shows ball or bat speeds (slo-mo uploads only).
  await expect(board).not.toContainText(/mph|exit velo|bat speed|launch/i);
  await page.screenshot({ path: test.info().outputPath("scoreboard.png") });

  // The toggle switches back to the small result card, and the choice sticks.
  const toggle = page.getByRole("button", { name: "Scoreboard" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(board).toHaveCount(0);
  await expect(page.getByText(/^Swing \d+$/).first()).toBeVisible();
  await toggle.click();
  await expect(board).toBeVisible();

  await page.getByRole("button", { name: "Review last" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel(/Swing frame \d+ of \d+/)).toBeVisible();
  await page.getByRole("button", { name: "Next frame" }).click();
  await expect(page.getByText("Bat speed").first()).toBeVisible();
  // Legs and feet were read: the section is there and the timing move was recognised.
  await expect(page.getByRole("dialog").getByRole("region", { name: "Legs and feet" })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Timing move")).toBeVisible();
  await page.getByRole("button", { name: "Back to batting" }).click();

  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: /swings? logged/ })).toBeVisible();
  await page.getByRole("button", { name: "Review swings" }).click();
  await page.getByRole("link", { name: /Swing 1\b/ }).click();
  await expect(page.getByRole("heading", { name: "Swing 1" })).toBeVisible();
  // The clip's frames were saved on the device.
  await expect(page.getByText("Video not saved for this swing")).toHaveCount(0);
  await expect(page.getByText(/Not available/).first()).toBeVisible();
  // The Foot down phase only exists when the live read caught the front foot landing. If it's missing, say how well the
  // session tracked (frame rates, feet in view) so a failure can be told apart from a slow test machine.
  const quality = (await page.getByText(/^Tracking \d+ fps/).textContent({ timeout: 3000 }).catch(() => null)) ?? "no tracking line";
  await expect(page.getByRole("button", { name: "Foot down", exact: true }), `No foot-down mark on the saved live swing (${quality})`).toBeVisible();
  expect(errors).toEqual([]);
});
