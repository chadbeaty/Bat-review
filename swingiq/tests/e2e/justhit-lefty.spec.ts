import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const video = join(__dirname, "..", "fixtures", "video", "swing-lefty.y4m");

// A left-handed batter on camera (the real test swing, mirrored). A Just Hit guest starts on the "bats right" default.
// After the first swing the one question is the batting side; one tap on "Left" re-reads that swing as a lefty's and
// every swing after it is read that way, with the outline facing the way a lefty stands.
test("Just Hit: a lefty taps Left once and every swing, the first one too, is read as a lefty's", async ({ page }) => {
  test.skip(!existsSync(video), "Run scripts/fetch-test-video.sh to build the mirrored clip.");
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/start");
  await page.getByRole("link", { name: /Just Hit/ }).click();
  // Before anything is known the guest is on the righty default: a righty's outline on the front camera.
  await expect(page.locator('svg[data-facing="left"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Record swing" }).click();

  await expect(page.getByRole("region", { name: /Your one fix|Keep doing this/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Which side do you hit from?")).toBeVisible();
  await page.getByRole("button", { name: /^Left/ }).click();
  await expect(page.getByText("Saved. Your next swings use it.")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("justhit-lefty-result.png") });

  // The first swing was re-read and saved as a lefty's.
  await page.getByRole("link", { name: "See full breakdown" }).click();
  await expect(page.getByRole("heading", { name: "Swing 1" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Legs and feet" }).first()).toBeVisible();
  const hand1 = await page.evaluate(
    () =>
      new Promise<string[]>((res) => {
        const r = indexedDB.open("swingiq");
        r.onsuccess = () => {
          const q = r.result.transaction("swings").objectStore("swings").getAll();
          q.onsuccess = () => res(q.result.map((s: { hand: string }) => s.hand));
        };
      }),
  );
  expect(hand1).toEqual(["L"]);

  // Next swing: a lefty's outline, read as a lefty, no question this visit.
  await page.goto("/hit");
  await expect(page.locator('svg[data-facing="right"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Record swing" }).click();
  await expect(page.getByRole("region", { name: /Your one fix|Keep doing this/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("form", { name: "Sharpen your numbers" })).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByText(/Left-handed/).first()).toBeVisible();

  expect(errors).toEqual([]);
});
