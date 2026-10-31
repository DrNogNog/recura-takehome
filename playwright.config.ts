import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * End-to-end regression tests. Runs the built app on its own port with in-memory data
 * and a throwaway folder for sign-ups, then drives it in Microsoft Edge.
 * Run with: npm run test:e2e
 */
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // the tests share one server and build on each other's state
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "msedge", // the Edge already on this machine; no browser download
    headless: true,
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node dist/index.js",
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      DATA_DIR: mkdtempSync(join(tmpdir(), "recura-e2e-")),
      DEMO_ADMIN: "on",
      ALLOW_PRIVATE_SCRAPE: "1", // lets the scrape test read its local fixture page
      APPOINTMENTS_STORE: "memory",
      SUPPLIES_STORE: "memory",
      FOOD_STORE: "memory",
      ANTHROPIC_API_KEY: "", // offline planner: deterministic and free
    },
  },
});
