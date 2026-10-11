import { fileURLToPath } from "node:url";
import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";
import { APP_ORIGIN } from "./emulators.ts";

/** Browser options every kip check runs with: the system Chrome, at phone size. */
export const use: PlaywrightTestConfig["use"] = {
  channel: "chrome",
  viewport: { width: 430, height: 932 },
  trace: "retain-on-failure",
};

// One worker: every check shares one emulator, and the emulator keeps its data
// for as long as it is up.
export default defineConfig({
  testDir: "app",
  testMatch: "*.e2e.ts",
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: "../node_modules/.cache/kip-e2e/app",
  use: { ...use, baseURL: APP_ORIGIN },
  globalSetup: fileURLToPath(new URL("emulated.ts", import.meta.url)),
  // Whatever already answers there is reused, and the port says nothing about
  // which backend it talks to: `--strictPort` only stops the emulated server
  // moving to another one. `emulated.ts` is what refuses a server that is not
  // emulated. The command serves 3001, so a `KIP_ORIGIN` elsewhere has to be up
  // already.
  webServer: {
    command: "bun dev:emulated",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: APP_ORIGIN,
    reuseExistingServer: true,
    timeout: 180_000,
    // Interrupted the way Ctrl-C does it, or `emulators:exec` dies without
    // stopping the Firestore emulator, which then holds 8080.
    gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
  },
});
