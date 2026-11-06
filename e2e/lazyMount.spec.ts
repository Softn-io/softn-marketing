import { expect, test, type Page } from '@playwright/test'
import { nav } from '../locales/fr/hero'
import { offers } from '../locales/fr/offers'

/**
 * Issue #55 — the Base UI drawer and the offer sheet are loaded with `next/dynamic`, so the
 * initial JS of `/preview` carries neither. This spec pins the contract end to end:
 *
 * - the server-rendered HTML announces the burger (label, popup role, collapsed state) before
 *   any drawer code exists in the browser;
 * - the initial load of `/preview` requests no chunk carrying Base UI or sheet code;
 * - those chunks arrive on the first intent (hover), before any open, and mount nothing visible;
 * - a click that lands before the chunk arrives (programmatic click, keyboard Enter — no prior
 *   hover or pointer press) still opens the drawer and the sheet.
 *
 * The chunk markers below were verified against the production build: each string exists only in
 * lazy chunks (`data-base-ui-swipe-ignore` in the drawer and the shared Base UI chunk,
 * `offer-sheet` in the sheet chunk) and in no initially referenced chunk.
 */

const BURGER = nav.menu.ariaLabel
const CLOSE = nav.menu.closeAriaLabel

const LAZY_MARKERS = ['data-base-ui-swipe-ignore', 'offer-sheet']

const BELOW_LG = { width: 1023, height: 800 }

/** CSS locator: while the drawer is open the header is aria-hidden (same contract as `header.spec.ts`). */
const burger = (page: Page) => page.locator('header button[aria-expanded]')
const drawer = (page: Page) => page.getByRole('dialog', { name: BURGER })
const cardButton = (page: Page) => page.getByRole('button', { name: offers.create.cardTitle })
const sheet = (page: Page) => page.getByRole('dialog')

/**
 * Returns every chunk fetched so far whose body contains a lazy marker. Bodies are fetched once
 * per URL and cached on `window`, so repeated polls never re-download or re-report.
 */
const lazyChunkHits = (page: Page) =>
  page.evaluate(async (markers) => {
    const probes = (Reflect.get(window, '__chunkProbes') as Map<string, string> | undefined) ?? new Map()
    Reflect.set(window, '__chunkProbes', probes)
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
  }, LAZY_MARKERS)

/** Navigates and waits until the initial payload (hydration chunks included) has settled. */
const gotoSettled = async (page: Page): Promise<void> => {
  await page.goto('/preview')
  await page.waitForLoadState('networkidle')
}

test.describe('lazy mount: server-rendered burger (issue #55)', () => {
  test('the SSR HTML of /preview announces the burger and the card buttons with no drawer code', async ({ page }) => {
    const response = await page.request.get('/preview')
    expect(response.ok()).toBe(true)
    const html = await response.text()
    // The burger is server-rendered with its accessible name, popup role and collapsed state.
    expect(html).toContain(`aria-label="${BURGER}"`)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    // The offer card buttons announce the dialog too.
    expect(html).toContain('aria-haspopup="dialog"')
  })

  test('the live burger keeps the label, popup role and collapsed state before any interaction', async ({ page }) => {
    await page.setViewportSize(BELOW_LG)
    await gotoSettled(page)
    await expect(burger(page)).toBeVisible()
    await expect(burger(page)).toHaveAttribute('aria-label', BURGER)
    await expect(burger(page)).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(cardButton(page)).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('lazy mount: Base UI chunks are not in the initial payload', () => {
  test.use({ viewport: BELOW_LG })

  test('the initial load of /preview requests no Base UI or sheet chunk', async ({ page }) => {
    await gotoSettled(page)
    await expect.poll(() => lazyChunkHits(page)).toEqual([])
  })

  test('hovering the burger fetches the drawer chunks and still mounts nothing visible', async ({ page }) => {
    await gotoSettled(page)
    await expect.poll(() => lazyChunkHits(page)).toEqual([])
    await burger(page).hover()
    await expect.poll(() => lazyChunkHits(page)).not.toEqual([])
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('hovering an offer card fetches the sheet chunk and still mounts nothing visible', async ({ page }) => {
    await gotoSettled(page)
    await expect.poll(() => lazyChunkHits(page)).toEqual([])
    await cardButton(page).hover()
    await expect.poll(() => lazyChunkHits(page)).not.toEqual([])
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('lazy mount: cold open without prior intent (drawer)', () => {
  test.use({ viewport: BELOW_LG })

  test('a programmatic click on the burger opens the drawer with no prior hover or focus', async ({ page }) => {
    await gotoSettled(page)
    // el.click() fires only the click event: no pointerenter, no pointerdown, no focus.
    await page.evaluate(() => {
      const trigger = document.querySelector<HTMLElement>('header button[aria-expanded]')
      if (trigger === null) throw new Error('burger not found')
      trigger.click()
    })
    const dialog = drawer(page)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: CLOSE })).toBeFocused()
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    await expect(burger(page)).toBeFocused()
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('a keyboard open (focus + Enter, no pointer) opens the drawer', async ({ page }) => {
    await gotoSettled(page)
    await burger(page).focus()
    await page.keyboard.press('Enter')
    await expect(drawer(page)).toBeVisible()
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    await expect(burger(page)).toBeFocused()
  })
})

test.describe('lazy mount: cold open without prior intent (offer sheet)', () => {
  test('a programmatic click on an offer card opens the sheet with no prior hover or focus', async ({ page }) => {
    await gotoSettled(page)
    // el.click() fires only the click event: the sheet chunk has not been requested by any intent.
    await cardButton(page).evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error('card button is not an HTMLElement')
      element.click()
    })
    const dialog = sheet(page)
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('heading', { level: 2, name: offers.create.sheet.title })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(cardButton(page)).toBeFocused()
  })

  test('a keyboard open on an offer card (focus + Enter, no pointer) opens the sheet', async ({ page }) => {
    await gotoSettled(page)
    await cardButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole('heading', { level: 2, name: offers.create.sheet.title })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeHidden()
    await expect(cardButton(page)).toBeFocused()
  })
})
