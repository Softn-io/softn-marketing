/**
 * E2E coverage for the Method section's scroll-pinned review-loop diagram (GitHub issue #13).
 *
 * The unit tests (`components/sections/Method/tests/`) prove the geometry math, the static markup
 * contract (single `role="img"`, hidden drawing texts, `aria-live` status) and the listener wiring
 * with stubbed layout. What only a real browser can prove is covered here:
 *
 * - `prefers-reduced-motion: reduce` arms nothing: no pinned mode, no keyframes, the tall track
 *   collapses to its natural height and the diagram shows its complete final state (issue #13's
 *   acceptance criterion). The ARIA contract is re-checked on the rendered page, not the tree.
 * - With motion allowed the track is tall, the stage pins at its `top` offset, and scrolling drives
 *   the four status sentences and the lane/gate/block custom properties through the whole
 *   choreography to completion (`--method-lane-live` reaches 1).
 * - On a narrow viewport the 180vh track is used and the capped travel still completes at the page
 *   end (the `/preview` page ends with this section).
 * - With a tall element after the section — the situation of the real home page, where the
 *   timeline, agent, FAQ and booking sections follow — the pin releases when the track's bottom
 *   reaches the stage and the diagram still completes: the page-end cap must not be the only way
 *   progress reaches 1.
 *
 * The suite runs against the production server the Playwright config builds and starts with
 * `ENABLE_PREVIEW_ROUTE=true` (see `playwright.config.ts`); the section renders on `/preview`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { method } from '../locales/fr/method'

/** The diagram's own root elements; the data attributes are the island's stable hook. */
const track = (page: Page) => page.locator('[data-diagram-track]')
const stage = (page: Page) => page.locator('[data-diagram-stage]')
const svg = (page: Page) => stage(page).locator('svg')

/** The dashed review line (x1="0") and the pulsing gate group, one match each inside the drawing. */
const reviewLine = (page: Page) => stage(page).locator('svg > g > line[x1="0"]')
const gatePulse = (page: Page) => stage(page).locator('svg > g > g')

/** The status sentence the scroll script announces. */
const statusRegion = (page: Page) => stage(page).locator('[aria-live="polite"]')

/** Value of a CSS custom property as the browser resolves it on the element. */
const computedVar = (locator: Locator, property: string): Promise<string> =>
  locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)

/** Resolves once the scroll script has had a frame to apply the current scroll position. */
const nextFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

/** Everything the progress math needs, measured from the live page. */
type DiagramGeometry = {
  trackTop: number
  trackHeight: number
  stageHeight: number
  stickyTop: number
  stagePosition: string
  maxScrollY: number
}

const readGeometry = (page: Page): Promise<DiagramGeometry> =>
  page.evaluate(() => {
    const trackElement = document.querySelector<HTMLElement>('[data-diagram-track]')
    const stageElement = document.querySelector<HTMLElement>('[data-diagram-stage]')
    if (trackElement === null || stageElement === null) throw new Error('track or stage missing')
    const styles = getComputedStyle(stageElement)
    const stickyTop = Number.parseFloat(styles.top)
    return {
      trackTop: trackElement.getBoundingClientRect().top + window.scrollY,
      trackHeight: trackElement.getBoundingClientRect().height,
      stageHeight: stageElement.getBoundingClientRect().height,
      stickyTop: Number.isFinite(stickyTop) ? stickyTop : 0,
      stagePosition: styles.position,
      maxScrollY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }
  })

/** Scroll position at which the pinned choreography reaches a given progress. */
const scrollYForProgress = (geometry: DiagramGeometry, progress: number): number =>
  geometry.trackTop - geometry.stickyTop +
  Math.min(geometry.trackHeight - geometry.stageHeight, geometry.maxScrollY - (geometry.trackTop - geometry.stickyTop)) *
    progress

/** Collects console errors, page errors and hydration-related warnings for one page. */
const collectConsoleProblems = (page: Page): string[] => {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
    if (message.type() === 'warning' && /hydrat/i.test(message.text())) {
      problems.push(`console.warning: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** The wide drawing and the 250vh track of the desktop reference. */
test.describe('method diagram, desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('reduced motion keeps the diagram static, collapsed and complete', async ({ page }) => {
    const problems = collectConsoleProblems(page)
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/preview')

    // The script never arms the pinned mode, so the track keeps its natural height.
    await expect(track(page)).not.toHaveAttribute('data-motion')
    const heights = await page.evaluate(() => {
      const trackElement = document.querySelector('[data-diagram-track]')
      const stageElement = document.querySelector('[data-diagram-stage]')
      return {
        track: trackElement?.getBoundingClientRect().height ?? 0,
        stage: stageElement?.getBoundingClientRect().height ?? 0,
      }
    })
    expect(heights.track, 'the tall track must collapse without the pinned mode').toBeLessThan(800)
    expect(Math.abs(heights.track - heights.stage), 'the collapsed track is the stage height').toBeLessThanOrEqual(1)
    expect(await stage(page).evaluate((element) => getComputedStyle(element).position)).toBe('static')

    // No keyframes either: the dash sweep and the gate pulse are switched off.
    expect(await reviewLine(page).evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
    expect(await gatePulse(page).evaluate((element) => getComputedStyle(element).animationName)).toBe('none')

    // The final static state the stylesheet declares: lanes full, gate visible, the failed block
    // faded back into the queue, the status sentence at its end. Chromium serializes the opacity
    // token without its leading zero, so the properties are compared as numbers.
    expect(Number(await computedVar(stage(page), '--method-lane-live'))).toBeCloseTo(1, 5)
    expect(Number(await computedVar(stage(page), '--method-gate-opacity'))).toBeCloseTo(1, 5)
    expect(Number(await computedVar(stage(page), '--method-block-opacity-2'))).toBeCloseTo(0.35, 5)
    await expect(statusRegion(page)).toHaveText(method.loop.status.live)

    // The image is exposed once, named by the locale, with its drawing texts hidden from AT.
    await expect(svg(page)).toHaveAttribute('role', 'img')
    await expect(svg(page)).toHaveAttribute('aria-label', method.loop.ariaLabel)
    const hiddenStates = await svg(page).locator('text').evaluateAll((texts) =>
      texts.map((text) => text.getAttribute('aria-hidden')),
    )
    expect(hiddenStates).toHaveLength(3)
    for (const state of hiddenStates) expect(state).toBe('true')

    // The drawing's lane labels are painted with `fill`, which the token audit's color probes do not
    // read: their fill must be the same tertiary color the section eyebrow uses, in the live theme.
    const labelFill = await svg(page).locator('text').first().evaluate((element) => getComputedStyle(element).fill)
    const eyebrowColor = await page
      .locator(`section#${SECTION_IDS.method} > div > p.text-caption`)
      .evaluate((element) => getComputedStyle(element).color)
    expect(labelFill).toBe(eyebrowColor)

    // Page landmarks: one h1, the section named by its own h2.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    const section = page.locator(`section#${SECTION_IDS.method}`)
    await expect(section).toHaveAttribute('aria-labelledby', 'method-title')
    await expect(section.getByRole('heading', { level: 2 })).toHaveCount(1)

    expect(problems, 'no console errors and no hydration warnings under reduced motion').toEqual([])
  })

  test('motion allowed pins the stage and drives the choreography to completion', async ({ page }) => {
    const problems = collectConsoleProblems(page)
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(track(page)).toHaveAttribute('data-motion', 'scroll')
    await page.evaluate(() => document.fonts.ready)

    await expect(svg(page)).toHaveAttribute('viewBox', '0 0 960 300')
    const geometry = await readGeometry(page)
    expect(geometry.stagePosition).toBe('sticky')
    expect(Math.abs(geometry.trackHeight - 2000), 'the wide track is 250vh at an 800px viewport').toBeLessThanOrEqual(2)

    // The keyboard never enters the diagram: nothing inside the track can hold focus, so the pinned
    // stage cannot swallow focus or hide a focus ring.
    const focusables = await track(page).evaluate((element) =>
      element.querySelectorAll('a, button, input, select, textarea, [tabindex]').length,
    )
    expect(focusables).toBe(0)

    // Each scroll band announces its own sentence; the properties move with the progress.
    await page.evaluate((y) => window.scrollTo(0, y), scrollYForProgress(geometry, 0))
    await nextFrame(page)
    await expect(statusRegion(page)).toHaveText(method.loop.status.producing)
    expect(await computedVar(stage(page), '--method-lane-live')).toBe('0')

    await page.evaluate((y) => window.scrollTo(0, y), scrollYForProgress(geometry, 0.3))
    await nextFrame(page)
    await expect(statusRegion(page)).toHaveText(method.loop.status.rising)
    // Pinned: the stage holds its top offset while the track scrolls under it.
    expect(await stage(page).evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(
      geometry.stickyTop,
      0,
    )

    await page.evaluate((y) => window.scrollTo(0, y), scrollYForProgress(geometry, 0.6))
    await nextFrame(page)
    await expect(statusRegion(page)).toHaveText(method.loop.status.failing)

    await page.evaluate((y) => window.scrollTo(0, y), scrollYForProgress(geometry, 1))
    await nextFrame(page)
    await expect(statusRegion(page)).toHaveText(method.loop.status.live)
    expect(await computedVar(stage(page), '--method-lane-live')).toBe('1')
    expect(await computedVar(stage(page), '--method-block-opacity-2')).toBe('0.35')

    expect(problems, 'no console errors and no hydration warnings while scrolling').toEqual([])
  })

  test('a tall element after the section does not stop the diagram completing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(track(page)).toHaveAttribute('data-motion', 'scroll')
    await page.evaluate(() => document.fonts.ready)

    // After hydration, so React never sees it: the sections that follow on the real home page.
    await page.evaluate(() => {
      const tail = document.createElement('div')
      tail.style.height = '3000px'
      document.body.appendChild(tail)
    })

    const geometry = await readGeometry(page)
    const pinStart = geometry.trackTop - geometry.stickyTop
    const travel = geometry.trackHeight - geometry.stageHeight
    expect(
      geometry.maxScrollY - pinStart,
      'with content after the section the page has more scroll than the pin needs',
    ).toBeGreaterThan(travel)

    // The pin releases when the track's bottom meets the stage — before the page ends — and the
    // diagram is complete from that point on.
    await page.evaluate((y) => window.scrollTo(0, y), pinStart + travel)
    await nextFrame(page)
    await expect(statusRegion(page)).toHaveText(method.loop.status.live)
    expect(await computedVar(stage(page), '--method-lane-live')).toBe('1')

    // Past the release the stage rides the page up and out of the viewport instead of staying
    // glued to its top offset: it now sits with the track's bottom, so its viewport top is the
    // pinned offset minus the distance scrolled past the release.
    await page.evaluate((y) => window.scrollTo(0, y), pinStart + travel + 300)
    await nextFrame(page)
    const releasedTop = await stage(page).evaluate((element) => element.getBoundingClientRect().top)
    expect(releasedTop, 'the stage left the pinned offset upwards with the page').toBeLessThan(
      geometry.stickyTop - 100,
    )
    expect(releasedTop).toBeGreaterThan(geometry.stickyTop - 500)
    expect(await computedVar(stage(page), '--method-lane-live')).toBe('1')
  })
})

/** The narrow drawing: content-sized stage, 180vh track, progress capped by the page's scroll. */
test.describe('method diagram, narrow', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('pins on a 180vh track and completes at the page end', async ({ page }) => {
    const problems = collectConsoleProblems(page)
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(track(page)).toHaveAttribute('data-motion', 'scroll')
    await page.evaluate(() => document.fonts.ready)

    await expect(svg(page)).toHaveAttribute('viewBox', '0 0 470 380')
    const geometry = await readGeometry(page)
    expect(geometry.stagePosition).toBe('sticky')
    expect(geometry.stageHeight, 'the narrow stage sizes to its content').toBeLessThan(844)
    expect(Math.abs(geometry.trackHeight - 844 * 1.8), 'the narrow track is 180vh').toBeLessThanOrEqual(2)

    // On /preview the section ends the page, so the travel is capped by the scroll the page has
    // left: progress must still reach 1 exactly at the page end.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await nextFrame(page)
    await expect(statusRegion(page)).toHaveText(method.loop.status.live)
    expect(await computedVar(stage(page), '--method-lane-live')).toBe('1')

    expect(problems, 'no console errors and no hydration warnings on the narrow page').toEqual([])
  })
})
