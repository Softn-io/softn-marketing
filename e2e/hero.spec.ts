/**
 * E2E coverage for the hero section (GitHub issue #10).
 *
 * Checks the acceptance criteria end to end: the single h1 with its three title lines, the two
 * calls to action and the scroll indicator navigating to their sections, the typed `booking`
 * intent fired by the primary CTA, keyboard reachability with visible focus rings, the
 * `prefers-reduced-motion` contract (no running animation, content visible), rendering without
 * JavaScript, and the absence of horizontal overflow at the three reference widths.
 *
 * Expected copy is imported from `locales/fr/`, never hardcoded (QA rule).
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { HERO_CTA_ID, SECTION_IDS } from '../lib/anchors'
import { ASSISTANT_INTENTS, ASSISTANT_INTENT_EVENT } from '../lib/assistant/intent'
import { interpolate } from '../lib/interpolate'
import { ASSISTANT_NAME } from '../locales/fr/chatbot'
import { hero } from '../locales/fr/hero'

const SECONDARY = hero.cta.secondary
const INDICATOR = interpolate(hero.agentPrompt, { assistantName: ASSISTANT_NAME })
const TITLE = `${hero.title.line1} ${hero.title.line2} ${hero.title.line3}`

const heroSection = (page: Page): Locator => page.locator('main section')
const primaryCta = (page: Page): Locator => page.locator(`#${HERO_CTA_ID}`)
const secondaryCta = (page: Page): Locator => page.getByRole('link', { name: SECONDARY })
const indicator = (page: Page): Locator => page.getByRole('link', { name: INDICATOR })

/** True when the focused element carries a visible focus ring (outline of at least 2 px, or a shadow). */
const focusRing = (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    }
  })

const expectRing = async (page: Page): Promise<void> => {
  const ring = await focusRing(page)
  const hasRing = (ring.outlineStyle !== 'none' && ring.outlineWidth >= 2) || ring.boxShadow !== 'none'
  expect(hasRing, `no focus ring on the active element ${JSON.stringify(ring)}`).toBe(true)
}

/**
 * Resolves once every *finite* CSS animation on the page has finished (a settled reveal). Infinite
 * ones — the decorative `hero-drift` loop — are filtered out, their `finished` promise never resolves.
 */
const awaitFiniteAnimations = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const running = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().iterations ?? 1))
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)))
  })
}

test.describe('hero: cursor-following glow', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('moving the pointer over the hero repositions the glow layer', async ({ page }) => {
    await page.goto('/')
    const glow = heroSection(page).locator('div[aria-hidden="true"]').first()
    const before = await glow.evaluate((el) => getComputedStyle(el).getPropertyValue('--hero-pointer-x').trim())
    // Move the real mouse inside the hero box (a hovering pointer, not touch).
    const box = await heroSection(page).boundingBox()
    if (box === null) throw new Error('hero section has no bounding box')
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.4)
    await expect
      .poll(() => glow.evaluate((el) => getComputedStyle(el).getPropertyValue('--hero-pointer-x').trim()), {
        message: 'glow position follows the pointer',
      })
      .not.toBe(before)
    const x = await glow.evaluate((el) => getComputedStyle(el).getPropertyValue('--hero-pointer-x').trim())
    expect(Number.parseFloat(x)).toBeGreaterThan(10)
    expect(Number.parseFloat(x)).toBeLessThan(50)
  })
})

test.describe('hero: privacy', () => {
  test('the page issues no third-party network request', async ({ page }) => {
    const external: string[] = []
    page.on('request', (request) => {
      const host = new URL(request.url()).hostname
      if (host !== 'localhost' && !host.startsWith('127.')) external.push(request.url())
    })
    await page.goto('/')
    await expect(heroSection(page)).toBeVisible()
    expect(external, 'third-party requests before consent').toEqual([])
  })
})

test.describe('hero: structure', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the page holds a single h1 gathering the three title lines', async ({ page }) => {
    await page.goto('/')
    const headings = page.getByRole('heading', { level: 1 })
    await expect(headings).toHaveCount(1)
    await expect(headings).toHaveText(TITLE)
  })

  test('eyebrow, subtitle and reassurance line render from the locale', async ({ page }) => {
    await page.goto('/')
    await expect(heroSection(page).getByText(hero.eyebrow)).toBeVisible()
    await expect(heroSection(page).getByText(hero.subtitle)).toBeVisible()
    await expect(heroSection(page).getByText(hero.reassurance)).toBeVisible()
  })
})

test.describe('hero: calls to action', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('primary CTA keeps id + anchor, fires the booking intent on click and navigates to #assistant', async ({
    page,
  }) => {
    // Window listener capturing the typed intent events (the chatbot consumer is not built yet).
    await page.addInitScript((eventName) => {
      const received: unknown[] = []
      Reflect.set(window, '__assistantIntents', received)
      window.addEventListener(eventName, (event) => {
        received.push((event as CustomEvent).detail)
      })
    }, ASSISTANT_INTENT_EVENT)
    await page.goto('/')
    const cta = primaryCta(page)
    await expect(cta).toHaveAttribute('href', `#${SECTION_IDS.agent}`)
    await cta.click()
    await expect(page).toHaveURL(new RegExp(`#${SECTION_IDS.agent}$`))
    // Fire-and-forget intent with the booking payload, emitted once per click.
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__assistantIntents') as unknown[]))
      .toEqual([{ intent: ASSISTANT_INTENTS.booking }])
  })

  test('secondary CTA navigates to #methode', async ({ page }) => {
    await page.goto('/')
    await expect(secondaryCta(page)).toHaveAttribute('href', `#${SECTION_IDS.method}`)
    await secondaryCta(page).click()
    await expect(page).toHaveURL(new RegExp(`#${SECTION_IDS.method}$`))
  })

  test('secondary CTA and scroll indicator dispatch no assistant intent, the primary one does', async ({ page }) => {
    // Only the primary call to action asks the assistant to start booking. Single document, no
    // reload: a second goto would re-run the init script and reset the capture array, which would
    // make the empty assertion pass even if an intent had been emitted. The primary CTA is clicked
    // last as a positive control, so the test also proves the listener is alive.
    await page.addInitScript((eventName) => {
      const received: unknown[] = []
      Reflect.set(window, '__assistantIntents', received)
      window.addEventListener(eventName, (event) => {
        received.push((event as CustomEvent).detail)
      })
    }, ASSISTANT_INTENT_EVENT)
    await page.goto('/')

    await secondaryCta(page).click()
    await expect(page).toHaveURL(new RegExp(`#${SECTION_IDS.method}$`))
    await indicator(page).click()
    await expect(page).toHaveURL(new RegExp(`#${SECTION_IDS.agent}$`))
    const afterNavigationLinks = await page.evaluate(() => Reflect.get(window, '__assistantIntents') as unknown[])
    expect(afterNavigationLinks, 'no assistant intent from the navigation-only hero links').toEqual([])

    await primaryCta(page).click()
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__assistantIntents') as unknown[]))
      .toEqual([{ intent: ASSISTANT_INTENTS.booking }])
  })

  test('primary CTA carries the large Button contract: body-md 16 px at weight 600, body face at line-height 1', async ({
    page,
  }) => {
    await page.goto('/')
    const cta = primaryCta(page)
    // Size scale of the design system's Button (lg): text step body-md (16 px), weight 600 on all sizes.
    await expect(cta).toHaveCSS('font-size', '16px')
    await expect(cta).toHaveCSS('font-weight', '600')
    // Typography of the design system's Button (loop-2 fix): the label is painted in the body face,
    // Plus Jakarta Sans — not the display face — and at line-height 1, so it adds no leading to the
    // token height of the size (16 px box on a 16 px step).
    await expect(cta).toHaveCSS('font-family', /plus.?jakarta/i)
    await expect(cta).not.toHaveCSS('font-family', /zalando/i)
    await expect(cta).toHaveCSS('line-height', '16px')
    // Control: the h1 really renders the display face, so the pin above is not the page collapsing both.
    const h1Family = await page.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).fontFamily)
    expect(h1Family.toLowerCase()).toContain('zalando')
  })

  test('scroll indicator is a link to #assistant named by the assistant prompt, badge decorative', async ({ page }) => {
    await page.goto('/')
    const link = indicator(page)
    await expect(link).toHaveAttribute('href', `#${SECTION_IDS.agent}`)
    // The accessible name starts with the visible label (WCAG 2.5.3): the link has no aria-label,
    // its name IS the visible interpolated prompt.
    await expect(link).not.toHaveAttribute('aria-label')
    const badge = link.locator('span[aria-hidden="true"]')
    await expect(badge).toHaveCount(1)
    await expect(badge.locator('svg')).toHaveCount(1)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`#${SECTION_IDS.agent}$`))
  })
})

test.describe('hero: keyboard', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Tab reaches the three hero links, each with a visible focus ring', async ({ page }) => {
    await page.goto('/')
    // The header CTA ships `data-state="hidden"` in the server render (ScrollRevealCta), so the hero
    // links are tab stops 9, 10 and 11 at the top of the page: the wait below pins that state, it is
    // not something the page has to settle into.
    await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'hidden')
    for (let i = 0; i < 9; i += 1) await page.keyboard.press('Tab')
    await expect(primaryCta(page)).toBeFocused()
    await expectRing(page)
    await page.keyboard.press('Tab')
    await expect(secondaryCta(page)).toBeFocused()
    await expectRing(page)
    await page.keyboard.press('Tab')
    await expect(indicator(page)).toBeFocused()
    await expectRing(page)
  })
})

test.describe('hero: sequenced reveal', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  /*
   * Acceptance criterion « animated title (sequenced reveal) ». The entrance is pure CSS: every revealed
   * block declares the same `hero-reveal` keyframes with a per-element delay that increases in reading
   * order, so the three title lines arrive one after the other. Since the PR #75 review the keyframes
   * animate `transform` and `opacity`: the fade rises from a non-zero floor (0.2) to 1, so the text is
   * painted — and legible — on the very first frame, which keeps the subtitle an LCP candidate (a fade
   * from 0 would drop it there) while the reveal still reads as a fade. No *base* rule ever lowers the
   * opacity: without JavaScript and under `prefers-reduced-motion` the hero renders at full opacity.
   * Timing is pinned to the token values the site uses today: duration `--softn-duration-sheet-drawer`
   * (350 ms) and delays that are whole multiples of `--softn-duration-micro` (120 ms). Changing any of
   * those is a deliberate design decision, so it should fail here first.
   */
  test('the hero blocks reveal in sequence, fading up from a non-zero floor opacity', async ({ page }) => {
    await page.goto('/')
    const data = await page.evaluate(() => {
      const section = document.querySelector('main section')
      if (section === null) throw new Error('hero section missing')
      const step = (el: Element) => {
        const c = getComputedStyle(el)
        return { name: c.animationName, duration: c.animationDuration, delay: c.animationDelay, opacity: c.opacity }
      }
      const steps = Array.from(section.querySelectorAll('[class*="reveal"]')).map(step)
      const title = Array.from(section.querySelectorAll('h1 span')).map(step)
      const frames: Array<{ at: string; properties: string[]; transform: string; opacity: string }> = []
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try {
          rules = sheet.cssRules
        } catch {
          continue
        }
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSKeyframesRule) || !/hero-reveal/.test(rule.name)) continue
          for (const raw of Array.from(rule.cssRules)) {
            if (!(raw instanceof CSSKeyframeRule)) continue
            frames.push({
              at: raw.keyText,
              properties: Array.from(raw.style),
              transform: raw.style.transform,
              opacity: raw.style.opacity,
            })
          }
        }
      }
      return { steps, title, frames }
    })

    // Keyframes (CSSOM): opacity and transform, nothing else. `from` fades up from a strictly
    // non-zero floor and rises one space step; `to` lands at full opacity and no transform.
    expect(data.frames.length, 'hero-reveal keyframe steps').toBeGreaterThanOrEqual(2)
    for (const frame of data.frames) {
      expect([...frame.properties].sort(), `keyframe ${frame.at} animates only opacity and transform`).toEqual([
        'opacity',
        'transform',
      ])
    }
    const from = data.frames.find((frame) => frame.at === '0%' || frame.at === 'from')
    const to = data.frames.find((frame) => frame.at === '100%' || frame.at === 'to')
    expect(from, 'the keyframes carry a from step').toBeTruthy()
    expect(to, 'the keyframes carry a to step').toBeTruthy()
    const floor = Number.parseFloat(from?.opacity ?? 'NaN')
    expect(Number.isNaN(floor), 'from keyframe opacity is a number').toBe(false)
    expect(floor, 'the fade never starts from full transparency (LCP)').toBeGreaterThan(0)
    expect(floor, 'from keyframe opacity is pinned to the 0.2 floor').toBeCloseTo(0.2, 5)
    expect(from?.transform, 'the from step still rises').toContain('translateY')
    expect(to?.opacity, 'to keyframe opacity').toBe('1')
    expect(to?.transform, 'the to step lands without a transform').toBe('none')

    // Every revealed block runs the same entrance animation at the token duration.
    expect(data.steps.length, 'elements carrying the reveal class').toBeGreaterThanOrEqual(8)
    for (const [index, s] of data.steps.entries()) {
      expect(s.name, `animation-name of reveal step ${index}`).toMatch(/hero-reveal/)
      expect(s.duration, `animation-duration of reveal step ${index} (sheet-drawer token)`).toBe('0.35s')
      // Sampled right after load, the fade is running (a step at its delay floor reads 0.2): the
      // computed opacity must stay between the floor and 1 — the text is never fully transparent.
      const sampled = Number.parseFloat(s.opacity)
      expect(sampled, `opacity of reveal step ${index} during the fade is ≥ the floor`).toBeGreaterThanOrEqual(floor)
      expect(sampled, `opacity of reveal step ${index} during the fade is ≤ 1`).toBeLessThanOrEqual(1)
    }

    // Sequenced: the delays strictly increase in reading order (eyebrow, the three title lines,
    // subtitle, actions, reassurance, indicator).
    const delays = data.steps.map((s) => Number.parseFloat(s.delay))
    for (const [index, value] of delays.entries()) {
      if (index === 0) continue
      const previous = delays[index - 1]
      expect(previous !== undefined && value > previous, `delay ${index}s must follow ${String(previous)}s`).toBe(true)
    }
    // The title itself arrives line by line: line 1 before line 2 before line 3.
    expect(data.title, 'the three title lines animate in sequence').toHaveLength(3)
    const titleDelays = data.title.map((s) => Number.parseFloat(s.delay))
    for (const [index, value] of titleDelays.entries()) {
      if (index === 0) continue
      const previous = titleDelays[index - 1]
      expect(previous !== undefined && value > previous, `title line ${index + 1} delay`).toBe(true)
    }

    // Once every finite entrance animation has finished, each block sits at full opacity: the floor
    // only exists inside the keyframes, no base rule holds the text back (no-JS, reduced motion).
    await awaitFiniteAnimations(page)
    const settled = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main section [class*="reveal"]')).map((el) => getComputedStyle(el).opacity),
    )
    expect(settled.length, 'elements carrying the reveal class').toBeGreaterThanOrEqual(8)
    for (const [index, value] of settled.entries()) {
      expect(value, `opacity of reveal step ${index} after the reveal`).toBe('1')
    }
  })
})

test.describe('hero: reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('no hero animation runs and all content stays visible', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    // No running animation anywhere in the hero subtree: reveal and drift are disabled.
    const running = await page.evaluate(() => {
      const section = document.querySelector('main section')
      if (section === null) throw new Error('hero section missing')
      return section.getAnimations({ subtree: true }).length
    })
    expect(running, 'running animations inside the hero').toBe(0)
    // Belt and braces: no descendant carries an animation other than none/zero duration.
    const offenders = await page.evaluate(() => {
      const section = document.querySelector('main section')
      if (section === null) throw new Error('hero section missing')
      const bad: string[] = []
      for (const el of [section, ...Array.from(section.querySelectorAll('*'))]) {
        const style = getComputedStyle(el)
        if (style.animationName !== 'none') bad.push(`${el.tagName}.${style.animationName}`)
      }
      return bad
    })
    expect(offenders, 'elements with a hero animation').toEqual([])
    // The pointer-follow glow writes nothing: the island attaches no listener under the preference,
    // so the glow keeps the static position the stylesheet gives it.
    const pointerVarUnset = await heroSection(page)
      .locator('div[aria-hidden="true"]')
      .first()
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--hero-pointer-x') === '')
    expect(pointerVarUnset, 'glow keeps its static stylesheet position').toBe(true)
    // The JS branch, not just the CSS one: on a hover-capable device the island is mounted under the
    // reduced-motion preference and must still refuse to track the pointer (its `matchMedia` guard
    // returns early). The unit-level assertion for that branch lives behind the blocked permission
    // glob (#74), so it is covered here instead.
    const box = await heroSection(page).boundingBox()
    if (box === null) throw new Error('hero section has no bounding box')
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.2)
    await expect
      .poll(
        () =>
          heroSection(page)
            .locator('div[aria-hidden="true"]')
            .first()
            .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--hero-pointer-x')),
        { message: 'no pointer position written while motion is reduced', timeout: 1000 },
      )
      .toBe('')
    // Content visible, at full opacity from the first paint: under the preference no animation runs,
    // so the reveal's 0.2 floor must not leak into any element — nothing waits behind a base rule.
    const opacities = await page.evaluate(() => {
      const section = document.querySelector('main section')
      if (section === null) throw new Error('hero section missing')
      return Array.from(section.querySelectorAll('[class*="reveal"]')).map((el) => getComputedStyle(el).opacity)
    })
    expect(opacities.length, 'elements carrying the reveal class').toBeGreaterThanOrEqual(8)
    for (const [index, value] of opacities.entries()) {
      expect(value, `computed opacity of reveal step ${index} under reduced motion`).toBe('1')
    }
    await expect(heroSection(page).getByText(hero.eyebrow)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(heroSection(page).getByText(hero.subtitle)).toBeVisible()
    await expect(primaryCta(page)).toBeVisible()
    await expect(secondaryCta(page)).toBeVisible()
    await expect(heroSection(page).getByText(hero.reassurance)).toBeVisible()
    await expect(indicator(page)).toBeVisible()
  })
})

test.describe('hero: without JavaScript', () => {
  test('content is readable and CTAs stay plain anchors', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await page.goto('/')
    // The entrance animations are pure CSS with no base `opacity: 0`: the markup is complete server-side.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE)
    await expect(page.getByText(hero.subtitle)).toBeVisible()
    const cta = page.locator(`#${HERO_CTA_ID}`)
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', `#${SECTION_IDS.agent}`)
    await expect(page.getByText(hero.reassurance)).toBeVisible()
    const secondary = page.getByRole('link', { name: SECONDARY })
    await expect(secondary).toHaveAttribute('href', `#${SECTION_IDS.method}`)
    await secondary.click()
    await expect(page).toHaveURL(new RegExp(`#${SECTION_IDS.method}$`))
    await context.close()
  })
})

test.describe('hero: viewports without horizontal overflow', () => {
  // The h1 step is responsive: display-md (36 px) below the md breakpoint, display-lg (48 px) from it
  // (loop-1 fix for the 375 px overflow D1; md = 768 px in Tailwind).
  const H1_STEP: Record<number, 36 | 48> = { 375: 36, 768: 48, 1280: 48 }
  for (const width of [375, 768, 1280]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      await expect(heroSection(page)).toBeVisible()
      const h1 = page.getByRole('heading', { level: 1 })
      await expect(h1).toBeVisible()
      await expect(h1).toHaveCSS('font-size', `${H1_STEP[width]}px`)
      const metrics = await page.evaluate(() => {
        const clamp = (el: Element): boolean => el.scrollWidth - el.clientWidth > 1
        return {
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
          overflowing: Array.from(document.querySelectorAll('main section *'))
            .filter((el) => clamp(el) && getComputedStyle(el).overflowX !== 'hidden')
            .map((el) => `${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 40)}`),
        }
      })
      expect(metrics.docScroll, 'document scrollWidth').toBeLessThanOrEqual(metrics.docClient)
      // Nothing inside the hero should need more width than it gets (clipped text would show up here).
      expect(metrics.overflowing, 'elements wider than their box').toEqual([])
    })
  }
})
