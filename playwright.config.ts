import { defineConfig, devices } from "@playwright/test"

/** Dedicated port so the suite never reuses a developer's `next dev` on 3000. */
const PORT = 3100

const startCommand = `exec ./node_modules/.bin/next start -p ${PORT}`

/** CI downloads the build job's output and sets PLAYWRIGHT_SKIP_BUILD so the suite does not rebuild. */
const webServerCommand = process.env.PLAYWRIGHT_SKIP_BUILD
  ? startCommand
  : `./node_modules/.bin/next build && ${startCommand}`

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  globalTimeout: 600_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: webServerCommand,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
