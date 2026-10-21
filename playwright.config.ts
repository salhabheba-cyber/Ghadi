import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: point at a specific Chromium build (useful in sandboxes with a pre-installed browser).
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    // No AI environment variables are set on purpose: e2e proves the app runs without any AI key.
    command: `npm run build && npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    // A throw-away embedded Postgres (PGlite) so the school-reading flows run against real SQL, with a fresh database per run.
    env: {
      GHADI_DEV_DB: "pglite",
      GHADI_DEV_DB_DIR: path.join(os.tmpdir(), `ghadi-e2e-db-${process.pid}`),
      GHADI_SETUP_TOKEN: "e2e-setup-token-0123456789",
      GHADI_TRUST_PROXY: "false",
    },
    timeout: 240_000,
  },
});
