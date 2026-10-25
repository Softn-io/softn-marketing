import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { interpolate } from '../lib/interpolate'
import { ASSISTANT_NAME } from '../locales/fr/chatbot'
import { offers } from '../locales/fr/offers'

/**
 * QA coverage of the offer detail sheet (issue #12): opening each sheet from its card with the
 * mouse and the keyboard, the rendered copy of every section, both calls to action, closing by
 * Escape and by the icon-only control, focus return to the opening card, the focus trap, the
 * assistant navigation with its booking intent, axe (WCAG 2.1 A/AA) with the sheet open, both
 * themes, a mobile and a desktop viewport, reduced motion, and the 4a-1 token audit of the
 * sheet's computed styles against the `@softnio-labs/tokens` package.
 *
 * The card-level journeys (grid, focus ring, pointer tilt) stay in `offers.spec.ts`.
 */

/** localStorage key the inline theme script reads (same contract as `lib/theme`, `e2e/theme.spec.ts`). */
const THEME_STORAGE_KEY = 'softn-theme'

/** The machine-checkable WCAG 2.1 A and AA rule tags (`e2e/accessibility.spec.ts`). */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

/** Offer locale entries in render order; sheet copy is read through them, never hardcoded. */
const CARDS = [offers.create, offers.automate] as const

/** Locale keys of the two cards, in render order; indexes line up with `CARDS`. */
const OFFER_IDS = ['create', 'automate'] as const

/**
 * The sheet kicker uses the `text-brand-foreground` / `text-warning` accents (`TONE_TEXT` in
 * `OfferSheet.tsx`): the brand tone resolves to `--softn-brand-foreground`, not the card
 * border's `--softn-brand-vivid` (`TONE_STYLES` in `OfferCard.tsx`).
 */
const SHEET_TONE_TOKENS = { create: '--softn-brand-foreground', automate: '--softn-warning' } as const

/** Below `48rem` the sheet's label/body grid stacks into one column (`OfferSheet.module.css`). */
const MOBILE_VIEWPORT = { width: 375, height: 800 }

/** Secondary call to action label, interpolated the way `OfferSheet.tsx` renders it. */
const secondaryLabel = (index: number): string =>
  interpolate(CARDS[index]?.sheet.cta.secondary ?? '', { assistantName: ASSISTANT_NAME })

/** The invisible whole-surface overlay button, named by the card title (`OfferCard.tsx`). */
const cardButton = (page: Page, index: number): Locator =>
  page.getByRole('button', { name: CARDS[index]?.cardTitle ?? '' })

/** The sheet popup. Only one dialog can be open at a time, so the role selector stays unique. */
const sheet = (page: Page): Locator => page.getByRole('dialog')

/** The icon-only close control, named by the locale (`offers.sheetCloseLabel`). */
const closeButton = (page: Page): Locator => page.getByRole('button', { name: offers.sheetCloseLabel })

/** Forces a theme the way the theme script consumes it, before navigation. */
const forceTheme = async (page: Page, scheme: 'dark' | 'light'): Promise<void> => {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, scheme] as const)
}

/** Records every `assistant-intent` event fired on `window` into `window.__assistantIntents`. */
const recordAssistantIntents = (page: Page): Promise<void> =>
  page
    .evaluate(() => {
      const seen: string[] = []
      window.addEventListener('assistant-intent', (event) => {
        seen.push((event as CustomEvent<{ intent: string }>).detail.intent)
      })
      ;(window as { __assistantIntents?: string[] }).__assistantIntents = seen
    })
    .then(() => undefined)

/** Presses Tab until `target` holds DOM focus; fails if the keyboard never reaches it. */
const tabTo = async (page: Page, target: Locator): Promise<void> => {
  for (let step = 0; step < 40; step += 1) {
    if (await target.evaluate((el) => document.activeElement === el)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('keyboard Tab never reached the offer card button')
}

/** The color the engine paints for a `--softn-*` custom property, read through a probe element. */
const tokenColor = (page: Page, name: string): Promise<string> =>
  page.evaluate((token) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${token})`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, name)

/** The length the engine paints for a `--softn-*` custom property, read through a probe element. */
const tokenLength = (page: Page, name: string): Promise<string> =>
  page.evaluate((token) => {
    const probe = document.createElement('span')
    probe.style.display = 'grid'
    probe.style.rowGap = `var(${token})`
    document.body.append(probe)
    const length = getComputedStyle(probe).rowGap
    probe.remove()
    return length
  }, name)

/** The font size the engine paints for a `--softn-*` custom property, read through a probe element. */
const tokenFontSize = (page: Page, name: string): Promise<string> =>
  page.evaluate((token) => {
    const probe = document.createElement('span')
    probe.style.fontSize = `var(${token})`
    document.body.append(probe)
    const size = getComputedStyle(probe).fontSize
    probe.remove()
    return size
  }, name)

/** Records every request whose host is neither the site nor loopback. */
const externalRequests = (page: Page): (() => string[]) => {
  const external: string[] = []
  page.on('request', (request) => {
    const { hostname } = new URL(request.url())
    if (hostname !== 'localhost' && !hostname.startsWith('127.')) external.push(request.url())
  })
  return () => external
}

/** Opens the sheet of offer `index` with a mouse click on its card and waits for the title. */
const openSheet = async (page: Page, index: number): Promise<void> => {
  await cardButton(page, index).click()
  const offer = CARDS[index]
  if (!offer) throw new Error(`no offer at index ${index}`)
  await expect(sheet(page)).toHaveAttribute('aria-modal', 'true')
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).getByRole('heading', { level: 2, name: offer.sheet.title })).toBeVisible()
}

/** Resolves once the sheet's entrance animation has stopped (none runs under reduced motion). */
const waitSheetSettled = (dialog: Locator): Promise<void> =>
  expect
    .poll(() => dialog.evaluate((el) => el.getAnimations().length))
    .toBe(0)
    .then(() => undefined)

test.describe('offer sheet: opening and content', () => {
  for (const [index, offer] of CARDS.entries()) {
    test(`a mouse click on the ${offer.kicker} card opens its sheet with every section`, async ({ page }) => {
      await page.goto('/preview')
      await openSheet(page, index)
      const dialog = sheet(page)
      const scope = dialog
      const copy = offer.sheet

      // Accessible name and description come from the title and the intro, never duplicated.
      const title = scope.getByRole('heading', { level: 2, name: copy.title })
      await expect(title).toHaveCount(1)
      await expect(dialog).toHaveAttribute('aria-labelledby', (await title.getAttribute('id')) ?? '')
      const intro = scope.getByText(copy.intro)
      await expect(intro).toBeVisible()
      await expect(dialog).toHaveAttribute('aria-describedby', (await intro.getAttribute('id')) ?? '')

      // One h1 on the page, h2 then h3s inside the sheet: no skipped level. The DOM query
      // (not `getByRole`) is deliberate: while the modal sheet is open the background is
      // `aria-hidden`, so the hero h1 leaves the accessibility tree although it stays in the DOM.
      await expect(page.locator('h1')).toHaveCount(1)
      const levels = await scope
        .locator('h2, h3, h4, h5, h6')
        .evaluateAll((headings) => headings.map((heading) => Number(/^h([1-6])$/i.exec(heading.tagName)?.[1] ?? 0)))
      expect(levels, 'heading levels inside the sheet: h2 then h3s').toEqual([2, 3, 3, 3])

      // Gains, phases and audience all render the locale copy.
      await expect(scope.getByRole('heading', { level: 3, name: copy.gainsLabel })).toBeVisible()
      for (const item of copy.items) {
        await expect(scope.getByText(item.title)).toBeVisible()
        await expect(scope.getByText(item.text)).toBeVisible()
      }
      await expect(scope.getByRole('heading', { level: 3, name: copy.phasesLabel })).toBeVisible()
      for (const [phaseIndex, phase] of copy.phases.entries()) {
        const line = scope.getByText(phase)
        await expect(line).toBeVisible()
        // The number is generated from the list order, never carried by the copy.
        await expect(line.locator('..').getByText(String(phaseIndex + 1).padStart(2, '0'))).toBeVisible()
      }
      await expect(scope.getByRole('heading', { level: 3, name: copy.whoLabel })).toBeVisible()
      await expect(scope.getByText(copy.who)).toBeVisible()

      // Both calls to action point at the assistant section (booking and chatbot are not built yet).
      const primary = scope.getByRole('link', { name: copy.cta.primary })
      const secondary = scope.getByRole('link', { name: secondaryLabel(index) })
      await expect(primary).toBeVisible()
      await expect(secondary).toBeVisible()
      await expect(primary).toHaveAttribute('href', `#${SECTION_IDS.agent}`)
      await expect(secondary).toHaveAttribute('href', `#${SECTION_IDS.agent}`)

      // The icon-only close control carries the locale label; the kicker keeps the card accent.
      await expect(closeButton(page)).toBeVisible()
      await expect(scope.getByText(offer.kicker, { exact: true })).toHaveCSS(
        'color',
        await tokenColor(page, SHEET_TONE_TOKENS[OFFER_IDS[index] ?? 'create']),
      )
    })
  }

  test('Enter and Space on a focused card each open the sheet', async ({ page }) => {
    await page.goto('/preview')
    const before = page.url()

    await tabTo(page, cardButton(page, 0))
    await page.keyboard.press('Enter')
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole('heading', { level: 2, name: offers.create.sheet.title })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    expect(page.url(), 'the keyboard opening is not a navigation').toBe(before)

    await tabTo(page, cardButton(page, 1))
    await page.keyboard.press('Space')
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole('heading', { level: 2, name: offers.automate.sheet.title })).toBeVisible()
  })
})

test.describe('offer sheet: closing and focus', () => {
  test('Escape closes the sheet and returns focus to the opening card', async ({ page }) => {
    await page.goto('/preview')
    const opening = cardButton(page, 0)
    await opening.click()
    await expect(sheet(page)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    // `finalFocus` restores the card control even though the mouse click already focused it.
    await expect.poll(() => opening.evaluate((el) => el === document.activeElement)).toBe(true)
  })

  test('the close control closes the sheet and returns focus to the opening card', async ({ page }) => {
    await page.goto('/preview')
    const opening = cardButton(page, 1)
    await opening.click()
    await expect(sheet(page)).toBeVisible()

    await closeButton(page).click()
    await expect(sheet(page)).toHaveCount(0)
    await expect.poll(() => opening.evaluate((el) => el === document.activeElement)).toBe(true)
  })

  test('Tab and Shift+Tab loop through the sheet controls and never escape them', async ({ page }) => {
    await page.goto('/preview')
    await openSheet(page, 0)
    const dialog = sheet(page)
    const close = closeButton(page)
    const primary = dialog.getByRole('link', { name: offers.create.sheet.cta.primary })
    const secondary = dialog.getByRole('link', { name: secondaryLabel(0) })

    /** Presses `Tab` (`shift` for backwards) until `target` holds DOM focus; fails if it never does. */
    const tabUntilFocused = async (target: Locator, shift = false, maxPresses = 10): Promise<void> => {
      for (let press = 0; press < maxPresses; press += 1) {
        await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab')
        if (await target.evaluate((el) => el === document.activeElement)) return
      }
      throw new Error(`${shift ? 'Shift+Tab' : 'Tab'} never reached the expected sheet control`)
    }

    // The sheet takes focus on open: the first control, the close button.
    await expect.poll(() => close.evaluate((el) => el === document.activeElement)).toBe(true)
    // Tab follows the visual order: close, primary, secondary, then wraps back to close.
    await tabUntilFocused(primary)
    await tabUntilFocused(secondary)
    await tabUntilFocused(close)
    // Backwards: primary, close, then the wrap lands on the last control, secondary.
    await tabUntilFocused(primary, true)
    await tabUntilFocused(close, true)
    await tabUntilFocused(secondary, true)
    // One more wrap forward keeps the loop going: close again.
    await tabUntilFocused(close)
  })
})

test.describe('offer sheet: calls to action', () => {
  test('the primary call to action closes the sheet, scrolls to the assistant and books', async ({ page }) => {
    await page.goto('/preview')
    // The recorder runs in the live document: the intent fires on click, after this line.
    await recordAssistantIntents(page)
    await openSheet(page, 0)

    await sheet(page).getByRole('link', { name: offers.create.sheet.cta.primary }).click()
    await expect(sheet(page)).toHaveCount(0)
    await expect.poll(() => page.url()).toContain(`#${SECTION_IDS.agent}`)
    // The assistant section itself is not built yet (chatbot pending): the fragment changes with
    // nothing to scroll to, so the hash is the whole navigation contract today.
    const intents = await page.evaluate(() => (window as { __assistantIntents?: string[] }).__assistantIntents)
    expect(intents, 'the booking intent fired once').toEqual(['booking'])
  })

  test('the secondary call to action navigates without booking', async ({ page }) => {
    await page.goto('/preview')
    await recordAssistantIntents(page)
    await openSheet(page, 1)

    await sheet(page)
      .getByRole('link', { name: secondaryLabel(1) })
      .click()
    await expect(sheet(page)).toHaveCount(0)
    await expect.poll(() => page.url()).toContain(`#${SECTION_IDS.agent}`)
    const intents = await page.evaluate(() => (window as { __assistantIntents?: string[] }).__assistantIntents)
    expect(intents, 'the assistant link does not book').toEqual([])
  })
})

/**
 * The block gap between the two calls to action (`styles/OfferSheet.module.css`, `.actions`):
 * below the 64rem breakpoint the secondary link wraps under the primary button, so the space
 * that shows between them is `row-gap` (`--softn-space-6`); from 64rem up both share one row
 * and the row gap tightens back to the design's single gap (`--softn-space-4`). Expected
 * lengths resolve through the package tokens, so the assertion cannot pass on a coincidental
 * hardcoded pixel count.
 */
test.describe('offer sheet: CTA area spacing', () => {
  test('the block gap between the two calls to action follows the spacing tokens', async ({ page }) => {
    /** Viewport width → the token `.actions` resolves its `row-gap` from, and that token's px step. */
    const CASES = [
      { width: 375, token: '--softn-space-6', px: 24 },
      { width: 768, token: '--softn-space-6', px: 24 },
      { width: 1280, token: '--softn-space-4', px: 16 },
    ] as const

    for (const { width, token, px } of CASES) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await openSheet(page, 0)
      const dialog = sheet(page)
      await waitSheetSettled(dialog)

      const primary = dialog.getByRole('link', { name: offers.create.sheet.cta.primary })
      // Both calls to action are the only children of the `.actions` flex container.
      const actions = primary.locator('..')

      // The token resolves to the package's own step, and the container paints exactly that.
      const resolved = await tokenLength(page, token)
      expect(resolved, `${token} resolves to the ${px}px step of the tokens package`).toBe(`${px}px`)
      await expect(actions, `computed row-gap on the CTA area at ${width}px`).toHaveCSS('row-gap', resolved)

      // Painted geometry: a wrapped link sits exactly one row gap under the button; a link that
      // fits the row stays centered beside it (`align-items: center`), with the gap as fallback.
      const rects = await actions.evaluate((container) => {
        const [button, link] = Array.from(container.querySelectorAll('a'))
        if (button === undefined || link === undefined) {
          throw new Error('the sheet CTA area lost one of its two links')
        }
        const buttonRect = button.getBoundingClientRect()
        const linkRect = link.getBoundingClientRect()
        return {
          buttonBottom: buttonRect.bottom,
          buttonMid: (buttonRect.top + buttonRect.bottom) / 2,
          linkTop: linkRect.top,
          linkMid: (linkRect.top + linkRect.bottom) / 2,
        }
      })
      const gapPx = Number.parseFloat(resolved)
      if (rects.linkTop >= rects.buttonBottom - 0.5) {
        expect(Math.abs(rects.linkTop - rects.buttonBottom), `painted block distance at ${width}px`).toBeCloseTo(
          gapPx,
          0,
        )
      } else {
        expect(
          Math.abs(rects.buttonMid - rects.linkMid),
          `both CTAs share one centered row at ${width}px`,
        ).toBeLessThan(0.5)
      }
    }
  })
})

/**
 * The sheet title's display scale (`OfferSheet.tsx`: `text-display-md` from 0, `md:text-display-lg`
 * from the 48rem breakpoint): 36px on mobile and tablet, 48px from 768px up. Expected sizes resolve
 * through the package's own typography tokens, so the assertion cannot pass on a coincidental
 * hardcoded pixel count. The 320px and 375px cases also guard the smallest supported widths against
 * horizontal overflow: the title wraps (`max-inline-size: 20ch`) instead of widening the popup.
 */
test.describe('offer sheet: title scale', () => {
  test('the sheet title follows the display tokens at every audited viewport', async ({ page }) => {
    /** Viewport width → the `--softn-*` size token the title resolves from, and that token's px step. */
    const CASES = [
      { width: 320, token: '--softn-font-size-display-md', px: 36 },
      { width: 375, token: '--softn-font-size-display-md', px: 36 },
      { width: 768, token: '--softn-font-size-display-lg', px: 48 },
      { width: 1280, token: '--softn-font-size-display-lg', px: 48 },
    ] as const

    for (const { width, token, px } of CASES) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await openSheet(page, 0)
      const title = sheet(page).getByRole('heading', { level: 2, name: offers.create.sheet.title })

      // The token resolves to the package's own step, and the title paints exactly that.
      const resolved = await tokenFontSize(page, token)
      expect(resolved, `${token} resolves to the ${px}px step of the tokens package`).toBe(`${px}px`)
      await expect(title, `computed title font-size at ${width}px`).toHaveCSS('font-size', resolved)

      // Neither the wrapped title nor the popup widens the page past its viewport.
      const overflow = await sheet(page).evaluate((el) => ({
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
        popupScroll: el.scrollWidth,
        popupClient: el.clientWidth,
      }))
      expect(overflow.docScroll, `document scrollWidth at ${width}px`).toBeLessThanOrEqual(overflow.docClient)
      expect(overflow.popupScroll, `sheet scrollWidth at ${width}px`).toBeLessThanOrEqual(overflow.popupClient)
    }
  })
})

test.describe('offer sheet: themes, viewports and motion', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`the sheet paints in the ${scheme} theme's tokens`, async ({ page }) => {
      await forceTheme(page, scheme)
      await page.goto('/preview')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      await openSheet(page, 0)

      // The popup is the theme's page background and the copy keeps the theme's ink.
      const background = await tokenColor(page, '--softn-background')
      const ink = await tokenColor(page, '--softn-color')
      await expect(sheet(page)).toHaveCSS('background-color', background)
      await expect(sheet(page).getByRole('heading', { level: 2 })).toHaveCSS('color', ink)
      const accent = await tokenColor(page, SHEET_TONE_TOKENS.create)
      await expect(sheet(page).getByText(offers.create.kicker, { exact: true })).toHaveCSS('color', accent)
    })
  }

  test('a mobile viewport opens the sheet without horizontal overflow', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await page.goto('/preview')
    await openSheet(page, 1)

    const overflow = await sheet(page).evaluate((el) => {
      const clipping = Array.from(el.querySelectorAll('*'))
        .filter((child) => child.scrollWidth - child.clientWidth > 1 && getComputedStyle(child).overflowX !== 'hidden')
        .map((child) => `${child.tagName}.${(child.getAttribute('class') ?? '').slice(0, 40)}`)
      return {
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
        popupScroll: el.scrollWidth,
        popupClient: el.clientWidth,
        clipping,
      }
    })
    expect(overflow.docScroll, 'document scrollWidth').toBeLessThanOrEqual(overflow.docClient)
    expect(overflow.popupScroll, 'sheet scrollWidth').toBeLessThanOrEqual(overflow.popupClient)
    expect(overflow.clipping, 'elements wider than their box').toEqual([])

    // The label/body grid stacks below 48rem: each section label sits above its body.
    const stacked = await sheet(page)
      .getByRole('heading', { level: 3, name: offers.automate.sheet.gainsLabel })
      .evaluate((label) => {
        const body = label.nextElementSibling
        if (!body) return { labelBottom: -1, bodyTop: -1 }
        return { labelBottom: label.getBoundingClientRect().bottom, bodyTop: body.getBoundingClientRect().top }
      })
    expect(stacked.labelBottom).toBeLessThanOrEqual(stacked.bodyTop + 1)

    // Both calls to action stay reachable and the close control keeps working.
    await expect(sheet(page).getByRole('link', { name: offers.automate.sheet.cta.primary })).toBeVisible()
    await closeButton(page).click()
    await expect(sheet(page)).toHaveCount(0)
  })

  test('prefers-reduced-motion removes the entrance animation and the control transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/preview')
    await openSheet(page, 0)
    const dialog = sheet(page)

    await expect(dialog).toHaveCSS('animation-name', 'none')
    await expect(closeButton(page)).toHaveCSS('transition-duration', '0s')
    await expect(
      dialog.getByRole('link', { name: secondaryLabel(0) }),
      'the assistant link keeps its underline but loses the transition',
    ).toHaveCSS('transition-duration', '0s')

    // Opening and closing still work without any animation to wait for.
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
  })
})

test.describe('offer sheet: accessibility', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`axe (WCAG 2.1 A/AA) finds no violation with the ${scheme} sheet open`, async ({ page }) => {
      await forceTheme(page, scheme)
      await page.goto('/preview')
      await openSheet(page, 0)
      await waitSheetSettled(sheet(page))

      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_AA_TAGS])
        .include('[role="dialog"]')
        .analyze()
      expect(
        results.violations,
        `sheet (${scheme}): ${String(results.violations.length)} WCAG 2.1 A/AA violation(s)\n${results.violations
          .map((violation) =>
            [
              `- ${violation.id} [${violation.impact ?? 'unknown'}]: ${violation.help}`,
              ...violation.nodes.map((node) => `    at ${node.target.join(' > ')}`),
            ].join('\n'),
          )
          .join('\n')}`,
      ).toHaveLength(0)
    })
  }

  test('using the sheet loads nothing external', async ({ page }) => {
    const readExternal = externalRequests(page)
    await page.goto('/preview')
    // Both sheets, every control, both calls to action: nothing leaves the origin.
    for (const index of [0, 1] as const) {
      await openSheet(page, index)
      await waitSheetSettled(sheet(page))
      await closeButton(page).click()
      await expect(sheet(page)).toHaveCount(0)
    }
    await openSheet(page, 0)
    await sheet(page).getByRole('link', { name: offers.create.sheet.cta.primary }).click()
    await expect.poll(() => page.url()).toContain(`#${SECTION_IDS.agent}`)
    expect(readExternal(), 'no third-party request from the offer sheet').toEqual([])
  })
})

/**
 * Every computed design value on the sheet's key elements must exist as a value of
 * `@softnio-labs/tokens`, in both themes. Method copied from `e2e/designTokens.spec.ts`: the
 * browser is the oracle. Each `--softn-*` name found in the stylesheets is resolved through a
 * probe element, so oklch/rem/ratio normalization differences cannot cause false positives or
 * negatives. The probe sits in a sentinel-colored wrapper, so a token that is not a color cannot
 * leak a real color into the allowed set.
 *
 * Accepted deviation (same policy as `designTokens.spec.ts`, Mel's decision 2026-10-20 on the
 * hero): a `clamp()` between two token bounds may interpolate between them. The sheet's content
 * `padding-bottom` (`clamp(--softn-space-16, 9vw, --softn-space-30)`), the content `gap`
 * (`clamp(--softn-space-8, 5vw, --softn-space-16)`) and the label/body `gap`
 * (`clamp(--softn-space-5, 3vw, --softn-space-10)` at or above 48rem) interpolate at the audit
 * viewports; their computed values are recorded and must stay inside the token bounds. Every
 * other value must be an exact token value.
 */
type SheetAudit = {
  theme: string
  tokenCount: number
  mismatches: string[]
  fluidAccepted: string[]
  loadedFontFamilies: string[]
}

/** Runs inside the page with the sheet open: audits the sheet's computed styles against the token sets. */
const auditSheetInPage = (theme: string): SheetAudit => {
  const SENTINEL = 'rgb(1, 2, 3)'
  document.documentElement.setAttribute('data-theme', theme)
  void document.documentElement.offsetHeight

  const num = (v: string): number => Number.parseFloat(v)
  const norm = (v: string): string => v.toLowerCase().replace(/\s+/g, ' ')

  // 1. Collect every --softn-* name declared anywhere in the stylesheets, plus those on :root.
  const names = new Set<string>()
  const rootStyle = getComputedStyle(document.documentElement)
  for (const p of Array.from(rootStyle)) if (p.startsWith('--softn-')) names.add(p)
  const walk = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        for (const p of Array.from(rule.style)) if (p.startsWith('--softn-')) names.add(p)
      } else if (rule instanceof CSSGroupingRule) {
        walk(rule.cssRules)
      }
    }
  }
  for (const pageSheet of Array.from(document.styleSheets)) {
    try {
      walk(pageSheet.cssRules)
    } catch {
      /* unreadable sheet: none should be, but never crash the audit */
    }
  }

  // 2. Resolve each name into allowed-value sets (colors, shadows, lengths, weights, ratios).
  const wrapper = document.createElement('div')
  wrapper.style.color = SENTINEL
  document.body.appendChild(wrapper)
  const probe = document.createElement('span')
  probe.style.fontSize = '100px'
  wrapper.appendChild(probe)
  const probeStyle = getComputedStyle(probe)

  const colors = new Set<string>([norm('rgba(0, 0, 0, 0)')])
  const shadows = new Set<string>([norm('none')])
  const lengths = new Set<number>([0])
  const weights = new Set<string>()
  const ratios = new Set<number>()
  const letterSpacingRatios = new Set<number>([0])

  const resolve = (name: string, depth = 0): string => {
    const raw = rootStyle.getPropertyValue(name).trim()
    if (depth < 4) {
      const inner = /var\((--softn-[a-z0-9-]+)\)/i.exec(raw)
      if (inner?.[1]) return resolve(inner[1], depth + 1)
    }
    return raw
  }

  for (const name of names) {
    if (resolve(name) === '') continue

    probe.style.color = `var(${name})`
    const color = norm(probeStyle.color)
    if (color !== SENTINEL) colors.add(color)

    probe.style.boxShadow = `var(${name})`
    const shadow = norm(probeStyle.boxShadow)
    if (shadow !== 'none') shadows.add(shadow)

    probe.style.fontSize = `var(${name})`
    const size = num(probeStyle.fontSize)
    if (size !== 100 && Number.isFinite(size)) lengths.add(Number(size.toFixed(2)))

    probe.style.borderTopLeftRadius = `var(${name})`
    const radius = num(probeStyle.borderTopLeftRadius)
    if (Number.isFinite(radius)) lengths.add(Number(radius.toFixed(2)))

    probe.style.padding = `var(${name})`
    for (const part of probeStyle.padding.split(/\s+/)) {
      const value = num(part)
      if (Number.isFinite(value)) lengths.add(Number(value.toFixed(2)))
    }

    if (/font-weight/.test(name)) {
      probe.style.fontWeight = `var(${name})`
      const weight = probeStyle.fontWeight
      if (weight !== '' && !Number.isNaN(num(weight))) weights.add(weight)
    }
    if (/line-height/.test(name)) {
      probe.style.fontSize = '100px'
      probe.style.lineHeight = `var(${name})`
      const lineHeight = num(probeStyle.lineHeight)
      if (Number.isFinite(lineHeight)) {
        ratios.add(Number((lineHeight / num(probeStyle.fontSize)).toFixed(3)))
      }
    }
    if (/letter-spacing/.test(name)) {
      probe.style.fontSize = '100px'
      probe.style.letterSpacing = `var(${name})`
      const spacing = probeStyle.letterSpacing
      if (spacing !== 'normal') {
        const value = num(spacing)
        if (Number.isFinite(value)) {
          letterSpacingRatios.add(Number(Math.abs(value / num(probeStyle.fontSize)).toFixed(4)))
        }
      }
    }

    probe.style.color = SENTINEL
    probe.style.boxShadow = 'none'
    probe.style.fontSize = '100px'
    probe.style.borderTopLeftRadius = '0px'
    probe.style.padding = '0px'
    probe.style.fontWeight = '400'
    probe.style.lineHeight = 'normal'
    probe.style.letterSpacing = 'normal'
  }

  const lengthOk = (v: number): boolean => {
    for (const t of lengths) if (Math.abs(t - v) < 0.06) return true
    return false
  }

  // 3. Audit the sheet's key elements against the sets.
  const dialog = document.querySelector('[role="dialog"]')
  const mismatches: string[] = []
  const fluidAccepted: string[] = []
  const loadedFamilies = Array.from(document.fonts).map((face) => face.family.toLowerCase())
  const finish = (): SheetAudit => {
    wrapper.remove()
    return { theme, tokenCount: names.size, mismatches, fluidAccepted, loadedFontFamilies: loadedFamilies }
  }
  if (dialog === null) {
    mismatches.push('no [role="dialog"] in the audit page')
    return finish()
  }

  const firstFamily = (stack: string): string =>
    (stack.split(',')[0] ?? '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .toLowerCase()

  const bodyFamily = firstFamily(rootStyle.getPropertyValue('--softn-font-body'))
  const displayFamily = firstFamily(rootStyle.getPropertyValue('--softn-font-display'))

  /** Property → clamp bounds (px) accepted as interpolating between token bounds; see the header note. */
  const acceptedFluid: Record<string, [number, number] | undefined> = {
    'padding-bottom': [64, 120],
    gap: [20, 40],
    'row-gap': [32, 64],
  }

  const auditElement = (
    label: string,
    element: Element | null,
    expectedFamily: 'body' | 'display',
    extraLengths: Record<string, [number, number] | undefined> = {},
  ): void => {
    if (element === null) {
      mismatches.push(`${label}: element not found`)
      return
    }
    const style = getComputedStyle(element)
    for (const property of ['color', 'background-color', 'border-top-color', 'border-bottom-color']) {
      const value = norm(style.getPropertyValue(property))
      if (value !== '' && !colors.has(value)) mismatches.push(`${label} ${property}: ${value} is not a token color`)
    }
    const shadow = norm(style.boxShadow)
    if (!shadows.has(shadow)) mismatches.push(`${label} box-shadow: ${shadow} is not a token shadow`)
    const fontSize = num(style.fontSize)
    if (!lengthOk(fontSize)) mismatches.push(`${label} font-size: ${style.fontSize} is not a token length`)
    const radius = num(style.borderTopLeftRadius)
    if (!lengthOk(radius)) {
      mismatches.push(`${label} border-radius: ${style.borderTopLeftRadius} is not a token length`)
    }
    if (!weights.has(style.fontWeight)) {
      mismatches.push(`${label} font-weight: ${style.fontWeight} is not a token weight`)
    }
    const lineHeightRatio = Number((num(style.lineHeight) / (fontSize > 0 ? fontSize : 1)).toFixed(3))
    if (!ratios.has(lineHeightRatio)) {
      mismatches.push(`${label} line-height: ${lineHeightRatio} is not a token ratio`)
    }
    if (style.letterSpacing !== 'normal') {
      const spacingRatio = Number(Math.abs(num(style.letterSpacing) / (fontSize > 0 ? fontSize : 1)).toFixed(4))
      if (!letterSpacingRatios.has(spacingRatio)) {
        mismatches.push(`${label} letter-spacing: ${spacingRatio} is not a token ratio`)
      }
    }
    const family = firstFamily(style.fontFamily)
    const expected = expectedFamily === 'body' ? bodyFamily : displayFamily
    if (family !== expected) mismatches.push(`${label} font-family: ${family} (expected ${expected})`)
    if (!loadedFamilies.includes(expected)) {
      mismatches.push(`${label} font-family: ${expected} has no loaded face (document.fonts)`)
    }
    for (const [property, bounds] of Object.entries({ ...acceptedFluid, ...extraLengths })) {
      if (bounds === undefined) continue
      const [min, max] = bounds
      const value = num(style.getPropertyValue(property))
      if (!Number.isFinite(value)) continue
      if (lengthOk(value)) continue
      if (value >= min - 0.06 && value <= max + 0.06) {
        fluidAccepted.push(`${label} ${property}: ${value} (clamp between ${min} and ${max})`)
      } else {
        mismatches.push(
          `${label} ${property}: ${value} is neither a token nor inside the clamp bounds [${min}, ${max}]`,
        )
      }
    }
  }

  const sections = Array.from(dialog.querySelectorAll('section'))
  auditElement('popup', dialog, 'body')
  auditElement('header-inner', dialog.querySelector('header div'), 'body')
  auditElement('kicker', dialog.querySelector('header span'), 'body')
  auditElement('close', dialog.querySelector('header button'), 'body')
  auditElement('content', dialog.querySelector('header + div'), 'body')
  auditElement('title', dialog.querySelector('h2'), 'display')
  auditElement('intro', dialog.querySelector('h2 + p'), 'body')
  auditElement('gains-label', sections[0]?.querySelector('h3') ?? null, 'body')
  auditElement('gains-item-title', sections[0]?.querySelector('li p:first-child') ?? null, 'display')
  auditElement('gains-item-text', sections[0]?.querySelector('li p:last-child') ?? null, 'body')
  auditElement('phases-label', sections[1]?.querySelector('h3') ?? null, 'body')
  auditElement('phase-number', sections[1]?.querySelector('ol li span:first-child') ?? null, 'body')
  auditElement('phase-text', sections[1]?.querySelector('ol li span:last-child') ?? null, 'body')
  auditElement('who-label', sections[2]?.querySelector('h3') ?? null, 'body')
  auditElement('who-text', sections[2]?.querySelector('div > p') ?? null, 'body')
  const actions = sections[2]?.querySelector('div:last-child') ?? null
  const actionLinks = actions?.querySelectorAll('a')
  auditElement('primary-cta', actionLinks?.[0] ?? null, 'body')
  auditElement('secondary-cta', actionLinks?.[1] ?? null, 'body')
  if (sections[1] !== undefined) auditElement('section-grid', sections[1], 'body')

  return finish()
}

test.describe('offer sheet: token fidelity (role contract 4a-1)', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`every computed sheet value is a package token (${scheme} theme, desktop)`, async ({ page }) => {
      await forceTheme(page, scheme)
      await page.goto('/preview')
      await openSheet(page, 0)
      await waitSheetSettled(sheet(page))

      const audit = await page.evaluate(auditSheetInPage, scheme)
      expect(audit.tokenCount, 'the audit resolved at least the theme tokens').toBeGreaterThan(50)
      expect(
        audit.mismatches,
        `${scheme}: ${String(audit.mismatches.length)} non-token value(s)\n${audit.mismatches.join('\n')}`,
      ).toEqual([])
      // The fonts the package declares are the faces the sheet actually paints in.
      expect(audit.loadedFontFamilies.join(',').toLowerCase()).toContain('plusjakartasans')
      expect(audit.loadedFontFamilies.join(',').toLowerCase()).toContain('zalando')
    })
  }

  test('every computed sheet value is a package token (dark theme, mobile)', async ({ page }) => {
    await forceTheme(page, 'dark')
    await page.setViewportSize(MOBILE_VIEWPORT)
    await page.goto('/preview')
    await openSheet(page, 1)
    await waitSheetSettled(sheet(page))

    const audit = await page.evaluate(auditSheetInPage, 'dark')
    expect(
      audit.mismatches,
      `mobile: ${String(audit.mismatches.length)} non-token value(s)\n${audit.mismatches.join('\n')}`,
    ).toEqual([])
  })
})
