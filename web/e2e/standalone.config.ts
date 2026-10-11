import { defineConfig } from "@playwright/test";
import { use } from "./playwright.config.ts";

// The checks that need neither the emulators nor the dev server: the EXIF
// check runs on about:blank, and the install check builds and serves the
// export itself.
export default defineConfig({
  testDir: "standalone",
  testMatch: "*.e2e.ts",
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: "../node_modules/.cache/kip-e2e/standalone",
  use,
});
