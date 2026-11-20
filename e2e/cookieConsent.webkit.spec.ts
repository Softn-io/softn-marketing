import { expect, test, type Page } from '@playwright/test'
import { stripUpgradeInsecureRequests } from './support/mobileEngines'
import { footer } from '../locales/fr/footer'
import { cookieBanner } from '../locales/fr/legal'

/**
 * Cookie consent (issue #23) on WebKit — the Safari engine. Safari does not focus a button on
 * click, so the dialog's explicit focus return is the only mechanism that can put focus back on the
 * opener: these checks run here, not in the Chromium-only default project. WebKit rewrites
 * plain-HTTP assets under the CSP `upgrade-insecure-requests` directive, so the directive is
 * stripped the same way the mobile-engine specs do.
 */

const BANNER = cookieBanner.ariaLabel
const ACCEPT = cookieBanner.accept
const CUSTOMIZE = cookieBanner.customize
const SAVED = cookieBanner.saved
const DIALOG_TITLE = cookieBanner.preferences.title
const FOOTER_BUTTON = footer.cookieSettings
const STORAGE_KEY = 'softn-consent'

const banner = (page: Page) => page.getByRole('region', { name: BANNER })
const bannerAccept = (page: Page) => banner(page).getByRole('button', { name: ACCEPT })
const bannerCustomize = (page: Page) => banner(page).getByRole('button', { name: CUSTOMIZE })
const dialog = (page: Page) => page.getByRole('dialog', { name: DIALOG_TITLE })
const footerCookieButton = (page: Page) => page.getByRole('button', { name: FOOTER_BUTTON })
const savedStatus = (page: Page) => page.locator('body > p[role="status"]')

/** A valid record dated now. */
const seedConsent = (page: Page, audience: boolean): void => {
  page.addInitScript(
    ({ key, audience: choice }) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, audience: choice, decidedAt: new Date().toISOString() })),
    { key: STORAGE_KEY, audience },
  )
}

test.use({ browserName: 'webkit' })

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: stripUpgradeInsecureRequests(response.headers()) })
  })
})

test('banner accept flow works on WebKit', async ({ page }) => {
  await page.goto('/')
  await expect(banner(page)).toBeVisible()
  await bannerAccept(page).click()
  await expect(banner(page)).toHaveCount(0)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.audience, STORAGE_KEY)).toBe(
    true,
  )
  await expect(savedStatus(page)).toHaveText(SAVED)
  expect(await page.context().cookies()).toEqual([])
})

test('footer click opens the dialog and Escape returns focus to the never-focused button', async ({ page }) => {
  seedConsent(page, false)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await footerCookieButton(page).click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(footerCookieButton(page)).toBeFocused()
})

test('banner Personnaliser click opens the dialog and Escape keeps the banner', async ({ page }) => {
  await page.goto('/')
  await expect(banner(page)).toBeVisible()
  await bannerCustomize(page).click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  await expect(banner(page)).toBeVisible()
})
