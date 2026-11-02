import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets several checkouts run browser tests at the same time on one machine.
const port = Number(process.env.E2E_PORT ?? 3000);

// End-to-end tests run against a production build. Auth tests need the local Supabase stack
// (`npx supabase start`) and its Mailpit inbox; see README, "Running the tests".
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /responsive\.spec\.ts/ },
    { name: "android", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
    { name: "tablet", use: { ...devices["iPad (gen 7)"], browserName: "chromium" }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: { command: `npx next start -p ${port}`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 120_000 },
});
