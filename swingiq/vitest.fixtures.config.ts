import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Builds generated test media (see tests/fixtures/build). Not part of the normal test run.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/fixtures/build/**/*.build.ts"], testTimeout: 600_000 },
});
