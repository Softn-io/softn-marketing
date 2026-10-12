import { defineConfig, devices } from "@playwright/test"

/** Dedicated port so the suite never reuses a developer's `next dev` on 3000. */
const PORT = 3100

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  globalTimeout: 600_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `./node_modules/.bin/next build && exec ./node_modules/.bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
