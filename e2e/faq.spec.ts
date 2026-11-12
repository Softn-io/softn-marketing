/**
 * E2E coverage for the FAQ section (`components/sections/FAQ`, issue #20) on `/preview`.
 *
 * The unit tests of the component already prove the rendered tree (jsdom) and the server markup;
 * this suite proves what only a real browser shows:
 *
 * - the section lands where the header navigation points it (`#faq`, reading band);
 * - the accordion runs in the page: first panel open on load, one open panel at a time, native
 *   buttons driven from the keyboard (Tab, Enter, Space) with a visible focus ring;
 * - every answer stays in the DOM behind `hidden="until-found"` while its panel is closed;
 * - WCAG 2.1 AA contrast of the question, the answer, the `+` mark and the hover state, in dark
 *   and light theme (the section paints over the flat page background, so axe also audits it —
 *   `e2e/accessibility.spec.ts` covers the whole page; the non-vacuity check here asserts axe
 *   really measured the section's text);
 * - `prefers-reduced-motion: reduce` disables the height, color and opacity transitions the
 *   component declares;
 * - the section carries its own `FAQPage` JSON-LD, matching the visible copy (the home page
 *   structured data, its absence of `FAQPage` included, belongs to `e2e/seo.spec.ts`);
 * - no request leaves localhost: the preview must not touch Umami or Fillout before consent.
 *
 * Copy comes from `locales/fr/faq.ts` / `locales/fr/hero.ts`, never hardcoded.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { faq } from '../locales/fr/faq'
import { nav } from '../locales/fr/hero'

/** localStorage key the inline theme script reads; same contract as `lib/theme`. */
const THEME_STORAGE_KEY = 'softn-theme'

/** Same WCAG 2.1 A/AA tag set as the coming-soon suite's axe audits. */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

const SCHEMES = ['dark', 'light'] as const
type Scheme = (typeof SCHEMES)[number]

const DESKTOP = { width: 1280, height: 800 }

/** Bound of the Tab walk: every tabbable stop before the first FAQ trigger, plus margin. */
const MAX_TAB_STOPS = 60

const section = (page: Page) => page.locator(`#${SECTION_IDS.faq}`)
/** Triggers in question order; the accordion owns every button inside the section. */
const triggers = (page: Page) => section(page).getByRole('button')
/** Panels in question order, closed ones included (`hidden="until-found"` keeps them mounted). */
const panels = (page: Page) => section(page).locator('[role="region"]')

/** Expanded state of every trigger, in question order. */
const expandedStates = async (page: Page): Promise<boolean[]> => {
  const states = await triggers(page).evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-expanded') === 'true'),
  )
  return states
}

/** Whether every panel is collapsed, in question order (`hidden="until-found"` or not set). */
const hiddenStates = async (page: Page): Promise<(string | null)[]> =>
  panels(page).evaluateAll((regions) => regions.map((panel) => panel.getAttribute('hidden')))

/** Forces one theme the way the site's theme script consumes it, before navigation. */
const forceTheme = async (page: Page, scheme: Scheme): Promise<void> => {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value ?? ''), [
    THEME_STORAGE_KEY,
    scheme,
  ] as const)
}

/** Loads the one-page preview and waits until the theme has actually been applied. */
const gotoPreviewWithTheme = async (page: Page, scheme: Scheme): Promise<void> => {
  await forceTheme(page, scheme)
  await page.goto('/preview')
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
}

/** Text metrics feed the contrast maths; analysis runs only once font loading has settled. */
const awaitFonts = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

/**
 * The FAQ section, scrolled so its top edge sits at the reading band (`scroll-padding-top`), as the
 * browser leaves it after applying the `#faq` fragment the header link writes.
 */
const sectionOffset = (page: Page): Promise<number> =>
  page.evaluate((sectionId) => {
    const element = document.getElementById(sectionId)
    if (element === null) throw new Error(`section ${sectionId} missing`)
    const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
    return element.getBoundingClientRect().top - padding
  }, SECTION_IDS.faq)

/**
 * Tab-walks from the top of the page to the FAQ trigger at `position`, and fails if the bound is
 * reached first (the trigger would not be reachable by keyboard). Returns once that trigger holds
 * focus.
 */
const tabToTrigger = async (page: Page, position: number): Promise<void> => {
  for (let stops = 0; stops < MAX_TAB_STOPS; stops += 1) {
    const onTarget = await page.evaluate(
      ({ position }) => document.activeElement === document.querySelectorAll('#faq button')[position],
      { position },
    )
    if (onTarget) return
    await page.keyboard.press('Tab')
  }
  throw new Error(
    `the FAQ trigger at position ${String(position)} was not reached within ${String(MAX_TAB_STOPS)} Tab stops`,
  )
}

/**
 * WCAG relative luminance of an sRGB channel triple, and the 1.4.3 contrast ratio of two triples —
 * both as in `e2e/hero.spec.ts`, where the painted-pixel recipe is documented.
 */
const contrastOf = (text: readonly number[], background: readonly number[]): number => {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = (rgb: readonly number[]): number =>
    0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0)
  const hi = Math.max(luminance(text), luminance(background))
  const lo = Math.min(luminance(text), luminance(background))
  return (hi + 0.05) / (lo + 0.05)
}

/** The first opaque background colour painted behind the element, walking up the ancestor chain. */
const paintedBackground = (page: Page, locatorAnswer: string): Promise<[number, number, number]> =>
  page.evaluate((selector) => {
    const element = document.querySelector(selector)
    if (element === null) throw new Error(`${selector} missing`)
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx === null) throw new Error('no 2d context')
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const background = getComputedStyle(node).backgroundColor
      if (background === 'rgba(0, 0, 0, 0)' || background === 'transparent') continue
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = background
      ctx.fillRect(0, 0, 1, 1)
      const [r = 0, g = 0, b = 0, a = 255] = Array.from(ctx.getImageData(0, 0, 1, 1).data)
      if (a === 255) return [r, g, b] as [number, number, number]
    }
    throw new Error('no opaque background behind the section')
  }, locatorAnswer)

test.describe('faq: structure and behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await gotoPreviewWithTheme(page, 'dark')
    await expect(section(page)).toBeVisible()
  })

  test('renders #faq with its h2 and every question of the locale in an h3-wrapped button', async ({ page }) => {
    await expect(section(page)).toHaveAttribute('id', SECTION_IDS.faq)
    await expect(section(page).getByRole('heading', { level: 2, name: faq.title })).toHaveCount(1)

    const headings = section(page).getByRole('heading', { level: 3 })
    await expect(headings, 'one h3 per question of the locale').toHaveCount(faq.items.length)
    for (const [position, item] of faq.items.entries()) {
      const heading = headings.nth(position)
      await expect(heading).toHaveText(item.question)
      await expect(heading.getByRole('button', { name: item.question })).toHaveCount(1)
    }
  })

  test('opens the first question on load and keeps the others closed', async ({ page }) => {
    await expect
      .poll(expandedStates.bind(null, page), 'aria-expanded over every trigger, first open')
      .toEqual(faq.items.map((_, position) => position === 0))
    await expect
      .poll(hiddenStates.bind(null, page), 'closed panels hidden, first visible')
      .toEqual(faq.items.map((_, position) => (position === 0 ? null : 'until-found')))
    await expect(
      panels(page)
        .first()
        .getByText(faq.items[0]?.answer ?? ''),
    ).toBeVisible()
  })

  test('keeps every answer in the DOM behind hidden="until-found" while closed', async ({ page }) => {
    for (const item of faq.items) {
      await expect(section(page).getByText(item.answer), `answer of "${item.question}" is in the DOM`).toBeAttached()
    }
    // The first panel starts open; the other seven answers sit behind `until-found`.
    const closed = (await hiddenStates(page)).filter((state) => state !== null)
    expect(closed).toHaveLength(faq.items.length - 1)
    for (const state of closed) expect(state, 'the hidden form is the searchable one').toBe('until-found')
  })

  test('moving to a closed question opens it and closes the previously open one', async ({ page }) => {
    await triggers(page).nth(2).click()
    await expect
      .poll(expandedStates.bind(null, page), 'only question 3 is open now')
      .toEqual(faq.items.map((_, position) => position === 2))
    await expect
      .poll(hiddenStates.bind(null, page), 'the first panel closed with it')
      .toEqual(faq.items.map((_, position) => (position === 2 ? null : 'until-found')))
    await expect(
      panels(page)
        .nth(2)
        .getByText(faq.items[2]?.answer ?? ''),
    ).toBeVisible()
  })

  test('runs the accordion from the keyboard: Tab reaches the triggers, Enter and Space toggle', async ({ page }) => {
    // Tab to the first trigger, close its panel with Enter (single-open accordion, toggle allowed).
    await tabToTrigger(page, 0)
    await page.keyboard.press('Enter')
    await expect.poll(expandedStates.bind(null, page)).toEqual(faq.items.map(() => false))

    // Enter on the next trigger opens it; Space on the one after moves the open panel.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect
      .poll(expandedStates.bind(null, page), 'Enter opened question 2')
      .toEqual(faq.items.map((_, position) => position === 1))
    await page.keyboard.press('Tab')
    await page.keyboard.press(' ')
    await expect
      .poll(expandedStates.bind(null, page), 'Space moved the open panel to question 3')
      .toEqual(faq.items.map((_, position) => position === 2))
  })

  test('shows a visible focus ring on a keyboard-focused trigger', async ({ page }) => {
    await tabToTrigger(page, 0)
    const ring = await triggers(page)
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          style: style.outlineStyle,
          width: style.outlineWidth,
          offset: style.outlineOffset,
          color: style.outlineColor,
        }
      })
    expect(ring.style, 'the focus ring is drawn (WCAG 2.4.7)').toBe('solid')
    expect(ring.width, 'the focus ring is 2px, the component stylesheet value').toBe('2px')
    expect(ring.color, 'the focus ring colour is not transparent').not.toBe('rgba(0, 0, 0, 0)')
    expect(ring.offset, 'the ring sits outside the row, not under it').toBe('2px')
  })

  test('the header navigation link lands on the section', async ({ page }) => {
    const FAQ_NAME = new RegExp(`^${nav.items.faq}`)
    await page.getByRole('banner').getByRole('link', { name: FAQ_NAME }).click()
    await expect(page).toHaveURL(/#faq$/)
    await expect.poll(sectionOffset.bind(null, page), '#faq sits at the reading band').toBeLessThanOrEqual(2)
  })
})

test.describe('faq: themes, contrast and hover (WCAG 1.4.3 / 1.4.11)', () => {
  for (const scheme of SCHEMES) {
    test(`question, answer, + mark and hover color keep AA contrast (${scheme})`, async ({ page }) => {
      await page.setViewportSize(DESKTOP)
      await gotoPreviewWithTheme(page, scheme)
      await awaitFonts(page)

      // First panel open by default: the answer is readable and measurable.
      const question = triggers(page).first()
      const answer = panels(page).first().locator('p')
      await expect(question).toBeVisible()
      await expect(answer).toBeVisible()

      const measure = (
        locatorAnswer: string,
      ): Promise<{ color: [number, number, number]; fontSize: number; fontWeight: number }> =>
        page.evaluate((selector) => {
          const element = document.querySelector(selector)
          if (element === null) throw new Error(`${selector} missing`)
          const style = getComputedStyle(element)
          const canvas = document.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx === null) throw new Error('no 2d context')
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = style.color
          ctx.fillRect(0, 0, 1, 1)
          const [r = 0, g = 0, b = 0] = Array.from(ctx.getImageData(0, 0, 1, 1).data)
          return {
            color: [r, g, b] as [number, number, number],
            fontSize: Number.parseFloat(style.fontSize),
            fontWeight: Number.parseFloat(style.fontWeight),
          }
        }, locatorAnswer)

      const background = await paintedBackground(page, `#${SECTION_IDS.faq}`)
      const questionRead = await measure(`#${SECTION_IDS.faq} button span`)
      const answerRead = await measure(`#${SECTION_IDS.faq} [role="region"] p`)
      const indicatorRead = await measure(`#${SECTION_IDS.faq} button svg`)

      // Large text (>= 18.66px at weight >= 700): 3:1; body text and the non-text mark: their rules.
      const questionLarge =
        questionRead.fontSize >= 24 || (questionRead.fontSize >= 18.66 && questionRead.fontWeight >= 700)
      const questionRatio = contrastOf(questionRead.color, background)
      const answerRatio = contrastOf(answerRead.color, background)
      // The `+` is a non-text control mark: WCAG 1.4.11 asks 3:1.
      const indicatorRatio = contrastOf(indicatorRead.color, background)
      const ratios = [
        `question ${String(questionRead.fontSize)}px/${String(questionRead.fontWeight)} → ${questionRatio.toFixed(2)}:1 (min ${questionLarge ? '3' : '4.5'})`,
        `answer → ${answerRatio.toFixed(2)}:1 (min 4.5)`,
        `+ mark → ${indicatorRatio.toFixed(2)}:1 (min 3)`,
      ]
      test.info().annotations.push({ type: 'measure', description: `faq contrast (${scheme}): ${ratios.join(' | ')}` })
      expect(questionRatio, `question text (${scheme})`).toBeGreaterThanOrEqual(questionLarge ? 3 : 4.5)
      expect(answerRatio, `answer text (${scheme})`).toBeGreaterThanOrEqual(4.5)
      expect(indicatorRatio, `+ mark (${scheme})`).toBeGreaterThanOrEqual(3)

      // The hover colour is the `brand-foreground` token, resolved live rather than hardcoded.
      const hoverProbe = page.evaluate(() => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--softn-brand-foreground)'
        document.body.append(probe)
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx === null) throw new Error('no 2d context')
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = getComputedStyle(probe).color
        ctx.fillRect(0, 0, 1, 1)
        const [r = 0, g = 0, b = 0] = Array.from(ctx.getImageData(0, 0, 1, 1).data)
        probe.remove()
        return [r, g, b] as [number, number, number]
      })

      await question.hover()
      await expect
        .poll(async () => {
          const color = await measure(`#${SECTION_IDS.faq} button`)
          const expected = await hoverProbe
          return color.color.every((channel, index) => channel === expected[index])
        }, 'hover settles on brand-foreground (120ms transition)')
        .toBe(true)
      const hoverRatio = contrastOf(await hoverProbe, background)
      expect(hoverRatio, `hovered question (${scheme}) stays AA against the page background`).toBeGreaterThanOrEqual(3)
    })

    test(`axe reports no WCAG 2.1 A/AA violation inside #faq (${scheme})`, async ({ page }) => {
      await page.setViewportSize(DESKTOP)
      await gotoPreviewWithTheme(page, scheme)
      await awaitFonts(page)
      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_AA_TAGS])
        .include(`#${SECTION_IDS.faq}`)
        .analyze()
      expect(
        results.violations,
        `#faq (${scheme}): ${String(results.violations.length)} violation(s)\n${results.violations
          .map((violation) => `- ${violation.id} [${violation.impact ?? 'unknown'}] ${violation.help}`)
          .join('\n')}`,
      ).toHaveLength(0)
      // Non-vacuity: axe really measured the section's text, it did not skip it.
      const contrast = results.passes.find((rule) => rule.id === 'color-contrast')
      expect(contrast, 'axe reported no color-contrast passes at all').toBeTruthy()
      const passNodes = contrast?.nodes.map((node) => node.html ?? '') ?? []
      expect(
        passNodes.some((html) => html.includes(faq.items[0]?.question ?? '')),
        'axe did not measure the FAQ question text',
      ).toBe(true)
    })
  }
})

test.describe('faq: motion', () => {
  const TRANSITION_TARGETS = [
    { label: 'trigger (color)', selector: 'button' },
    { label: 'indicator (transform)', selector: 'button svg' },
    { label: 'panel (height)', selector: '[role="region"]' },
    { label: 'answer (opacity)', selector: '[role="region"] p' },
  ] as const

  /** Transition declarations of the four animated elements, in declaration order. */
  const readTransitions = (page: Page): Promise<{ label: string; property: string; duration: string }[]> =>
    page.evaluate(
      (targets) =>
        targets.map((target) => {
          const element = document.querySelector(`#faq ${target.selector}`)
          if (element === null) throw new Error(`#faq ${target.selector} missing`)
          const style = getComputedStyle(element)
          return { label: target.label, property: style.transitionProperty, duration: style.transitionDuration }
        }),
      TRANSITION_TARGETS,
    )

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await gotoPreviewWithTheme(page, 'dark')
    await expect(section(page)).toBeVisible()
  })

  test('declares the transitions the design runs, so reducing motion can disable something real', async ({ page }) => {
    const transitions = await readTransitions(page)
    const byLabel = (label: string): { property: string; duration: string } => {
      const found = transitions.find((transition) => transition.label === label)
      if (found === undefined) throw new Error(`no transition read for ${label}`)
      return found
    }
    const trigger = byLabel('trigger (color)')
    expect(trigger.property).toContain('color')
    expect(trigger.duration, '--softn-duration-micro').toBe('0.12s')
    for (const label of ['indicator (transform)', 'panel (height)', 'answer (opacity)']) {
      expect(byLabel(label).duration, `${label} runs on --softn-duration-screen-transition`).toBe('0.28s')
    }
  })

  test('prefers-reduced-motion: reduce disables every accordion transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/preview')
    await expect(section(page)).toBeVisible()
    for (const transition of await readTransitions(page)) {
      expect(
        [transition.property, transition.duration],
        `${transition.label} must not animate under prefers-reduced-motion`,
      ).toEqual(['none', '0s'])
    }
  })
})

test.describe('faq: structured data (FAQPage)', () => {
  test('serves one FAQPage block from the section, identical to the visible questions and answers', async ({
    page,
  }) => {
    await page.goto('/preview')
    await expect(section(page)).toBeVisible()

    // The block is rendered by the section itself, so it exists wherever the FAQ does.
    const blocks = section(page).locator('script[type="application/ld+json"]')
    await expect(blocks, 'one FAQPage block, inside #faq').toHaveCount(1)

    const data = JSON.parse((await blocks.first().textContent()) ?? '')
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(faq.items.length)
    expect(data.mainEntity).toEqual(
      faq.items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    )
    // Every question of the block is a heading the visitor can read, not copy written for crawlers.
    for (const item of faq.items) {
      await expect(section(page).getByRole('heading', { level: 3, name: item.question })).toHaveCount(1)
    }
  })

  test('serves exactly one FAQPage block per page, beside the layout ProfessionalService block', async ({ page }) => {
    await page.goto('/preview')
    await expect(section(page)).toBeVisible()

    // Page-level view: the section's block is the only FAQPage of the document, the layout's
    // ProfessionalService block is still there, and every block parses as JSON.
    const payloads = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(payloads.filter((payload) => payload.includes('"FAQPage"'))).toHaveLength(1)
    expect(payloads.some((payload) => payload.includes('"ProfessionalService"'))).toBe(true)
    for (const payload of payloads) expect(JSON.parse(payload)).toBeInstanceOf(Object)
  })
})

test.describe('faq: consent', () => {
  test('makes no request off localhost while loading and using the section', async ({ page }) => {
    const external: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      const local =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.protocol === 'data:' ||
        url.protocol === 'blob:' ||
        url.protocol === 'about:'
      if (!local) external.push(request.url())
    })
    await page.setViewportSize(DESKTOP)
    await gotoPreviewWithTheme(page, 'dark')
    await triggers(page).nth(2).click()
    await triggers(page).nth(0).click()
    expect(external, `requests that left localhost: ${external.join(', ')}`).toHaveLength(0)
  })
})
