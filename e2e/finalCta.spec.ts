/**
 * QA coverage of the final call-to-action section `#appel` (GitHub issue #21).
 *
 * The section renders after the FAQ on `/preview` only (the `/preview` route needs the preview
 * flag; the home page is the coming-soon screen and is unchanged). The suite pins:
 * - the section's place and heading hierarchy: the one h2 names the region (`aria-labelledby`), no
 *   stray h3s;
 * - the shared booking call to action: a plain left click opens the booking flow exactly once (the
 *   same `assistant-intent` event the hero and the header dispatch), the link keeps working without
 *   JavaScript as a plain `#assistant` anchor, and the anchor lands clear of the sticky header;
 * - the hero CTA keeps `#hero-cta` so the header CTA still reveals once it scrolls out of view;
 * - no horizontal overflow at the reference widths, in both themes;
 * - a visible focus ring on the call to action;
 * - the glow freezes under `prefers-reduced-motion`;
 * - WCAG contrast of the body text and the button label in both themes;
 * - the anchor lands clear of the sticky header when a shared link opens the fragment, and the
 *   fragment hold leaves the URL and the navigation alone.
 *
 * Expected copy is imported from `locales/fr/`, never hardcoded (QA rule). When `QA_CAPTURE_DIR` is
 * set the suite saves one screenshot of the section per reference width and theme for the QA report
 * folder.
 */
import { expect, test, type Page } from '@playwright/test'
import { HERO_CTA_ID, SECTION_IDS } from '../lib/anchors'
import { appel } from '../locales/fr/hero'
import { chatbot } from '../locales/fr/chatbot'

const WIDTHS = [375, 768, 1280] as const
const HEIGHT = 800

const captureDir = process.env.QA_CAPTURE_DIR
const section = (page: Page) => page.locator(`#${SECTION_IDS.finalCta}`)
const heroCta = (page: Page) => page.locator(`#${HERO_CTA_ID}`)
const sectionCta = (page: Page) => section(page).getByRole('link', { name: appel.cta })
const bookingRegion = (page: Page) => page.getByRole('region', { name: chatbot.suggestions.book })

/**
 * Counts the booking intents the page dispatches until the returned reader is called. Both calls to
 * action announce the flow through the `assistant-intent` event, and each must open it exactly once.
 */
const countBookingIntents = async (page: Page): Promise<() => number> => {
  let opened = 0
  await page.exposeFunction('qaCountBooking', () => {
    opened += 1
  })
  await page.evaluate(() => {
    window.addEventListener('assistant-intent', () => {
      const w = window as unknown as { qaCountBooking: () => void }
      w.qaCountBooking()
    })
  })
  return () => opened
}

/** Distance between a section's top edge and the reading band's top edge (`scroll-padding-top`), in px. */
const sectionOffset = (page: Page, id: string): Promise<number> =>
  page.evaluate((sectionId) => {
    const el = document.getElementById(sectionId)
    if (el === null) throw new Error(`section ${sectionId} missing`)
    const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
    return el.getBoundingClientRect().top - padding
  }, id)

test.describe('final CTA section (#appel)', () => {
  test('renders last on /preview, after the FAQ, as one region named by its single h2', async ({ page }) => {
    await page.goto('/preview')
    await page.evaluate(() => document.fonts.ready)

    // The section is the last one in main, right after the FAQ.
    const sections = page.locator('main section')
    const count = await sections.count()
    await expect(sections.nth(count - 1)).toHaveAttribute('id', SECTION_IDS.finalCta)
    await expect(sections.nth(count - 2)).toHaveAttribute('id', SECTION_IDS.faq)

    // One h2, no h3: the section is named by it, nothing after it.
    await expect(section(page).getByRole('heading', { level: 2 })).toHaveCount(1)
    await expect(section(page).getByRole('heading', { level: 3 })).toHaveCount(0)
    const heading = section(page).getByRole('heading', { level: 2 })
    const labelledBy = await section(page).getAttribute('aria-labelledby')
    const headingId = await heading.getAttribute('id')
    expect(headingId, 'the h2 carries an id').toBeTruthy()
    expect(labelledBy, 'the region is named by its single h2').toBe(headingId)
    await expect(heading).toHaveText(`${appel.title.line1} ${appel.title.line2}`)
    await expect(section(page).getByText(appel.body)).toBeVisible()
    await expect(sectionCta(page)).toBeVisible()
  })

  test('a plain left click on the section call to action opens the booking flow exactly once', async ({ page }) => {
    await page.goto('/preview')
    const opened = await countBookingIntents(page)

    await sectionCta(page).click()
    await expect(page).toHaveURL(/#assistant$/)
    await expect(bookingRegion(page)).toBeVisible()
    expect(opened(), 'the section CTA opens the booking flow exactly once').toBe(1)
  })

  test('the hero call to action still opens the booking flow exactly once', async ({ page }) => {
    await page.goto('/preview')
    const opened = await countBookingIntents(page)

    await heroCta(page).click()
    await expect(page).toHaveURL(/#assistant$/)
    await expect(bookingRegion(page)).toBeVisible()
    expect(opened(), 'the hero CTA opens the booking flow exactly once').toBe(1)
    // The hero CTA keeps its id, so the header CTA still reveals once it scrolls out of view.
    await expect(heroCta(page)).toHaveAttribute('id', HERO_CTA_ID)
  })

  test('the section call to action works without JavaScript as a plain #assistant link', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: HEIGHT } })
    const page = await context.newPage()
    await page.goto('/preview')
    await sectionCta(page).click()
    await expect(page).toHaveURL(/#assistant$/)
    await expect.poll(async () => Math.abs(await sectionOffset(page, SECTION_IDS.agent))).toBeLessThanOrEqual(2)
    await context.close()
  })

  test('the hero CTA keeps its id and the header CTA still reveals once it scrolls out of view', async ({ page }) => {
    await page.goto('/preview')
    await expect(heroCta(page)).toHaveAttribute('id', HERO_CTA_ID)
    await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'hidden')

    await page.evaluate((id) => {
      const el = document.getElementById(id)
      if (el === null) throw new Error(`#${id} missing`)
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().bottom)
    }, HERO_CTA_ID)
    await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'visible')
    await expect(page.locator('header [data-state] a[href="#assistant"]')).toBeVisible()
  })

  /*
   * `#appel` is a link target, not a header navigation entry, so the scroll-spy never observes it and
   * the navigation has nothing to highlight. The fragment re-apply still covers it: a shared
   * `/preview#appel` link is re-applied from the section's own box once the page grows (the method
   * diagram's pinned track, the font swap), so the reader lands on the section instead of where the
   * pre-hydration layout put them. `#appel` can also be the last block of the page, where the
   * document ends before the section top can reach the reading band: the section then lands at the
   * last scroll position, entirely visible below the sticky header. The assertion accepts either, so
   * it stays valid once a footer follows the section.
   */
  test('the #appel anchor lands clear of the sticky header', async ({ page }) => {
    // Land on the fragment the way a shared link does.
    await page.goto(`/preview#${SECTION_IDS.finalCta}`)
    await page.evaluate(() => document.fonts.ready)
    await expect
      .poll(
        () =>
          page.evaluate((sectionId) => {
            const el = document.getElementById(sectionId)
            if (el === null) throw new Error(`section ${sectionId} missing`)
            const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
            const box = el.getBoundingClientRect()
            const atReadingBand = Math.abs(box.top - padding) <= 2
            const atLastScroll =
              Math.abs(window.scrollY - (document.documentElement.scrollHeight - window.innerHeight)) <= 2
            const clearOfHeader = box.top >= padding - 2 && box.bottom <= window.innerHeight + 2
            return atReadingBand || (atLastScroll && clearOfHeader)
          }, SECTION_IDS.finalCta),
        {
          message: 'the #appel section must be at the reading band or at the last scroll position, clear of the header',
        },
      )
      .toBe(true)
    await expect(section(page)).toBeVisible()
    await expect(sectionCta(page)).toBeVisible()
  })

  /*
   * The hook holds a fragment that names a section without a navigation entry: the address keeps the
   * visitor's own fragment and no navigation entry is marked, for as long as the hold lasts. The hold
   * ends on the visitor's own gesture, exactly like a navigation fragment's.
   */
  test('the #appel fragment is never rewritten in the URL and never highlights a nav entry', async ({ page }) => {
    await page.goto(`/preview#${SECTION_IDS.finalCta}`)
    await page.evaluate(() => document.fonts.ready)
    // Past the hold's 150 ms scroll-idle release and its 3 s cap, with no gesture from the visitor.
    await page.waitForTimeout(4000)
    const navHighlight = await page.evaluate(() => {
      const link = document.querySelector('nav a[aria-current="location"]')
      return link === null ? null : (link.getAttribute('href') ?? '')
    })
    expect(navHighlight, 'no nav entry is ever highlighted while the fragment is held').toBeNull()
    expect(await page.evaluate(() => window.location.hash), `the visitor's fragment stays in the URL`).toBe(
      `#${SECTION_IDS.finalCta}`,
    )
  })

  test('the call to action shows a visible focus ring', async ({ page }) => {
    await page.goto('/preview')
    await sectionCta(page).focus()
    const ring = await page.evaluate((sectionId) => {
      const el = document.querySelector(`#${sectionId} a[href='#assistant']`)
      if (el === null) throw new Error(`#${sectionId}: no booking CTA`)
      const style = getComputedStyle(el)
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        boxShadow: style.boxShadow,
      }
    }, SECTION_IDS.finalCta)
    const visible = ring.outlineStyle !== 'none' && ring.outlineWidth >= 2
    expect(visible || ring.boxShadow !== 'none', 'a visible focus ring on the section CTA').toBe(true)
  })

  test('the glow freezes under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/preview')
    const glow = section(page).locator('[aria-hidden="true"]')
    await expect(glow).toBeAttached()
    const style = await glow.evaluate((el) => {
      const s = getComputedStyle(el)
      return { animationName: s.animationName, opacity: s.opacity }
    })
    expect(style.animationName, 'no animation under prefers-reduced-motion').toBe('none')
    expect(Number.parseFloat(style.opacity), 'the glow keeps its resting opacity').toBeGreaterThan(0)
  })

  test('body and button text contrast in both themes', async ({ browser }) => {
    for (const theme of ['dark', 'light'] as const) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: HEIGHT } })
      const page = await context.newPage()
      await page.goto('/preview')
      await page.evaluate(() => document.fonts.ready)
      const result = await page.evaluate((sectionId) => {
        const s = document.getElementById(sectionId)
        if (s === null) throw new Error(`#${sectionId} missing`)
        const body = s.querySelector('p') as HTMLElement
        const cta = s.querySelector('a[href="#assistant"]') as HTMLElement
        // The first opaque background of the section, the section's own background is transparent.
        const effectiveBackground = (el: Element): string => {
          let node: Element | null = el
          while (node) {
            const bg = getComputedStyle(node).backgroundColor
            if (!/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(bg)) return bg
            node = node.parentElement
          }
          return 'rgb(255, 255, 255)'
        }
        // The tokens package publishes colors in `oklch()`, and Chromium's computed style keeps
        // them in `lab()` — the contrast check needs sRGB, so it converts the two spaces it meets
        // (lab and rgb()/rgba()) and fails loudly on anything else instead of parsing away a defect.
        const toSRGB = (color: string): [number, number, number] => {
          const lab = color.match(/^lab\(([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*[\d.]+%?)?\)$/)
          if (lab !== null && lab[1] !== undefined && lab[2] !== undefined && lab[3] !== undefined) {
            const L = Number.parseFloat(lab[1])
            const a = Number.parseFloat(lab[2])
            const b = Number.parseFloat(lab[3])
            const fy = (L + 16) / 116
            const fx = fy + a / 500
            const fz = fy - b / 200
            const invert = (t: number): number => (t > 6 / 29 ? t ** 3 : ((t - 4 / 29) * 108) / 841)
            const x = 0.95047 * invert(fx)
            const y = 1.0 * invert(fy)
            const z = 1.08883 * invert(fz)
            const linear = [
              3.2406 * x - 1.5372 * y - 0.4986 * z,
              -0.9689 * x + 1.8758 * y + 0.0415 * z,
              0.0557 * x - 0.204 * y + 1.057 * z,
            ]
            const encode = (v: number): number =>
              Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055))
            return [encode(linear[0] ?? 0), encode(linear[1] ?? 0), encode(linear[2] ?? 0)]
          }
          const rgb = color.match(/^rgba?\(([^)]+)\)$/)
          if (rgb !== null && rgb[1] !== undefined) {
            const parts = rgb[1].split(',').map((v) => Number.parseFloat(v))
            return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
          }
          throw new Error(`#${sectionId}: unsupported color: ${color}`)
        }
        const contrast = (a: string, b: string): number => {
          const lum = (c: string): number => {
            const [r, g, b] = toSRGB(c)
            const f = (v: number): number => {
              const x = v / 255
              return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
          }
          const l1 = lum(a)
          const l2 = lum(b)
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        }
        const bodyBackground = effectiveBackground(body)
        const ctaBackground = effectiveBackground(cta)
        return {
          bodyColor: getComputedStyle(body).color,
          bodyBackground,
          bodyContrast: contrast(getComputedStyle(body).color, bodyBackground),
          ctaColor: getComputedStyle(cta).color,
          ctaBackground,
          ctaContrast: contrast(getComputedStyle(cta).color, ctaBackground),
        }
      }, SECTION_IDS.finalCta)
      expect(result.bodyContrast, `body text contrast in ${theme}`).toBeGreaterThanOrEqual(4.5)
      expect(result.ctaContrast, `button text contrast in ${theme}`).toBeGreaterThanOrEqual(4.5)
      await context.close()
    }
  })

  test('no horizontal overflow at the reference widths in both themes', async ({ page }) => {
    await page.goto('/preview')
    for (const theme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      await page.evaluate(() => document.fonts.ready)
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT })
        const overflow = await page.evaluate(() => {
          const el = document.documentElement
          return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        })
        expect(overflow.scrollWidth, `no horizontal scroll at ${width}px in ${theme}`).toBeLessThanOrEqual(
          overflow.clientWidth,
        )
        await expect(sectionCta(page), `the CTA is visible at ${width}px in ${theme}`).toBeVisible()
        if (captureDir) {
          await section(page).scrollIntoViewIfNeeded()
          await page.screenshot({ path: `${captureDir}/appel-${width}-${theme}.png`, fullPage: false })
        }
      }
    }
  })
})
