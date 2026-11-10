import { expect, test, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { thisSite } from '../locales/fr/thisSite'

/**
 * Invariant under test: hovering near a step border must select at most the step under the pointer
 * and never resize the section. A resize moves the steps under a stationary pointer, so the step
 * under the pointer changes, which moves the layout again: the selection and the geometry must
 * settle together. The section holds it through the reserved detail cell: from the two-column
 * breakpoint the six details share one cell, and the tallest sets its height.
 *
 * These specs drive real pointer input at a fixed viewport, scroll the page to its bottom, and record
 * every frame of the section: how many details are displayed, how many times the selection changed,
 * and whether the page, the section or the step list moved at all. The last specs sweep the six steps
 * at the two-column widths and hold that cell to one height throughout, and hold the total block to
 * one row gap under the list, whatever step is selected.
 */

/** The viewport under test: wide enough for the two columns, short enough that the page scrolls. */
const VIEWPORT = { width: 1512, height: 862 }

/** What the recorded frames held. */
type FrameRecording = {
  /** Times the selected tab changed over the recording: one per step really crossed. */
  changes: number
  /** Largest number of details displayed at once over the recorded frames. */
  maxVisibleDetails: number
  /** Document height on each recorded frame. */
  heights: readonly number[]
  /** Height of the section on each recorded frame: a selection must never resize it. */
  sectionHeights: readonly number[]
  /** Viewport top of the step list on each recorded frame. */
  listTops: readonly number[]
  /** Scroll offset on each recorded frame. */
  scrollTops: readonly number[]
}

/** Handle the page keeps between the two `evaluate` calls. */
type FrameRecorderWindow = {
  __thisSiteFrames?: { stop: () => FrameRecording }
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

/** Starts a per-frame recording of the section's invariants; {@link stopFrameRecording} returns it. */
const startFrameRecording = async (page: Page): Promise<void> => {
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
    const sectionHeights: number[] = []
    const listTops: number[] = []
    const scrollTops: number[] = []

    let frame = 0
    const sample = (): void => {
      const current = selectedTabId()
      if (current !== null && previous !== null && current !== previous) changes += 1
      previous = current ?? previous
      maxVisibleDetails = Math.max(maxVisibleDetails, visibleDetails())
      heights.push(document.documentElement.scrollHeight)
      sectionHeights.push(Math.round(section.getBoundingClientRect().height))
      listTops.push(Math.round(list.getBoundingClientRect().top))
      scrollTops.push(Math.round(window.scrollY))
      frame = requestAnimationFrame(sample)
    }
    frame = requestAnimationFrame(sample)

    const recorder = window as unknown as FrameRecorderWindow
    recorder.__thisSiteFrames = {
      stop: () => {
        cancelAnimationFrame(frame)
        return { changes, maxVisibleDetails, heights, sectionHeights, listTops, scrollTops }
      },
    }
  }, SECTION_IDS.thisSite)
}

/** Stops the recording and returns what the frames held. */
const stopFrameRecording = async (page: Page): Promise<FrameRecording> =>
  page.evaluate(() => {
    const recorder = window as unknown as FrameRecorderWindow
    if (recorder.__thisSiteFrames === undefined) throw new Error('the recording was not started')
    return recorder.__thisSiteFrames.stop()
  })

/** Invariants every recorded frame must respect, whatever the pointer did. */
const expectStableHover = (recording: FrameRecording, mostChanges: number): void => {
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

    // The hover under test: the last pixel row of the third step, just above the border it shares
    // with the fourth.
    const point = await aboveStepBottom(page, 2, 1)
    const hit = await stepAtPoint(page, point)
    expect(hit, 'the point must hit a step, not the space between two').toContain(thisSite.steps[2]?.title ?? '')

    await startFrameRecording(page)
    await page.mouse.move(point.x, point.y)
    // The fixed waits of this spec are sampling windows, not synchronisation: frames must elapse for
    // the invariant to be observable, so they must not be turned into `expect.poll`.
    await page.waitForTimeout(1_000)
    const recording = await stopFrameRecording(page)

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
    // the drift that crosses the border.
    const border = await aboveStepBottom(page, 1, 0)

    await startFrameRecording(page)
    // Sampling windows again: see the note in the first test.
    for (const offset of [2, 1, 0, -1]) {
      await page.mouse.move(border.x, border.y - offset)
      await page.waitForTimeout(150)
    }
    await page.waitForTimeout(500)
    const recording = await stopFrameRecording(page)

    expectStableHover(recording, 2)
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false')
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true')
  })
})

/** The two-column widths where the detail cell is reserved: the tallest detail sets the height. */
const RESERVED_CELL_WIDTHS = [1024, 1512] as const

/**
 * Where the total block sits under the list: the distance between their edges, and the layout's own
 * row gap. The two are compared so a change to the gap token never makes the test vacuous.
 */
type TotalGapMeasurement = {
  /** Distance from the list's bottom edge to the total's top edge, in CSS pixels. */
  gap: number
  /** The row gap the layout separates its two rows by, in CSS pixels. */
  rowGap: number
}

/**
 * Reads the list-bottom-to-total-top distance and the layout's row gap. The total is the layout's
 * last child and the list its first, so the measurement does not depend on a class name.
 */
const measureTotalGap = async (page: Page): Promise<TotalGapMeasurement> =>
  page.evaluate((sectionId) => {
    const section = document.getElementById(sectionId)
    const root = section?.querySelector('[role="tablist"]')?.parentElement
    const list = root?.firstElementChild
    const total = root?.lastElementChild
    if (root == null || list == null || total == null) throw new Error(`#${sectionId} has no two-column layout`)

    return {
      gap: total.getBoundingClientRect().top - list.getBoundingClientRect().bottom,
      rowGap: Number.parseFloat(getComputedStyle(root).rowGap),
    }
  }, SECTION_IDS.thisSite)

test.describe('the "Ce site" detail cell', () => {
  for (const width of RESERVED_CELL_WIDTHS) {
    test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height: VIEWPORT.height } })

      test('selecting each of the six steps leaves the section and the document at one height', async ({ page }) => {
        await page.goto('/preview')
        const tabs = page.locator(`#${SECTION_IDS.thisSite}`).getByRole('tab')
        await expect(tabs).toHaveCount(thisSite.steps.length)
        await settleAtPageBottom(page)

        await startFrameRecording(page)
        for (let position = 0; position < thisSite.steps.length; position += 1) {
          await tabs.nth(position).click()
          await expect(tabs.nth(position)).toHaveAttribute('aria-selected', 'true')
          // A sampling window: every step's frames must be recorded before the next click.
          await page.waitForTimeout(150)
        }
        const recording = await stopFrameRecording(page)

        expect([...new Set(recording.sectionHeights)], 'a selection resized the section').toHaveLength(1)
        expect([...new Set(recording.heights)], 'a selection resized the document').toHaveLength(1)
        expect(recording.maxVisibleDetails, 'two step details were displayed at the same time').toBe(1)

        // What holds the cell open: the five inactive panels stay laid out, out of the paint and out
        // of the accessibility tree (`visibility`), and unreachable (Base UI's `inert`).
        const inactive = await page.evaluate((sectionId) => {
          const section = document.getElementById(sectionId)
          if (section === null) throw new Error(`#${sectionId} missing`)
          return [...section.querySelectorAll('[role="tabpanel"]')]
            .filter((panel) => panel.hasAttribute('hidden'))
            .map((panel) => ({
              inert: panel.hasAttribute('inert'),
              visibility: getComputedStyle(panel).visibility,
              height: Math.round(panel.getBoundingClientRect().height),
            }))
        }, SECTION_IDS.thisSite)

        expect(inactive).toHaveLength(thisSite.steps.length - 1)
        inactive.forEach((panel, index) => {
          expect(panel, `inactive detail ${String(index + 1)} must stay inert and invisible`).toMatchObject({
            inert: true,
            visibility: 'hidden',
          })
          expect(panel.height, `inactive detail ${String(index + 1)} must hold the cell open`).toBeGreaterThan(0)
        })
      })
    })
  }
})

test.describe('the "Ce site" total block', () => {
  for (const width of RESERVED_CELL_WIDTHS) {
    test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height: VIEWPORT.height } })

      test('starts one row gap under the list, the same distance whatever step is selected', async ({ page }) => {
        await page.goto('/preview')
        const tabs = page.locator(`#${SECTION_IDS.thisSite}`).getByRole('tab')
        await expect(tabs).toHaveCount(thisSite.steps.length)
        await settleAtPageBottom(page)

        // The free space the tallest detail reserves belongs below the total: a spanning item's
        // extra height is otherwise shared with the row above it, which would hold a gap between
        // the list and the total that grows with the detail's height.
        const measurements: TotalGapMeasurement[] = []
        for (let position = 0; position < thisSite.steps.length; position += 1) {
          await tabs.nth(position).click()
          await expect(tabs.nth(position)).toHaveAttribute('aria-selected', 'true')
          measurements.push(await measureTotalGap(page))
        }

        for (const [position, { gap, rowGap }] of measurements.entries()) {
          expect(
            Math.abs(gap - rowGap),
            `step ${String(position + 1)}: the total must start one row gap (${String(rowGap)}px) under the list, ${String(gap)}px away`,
          ).toBeLessThanOrEqual(1)
        }

        expect(
          [...new Set(measurements.map(({ gap }) => Math.round(gap)))],
          'the list-to-total distance must not depend on the selected step',
        ).toHaveLength(1)
      })
    })
  }
})
