import { expect, test, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { thisSite } from '../locales/fr/thisSite'

/**
 * Mel's report: on the two-column layout, hovering the bottom border of a step — or a pixel above it —
 * made the page shake and showed two step details at once. The outgoing panel stayed in the document
 * flow for one animation frame (Base UI keeps it mounted until its exit is reported complete), so the
 * detail column grew, the section grew, and the steps moved under the stationary pointer; the step
 * then under the pointer got hover-selected, which moved the layout again, and so on.
 *
 * These specs drive real pointer input at the reported viewport, scroll the page to its bottom, and
 * record every frame of the section while the pointer moves: how many details are displayed, how many
 * times the selection changed, and whether the page or the step list moved at all.
 */

/** The reported viewport: wide enough for the two columns, short enough that the page scrolls. */
const VIEWPORT = { width: 1512, height: 862 }

/** What the recorded frames held. */
type HoverRecording = {
  /** Times the selected tab changed over the recording: one per step really crossed. */
  changes: number
  /** Largest number of details displayed at once over the recorded frames. */
  maxVisibleDetails: number
  /** Document height on each recorded frame. */
  heights: readonly number[]
  /** Viewport top of the step list on each recorded frame. */
  listTops: readonly number[]
  /** Scroll offset on each recorded frame. */
  scrollTops: readonly number[]
}

/** Handle the page keeps between the two `evaluate` calls. */
type HoverRecorderWindow = {
  __thisSiteHover?: { stop: () => HoverRecording }
}

/**
 * Waits until the page has stopped growing and rests at its bottom, whatever hydration adds.
 *
 * The suite measures pixels at fixed viewport coordinates, so the instant scroll is set on purpose:
 * the site scrolls smoothly, and a scroll animation still running would move the sections under the
 * coordinates being read. The behaviour under test does not depend on the scroll motion.
 */
const settleAtPageBottom = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
  })

  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          window.scrollTo(0, document.documentElement.scrollHeight)
          const height = document.documentElement.scrollHeight
          const atBottom = height - window.innerHeight - window.scrollY
          await new Promise((resolve) => setTimeout(resolve, 300))
          return atBottom <= 1 && document.documentElement.scrollHeight === height
        }),
      { message: 'the page must stop growing and rest at its bottom before the pointer moves', timeout: 20_000 },
    )
    .toBe(true)
}

/** Starts a per-frame recording of the section's invariants; {@link stopHoverRecording} returns it. */
const startHoverRecording = async (page: Page): Promise<void> => {
  await page.evaluate((sectionId) => {
    const section = document.getElementById(sectionId)
    if (section === null) throw new Error(`#${sectionId} missing`)
    const list = section.querySelector('[role="tablist"]')
    if (list === null) throw new Error(`#${sectionId} has no step list`)

    const selectedTabId = (): string | null => list.querySelector('[role="tab"][aria-selected="true"]')?.id ?? null
    const visibleDetails = (): number =>
      [...section.querySelectorAll('[role="tabpanel"]')].filter((panel) => {
        const style = getComputedStyle(panel)
        return style.display !== 'none' && style.visibility !== 'hidden' && panel.getBoundingClientRect().height > 0
      }).length

    let changes = 0
    let maxVisibleDetails = 0
    let previous = selectedTabId()
    const heights: number[] = []
    const listTops: number[] = []
    const scrollTops: number[] = []

    let frame = 0
    const sample = (): void => {
      const current = selectedTabId()
      if (current !== null && previous !== null && current !== previous) changes += 1
      previous = current ?? previous
      maxVisibleDetails = Math.max(maxVisibleDetails, visibleDetails())
      heights.push(document.documentElement.scrollHeight)
      listTops.push(Math.round(list.getBoundingClientRect().top))
      scrollTops.push(Math.round(window.scrollY))
      frame = requestAnimationFrame(sample)
    }
    frame = requestAnimationFrame(sample)

    const recorder = window as unknown as HoverRecorderWindow
    recorder.__thisSiteHover = {
      stop: () => {
        cancelAnimationFrame(frame)
        return { changes, maxVisibleDetails, heights, listTops, scrollTops }
      },
    }
  }, SECTION_IDS.thisSite)
}

/** Stops the recording and returns what the frames held. */
const stopHoverRecording = async (page: Page): Promise<HoverRecording> =>
  page.evaluate(() => {
    const recorder = window as unknown as HoverRecorderWindow
    if (recorder.__thisSiteHover === undefined) throw new Error('the recording was not started')
    return recorder.__thisSiteHover.stop()
  })

/** Invariants every recorded frame must respect, whatever the pointer did. */
const expectStableHover = (recording: HoverRecording, mostChanges: number): void => {
  expect(recording.maxVisibleDetails, 'two step details were displayed at the same time').toBe(1)
  expect(new Set(recording.heights).size, 'the page was resized by the hover').toBe(1)
  expect(new Set(recording.listTops).size, 'the step list moved under the pointer').toBe(1)
  expect(new Set(recording.scrollTops).size, 'the page scrolled while the pointer was on the section').toBe(1)
  expect(recording.changes, 'the selection changed more times than the pointer crossed steps').toBeLessThanOrEqual(
    mostChanges,
  )
}

/**
 * Viewport point `offset` pixels above the bottom edge of a step: its own last pixels (`offset: 1`),
 * or the border it shares with the next step (`offset: 0`), whose first pixel row belongs to the next
 * step — the steps' boxes sit on fractional pixels, so the pixel row is taken with `floor`.
 */
const aboveStepBottom = async (page: Page, position: number, offset: number): Promise<{ x: number; y: number }> => {
  const step = page.locator(`#${SECTION_IDS.thisSite}`).getByRole('tab').nth(position)
  const box = await step.boundingBox()
  if (box === null) throw new Error(`step ${String(position)} has no box`)

  return { x: Math.floor(box.x + box.width / 2), y: Math.floor(box.y + box.height - offset) }
}

/** Reads the step the point really hits, so a test never hovers an emptied area by accident. */
const stepAtPoint = (page: Page, point: { x: number; y: number }): Promise<string | null> =>
  page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="tab"]')?.textContent ?? null, point)

test.use({ viewport: VIEWPORT })

test.describe('the "Ce site" steps under a pointer', () => {
  test('hovering one pixel above a step bottom border selects it once and never resizes the page', async ({ page }) => {
    await page.goto('/preview')
    const tabs = page.locator(`#${SECTION_IDS.thisSite}`).getByRole('tab')
    await expect(tabs).toHaveCount(thisSite.steps.length)
    await settleAtPageBottom(page)

    // The reported hover: the last pixel row of the third step, just above the border it shares with
    // the fourth.
    const point = await aboveStepBottom(page, 2, 1)
    const hit = await stepAtPoint(page, point)
    expect(hit, 'the point must hit a step, not the space between two').toContain(thisSite.steps[2]?.title ?? '')

    await startHoverRecording(page)
    await page.mouse.move(point.x, point.y)
    await page.waitForTimeout(1_000)
    const recording = await stopHoverRecording(page)

    expectStableHover(recording, 1)
    expect(recording.changes, 'the hovered step must be selected exactly once').toBe(1)
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true')
    await expect(tabs).toHaveCount(thisSite.steps.length)
  })

  test('drifting one pixel at a time across a step border selects the next step and settles there', async ({
    page,
  }) => {
    await page.goto('/preview')
    const tabs = page.locator(`#${SECTION_IDS.thisSite}`).getByRole('tab')
    await expect(tabs).toHaveCount(thisSite.steps.length)
    await settleAtPageBottom(page)

    // From two pixels above the border between the second and the third step to one pixel below it:
    // the drift Mel's report describes as the shake's trigger.
    const border = await aboveStepBottom(page, 1, 0)

    await startHoverRecording(page)
    for (const offset of [2, 1, 0, -1]) {
      await page.mouse.move(border.x, border.y - offset)
      await page.waitForTimeout(150)
    }
    await page.waitForTimeout(500)
    const recording = await stopHoverRecording(page)

    expectStableHover(recording, 2)
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false')
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true')
  })
})
