import { chromium, expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { nav } from '../locales/fr/hero'
import { offers } from '../locales/fr/offers'
import {
  dispatchTouchPath,
  launchMobileEngine,
  MOBILE_ENGINES,
  stripUpgradeInsecureRequests,
  type MobileEngineType,
} from './support/mobileEngines'

/**
 * Scroll lock of the modal layers. The drawer and the offer sheet are lazily loaded, so their
 * Base UI Root can mount in the same interaction that opens it (a cold first open, before the
 * chunk has arrived). Base UI derives the document scroll lock from a closed → open change, so
 * the lazy Roots are held closed for one animation frame first (`useHasPaintedOnce`) and every
 * open — cold or later — enters through the same mounted transition. This spec pins, per layer
 * (mobile drawer, offer sheet) and per engine (Chromium for Android Chrome, WebKit for iOS
 * Safari, real device emulation and touch input):
 *
 * - the cold open enters through its starting style: the Root saw a closed → open change, the
 *   popup's first frames are transparent (the enter transition runs);
 * - no painted frame ever shows the layer while the page behind is unlocked;
 * - Base UI's own lock is held while the layer is open (overflow hidden on the viewport
 *   scroller) and released once it closes;
 * - once the open has settled, scroll attempts keep `window.scrollY` where it was: a mouse wheel
 *   and a real CDP touch drag on the layer on Chromium, keyboard arrow scrolling on WebKit
 *   (mobile WebKit has no synthetic wheel).
 *
 * `window.scrollBy` is recorded but never asserted: the lock is `overflow: hidden`, under which
 * programmatic scrolling stays allowed by design (Base UI's documented behaviour), so a moved
 * page there is not a regression; the page is reset afterwards.
 *
 * The suite launches the engines itself (the config ships a single desktop Chromium project); see
 * `support/mobileEngines.ts` for the WebKit CSP strip.
 *
 * The CDP touch drag runs on Chromium only: it drives real touch input through the CDP input
 * pipeline, which WebKit does not expose. The wheel attempt runs on both engines.
 */

const BURGER = nav.menu.ariaLabel

/** Strings that exist only in lazy chunks (drawer + shared Base UI internals, sheet). */
const LAZY_MARKERS = ['data-base-ui-swipe-ignore', 'offer-sheet']

/** Long enough that a real click always lands before the held-back chunk arrives. */
const CHUNK_DELAY_MS = 400

const burger = (page: Page) => page.locator('header button[aria-expanded]')
const drawer = (page: Page) => page.getByRole('dialog', { name: BURGER })
const cardButton = (page: Page) => page.getByRole('button', { name: offers.create.cardTitle })
const sheet = (page: Page) => page.getByRole('dialog')

type LockSample = {
  phase: string
  popup: boolean
  starting: boolean
  opacity: number | null
  locked: boolean
}

/**
 * Starts a per-frame recorder in the page: every animation frame it samples whether a dialog
 * popup is in the DOM, whether it still carries its `data-starting-style` (the enter transition),
 * its computed opacity and whether the page is scroll-locked. Each sample is tagged with the
 * phase the test drives from Node, so assertions can cover the open phases and ignore the exit.
 */
const installLockRecorder = (page: Page) =>
  page.evaluate(() => {
    const samples: LockSample[] = []
    Reflect.set(window, '__lockSamples', samples)
    Reflect.set(window, '__lockPhase', 'idle')
    // Mirror of Base UI's viewport-scroller rule: <html> when it has an overflow of its own,
    // <body> otherwise — only a lock on that element actually stops the page. Exposed on `window`
    // so the recorder and the Node-side assertions read this one rule.
    const isLocked = (): boolean => {
      const html = document.documentElement
      const htmlStyle = window.getComputedStyle(html)
      const scroller = htmlStyle.overflowY !== 'visible' || htmlStyle.overflowX !== 'visible' ? html : document.body
      return /hidden|clip/.test(window.getComputedStyle(scroller).overflowY)
    }
    Reflect.set(window, '__isPageLocked', isLocked)
    const read = (): void => {
      const popup = document.querySelector('[role="dialog"]')
      samples.push({
        phase: String(Reflect.get(window, '__lockPhase') ?? 'idle'),
        popup: popup !== null,
        starting: popup?.hasAttribute('data-starting-style') ?? false,
        opacity: popup === null ? null : Number.parseFloat(window.getComputedStyle(popup).opacity),
        locked: isLocked(),
      })
      window.requestAnimationFrame(read)
    }
    window.requestAnimationFrame(read)
  })

const setPhase = (page: Page, phase: string) =>
  page.evaluate((next) => {
    Reflect.set(window, '__lockPhase', next)
  }, phase)

const readSamples = (page: Page): Promise<LockSample[]> =>
  page.evaluate(() => Reflect.get(window, '__lockSamples') as LockSample[])

/** Mirror of Base UI's `isPageScrollLocked`, read live from the page (installed by the recorder). */
const isPageLocked = (page: Page): Promise<boolean> =>
  page.evaluate(() => (Reflect.get(window, '__isPageLocked') as () => boolean)())

/** Waits until the popup's entrance has finished (opacity 1), so the phase can move to `open`. */
const settleOpen = (page: Page, dialog: Locator) =>
  expect.poll(() => dialog.evaluate((element) => window.getComputedStyle(element).opacity)).toBe('1')

/**
 * Real touch input through the CDP pipeline (Chromium only): a drag on the layer, downward then
 * upward, as a visitor's finger would. The drag may scroll the layer's own content — the page
 * behind it must not move, which the caller asserts on `window.scrollY`.
 */
const touchDrag = async (page: Page, context: BrowserContext, target: Locator): Promise<void> => {
  const box = await target.boundingBox()
  if (box === null) throw new Error('drag target has no bounding box')
  const session = await context.newCDPSession(page)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await dispatchTouchPath(page, session, {
    x,
    y,
    clientYs: Array.from({ length: 12 }, (_, index) => y - 24 * (index + 1)),
    moveDelayMs: 12,
    settleMs: 60,
  })
  await dispatchTouchPath(page, session, {
    x,
    y: y - 288,
    clientYs: Array.from({ length: 12 }, (_, index) => y - 264 + 24 * index),
    moveDelayMs: 12,
    settleMs: 60,
  })
}

/**
 * Every scroll attempt once the open has settled: a mouse wheel and a CDP touch drag on
 * Chromium, keyboard arrow scrolling on WebKit (mobile WebKit does not support a synthetic
 * wheel; arrow keys are a real user scroll attempt), and `window.scrollBy` recorded then undone.
 * After each asserted attempt the page must still sit at the scroll position it had when the
 * layer settled.
 */
const scrollAttempts = async (
  page: Page,
  context: BrowserContext,
  dialog: Locator,
  engine: MobileEngineType,
  layer: 'drawer' | 'sheet',
): Promise<void> => {
  const baseline = await page.evaluate(() => window.scrollY)
  const wheelTarget = layer === 'drawer' ? drawer(page).locator('[data-base-ui-swipe-ignore]') : dialog
  const box = await wheelTarget.boundingBox()
  if (box === null) throw new Error('scroll target has no bounding box')
  if (engine === chromium) {
    // 1. Mouse wheel over the layer.
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200))
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(120)
    expect(await page.evaluate(() => window.scrollY), 'wheel must not scroll the page behind').toBe(baseline)
    // 2. Real touch drag on the layer (CDP input is not exposed on WebKit).
    await touchDrag(page, context, wheelTarget)
    await page.waitForTimeout(120)
    expect(await page.evaluate(() => window.scrollY), 'a touch drag must not scroll the page behind').toBe(baseline)
    await expect(dialog).toBeVisible()
  } else {
    // 1'. Keyboard scrolling over the layer: the focused control's scroll chain ends on the
    // locked document, so the page must not move.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(120)
    expect(await page.evaluate(() => window.scrollY), 'keyboard scrolling must not move the page behind').toBe(baseline)
  }
  // 2'. Programmatic scrolling stays allowed under `overflow: hidden` (Base UI's documented lock
  //    behaviour): record what `window.scrollBy` did and put the page back, assert nothing.
  const scrollByY = await page.evaluate(() => {
    window.scrollBy(0, 600)
    return window.scrollY
  })
  test.info().annotations.push({
    type: 'measure',
    description: `window.scrollBy while locked moved the page to ${String(scrollByY)} (programmatic scrolling stays allowed; not asserted)`,
  })
  await page.evaluate((reset) => window.scrollTo(0, reset), baseline)
}

for (const layer of ['drawer', 'sheet'] as const) {
  for (const { name, engine, device, stripsUpgradeInsecureRequests } of MOBILE_ENGINES) {
    test(`${layer}: the page behind does not scroll while the layer is open (${name})`, async ({ baseURL }) => {
      const { browser, context } = await launchMobileEngine(engine, device)
      const delayedChunks: string[] = []
      // Holds back every response whose body is a lazy chunk (bodies inspected against the lazy
      // markers, so the cold path stays deterministic whatever the hashed names are) and strips
      // the CSP upgrade directive where the engine's entry asks for it.
      await context.route('**/*', async (route) => {
        const response = await route.fetch()
        const rawHeaders = response.headers()
        const headers = stripsUpgradeInsecureRequests ? stripUpgradeInsecureRequests(rawHeaders) : rawHeaders
        const url = route.request().url()
        if (url.includes('/_next/static/chunks/') && url.endsWith('.js')) {
          const body = await response.text()
          if (LAZY_MARKERS.some((marker) => body.includes(marker))) {
            delayedChunks.push(url.split('/').pop() ?? url)
            await new Promise<void>((resolve) => {
              setTimeout(resolve, CHUNK_DELAY_MS)
            })
          }
          await route.fulfill({ response, headers, body })
          return
        }
        await route.fulfill({ response, headers })
      })
      const page = await context.newPage()
      const dialog = layer === 'drawer' ? drawer(page) : sheet(page)
      try {
        await page.goto(`${baseURL}/preview`)
        await page.waitForLoadState('networkidle')
        await installLockRecorder(page)
        expect(delayedChunks, 'no lazy chunk may load before the first intent').toEqual([])

        // --- Cold open: the tap lands before the chunk arrives, the open state is already true.
        await setPhase(page, 'entering')
        if (layer === 'drawer') await burger(page).tap()
        else await cardButton(page).tap()
        await expect
          .poll(() => delayedChunks.length, 'the tap intent must request the lazy chunk, which the route holds back')
          .toBeGreaterThan(0)
        await expect(dialog).toBeVisible()
        await settleOpen(page, dialog)
        await setPhase(page, 'open')

        // Base UI's own lock is held while the layer is open.
        await expect
          .poll(() => isPageLocked(page), 'the document must be scroll-locked while the layer is open')
          .toBe(true)
        await scrollAttempts(page, context, dialog, engine, layer)

        // --- Later open in the same page: the module is loaded, no chunk is requested.
        await setPhase(page, 'closing')
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect.poll(() => isPageLocked(page), 'the lock must be released once the layer closed').toBe(false)

        await setPhase(page, 'entering')
        if (layer === 'drawer') await burger(page).tap()
        else await cardButton(page).tap()
        await expect(dialog).toBeVisible()
        await settleOpen(page, dialog)
        await setPhase(page, 'open')

        await expect
          .poll(() => isPageLocked(page), 'the document must be scroll-locked while the layer is open')
          .toBe(true)
        await scrollAttempts(page, context, dialog, engine, layer)

        // --- Close and read the recording.
        await setPhase(page, 'closing')
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect.poll(() => isPageLocked(page)).toBe(false)

        const samples = await readSamples(page)
        // The lock must cover every painted frame of every open phase: a frame that shows the
        // layer opaque while the page behind is still unlocked is exactly the regression this
        // spec exists for (a lazily mounted Root that opened without a closed → open change).
        const activePhases = new Set(['entering', 'open'])
        const unlockedPainted = samples.filter(
          (sample) =>
            activePhases.has(sample.phase) &&
            sample.popup &&
            sample.opacity !== null &&
            sample.opacity >= 1 &&
            !sample.locked,
        )
        expect(unlockedPainted, 'no painted frame may show the layer while the page behind is unlocked').toEqual([])
        // The cold open — the recording up to the first close — must have entered through its
        // starting style: proof that the Root mounted closed first and opened with a transition.
        const coldEnd = samples.findIndex((sample) => sample.phase === 'closing')
        const coldSamples = coldEnd === -1 ? samples : samples.slice(0, coldEnd)
        expect(
          coldSamples.some((sample) => sample.popup && sample.starting),
          'the cold open must run the closed → open enter transition, not paint the popup at once',
        ).toBe(true)
      } finally {
        await context.close()
        await browser.close()
      }
    })
  }
}
