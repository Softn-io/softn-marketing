import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { footer } from '../locales/fr/footer'
import { cookieBanner } from '../locales/fr/legal'
import { stubUmami } from './support/umamiStub'

/**
 * Cookie consent (issue #23): the banner, the preferences dialog and the footer control.
 *
 * The decided contract, verified end to end against the production build (`next start`):
 *
 * - the choice lives in `localStorage` under `softn-consent` as
 *   `{ version: 1, audience: boolean, decidedAt: ISO }`, valid six months; an invalid, unknown-version,
 *   future-dated or expired record reads as "no choice" and the banner comes back;
 * - the site sets no cookie at all, and no third party is ever requested from the browser
 *   (Umami is not wired in this delivery);
 * - the banner shows only without a valid choice, is keyboard reachable, and never covers the page
 *   or shifts the layout;
 * - « Personnaliser » records a preferences request that opens the shared preferences dialog; the
 *   dialog and Base UI are fetched only then — a first visit with no interaction pulls no Base UI
 *   chunk; Escape and the close button store nothing;
 * - « Gérer mes cookies » in the footer opens the same dialog on every page and keeps focus on
 *   return, including on Safari/WebKit where a click does not focus a button;
 * - after a save from the banner-opened dialog the banner has unmounted, so focus falls back inside
 *   `<main>` instead of body;
 * - the shared Switch is off by default and reflects a stored `audience: true`.
 */

const BANNER = cookieBanner.ariaLabel
const TITLE = cookieBanner.title
const ACCEPT = cookieBanner.accept
const DECLINE = cookieBanner.decline
const CUSTOMIZE = cookieBanner.customize
const LEARN_MORE = cookieBanner.learnMore
const SAVED = cookieBanner.saved
const DIALOG_TITLE = cookieBanner.preferences.title
const CLOSE_DIALOG = cookieBanner.preferences.closeAriaLabel
const SWITCH_LABEL = cookieBanner.preferences.audience.toggleAriaLabel
const SAVE_CHOICES = cookieBanner.preferences.save
const FOOTER_BUTTON = footer.cookieSettings

const STORAGE_KEY = 'softn-consent'

const banner = (page: Page) => page.getByRole('region', { name: BANNER })
const bannerAccept = (page: Page) => banner(page).getByRole('button', { name: ACCEPT })
const bannerDecline = (page: Page) => banner(page).getByRole('button', { name: DECLINE })
const bannerCustomize = (page: Page) => banner(page).getByRole('button', { name: CUSTOMIZE })
const dialog = (page: Page) => page.getByRole('dialog', { name: DIALOG_TITLE })
const dialogSwitch = (page: Page) => dialog(page).getByRole('switch', { name: SWITCH_LABEL })
const footerCookieButton = (page: Page) => page.getByRole('button', { name: FOOTER_BUTTON })
const savedStatus = (page: Page) => page.locator('body > p[role="status"]')

/** Screenshots directory of the QA report (outside the repo's committed tree). */
const REPORT_DIR = path.resolve(process.cwd(), '.orchestration', 'reports', 'qa')

/** Reads the stored consent record as a parsed value, or null when absent. */
const readStoredRecord = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return 'invalid-json'
    }
  }, STORAGE_KEY)

/** The audience value of the stored record, or null when the record is absent or malformed. */
const storedAudience = async (page: Page): Promise<boolean | null> => {
  const record = (await readStoredRecord(page)) as { audience?: unknown } | 'invalid-json' | null
  if (record === null || record === 'invalid-json') return null
  return typeof record.audience === 'boolean' ? record.audience : null
}

/** Seeds a consent record before any page script runs. */
const seedConsent = (page: Page, record: Record<string, unknown>): void => {
  page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: STORAGE_KEY,
    value: record,
  })
}

/** A valid record dated `ageMs` in the past (negative for the future). */
const recordDated = (audience: boolean, ageMs: number): Record<string, unknown> => ({
  version: 1,
  audience,
  decidedAt: new Date(Date.now() - ageMs).toISOString(),
})

/** Seven months back: the six-month expiry is calendar-based, so seven months is safely past it. */
const SEVEN_MONTHS_MS = 213 * 24 * 60 * 60 * 1000

/**
 * Returns every chunk fetched so far whose body carries Base UI runtime markers
 * (`data-base-ui-*` attributes are emitted by the Base UI core and the header drawer). The consent
 * layer must not pull any of them before a preferences request (issue #23, revision 2).
 */
const baseUiChunkHits = (page: Page) =>
  page.evaluate(async () => {
    const markers = ['data-base-ui-swipe-ignore', 'data-base-ui-click-trigger', 'data-base-ui-focus']
    const probes = (Reflect.get(window, '__consentChunkProbes') as Map<string, string> | undefined) ?? new Map()
    Reflect.set(window, '__consentChunkProbes', probes)
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/_next/static/chunks/') && name.endsWith('.js'))
    const hits: string[] = []
    for (const url of urls) {
      let body = probes.get(url)
      if (body === undefined) {
        body = await fetch(url).then((response) => response.text())
        probes.set(url, body)
      }
      for (const marker of markers) {
        if (body.includes(marker)) hits.push(`${url.split('/').pop()} :: ${marker}`)
      }
    }
    return hits
  })

/**
 * Collects every request URL the page fires. The consent contract allows same-origin requests only:
 * no third party may be contacted from the browser, before or after consent.
 */
const trackRequests = (page: Page): { urls: string[]; thirdPartyHits: string[] } => {
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))
  return {
    urls,
    get thirdPartyHits(): string[] {
      return urls.filter((url) => {
        try {
          return new URL(url).host !== new URL(page.url()).host
        } catch {
          return true
        }
      })
    },
  }
}

/** Asserts the browser holds no cookie at all: the site stores everything in localStorage. */
const expectNoCookies = async (page: Page): Promise<void> => {
  expect(await page.context().cookies()).toEqual([])
}

/**
 * Tab-walks from the top of the page until the given button is focused. The banner mounts last in
 * the DOM, so it is reached after the page's own controls.
 */
const tabUntilFocused = async (page: Page, name: string, maxTabs = 80): Promise<boolean> => {
  for (let index = 0; index < maxTabs; index += 1) {
    const focusedName = await page.evaluate(() => {
      const active = document.activeElement
      return active instanceof HTMLElement ? (active.textContent?.trim() ?? '') : ''
    })
    if (focusedName === name) return true
    await page.keyboard.press('Tab')
  }
  return false
}

/** Installs a layout-shift recorder before any script runs (Chromium only). */
const recordLayoutShifts = (page: Page): void => {
  page.addInitScript(() => {
    const entries: number[] = []
    Reflect.set(window, '__clsEntries', entries)
    const isLayoutShift = (
      entry: PerformanceEntry,
    ): entry is PerformanceEntry & { value: number; hadRecentInput: boolean } => entry.entryType === 'layout-shift'
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!isLayoutShift(entry) || entry.hadRecentInput) continue
        entries.push(entry.value)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

const readClsEntries = (page: Page) => page.evaluate(() => Reflect.get(window, '__clsEntries') as number[])

// Every test runs on a page that can grant the audience consent (banner accept, stored record,
// issue #24): the Umami endpoints are stubbed first, so no run ever loads the real tracker or
// sends a pageview to the production dashboard.
test.beforeEach(async ({ page }) => {
  await stubUmami(page)
})

test.describe('cookie consent — banner presence and storage', () => {
  test('shows the banner on first visit and reaches every control by keyboard', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await expect(banner(page).getByRole('heading', { name: TITLE })).toBeVisible()
    await expect(banner(page).getByRole('link', { name: LEARN_MORE })).toBeVisible()

    expect(await tabUntilFocused(page, ACCEPT)).toBe(true)
    await expect(bannerAccept(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(bannerDecline(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(bannerCustomize(page)).toBeFocused()
  })

  test('hides the banner when a valid record is pre-seeded', async ({ page }) => {
    seedConsent(page, recordDated(false, 0))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(banner(page)).toHaveCount(0)
    await expect(dialog(page)).toHaveCount(0)
  })

  test('accept stores audience true, hides the banner and announces the confirmation', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await bannerAccept(page).click()

    await expect(banner(page)).toHaveCount(0)
    expect(await storedAudience(page)).toBe(true)
    const record = (await readStoredRecord(page)) as { version: number; decidedAt: string } | null
    expect(record?.version).toBe(1)
    expect(Number.isNaN(Date.parse(record?.decidedAt ?? ''))).toBe(false)
    await expect(savedStatus(page)).toHaveText(SAVED)
    await expect(dialog(page)).toHaveCount(0)
    await expectNoCookies(page)
  })

  test('refuse stores audience false, hides the banner and announces the confirmation', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await bannerDecline(page).click()

    await expect(banner(page)).toHaveCount(0)
    expect(await storedAudience(page)).toBe(false)
    await expect(savedStatus(page)).toHaveText(SAVED)
    await expectNoCookies(page)
  })

  test('an expired, invalid, unknown-version or future-dated record shows the banner again', async ({ page }) => {
    const cases: Array<[string, unknown]> = [
      ['expired', recordDated(true, SEVEN_MONTHS_MS)],
      ['invalid JSON', 'not-json{'],
      ['unknown version', { version: 99, audience: true, decidedAt: new Date().toISOString() }],
      ['future dated', recordDated(true, -60 * 60 * 1000)],
      ['malformed record', { version: 1, audience: 'yes' }],
    ]
    for (const [name, seeded] of cases) {
      await page.goto('/')
      if (typeof seeded === 'string') {
        await page.evaluate(([key, raw]) => localStorage.setItem(key, raw as string), [STORAGE_KEY, seeded] as const)
      } else {
        seedConsent(page, seeded as Record<string, unknown>)
      }
      await page.reload()
      await expect(banner(page), name).toBeVisible()
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    }
  })
})

test.describe('cookie consent — preferences dialog', () => {
  test('Personnaliser opens the dialog, Escape closes it and stores nothing', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await bannerCustomize(page).click()

    await expect(dialog(page)).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement
          const popup = document.querySelector('[role="dialog"]')
          return popup !== null && active instanceof HTMLElement && popup.contains(active)
        }),
      )
      .toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    expect(await readStoredRecord(page)).toBeNull()
    await expect(banner(page)).toBeVisible()

    await bannerCustomize(page).click()
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: CLOSE_DIALOG }).click()
    await expect(dialog(page)).toHaveCount(0)
    expect(await readStoredRecord(page)).toBeNull()
    await expect(banner(page)).toBeVisible()
    await expectNoCookies(page)
  })

  test('the switch is off by default and reflects a stored audience choice', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await bannerCustomize(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialogSwitch(page)).toHaveAttribute('aria-checked', 'false')
    await page.keyboard.press('Escape')

    seedConsent(page, recordDated(true, 0))
    await page.goto('/')
    await expect(banner(page)).toHaveCount(0)
    await footerCookieButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialogSwitch(page)).toHaveAttribute('aria-checked', 'true')
  })

  test('saving from the banner-opened dialog stores the choice and returns focus inside main', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await bannerCustomize(page).click()
    await expect(dialog(page)).toBeVisible()
    await dialogSwitch(page).click()
    await expect(dialogSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await dialog(page).getByRole('button', { name: SAVE_CHOICES }).click()

    await expect(dialog(page)).toHaveCount(0)
    await expect(banner(page)).toHaveCount(0)
    expect(await storedAudience(page)).toBe(true)
    await expect(savedStatus(page)).toHaveText(SAVED)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement
          const main = document.querySelector('main')
          return {
            tag: active?.tagName ?? '',
            inMain: main !== null && active instanceof HTMLElement && (active === main || main.contains(active)),
            isBody: active === document.body,
          }
        }),
      )
      .toStrictEqual({ tag: expect.any(String), inMain: true, isBody: false })
    await expectNoCookies(page)
  })
})

test.describe('cookie consent — lazy dialog (issue #23, revision 2)', () => {
  test('no Base UI chunk is requested before a preferences request, and Personnaliser loads it', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect.poll(() => baseUiChunkHits(page)).toEqual([])

    await bannerCustomize(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect.poll(() => baseUiChunkHits(page)).not.toEqual([])
  })

  test('the footer request loads the dialog lazily too, and Escape still returns focus', async ({ page }) => {
    seedConsent(page, recordDated(false, 0))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect.poll(() => baseUiChunkHits(page)).toEqual([])
    await expect(banner(page)).toHaveCount(0)

    await footerCookieButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect.poll(() => baseUiChunkHits(page)).not.toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(footerCookieButton(page)).toBeFocused()
  })
})

test.describe('cookie consent — booking manage page footer (L1)', () => {
  test.beforeEach(({ page }) => {
    seedConsent(page, recordDated(false, 0))
  })

  test('Gérer mes cookies opens the dialog from the manage page footer and keeps focus on return', async ({ page }) => {
    // The invalid-token state renders the manage footer without any API call, so the control is
    // reachable in E2E without real calendar tokens (the valid-token states are `bookingManage`'s).
    await page.goto('/rendez-vous/not-a-signed-token')
    await page.waitForLoadState('networkidle')
    await expect(banner(page)).toHaveCount(0)

    const manageFooterButton = page.locator('footer').getByRole('button', { name: FOOTER_BUTTON })
    await expect(manageFooterButton).toBeVisible()
    await manageFooterButton.click()
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(manageFooterButton).toBeFocused()
    await expectNoCookies(page)
  })
})

test.describe('cookie consent — footer control', () => {
  for (const route of ['/', '/preview', '/politique-de-cookies']) {
    test(`Gérer mes cookies opens the dialog on ${route} and keeps focus on return (Escape)`, async ({ page }) => {
      seedConsent(page, recordDated(false, 0))
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expect(banner(page)).toHaveCount(0)

      await footerCookieButton(page).click()
      await expect(dialog(page)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog(page)).toHaveCount(0)
      await expect(footerCookieButton(page)).toBeFocused()
      expect(await readStoredRecord(page)).not.toBeNull()
    })
  }

  test('closing with the close button returns focus to the footer button', async ({ page }) => {
    seedConsent(page, recordDated(false, 0))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await footerCookieButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: CLOSE_DIALOG }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(footerCookieButton(page)).toBeFocused()
  })

  test('saving from the footer-opened dialog returns focus to the footer button', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await footerCookieButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: DECLINE }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(banner(page)).toHaveCount(0)
    await expect(footerCookieButton(page)).toBeFocused()
    expect(await storedAudience(page)).toBe(false)
  })
})

test.describe('cookie consent — no cookie, no third party', () => {
  test('the browser never holds a cookie across a full accept, revoke and re-accept journey', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await bannerAccept(page).click()
    await expect(banner(page)).toHaveCount(0)
    await expectNoCookies(page)

    await page.reload()
    await footerCookieButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await dialogSwitch(page).click()
    await dialog(page).getByRole('button', { name: SAVE_CHOICES }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expectNoCookies(page)

    await footerCookieButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: DECLINE }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expectNoCookies(page)
    expect(await storedAudience(page)).toBe(false)
  })

  test('every request stays on the site origin, before and after consent', async ({ page }) => {
    const tracked = trackRequests(page)
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await bannerAccept(page).click()
    await expect(banner(page)).toHaveCount(0)
    await page.goto('/preview')
    await page.waitForLoadState('networkidle')
    await footerCookieButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: SAVE_CHOICES }).click()
    await expect(dialog(page)).toHaveCount(0)
    await page.goto('/politique-de-cookies')
    await page.waitForLoadState('networkidle')

    expect(tracked.thirdPartyHits).toEqual([])
    expect(tracked.urls.length).toBeGreaterThan(0)
    const base = new URL(page.url()).host
    for (const url of tracked.urls) {
      expect(new URL(url).host, url).toBe(base)
    }
  })
})

test.describe('cookie consent — layout', () => {
  test('the banner covers only part of the page and causes no layout shift', async ({ page }) => {
    recordLayoutShifts(page)
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await page.waitForTimeout(600)

    const geometry = await page.evaluate(() => {
      const card = document.querySelector('section[aria-label="Choix des cookies"]')
      if (!(card instanceof HTMLElement)) return null
      const rect = card.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }
    })
    expect(geometry).not.toBeNull()
    if (geometry === null) return
    expect(geometry.height).toBeLessThan(geometry.viewportHeight * 0.5)
    expect((geometry.width * geometry.height) / (geometry.viewportWidth * geometry.viewportHeight)).toBeLessThan(0.8)

    const entries = await readClsEntries(page)
    expect(entries.reduce((total, value) => total + value, 0)).toBeLessThan(0.05)
  })

  test('desktop the card is fit-content (about 397px); mobile it spans the width minus margins', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    const desktopWidth = (await banner(page).boundingBox())?.width ?? 0
    expect(desktopWidth).toBeGreaterThan(300)
    expect(desktopWidth).toBeLessThan(560)

    await page.setViewportSize({ width: 375, height: 667 })
    const box = await banner(page).boundingBox()
    expect(box).not.toBeNull()
    if (box === null) return
    // The card is the viewport minus two space-4 (16px) margins.
    expect(box.width).toBeGreaterThan(375 - 2 * 16 - 2)
    expect(box.width).toBeLessThanOrEqual(375)
  })
})

test.describe('cookie consent — screenshots for the QA report', () => {
  const THEMES = [
    { name: 'dark', colorScheme: 'dark' as const },
    { name: 'light', colorScheme: 'light' as const },
  ]
  const VIEWPORTS = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 375, height: 667 },
  ]

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`captures the banner and the dialog — ${viewport.name} · ${theme.name}`, async ({ page }) => {
        mkdirSync(REPORT_DIR, { recursive: true })
        await page.emulateMedia({ colorScheme: theme.colorScheme })
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto('/')
        await expect(banner(page)).toBeVisible()
        await page.waitForTimeout(400)
        await banner(page).screenshot({
          path: path.join(REPORT_DIR, `banner-${viewport.name}-${theme.name}.png`),
        })

        await bannerCustomize(page).click()
        await expect(dialog(page)).toBeVisible()
        await page.waitForTimeout(400)
        await dialog(page).screenshot({
          path: path.join(REPORT_DIR, `dialog-${viewport.name}-${theme.name}.png`),
        })
      })
    }
  }
})

/**
 * The Safari/WebKit checks live in `cookieConsent.webkit.spec.ts`: `browserName` cannot be
 * overridden inside a describe group, so that spec carries them at top level.
 */
