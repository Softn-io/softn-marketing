/**
 * E2E coverage for the hero section (GitHub issue #10).
 *
 * Checks the acceptance criteria end to end: the single h1 with its three title lines, the two
 * calls to action and the scroll indicator navigating to their sections, the typed `booking`
 * intent fired by the primary CTA, keyboard reachability with visible focus rings, the
 * `prefers-reduced-motion` contract (no running animation, content visible), rendering without
 * JavaScript, and the absence of horizontal overflow at the reference widths.
 *
 * On top of the acceptance criteria it pins the design-token surface this branch adopts
 * (`@softnio-labs/tokens` 0.3.0/0.3.1): the reveal floor and duration, the drift duration, the
 * h1 step and measure, the subtitle step and measure per breakpoint, the section container and its
 * vertical rhythm, and the aura colour of the pointer glow. Those values are deliberate design
 * decisions, so a change of token or of step has to fail here first.
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

/** The hero: the one `main` section that holds the page's single h1. Later sections never match. */
const heroSection = (page: Page): Locator =>
  page.locator('main section').filter({ has: page.getByRole('heading', { level: 1 }) })
const primaryCta = (page: Page): Locator => page.locator(`#${HERO_CTA_ID}`)
const secondaryCta = (page: Page): Locator => page.getByRole('link', { name: SECONDARY })
const indicator = (page: Page): Locator => page.getByRole('link', { name: INDICATOR })
/** The hero's content box (`mx-auto max-w-6xl`): the glow layer is the only other direct child. */
const heroContent = (page: Page): Locator => heroSection(page).locator('> div:not([aria-hidden])')

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

/** The WCAG relative luminance of an 8-bit sRGB triplet. */
const luminance = ([r, g, b]: [number, number, number]): number => {
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
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
   * animate `transform` and `opacity`: the fade rises from a non-zero floor (`--softn-opacity-20`,
   * i.e. 0,2) to 1, so the text is painted — and legible — on the very first frame, which keeps the
   * subtitle an LCP candidate (a fade from 0 would drop it there) while the reveal still reads as a
   * fade. No *base* rule ever lowers the opacity: without JavaScript and under `prefers-reduced-motion`
   * the hero renders at full opacity.
   * Timing is pinned to the token values the site uses today (tokens 0.3.0): duration
   * `--softn-duration-reveal` (700 ms), the drift on `--softn-duration-drift` (4,5 s), and delays that
   * are whole multiples of `--softn-duration-micro` (120 ms). Changing any of those is a deliberate
   * design decision, so it has to fail here first.
   */
  test('the hero blocks reveal in sequence, fading up from a non-zero floor opacity', async ({ page }) => {
    await page.goto('/')
    const data = await page.evaluate(() => {
      const section = document.querySelector('main h1')?.closest('section') ?? null
      if (section === null) throw new Error('hero section missing')
      const step = (el: Element) => {
        const c = getComputedStyle(el)
        return { name: c.animationName, duration: c.animationDuration, delay: c.animationDelay, opacity: c.opacity }
      }
      const steps = Array.from(section.querySelectorAll('[class*="reveal"]')).map(step)
      const title = Array.from(section.querySelectorAll('h1 span')).map(step)
      // Source text of the keyframes, off the CSSOM: since tokens 0.3.0 the `from` step is written
      // with `var()` calls, so these readings are the *declarations*, not the numbers.
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
      // Resolved keyframes, off a running animation: this is where the engine has substituted the
      // tokens, so the floor reads as the number 0.2 and the rise as a used pixel offset.
      const resolved = section
        .getAnimations({ subtree: true })
        .map((animation) => {
          const name = (animation as CSSAnimation).animationName ?? ''
          const effect = animation.effect as KeyframeEffect | null
          const keyframes = effect?.getKeyframes() ?? []
          return {
            name,
            first: keyframes[0],
            last: keyframes[keyframes.length - 1],
          }
        })
        .filter((entry) => /hero-reveal/.test(entry.name))
      return { steps, title, frames, resolved }
    })

    // Keyframes (CSSOM): opacity and transform, nothing else, both declared through the tokens.
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
    expect(from?.opacity, 'the source fade reads the opacity token').toContain('--softn-opacity-20')
    expect(from?.transform, 'the source rise reads the space token').toContain('--softn-space-4')
    expect(to?.opacity, 'to keyframe opacity').toBe('1')
    expect(to?.transform, 'the to step lands without a transform').toBe('none')

    // Resolved keyframes: the floor is a real number, strictly non-zero (LCP), pinned to 0,2.
    expect(data.resolved.length, 'running hero-reveal animations').toBeGreaterThan(0)
    const resolvedFrom = data.resolved[0]
    expect(resolvedFrom, 'a reveal animation was sampled').toBeTruthy()
    const floor = Number.parseFloat(String(resolvedFrom?.first?.['opacity'] ?? 'NaN'))
    expect(Number.isNaN(floor), 'resolved from-keyframe opacity is a number').toBe(false)
    expect(floor, 'the fade never starts from full transparency (LCP)').toBeGreaterThan(0)
    expect(floor, 'the fade starts at the --softn-opacity-20 floor').toBeCloseTo(0.2, 5)
    expect(
      Number.parseFloat(String(resolvedFrom?.last?.['opacity'] ?? 'NaN')),
      'resolved to-keyframe opacity',
    ).toBeCloseTo(1, 5)
    const rise = String(resolvedFrom?.first?.['transform'] ?? '')
    expect(rise, `resolved from-keyframe transform rises (${rise})`).toMatch(/matrix|translate/)
    // One --softn-space-4 step: 16 px, whichever serialization form the engine chose.
    const risePx = Number.parseFloat(rise.match(/-?[\d.]+px/)?.[0] ?? 'NaN')
    expect(risePx, `resolved from-keyframe rise is --softn-space-4 (16 px): ${rise}`).toBeCloseTo(16, 1)

    // Every revealed block runs the same entrance animation at the reveal-token duration.
    expect(data.steps.length, 'elements carrying the reveal class').toBeGreaterThanOrEqual(8)
    for (const [index, s] of data.steps.entries()) {
      expect(s.name, `animation-name of reveal step ${index}`).toMatch(/hero-reveal/)
      expect(s.duration, `animation-duration of reveal step ${index} (--softn-duration-reveal)`).toBe('0.7s')
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

    // The decorative drift badge: the drift-token duration, an infinite loop, so the settle below
    // (finite animations only) is not disturbed by it.
    const badge = await heroSection(page)
      .locator('a span[aria-hidden="true"]')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          name: style.animationName,
          duration: style.animationDuration,
          iteration: style.animationIterationCount,
        }
      })
    expect(badge.name, 'the scroll badge carries the drift animation').toMatch(/hero-drift/)
    expect(badge.duration, 'drift duration is --softn-duration-drift').toBe('4.5s')
    expect(badge.iteration, 'drift loops forever').toBe('infinite')

    // Once every finite entrance animation has finished, each block sits at full opacity: the floor
    // only exists inside the keyframes, no base rule holds the text back (no-JS, reduced motion).
    await awaitFiniteAnimations(page)
    const settled = await page.evaluate(() => {
      const hero = document.querySelector('main h1')?.closest('section') ?? null
      if (hero === null || hero === undefined) throw new Error('hero section missing')
      return Array.from(hero.querySelectorAll('[class*="reveal"]')).map((el) => getComputedStyle(el).opacity)
    })
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
      const section = document.querySelector('main h1')?.closest('section') ?? null
      if (section === null) throw new Error('hero section missing')
      return section.getAnimations({ subtree: true }).length
    })
    expect(running, 'running animations inside the hero').toBe(0)
    // Belt and braces: no descendant carries an animation other than none/zero duration.
    const offenders = await page.evaluate(() => {
      const section = document.querySelector('main h1')?.closest('section') ?? null
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
      const section = document.querySelector('main h1')?.closest('section') ?? null
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
  /*
   * The h1 step (tokens 0.3.0 + Mel's adjustment): `text-display-md` (36 px) below `sm` (640 px), then
   * the fluid `sm:text-display-xl` = `clamp(2.375rem, 7.6vw, 5.375rem)` = 38 px … 86 px. 768 px and
   * 1024 px sit in the fluid band (7.6 vw), 1280 px has reached the ceiling.
   * The validated title is short enough that no line needs `break-words` at any width, so the h1 keeps
   * `overflow-wrap: normal` and still never overflows its box — pinned here as well.
   */
  const H1_STEP: Record<number, number> = { 320: 36, 375: 36, 390: 36, 768: 58.368, 1024: 77.824, 1280: 86 }
  for (const width of [320, 375, 390, 768, 1024, 1280]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      await expect(heroSection(page)).toBeVisible()
      const h1 = page.getByRole('heading', { level: 1 })
      await expect(h1).toBeVisible()
      await expect(h1).toHaveCSS('font-size', `${String(H1_STEP[width])}px`)
      const metrics = await page.evaluate(() => {
        const isClipping = (el: Element): boolean => el.scrollWidth - el.clientWidth > 1
        const hero = document.querySelector('main h1')?.closest('section') ?? null
        if (hero === null || hero === undefined) throw new Error('hero section missing')
        const h1el = document.querySelector('main h1') as HTMLElement
        return {
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
          overflowing: Array.from(hero.querySelectorAll('*'))
            .filter((el) => isClipping(el) && getComputedStyle(el).overflowX !== 'hidden')
            .map((el) => `${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 40)}`),
          // No word break: `break-words` was removed with the shorter title, and no word may be
          // clipped by its box at any of these widths.
          h1OverflowWrap: getComputedStyle(h1el).overflowWrap,
          h1Scroll: h1el.scrollWidth,
          h1Client: h1el.clientWidth,
        }
      })
      expect(metrics.docScroll, 'document scrollWidth').toBeLessThanOrEqual(metrics.docClient)
      // Nothing inside the hero should need more width than it gets (clipped text would show up here).
      expect(metrics.overflowing, 'elements wider than their box').toEqual([])
      expect(metrics.h1OverflowWrap, 'the h1 no longer needs break-words').toBe('normal')
      expect(metrics.h1Scroll, 'the h1 itself never overflows its box').toBeLessThanOrEqual(metrics.h1Client + 1)
    })
  }
})

test.describe('hero: typography scale and rhythm (tokens 0.3.0 / 0.3.1)', () => {
  /*
   * The validated title copy: three lines, read from `locales/fr/hero.ts` (never hardcoded here). The
   * copy changed in the "Ajustements Mel après 0.3.0" pass; the three-block structure did not.
   */
  test('the h1 holds exactly the three validated title lines', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const lines = page.getByRole('heading', { level: 1 }).locator('> span')
    await expect(lines).toHaveCount(3)
    await expect(lines.nth(0)).toHaveText(hero.title.line1)
    await expect(lines.nth(1)).toHaveText(hero.title.line2)
    await expect(lines.nth(2)).toHaveText(hero.title.line3)
  })

  /*
   * The h1 measure of the mockup (`max-width: 15ch`), applied by the 0.3.0 pass. The `ch` unit is
   * measured in the page (it is the advance of the "0" glyph of the loaded display face at the
   * rendered size), so the assertion holds the *ratio* — 15 of them — rather than a snapshot of a
   * pixel width that moves with the font.
   */
  test('the h1 keeps the design measure of 15ch', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const measure = await page.getByRole('heading', { level: 1 }).evaluate((el) => {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;width:100ch'
      el.appendChild(probe)
      const oneCh = probe.getBoundingClientRect().width / 100
      probe.remove()
      return {
        oneCh,
        cap: Number.parseFloat(getComputedStyle(el).maxInlineSize),
        fontSize: getComputedStyle(el).fontSize,
      }
    })
    expect(measure.oneCh, 'the probe measures a non-zero ch unit').toBeGreaterThan(1)
    expect(measure.cap, `15ch at ${measure.fontSize} (1ch = ${String(measure.oneCh)} px)`).toBeCloseTo(
      measure.oneCh * 15,
      1,
    )
  })

  /*
   * The subtitle step (Mel's decision after 0.3.0, published as `body-lg` in 0.3.1): `text-body-md`
   * (16 px, 400, line-height 1,5) below `md` (768 px), `text-body-lg` (18 px, **400**, 1,5) from `md`.
   * The measure widens with the viewport: 40ch below `md`, 50ch from `md` (48 rem), 60ch from `lg`
   * (64 rem) — again read as a `ch` ratio, since 1ch itself moves with the size and the weight.
   * The 767/1023 cases pin the two breakpoints themselves, so a moved step fails, not just a value.
   */
  const SUBTITLE: Record<number, { size: string; weight: string; lineHeight: string; ch: number }> = {
    375: { size: '16px', weight: '400', lineHeight: '24px', ch: 40 },
    767: { size: '16px', weight: '400', lineHeight: '24px', ch: 40 },
    768: { size: '18px', weight: '400', lineHeight: '27px', ch: 50 },
    1023: { size: '18px', weight: '400', lineHeight: '27px', ch: 50 },
    1024: { size: '18px', weight: '400', lineHeight: '27px', ch: 60 },
    1280: { size: '18px', weight: '400', lineHeight: '27px', ch: 60 },
  }
  for (const [width, expected] of Object.entries(SUBTITLE)) {
    test(`the subtitle is body-md below md and body-lg from md at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width: Number(width), height: 800 })
      await page.goto('/')
      const subtitle = heroSection(page).getByText(hero.subtitle)
      await expect(subtitle).toBeVisible()
      await expect(subtitle).toHaveCSS('font-size', expected.size)
      // The 0.3.1 decision: weight 400. A `title-sm` step (600) would read as a heading, not as prose.
      await expect(subtitle).toHaveCSS('font-weight', expected.weight)
      await expect(subtitle).toHaveCSS('line-height', expected.lineHeight)
      const measure = await subtitle.evaluate((el) => {
        const probe = document.createElement('span')
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;width:100ch'
        el.appendChild(probe)
        const oneCh = probe.getBoundingClientRect().width / 100
        probe.remove()
        return { oneCh, cap: Number.parseFloat(getComputedStyle(el).maxInlineSize) }
      })
      expect(
        measure.cap,
        `max-inline-size ${String(measure.cap)} px vs ${String(expected.ch)}ch (${String(measure.oneCh)} px each)`,
      ).toBeCloseTo(measure.oneCh * expected.ch, 1)
    })
  }

  /*
   * Mel's adjustment: the hero content box is `mx-auto max-w-6xl` (72 rem = 1152 px). Measured at
   * 1440 px, where the cap binds and the auto margins centre the box.
   */
  test('the hero container is capped at 1152 px and centred', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const content = await heroContent(page).evaluate((el) => {
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      // `clientWidth`, not `innerWidth`: the vertical scrollbar sits outside the document's content
      // box, so the centring has to be measured against the document width.
      const documentWidth = document.documentElement.clientWidth
      return { maxWidth: style.maxWidth, width: box.width, left: box.left, right: documentWidth - box.right }
    })
    expect(content.maxWidth, 'max-w-6xl = 72rem = 1152 px').toBe('1152px')
    expect(Math.round(content.width), 'the container stops at its cap').toBe(1152)
    expect(
      Math.abs(content.left - content.right),
      `centred: ${String(content.left)} left vs ${String(content.right)} right`,
    ).toBeLessThanOrEqual(1)
  })

  /*
   * The vertical rhythm (Mel's adjustment): a flat `--softn-space-10` (40 px) below `sm`, and from
   * `sm` the clamps `clamp(--softn-space-16, 11vh, --softn-space-30)` (block start) and
   * `clamp(--softn-space-16, 9vw, --softn-space-24)` (block end). The token bounds are read in the
   * page and the clamp is recomputed from the live viewport, so the assertion holds the formula, not
   * a screenshot of a number.
   */
  const RHYTHM: Record<number, { flat: boolean; top: number; bottom: number; viewportHeight: number }> = {
    375: { flat: true, top: 40, bottom: 40, viewportHeight: 800 },
    768: { flat: false, top: 88, bottom: 69.12, viewportHeight: 800 },
    1280: { flat: false, top: 99, bottom: 96, viewportHeight: 900 },
  }
  for (const [width, expected] of Object.entries(RHYTHM)) {
    test(`the hero padding-block follows the token rhythm at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width: Number(width), height: expected.viewportHeight })
      await page.goto('/')
      const content = await heroContent(page).evaluate((el) => {
        const style = getComputedStyle(el)
        // Custom properties serialize as authored (`2.5rem`), so read them through a probe element:
        // only the engine knows how a token of one family lands in pixels.
        const probe = document.createElement('div')
        document.body.appendChild(probe)
        const px = (name: string): number => {
          probe.style.padding = `var(${name})`
          const value = Number.parseFloat(getComputedStyle(probe).paddingTop)
          probe.style.padding = ''
          return value
        }
        const read = {
          top: Number.parseFloat(style.paddingTop),
          bottom: Number.parseFloat(style.paddingBottom),
          space10: px('--softn-space-10'),
          space16: px('--softn-space-16'),
          space24: px('--softn-space-24'),
          space30: px('--softn-space-30'),
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        }
        probe.remove()
        return read
      })
      expect(content.space10, '--softn-space-10 is 40 px').toBe(40)
      expect(content.space16, '--softn-space-16 is 64 px').toBe(64)
      expect(content.space24, '--softn-space-24 is 96 px').toBe(96)
      expect(content.space30, '--softn-space-30 is 120 px').toBe(120)
      if (expected.flat) {
        expect(content.top, 'below sm the block padding is the flat 40 px step').toBe(40)
        expect(content.bottom, 'below sm the block padding is the flat 40 px step').toBe(40)
        return
      }
      const expectTop = Math.min(120, Math.max(64, content.innerHeight * 0.11))
      const expectBottom = Math.min(96, Math.max(64, content.innerWidth * 0.09))
      expect(content.top, `padding-block-start ${String(content.top)} vs clamp(64, 11vh, 120)`).toBeCloseTo(
        expectTop,
        1,
      )
      expect(content.bottom, `padding-block-end ${String(content.bottom)} vs clamp(64, 9vw, 96)`).toBeCloseTo(
        expectBottom,
        1,
      )
      expect(content.top, `sampled padding-block-start at ${width}px`).toBeCloseTo(expected.top, 1)
      expect(content.bottom, `sampled padding-block-end at ${width}px`).toBeCloseTo(expected.bottom, 1)
    })
  }
})

test.describe('hero: cursor glow paints the brand aura token', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  /*
   * The 0.3.0 pass moved the pointer glow from the aliased `--softn-warning-background` to the
   * dedicated `--softn-brand-aura` (same value: amber at 12 %). Two readings pin the token: the
   * **declared** one, taken off the constructed stylesheet (the `.glow` rule must name the custom
   * property, not a literal colour — a hardcoded amber would serialize identically), and the
   * **computed** one, where the gradient's colour equals the value a probe styled with
   * `var(--softn-brand-aura)` resolves to in this theme.
   */
  test('the pointer radial uses --softn-brand-aura, resolved through the token', async ({ page }) => {
    await page.goto('/')
    const read = await heroSection(page)
      .locator('div[aria-hidden="true"]')
      .first()
      .evaluate((el) => {
        const probe = document.createElement('div')
        probe.style.color = 'var(--softn-brand-aura)'
        document.body.appendChild(probe)
        const aura = getComputedStyle(probe).color
        const backgroundProbe = document.createElement('div')
        backgroundProbe.style.color = 'var(--softn-brand-background)'
        document.body.appendChild(backgroundProbe)
        const brand = getComputedStyle(backgroundProbe).color
        probe.remove()
        backgroundProbe.remove()
        const computed = getComputedStyle(el).backgroundImage
        // Declared value: find the rule that carries this element's own background-image through the
        // CSSOM (the CSS-module class is hashed in the build, so match on the element's class list).
        const classes = Array.from(el.classList)
        let declared = ''
        const scan = (rules: CSSRuleList): void => {
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule && classes.some((name) => rule.selectorText.includes(name))) {
              if (rule.style.backgroundImage.includes('radial-gradient')) declared = rule.style.backgroundImage
            } else if (rule instanceof CSSGroupingRule) {
              scan(rule.cssRules)
            }
          }
        }
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            scan(sheet.cssRules)
          } catch {
            /* unreadable sheet: none should be, but never crash the audit */
          }
        }
        return { aura, brand, computed, declared }
      })
    expect(read.aura, 'the aura token resolves to a colour in this theme').not.toBe('')
    expect(read.aura).toMatch(/^(lab|oklab|color|rgb)/)
    expect(read.declared, 'the glow rule was found in the constructed stylesheet').not.toBe('')
    expect(read.declared, 'the pointer radial declares the aura token, not a literal').toContain('--softn-brand-aura')
    expect(read.declared, 'the aura alias replaced the warning-background alias').not.toContain(
      '--softn-warning-background',
    )
    const radials = read.computed.match(/radial-gradient/g) ?? []
    expect(radials.length, 'the glow is two stacked radials (pointer + static brand wash)').toBe(2)
    expect(read.computed, `the pointer radial paints the aura colour (${read.aura})`).toContain(read.aura)
    expect(read.computed, `the static wash paints the brand background (${read.brand})`).toContain(read.brand)
  })
})

test.describe('hero: contrast over the painted glow (WCAG 1.4.3)', () => {
  /*
   * axe cannot judge the hero text: it paints over the two radial glows, so its nodes come back in
   * `incomplete` with "Element's background color could not be determined due to a background
   * gradient" (that fact is asserted in `e2e/accessibility.spec.ts`). The gap is closed here against
   * the real painting:
   *   1. each target's rendered colour, size and weight are read while nothing is overridden;
   *   2. every glyph in the hero is then turned transparent at once — a per-element reset is not
   *      enough, because the h1 runs at `line-height: 0.96`, so the ascenders and descenders of the
   *      neighbouring lines paint inside the box under test and would score as "background";
   *   3. each text box is screenshotted and the *worst* pixel of the exposed background — the one
   *      whose luminance is closest to the text's — is put against the text colour.
   * Thresholds are WCAG 2.1 AA: 4,5:1 for normal text, 3:1 for large text (>= 24 px, or >= 18.66 px
   * at weight >= 700). The pointer is at rest and the reveal is settled, so this is the steady state a
   * reader actually sees, measured in both themes.
   */
  const TARGETS = [
    { label: 'eyebrow', text: hero.eyebrow },
    { label: 'title line 1', text: hero.title.line1 },
    { label: 'title line 2', text: hero.title.line2 },
    { label: 'title line 3', text: hero.title.line3 },
    { label: 'subtitle', text: hero.subtitle.slice(0, 24) },
    { label: 'secondary call to action', text: hero.cta.secondary },
    { label: 'reassurance', text: hero.reassurance.slice(0, 24) },
    { label: 'scroll indicator', text: INDICATOR.slice(0, 24) },
  ] as const

  type TextSpec = {
    label: string
    text: string
    color: string
    rgb: [number, number, number]
    fontSize: number
    fontWeight: number
    /**
     * Width, in CSS px from the left of the element's own box, to ignore when reading the painted
     * background: the scroll indicator carries the decorative badge, whose brand-coloured disc is a
     * component background, not the background the text sits on. Measured off the child, never
     * hardcoded.
     */
    skipLeft: number
  }

  for (const scheme of ['dark', 'light'] as const) {
    test(`hero text keeps AA contrast against the worst painted background (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.addInitScript((value) => localStorage.setItem('softn-theme', value), scheme)
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      await awaitFiniteAnimations(page)

      // 1. The rendered text colours, before the transparent-ink override.
      const specs: TextSpec[] = []
      for (const target of TARGETS) {
        const element = heroSection(page).getByText(target.text, { exact: false }).first()
        await expect(element, `${target.label} is on the page`).toBeVisible()
        const read = await element.evaluate((el) => {
          const style = getComputedStyle(el)
          const canvas = document.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx === null) throw new Error('no 2d context')
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = style.color
          ctx.fillRect(0, 0, 1, 1)
          const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
          // Any descendant that paints its own background (the indicator's badge) is a component
          // surface, not the page behind the text: record how far it reaches into the box.
          const own = el.getBoundingClientRect()
          let skipLeft = 0
          for (const child of Array.from(el.querySelectorAll('*'))) {
            const background = getComputedStyle(child).backgroundColor
            if (background === 'rgba(0, 0, 0, 0)' || background === 'transparent') continue
            const box = child.getBoundingClientRect()
            skipLeft = Math.max(skipLeft, Math.round(box.right - own.left))
          }
          return {
            rgb: [r, g, b] as [number, number, number],
            color: style.color,
            fontSize: Number.parseFloat(style.fontSize),
            fontWeight: Number.parseFloat(style.fontWeight),
            skipLeft,
          }
        })
        specs.push({ label: target.label, text: target.text, ...read })
      }

      // 2. Kill every glyph in the hero at once (layout, backgrounds and glows stay painted).
      const ink = await page.addStyleTag({ content: 'main section, main section * { color: transparent !important }' })

      const ratios: string[] = []
      for (const spec of specs) {
        const element = heroSection(page).getByText(spec.text, { exact: false }).first()
        // 3. The pixels behind this line, and the worst of them for the text's own luminance.
        const shot = await element.screenshot({ timeout: 15_000 })
        const textLum = luminance(spec.rgb)
        const worst = await page.evaluate(
          async ({ data, target, skipLeft }) => {
            const image = new Image()
            await new Promise<void>((resolve, reject) => {
              image.onload = (): void => resolve()
              image.onerror = (): void => reject(new Error('screenshot decode failed'))
              image.src = `data:image/png;base64,${data}`
            })
            const canvas = document.createElement('canvas')
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (ctx === null) throw new Error('no 2d context')
            ctx.drawImage(image, 0, 0)
            const { data: pixels } = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const channel = (v: number): number => {
              const c = v / 255
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
            }
            let closest = 0
            let best = Number.POSITIVE_INFINITY
            let checked = 0
            for (let y = 0; y < canvas.height; y += 1) {
              for (let x = 0; x < canvas.width; x += 1) {
                // The scroll indicator's badge paints its own surface: it is not the background the
                // text sits on, so the band it covers is out of the sample.
                if (x < skipLeft) continue
                const index = (y * canvas.width + x) * 4
                if ((pixels[index + 3] ?? 255) < 250) continue // fully transparent pixel: nothing painted
                checked += 1
                const l =
                  0.2126 * channel(pixels[index] ?? 0) +
                  0.7152 * channel(pixels[index + 1] ?? 0) +
                  0.0722 * channel(pixels[index + 2] ?? 0)
                const distance = Math.abs(l - target)
                if (distance < best) {
                  best = distance
                  closest = l
                }
              }
            }
            return { closest, checked }
          },
          { data: shot.toString('base64'), target: textLum, skipLeft: spec.skipLeft },
        )
        expect(worst.checked, `${spec.label}: no painted pixel behind the text`).toBeGreaterThan(0)

        const hi = Math.max(textLum, worst.closest)
        const lo = Math.min(textLum, worst.closest)
        const ratio = (hi + 0.05) / (lo + 0.05)
        const large = spec.fontSize >= 24 || (spec.fontSize >= 18.66 && spec.fontWeight >= 700)
        const threshold = large ? 3 : 4.5
        ratios.push(
          `${spec.label} ${String(spec.fontSize)}px/${String(spec.fontWeight)} ${spec.color} vs painted ${worst.closest.toFixed(4)} → ${ratio.toFixed(2)}:1 (min ${String(threshold)})`,
        )
        expect(
          ratio,
          `${spec.label} at ${String(spec.fontSize)}px/${String(spec.fontWeight)} over the painted glow`,
        ).toBeGreaterThanOrEqual(threshold)
      }
      await ink.evaluate((node) => {
        ;(node as HTMLElement).remove()
      })

      // The numbers belong in the report, not just the green check.
      test.info().annotations.push({ type: 'measure', description: `hero contrast (${scheme}): ${ratios.join(' | ')}` })
    })
  }
})
