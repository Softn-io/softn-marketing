/**
 * E2E coverage for the Method section's five-step sticky timeline (GitHub issue #14).
 *
 * The unit tests (`components/sections/Method/tests/`) prove the markup contract (ordered list,
 * h3 per step, locale-only copy). What only a real browser can prove is covered here:
 *
 * - While scrolling through the timeline the step blocks stack below the sticky site header with
 *   increasing top offsets (one `--softn-space-8` step per block), and each earlier caption line
 *   stays visible — covered neither by the header nor by the block stacked over it — at 375, 768
 *   and 1280 px. The pins are checked against the live header height, not a hardcoded number.
 * - The caption line keeps WCAG 2.1 AA contrast on the block's opaque background, in both themes
 *   (the site's brand default is dark, light activates on explicit choice).
 * - The stacking is layout, not motion: it survives `prefers-reduced-motion: reduce`.
 * - The heading hierarchy stays h1 → h2 → h3: the section keeps its single `<h2>` and the five
 *   step titles are `<h3>` under it.
 * - The review-loop diagram of issue #13 still renders before the timeline, unchanged (the CSS
 *   split into per-component modules must not move its box).
 *
 * The suite runs against the production server the Playwright config builds and starts with
 * `ENABLE_PREVIEW_ROUTE=true` (see `playwright.config.ts`); the section renders on `/preview`.
 */
import { expect, test, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { method } from '../locales/fr/method'

/** One sticky step of the stagger between two blocks: the design's 30px mapped to --softn-space-8. */
const STEP_STAGGER_PX = 32

/** Element id of the method section, passed into every `page.evaluate` (closures do not cross). */
const METHOD_ID = SECTION_IDS.method

const section = (page: Page) => page.locator(`section#${METHOD_ID}`)
const timeline = (page: Page) => section(page).locator('ol')
const steps = (page: Page) => timeline(page).locator('li')
const captionOf = (page: Page, index: number) => steps(page).nth(index).locator('p').first()

/** Live geometry of the header, the list and every block, read in one pass. */
type TimelineGeometry = {
  headerBottom: number
  olTop: number
  olHeight: number
  maxScrollY: number
  blocks: Array<{
    flowTop: number
    height: number
    stickyOffset: number
    background: string
  }>
  captionColor: string
  captionFontSize: number
  captionFontWeight: number
}

const readGeometry = (page: Page): Promise<TimelineGeometry> =>
  page.evaluate((methodId) => {
    const header = document.querySelector('header')
    const ol = document.querySelector<HTMLElement>(`section#${methodId} ol`)
    if (header === null || ol === null) throw new Error('header or timeline missing')
    const headerBox = header.getBoundingClientRect()
    const olBox = ol.getBoundingClientRect()
    const caption = ol.querySelector('p')
    if (caption === null) throw new Error('caption missing')
    const captionStyle = getComputedStyle(caption)
    return {
      headerBottom: headerBox.bottom,
      olTop: olBox.top + window.scrollY,
      olHeight: olBox.height,
      maxScrollY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      blocks: Array.from(ol.querySelectorAll('li')).map((li) => {
        const box = li.getBoundingClientRect()
        const stickyTop = Number.parseFloat(getComputedStyle(li).top)
        return {
          flowTop: box.top + window.scrollY,
          height: box.height,
          stickyOffset: Number.isFinite(stickyTop) ? stickyTop : 0,
          background: getComputedStyle(li).backgroundColor,
        }
      }),
      captionColor: captionStyle.color,
      captionFontSize: Number.parseFloat(captionStyle.fontSize),
      captionFontWeight: Number(captionStyle.fontWeight),
    }
  }, METHOD_ID)

/**
 * Scroll position at which a block reaches its sticky offset: its flow top (an absolute document
 * position) minus the offset it pins at. Once the window passes this line the block is pinned until
 * the list's bottom edge.
 */
const pinScrollY = (geometry: TimelineGeometry, index: number): number =>
  geometry.blocks[index]!.flowTop - geometry.blocks[index]!.stickyOffset

/** Resolves once the browser has had a frame to apply the current scroll position. */
const nextFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

/** Viewport-top of every block, in one pass. */
const blockTops = (page: Page): Promise<number[]> =>
  page.evaluate(
    (methodId) =>
      Array.from(document.querySelectorAll<HTMLElement>(`section#${methodId} ol li`)).map(
        (li) => li.getBoundingClientRect().top,
      ),
    METHOD_ID,
  )

/**
 * True when the caption of a step paints on top of everything at its own centre: the header, a
 * later block or the page background would all fail the `elementFromPoint` walk.
 */
const captionPaintsOnTop = (page: Page, index: number): Promise<boolean> =>
  page.evaluate(
    ([methodId, stepIndex]: [string, number]) => {
      const li = document.querySelectorAll<HTMLElement>(`section#${methodId} ol li`)[stepIndex]
      const caption = li === undefined ? null : li.querySelector('p')
      if (caption === null) throw new Error(`missing step ${stepIndex} or its caption`)
      const box = caption.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return false
      let hit: Element | null = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      while (hit !== null && hit !== caption) hit = hit.parentElement
      return hit === caption
    },
    [METHOD_ID, index] as [string, number],
  )

/** WCAG 2.1 relative-luminance contrast of two CSS colors, resolved by the browser's canvas. */
const contrastRatio = (page: Page, foreground: string, background: string): Promise<number> =>
  page.evaluate(
    ([fg, bg]: [string, string]) => {
      const pixel = (color: string): [number, number, number] => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        if (context === null) throw new Error('no 2d context')
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        const data = context.getImageData(0, 0, 1, 1).data
        return [data[0]!, data[1]!, data[2]!]
      }
      const luminance = ([r, g, b]: [number, number, number]) => {
        const channel = (value: number) => {
          const s = value / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }
      const l1 = luminance(pixel(fg))
      const l2 = luminance(pixel(bg))
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    },
    [foreground, background] as [string, string],
  )

/**
 * The sticky contract of one viewport: pins under the live header at increasing offsets, earlier
 * captions stay visible at every stage of the scroll, and the pins hold while scrolling on.
 */
const expectStickyStacking = async (page: Page): Promise<void> => {
  // Reduced motion keeps this test about LAYOUT ONLY: the pin offsets, not motion. With motion
  // allowed, the agent section's entrance parallax (#15) intentionally translates and scales the
  // whole timeline while it enters the viewport, which moves every pinned block; that interplay
  // is covered by agentSection.spec.ts. Under `prefers-reduced-motion: reduce` the parallax
  // writes nothing and the blocks pin at their stylesheet offsets.
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto('/preview')
  await expect(timeline(page)).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const geometry = await readGeometry(page)

  // Five blocks, each pinning one --softn-space-8 step lower than the previous one, the first at
  // the live header height (the real clearance, not a hardcoded pixel value).
  expect(geometry.blocks).toHaveLength(method.steps.length)
  expect(geometry.blocks[0]!.stickyOffset, 'the first block pins at the header height').toBeCloseTo(
    geometry.headerBottom,
    0,
  )
  for (let index = 1; index < geometry.blocks.length; index += 1) {
    const previous = geometry.blocks[index - 1]!
    const current = geometry.blocks[index]!
    expect(
      current.stickyOffset - previous.stickyOffset,
      `block ${index} pins one ${STEP_STAGGER_PX}px step below block ${index - 1}`,
    ).toBeCloseTo(STEP_STAGGER_PX, 0)
  }

  // Stage 1: the first three blocks pinned, the two after still in flow below.
  const pinOfSecond = pinScrollY(geometry, 2)
  await page.evaluate((y) => window.scrollTo(0, y), pinOfSecond)
  await nextFrame(page)
  const pinnedTops = await blockTops(page)
  for (const [index, top] of pinnedTops.slice(0, 3).entries()) {
    expect(top, `block ${index} holds its pinned offset`).toBeCloseTo(geometry.blocks[index]!.stickyOffset, 0)
  }
  for (const index of [3, 4]) {
    expect(pinnedTops[index], `block ${index} has not pinned yet`).toBeGreaterThan(geometry.blocks[index]!.stickyOffset)
  }
  // The pinned captions are neither under the header nor under the block stacked over them.
  for (const index of [0, 1, 2]) {
    const caption = await captionOf(page, index).boundingBox()
    expect(caption, `caption ${index} has a box`).not.toBeNull()
    expect(caption!.y, `caption ${index} sits below the header`).toBeGreaterThanOrEqual(geometry.headerBottom - 1)
    const nextBlockTop = pinnedTops[index + 1]
    if (nextBlockTop !== undefined) {
      expect(caption!.y + caption!.height, `caption ${index} clears block ${index + 1}`).toBeLessThanOrEqual(
        nextBlockTop + 1,
      )
    }
    expect(await captionPaintsOnTop(page, index), `caption ${index} is the topmost paint at its centre`).toBe(true)
  }

  // Stage 2: all five blocks pinned, every caption still on top.
  await page.evaluate((y) => window.scrollTo(0, y), pinScrollY(geometry, 4))
  await nextFrame(page)
  const allTops = await blockTops(page)
  for (const [index, top] of allTops.entries()) {
    expect(top, `block ${index} holds its pinned offset with the pile complete`).toBeCloseTo(
      geometry.blocks[index]!.stickyOffset,
      0,
    )
  }
  for (let index = 0; index < method.steps.length; index += 1) {
    expect(await captionPaintsOnTop(page, index), `caption ${index} stays the topmost paint`).toBe(true)
  }

  // The pins hold while the reader keeps scrolling: nothing drifts.
  await page.evaluate((y) => window.scrollTo(0, y + 200), pinScrollY(geometry, 4))
  await nextFrame(page)
  expect(await blockTops(page), 'the pinned offsets survive further scrolling').toEqual(allTops)
}

/** Both themes' caption contrast on the opaque block background, from the live page. */
const expectCaptionContrast = async (page: Page): Promise<void> => {
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
    await page.evaluate(() => document.documentElement.offsetHeight) // flush the style recalculation
    const geometry = await readGeometry(page)
    const block = geometry.blocks[0]!
    expect(
      await contrastRatio(page, geometry.captionColor, block.background),
      `caption contrast on the block background (${theme}, ${geometry.captionFontSize}px / weight ${geometry.captionFontWeight})`,
    ).toBeGreaterThanOrEqual(4.5)
  }
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), 'dark')
}

/** One heading-hierarchy pass: a single page h1, a single section h2, five h3, nothing deeper. */
const expectHeadingHierarchy = async (page: Page): Promise<void> => {
  await page.goto('/preview')
  await expect(section(page)).toBeVisible()
  const structure = await page.evaluate((methodId) => {
    const methodSection = document.getElementById(methodId)
    if (methodSection === null) throw new Error('method section missing')
    return {
      pageH1: document.querySelectorAll('main h1').length,
      sectionH2: methodSection.querySelectorAll('h2').length,
      sectionH3: methodSection.querySelectorAll('h3').length,
      deeper: methodSection.querySelectorAll('h4, h5, h6').length,
    }
  }, SECTION_IDS.method)
  expect(structure.pageH1, 'one page h1').toBe(1)
  expect(structure.sectionH2, 'one section h2').toBe(1)
  expect(structure.sectionH3, 'five step h3').toBe(method.steps.length)
  expect(structure.deeper, 'nothing below h3').toBe(0)
  for (const step of method.steps) {
    await expect(section(page).getByRole('heading', { level: 3, name: step.title })).toBeVisible()
  }
}

test.describe('method timeline, desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('stacks the five blocks below the header with visible captions', async ({ page }) => {
    await expectStickyStacking(page)
  })

  test('keeps the caption at AA contrast in both themes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(timeline(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expectCaptionContrast(page)
  })

  test('keeps the heading hierarchy h1 > h2 > h3', async ({ page }) => {
    await expectHeadingHierarchy(page)
  })

  test('renders the diagram before the timeline, on the same section', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(section(page)).toBeVisible()
    const order = await page.evaluate((methodId) => {
      const methodSection = document.getElementById(methodId)
      if (methodSection === null) throw new Error('method section missing')
      const diagramTrack = methodSection.querySelector('[data-diagram-track]')
      const timelineList = methodSection.querySelector('ol')
      return {
        hasDiagramTrack: diagramTrack !== null,
        hasDiagramSvg: methodSection.querySelector('[data-diagram-stage] svg') !== null,
        hasTimeline: timelineList !== null,
        timelineFollowsDiagram:
          diagramTrack !== null &&
          timelineList !== null &&
          (diagramTrack.compareDocumentPosition(timelineList) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        timelineIsLastChild: timelineList !== null && methodSection.lastElementChild === timelineList,
        timelineFollowsTrackDirectly: timelineList !== null && timelineList.previousElementSibling === diagramTrack,
        sectionChildTags: Array.from(methodSection.children).map((child) => child.tagName),
      }
    }, METHOD_ID)
    expect(order.hasDiagramTrack, 'the diagram track is still inside the section').toBe(true)
    expect(order.hasDiagramSvg, 'the review-loop diagram still renders its drawing').toBe(true)
    expect(order.hasTimeline, 'the timeline is inside the section').toBe(true)
    expect(order.timelineFollowsDiagram, 'the timeline follows the diagram in document order').toBe(true)
    expect(order.timelineIsLastChild, 'the timeline is the section last child').toBe(true)
    expect(order.timelineFollowsTrackDirectly, 'the timeline directly follows the diagram track').toBe(true)
    expect(order.sectionChildTags, 'header block, diagram, timeline').toEqual(['DIV', 'DIV', 'OL'])
  })
})

test.describe('method timeline, tablet', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('stacks the five blocks below the header with visible captions', async ({ page }) => {
    await expectStickyStacking(page)
  })

  test('keeps the caption at AA contrast in both themes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(timeline(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expectCaptionContrast(page)
  })
})

test.describe('method timeline, mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('stacks the five blocks below the header with visible captions', async ({ page }) => {
    await expectStickyStacking(page)
  })

  test('keeps the caption at AA contrast in both themes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(timeline(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expectCaptionContrast(page)
  })
})

test.describe('method timeline, reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('still stacks under prefers-reduced-motion: the pile is layout, not animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(timeline(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const geometry = await readGeometry(page)
    await page.evaluate((y) => window.scrollTo(0, y), pinScrollY(geometry, 4))
    await nextFrame(page)
    const tops = await blockTops(page)
    for (const [index, top] of tops.entries()) {
      expect(top, `block ${index} still pins under reduced motion`).toBeCloseTo(geometry.blocks[index]!.stickyOffset, 0)
    }
    for (let index = 0; index < method.steps.length; index += 1) {
      expect(await captionPaintsOnTop(page, index), `caption ${index} stays visible under reduced motion`).toBe(true)
    }
  })
})
