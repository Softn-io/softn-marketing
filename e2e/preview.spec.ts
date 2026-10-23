/**
 * E2E coverage for the `/preview` route metadata (GitHub issue #86).
 *
 * The gated one-page render must stay invisible to search engines: `noindex,nofollow`, the
 * preview title, and no canonical URL that could make it compete with the coming-soon home page.
 *
 * The 404 answer when the gate is off (`ENABLE_PREVIEW_ROUTE` unset/false outside development) is
 * the gate helper's own contract, covered by the unit tests of `lib/preview.test.ts`; this suite
 * always runs the server with the flag on (see `playwright.config.ts`).
 */
import { expect, test } from '@playwright/test'
import { metadataContent } from '../locales/fr/metadata'

test.describe('preview: metadata', () => {
  test('serves the one-page render with the preview title, noindex,nofollow and no canonical', async ({ page }) => {
    const response = await page.goto('/preview')
    expect(response?.status(), 'the route answers under the suite gate').toBe(200)
    // The route really serves the one-page site, not a bare shell.
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

    expect(await page.title()).toBe(metadataContent.preview.title)
    // Next.js serializes the robots directives as "noindex, nofollow".
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    // No canonical: a temporary preview must never carry the production page's authoritative URL.
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
  })
})
