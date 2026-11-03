import { defineConfig, devices } from '@playwright/test'

/** Dedicated port so the suite never reuses a developer's `next dev` on 3000. */
const PORT = 3100

const startCommand = `exec ./node_modules/.bin/next start -p ${PORT}`

/** CI downloads the build job's output and sets PLAYWRIGHT_SKIP_BUILD so the suite does not rebuild. */
const webServerCommand = process.env.PLAYWRIGHT_SKIP_BUILD
  ? startCommand
  : `./node_modules/.bin/next build && ${startCommand}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  globalTimeout: 600_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: webServerCommand,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ENABLE_PREVIEW_ROUTE: 'true',
      // The Route Handlers call their providers server-side, where page.route cannot intercept:
      // blanking every provider key (process.env wins over env files; lib/env treats '' as
      // unset) so no run can ever reach Google, Baserow or the model.
      BASEROW_API_URL: '',
      BASEROW_TOKEN: '',
      BASEROW_WAITLIST_TABLE_ID: '',
      BASEROW_LEADS_TABLE_ID: '',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
      GOOGLE_CALENDAR_ID: '',
      GCP_PROJECT_NUMBER: '',
      GCP_WORKLOAD_IDENTITY_POOL_ID: '',
      GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: '',
      VERCEL_OIDC_TOKEN: '',
      MISTRAL_API_KEY: '',
      // Signing secret of the manage links. Default: unset, so every token is refused
      // (fail closed). The manage suite passes a test-only secret through the environment
      // of the command (`BOOKING_LINK_SECRET=… playwright test`) and the server then signs
      // and verifies with the very same value; it is never written to any .env file.
      BOOKING_LINK_SECRET: process.env.BOOKING_LINK_SECRET ?? '',
    },
  },
})
