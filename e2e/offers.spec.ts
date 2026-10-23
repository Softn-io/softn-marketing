import { devices, expect, test, type Locator, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { offers } from '../locales/fr/offers'

/**
 * QA coverage of the Offers section (#11): the services landmark, both theme renderings, the
 * responsive grid, the whole-card button with its keyboard focus ring, and the pointer tilt with
 * its motion and pointer-type gates.
 *
 * The detail sheet (issue #12) has its own coverage in `e2e/offerSheet.spec.ts`: opening each
 * sheet from its card, its content, closing, focus and the calls to action.
 */

/** localStorage key the inline theme script reads (same contract as `lib/theme`, `e2e/theme.spec.ts`). */
const THEME_STORAGE_KEY = 'softn-theme'

const CARDS = [offers.create, offers.automate] as const

/** Locale keys of the two cards, in render order; indexes line up with `CARDS`. */
const OFFER_IDS = ['create', 'automate'] as const

/** Accent custom property of each card, from `OfferCard.tsx` and `Offers.module.css`. */
const TONE_TOKENS = { create: '--softn-brand-vivid', automate: '--softn-warning' } as const

const section = (page: Page): Locator => page.locator(`#${SECTION_IDS.offers}`)
const card = (page: Page, index: number): Locator => section(page).locator('article').nth(index)

/** The invisible whole-surface overlay button, named by the card title. */
const cardButton = (page: Page, index: number): Locator =>
  page.getByRole('button', { name: CARDS[index]?.cardTitle ?? '' })

/** Forces a theme the way the theme script consumes it, before navigation (`e2e/accessibility.spec.ts`). */
const forceTheme = async (page: Page, scheme: 'dark' | 'light'): Promise<void> => {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, scheme] as const)
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

/** Presses Tab until `target` holds DOM focus; fails if the keyboard never reaches it. */
const tabTo = async (page: Page, target: Locator): Promise<void> => {
  for (let step = 0; step < 40; step += 1) {
    if (await target.evaluate((el) => document.activeElement === el)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('keyboard Tab never reached the offer card button')
}

test.describe('offers: structure and copy', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`section, hidden h2 and both cards render in the ${scheme} theme`, async ({ page }) => {
      await forceTheme(page, scheme)
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)

      const heading = page.getByRole('heading', { level: 2, name: offers.srTitle })
      await expect(heading).toHaveCount(1)
      await expect(section(page)).toHaveAttribute('aria-labelledby', (await heading.getAttribute('id')) ?? '')
      // The srTitle exists for the landmark name only: nothing a sighted user reads on the page.
      await expect(heading).toHaveClass(/sr-only/)

      // Scoped and exact: the eyebrow string also names the header nav link to this section.
      await expect(section(page).getByText(offers.eyebrow, { exact: true })).toBeVisible()
      await expect(section(page).getByText(offers.hint, { exact: true })).toBeVisible()
      for (const [index, offer] of CARDS.entries()) {
        const inCard = card(page, index)
        await expect(inCard.getByText(offer.kicker)).toBeVisible()
        await expect(inCard.getByRole('heading', { level: 3, name: offer.cardTitle })).toBeVisible()
        await expect(inCard.getByText(offer.cardText)).toBeVisible()
        // Exact match: "Indépendants" would otherwise also hit "Indépendants et entrepreneurs".
        for (const audience of offer.audiences) {
          await expect(inCard.getByText(audience, { exact: true })).toBeVisible()
        }
        await expect(cardButton(page, index)).toHaveAttribute('aria-haspopup', 'dialog')
      }
      // The theme really reaches the cards: their border is the theme's subtle border token.
      const subtle = await tokenColor(page, '--softn-border-subtle')
      await expect(card(page, 0)).toHaveCSS('border-top-color', subtle)
    })
  }

  test('the section is one landmark, not two sections deep', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(`main > section#${SECTION_IDS.offers}`)).toHaveCount(1)
  })
})

test.describe('offers: responsive grid', () => {
  test('two cards share one row on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const boxes = await page.evaluate((id) => {
      const cards = Array.from(document.querySelectorAll(`#${id} article`))
      return cards.map((el) => {
        const box = el.getBoundingClientRect()
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      })
    }, SECTION_IDS.offers)
    expect(boxes).toHaveLength(2)
    const [first, second] = boxes
    // auto-fit drops the empty tracks: exactly two, side by side, same row.
    expect(second?.left).toBeGreaterThan(first?.right ?? 0)
    expect(Math.abs((second?.top ?? 0) - (first?.top ?? 0))).toBeLessThan(1)
  })

  test('one column on a narrow screen, without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    const boxes = await page.evaluate((id) => {
      const cards = Array.from(document.querySelectorAll(`#${id} article`))
      return cards.map((el) => {
        const box = el.getBoundingClientRect()
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      })
    }, SECTION_IDS.offers)
    expect(boxes).toHaveLength(2)
    const [first, second] = boxes
    // Stacked: the second card starts below the first, at the same inset.
    expect(second?.top).toBeGreaterThanOrEqual(first?.bottom ?? 0)
    expect(Math.abs((second?.left ?? 0) - (first?.left ?? 0))).toBeLessThan(1)

    const overflow = await page.evaluate((id) => {
      const root = document.getElementById(id)
      const clipping = (root === null ? [] : Array.from(root.querySelectorAll('*')))
        .filter((el) => el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).overflowX !== 'hidden')
        .map((el) => `${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 40)}`)
      return {
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
        clipping,
      }
    }, SECTION_IDS.offers)
    expect(overflow.docScroll, 'document scrollWidth').toBeLessThanOrEqual(overflow.docClient)
    expect(overflow.clipping, 'elements wider than their box').toEqual([])
  })
})

test.describe('offers: the whole card is a keyboard-operable button', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Tab reaches both cards and paints a visible focus ring in the accent tone', async ({ page }) => {
    await page.goto('/')
    for (const index of [0, 1] as const) {
      const button = cardButton(page, index)
      const tone = await tokenColor(page, TONE_TOKENS[OFFER_IDS[index]])
      await tabTo(page, button)
      // Chromium invalidates `:has()` a few frames after the focus change, so the border
      // assertion has to poll: `toHaveCSS` retries until the async re-match lands.
      await expect(card(page, index)).toHaveCSS('border-top-color', tone)
      const ring = await button.evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
        }
      })
      // The direct `.action:focus-visible` rule paints the ring synchronously.
      expect(ring.outlineStyle).toBe('solid')
      expect(Number.parseFloat(ring.outlineWidth)).toBeGreaterThanOrEqual(2)
      expect(ring.outlineColor).not.toBe('rgba(0, 0, 0, 0)')
    }
  })

  test('a mouse click on the card opens its sheet and loads nothing external', async ({ page }) => {
    const external: string[] = []
    page.on('request', (request) => {
      const { hostname } = new URL(request.url())
      if (hostname !== 'localhost' && !hostname.startsWith('127.')) external.push(request.url())
    })
    await page.goto('/')
    // The overlay sits between the pointer and every pixel of the card: Playwright refuses to
    // click the heading underneath it, because the hit target is not a heading descendant.
    // Clicking the overlay button directly is the honest version of that same interaction.
    await cardButton(page, 0).click()
    // The sheet itself is covered by `offerSheet.spec.ts`; this asserts the handoff only.
    await expect(page.getByRole('dialog', { name: offers.create.sheet.title })).toBeVisible()
    await expect(page.getByRole('dialog', { name: offers.create.sheet.title })).toHaveAttribute(
      'aria-modal',
      'true',
    )
    expect(external, 'no third-party request from the offers section').toEqual([])
  })
})

test.describe('offers: pointer tilt', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  /** The pointer position (fractions of the card box) and the matrix the stylesheet derives from it. */
  const readTilt = (page: Page, index: number): Promise<{ x: number; y: number; matrix: number[] | null }> =>
    card(page, index).evaluate((el) => {
      const style = getComputedStyle(el)
      const raw = style.transform
      // Chromium serializes the matrix with e-notation entries (`3.17e-05`), and the function
      // name itself (`matrix3d`) ends in a digit, so the numbers are the inside of the parens.
      const inner = raw.replace(/^matrix(?:3d)?\(/i, '').replace(/\)$/, '')
      const matrix = raw === 'none' ? null : (inner.match(/-?[\d.]+(?:e[+-]?\d+)?/gi) ?? []).map(Number)
      return {
        x: Number.parseFloat(style.getPropertyValue('--offer-pointer-x')),
        y: Number.parseFloat(style.getPropertyValue('--offer-pointer-y')),
        matrix,
      }
    })

  test('a hovering fine pointer tilts, lifts and highlights the card, and leaves reset it', async ({ page }) => {
    await page.goto('/')
    // The cards sit below the fold: the mouse can only hover what the viewport shows.
    await card(page, 0).scrollIntoViewIfNeeded()
    const flat = await readTilt(page, 0)
    expect(flat.matrix, 'no transform before any hover').toBeNull()

    const box = await card(page, 0).boundingBox()
    expect(box).not.toBeNull()
    if (box === null) return
    const tone = await tokenColor(page, '--softn-brand-vivid')
    // 25% across, 75% down: pointer fractions 0.25 / 0.75, so rotateY −2° and rotateX −1.5°.
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75)
    await expect(card(page, 0)).toHaveAttribute('data-tilted', 'true')

    // The 350 ms transform transition interpolates from flat: poll until the matrix has settled.
    // Chromium rounds the serialized matrix (`−4.99829` for the −5 px lift), so the value is
    // compared with a tolerance, not by equality.
    await expect
      .poll(async () => {
        const tilt = await readTilt(page, 0)
        return tilt.matrix !== null && tilt.matrix.length === 16 ? tilt.matrix[13] : Number.NaN
      })
      .toBeCloseTo(-5, 1)
    const tilted = await readTilt(page, 0)
    const matrix = tilted.matrix ?? []
    expect(tilted.x).toBeCloseTo(0.25, 2)
    expect(tilted.y).toBeCloseTo(0.75, 2)
    // perspective(1100px) lands in the matrix as −1/1100 on the fourth column.
    expect(Math.abs((matrix[11] ?? 0) + 1 / 1100)).toBeLessThan(0.00005)
    // The border follows the accent while tilted.
    await expect(card(page, 0)).toHaveCSS('border-top-color', tone)

    // Leaving the card resets the transform and the border.
    await page.mouse.move(8, 8)
    await expect(card(page, 0)).not.toHaveAttribute('data-tilted', /.*/)
    await expect(card(page, 0)).toHaveCSS('transform', 'none')
  })

  test('reduced motion keeps the card flat while hovered', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await card(page, 1).scrollIntoViewIfNeeded()
    const box = await card(page, 1).boundingBox()
    expect(box).not.toBeNull()
    if (box === null) return
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75)
    // The handler still runs (the border feedback stays), the tilt does not.
    await expect(card(page, 1)).toHaveAttribute('data-tilted', 'true')
    await expect(card(page, 1)).toHaveCSS('transform', 'none')
    const tone = await tokenColor(page, '--softn-warning')
    await expect(card(page, 1)).toHaveCSS('border-top-color', tone)
    const duration = await card(page, 1).evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(duration).toBe('0s')
  })

  /*
   * Playwright's `emulateMedia` covers color scheme and reduced motion but not hover/pointer
   * media features, and a raw `Emulation.setEmulatedMedia` with `hover`/`pointer` features is
   * ignored by this Chromium — verified before this test was written. A mobile context
   * (`isMobile` + `hasTouch`) is the supported way to get `(hover: none)` and `(pointer: coarse)`
   * on the real engine: the media gate in the stylesheet is then genuinely closed.
   */
  test('non-hover, coarse pointers never tilt the card', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['Pixel 5'] })
    const page = await context.newPage()
    await page.goto('/')
    await card(page, 0).scrollIntoViewIfNeeded()
    const media = await page.evaluate(() => ({
      hoverHover: matchMedia('(hover: hover)').matches,
      pointerFine: matchMedia('(pointer: fine)').matches,
    }))
    expect(media.hoverHover, 'the device reports no hover capability').toBe(false)
    expect(media.pointerFine, 'the device reports a coarse pointer').toBe(false)

    const box = await card(page, 0).boundingBox()
    expect(box).not.toBeNull()
    if (box !== null) {
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.25)
    }
    // The media gate in the stylesheet is what has to stay closed, with or without data-tilted.
    await expect(card(page, 0)).toHaveCSS('transform', 'none')
    const subtle = await tokenColor(page, '--softn-border-subtle')
    await expect(card(page, 0)).toHaveCSS('border-top-color', subtle)
    await context.close()
  })
})
