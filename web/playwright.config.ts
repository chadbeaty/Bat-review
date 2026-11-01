import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build. Auth tests need the local Supabase stack
// (`npx supabase start`) and its Mailpit inbox; see README, "Running the tests".
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /responsive\.spec\.ts/ },
    { name: "android", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
    { name: "tablet", use: { ...devices["iPad (gen 7)"], browserName: "chromium" }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
