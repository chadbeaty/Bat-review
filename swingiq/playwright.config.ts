import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.env.E2E_PORT ?? 3100);
const video = join(__dirname, "tests/fixtures/video/swing.y4m");

// End-to-end tests run against a production build (`npm run build` first).
// The live-camera test feeds a real batter clip to Chromium as a fake webcam (see scripts/fetch-test-video.sh).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
      testMatch: /pages\.spec\.ts/,
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /pages\.spec\.ts/,
    },
    {
      name: "flows",
      testMatch: /flows\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 430, height: 900 }, launchOptions: { args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"] } },
    },
    {
      name: "live-camera",
      testMatch: /live\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 430, height: 860 },
        permissions: ["camera", "microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            ...(existsSync(video) ? [`--use-file-for-fake-video-capture=${video}`] : []),
            "--autoplay-policy=no-user-gesture-required",
            "--enable-unsafe-swiftshader",
          ],
        },
      },
    },
  ],
  webServer: { command: `npx next start -p ${port}`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 120_000 },
});
