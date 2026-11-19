/**
 * Browser acceptance of the scroll behaviour of the assistant section (GitHub issue #157).
 *
 * The unit tests (`components/sections/Agent/tests/`) pin the geometry of `data/revealInViewport.ts`
 * in jsdom. What only a real browser proves is covered here, on `/preview`, with the three endpoints
 * mocked through `page.route`:
 *
 * - After a chatbot answer the page does not move at all: no bounce down and back, and the section
 *   that follows the assistant is never brought into view by a scroll. The conversation reveals
 *   nothing on an answer — it only brings the composer back when the flow closes.
 * - At each booking step, on every viewport of the acceptance (1280x800, 1440x700, 390x844,
 *   375x667, with and without reduced motion), the newest message and the step's control sit fully
 *   inside the viewport under the sticky header, the control keeps the 32 px foot gap
 *   (`--softn-space-8`, the step area's `padding-block-end`) above the bottom edge when the reveal
 *   landed the step there, and the next section stays below the fold. When the union of the newest
 *   line and the step outgrows the room under the header, the step is revealed alone: the control
 *   leads and the newest line may sit under the header.
 * - Closing the flow hands the focus back to the composer, which is then visible in the viewport.
 * - The short-viewport overflow case the code review asked about: a long need answer plus the chooser
 *   outgrow the room, so the step is revealed alone, and the walk checks that the control the flow
 *   focuses (the picked day card) stays inside the viewport — the focus must never land off-screen
 *   (WCAG 2.4.7).
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { findFreeSlots, type BookingSlot } from '../lib/booking/availability'
import { BOOKING_RULES } from '../lib/booking/rules'
import { AGENT_QUESTION_INPUT_ID } from '../components/sections/Agent/AgentComposer'
import { BOOKING_NEED_MAX_LENGTH } from '../schemas/bookingLimits'
import { agent } from '../locales/fr/agent'
import { chatbot } from '../locales/fr/chatbot'

/** The foot gap under a revealed control: the step area's `padding-block-end`, the 32 px token. */
const FOOT_GAP_PX = 32

/** Sub-pixel tolerance of the foot-gap check on a real layout. */
const TOLERANCE_PX = 3

/** The eight mocked slots: two working days, deterministic from the fixed «now» like #17 and #18. */
const SLOTS: readonly BookingSlot[] = findFreeSlots({
  rules: BOOKING_RULES,
  busy: [],
  bookedCallsPerDay: {},
  now: new Date('2026-11-02T09:00:00Z'),
  limit: 8,
})

/** The grounded answer the mocked assistant returns, rendered as the conversation's reply. */
const ANSWER = 'Une réponse ancrée.'

/**
 * A need answer at exactly the length cap the booking accepts: the longest line a real visitor can
 * submit, wrapped over enough lines at 375 px to outgrow the room under the header with the chooser.
 */
const LONG_NEED =
  'Automatiser la facturation de mes devis, du chiffrage à l_envoi, avec relance automatique des clients qui ne répondent pas, et un récapitulatif hebdomadaire de ce qui reste ouvert. '
    .repeat(Math.ceil(BOOKING_NEED_MAX_LENGTH / 180))
    .slice(0, BOOKING_NEED_MAX_LENGTH)

/** The assistant section, which holds the conversation and the reservation flow. */
const agentSection = (page: Page): Locator => page.locator(`section#${SECTION_IDS.agent}`)

/** The section that follows the assistant in the document: never revealed by a scroll. */
const nextSection = (page: Page): Locator => page.locator(`section#${SECTION_IDS.thisSite}`)

/** The flow region, named by the locale like the chip that opens it (`BookingFlow.tsx`). */
const bookingRegion = (page: Page): Locator => page.getByRole('region', { name: chatbot.suggestions.book })

/** One time button of the slot step's chooser (`SlotChooser.tsx`). */
const slotChip = (page: Page): Locator => bookingRegion(page).locator('[data-booking-slot]')

/** The control of the current step: the element the flow focuses and reveals (`BookingFlow.tsx`). */
const stepControl = (page: Page): Locator => bookingRegion(page).locator('[data-booking-focus]')

/** The lines of the flow's own transcript, excluding the typing-indicator line. */
const flowLines = (page: Page): Locator =>
  bookingRegion(page).locator('[data-booking-transcript] > li:not([data-booking-typing])')

/** The step area whose bottom padding carries the 32 px foot gap (`Booking.module.css`). */
const stepArea = (page: Page): Locator => bookingRegion(page).locator('[data-booking-step]')

/** The composer input, focused again once the flow is closed (`AgentComposer.tsx`). */
const composer = (page: Page): Locator => page.locator(`#${AGENT_QUESTION_INPUT_ID}`)

/** Mocks the three endpoints: two booking answers, one grounded assistant answer. */
const mockEndpoints = async (page: Page): Promise<void> => {
  await page.route('**/api/booking/slots', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ slots: SLOTS }) }),
  )
  await page.route('**/api/booking', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ booked: true }) }),
  )
  await page.route('**/api/assistant', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: ANSWER }) }),
  )
}

/** Resolves once the smooth scroll of the last reveal has landed: two reads 150 ms apart are equal. */
const settleScroll = async (page: Page): Promise<void> => {
  await expect
    .poll(
      async () => {
        const before = await page.evaluate(() => window.scrollY)
        await page.waitForTimeout(150)
        return (await page.evaluate(() => window.scrollY)) - before
      },
      { timeout: 8_000 },
    )
    .toBe(0)
}

/** Box of a locator in viewport coordinates, failing the test when it renders nothing. */
const boxOf = async (locator: Locator): Promise<{ top: number; bottom: number; left: number; right: number }> => {
  const box = await locator.boundingBox()
  expect(box, 'the element rendered a box').not.toBeNull()
  const { x, y, width, height } = box as { x: number; y: number; width: number; height: number }
  return { top: y, bottom: y + height, left: x, right: x + width }
}

/**
 * Measures a reveal in viewport coordinates: the viewport, the sticky header's bottom, the room
 * under the header (its height plus the `--softn-space-24` gap token, read from the stylesheet like
 * the application does), the newest transcript line, the step area, and the union of both.
 */
const measureReveal = async (
  page: Page,
): Promise<{
  vh: number
  headerBottom: number
  room: number
  newest: { top: number; bottom: number }
  step: { top: number; bottom: number }
  unionHeight: number
}> => {
  const vh = await page.evaluate(() => window.innerHeight)
  const headerBottom = await page.evaluate(() => {
    const header = document.querySelector('header')
    return header === null ? 0 : header.getBoundingClientRect().bottom
  })
  const offset = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return Number.parseFloat(root.getPropertyValue('--softn-space-24')) * Number.parseFloat(root.fontSize)
  })
  const newest = await boxOf(flowLines(page).last())
  const step = await boxOf(stepArea(page))
  const unionHeight = Math.max(newest.bottom, step.bottom) - Math.min(newest.top, step.top)
  return { vh, headerBottom, room: vh - (headerBottom + offset), newest, step, unionHeight }
}

/**
 * Asserts the reveal of a booking step. When the union of the newest transcript line and the step
 * fits the room under the sticky header, the block is revealed and both sit below the header. When
 * it outgrows the room, the step is revealed alone: the control the flow focuses leads, and the
 * newest line may sit under the header. Either way the control keeps the foot gap above the bottom
 * edge, and the next section stays below the fold.
 */
const assertReveal = async (page: Page, control: Locator): Promise<void> => {
  await control.waitFor({ state: 'visible', timeout: 15_000 })
  await settleScroll(page)

  const { vh, headerBottom, room, newest, step, unionHeight } = await measureReveal(page)
  const controlBox = await boxOf(control)

  if (unionHeight > room) {
    // Step-alone branch: the union outgrows the room, so the step is revealed alone and the newest
    // line sits above it, possibly under the header.
    expect(step.top, 'the step revealed alone leads below the header').toBeGreaterThanOrEqual(headerBottom - 1)
    expect(newest.bottom, 'the newest line sits above the revealed step').toBeLessThanOrEqual(step.top + 1)
  } else {
    expect(newest.top, 'newest message below the sticky header').toBeGreaterThanOrEqual(headerBottom - 1)
    expect(newest.bottom, 'newest message inside the viewport').toBeLessThanOrEqual(vh + 1)
  }
  expect(controlBox.top, 'step control below the sticky header').toBeGreaterThanOrEqual(headerBottom - 1)
  expect(controlBox.bottom, 'step control inside the viewport').toBeLessThanOrEqual(vh + 1)
  // The control the flow focused must be the one on screen: a focus landing off-screen is the
  // overflow defect the code review flagged (WCAG 2.4.7).
  const focusIsControl = await control.evaluate((element) => element === document.activeElement)
  expect(focusIsControl, 'the flow focused the step control it revealed').toBe(true)

  // Foot gap: the reveal stops the step area (its 32 px bottom padding included) on the bottom edge,
  // so the area's last content — the control has a helper line under it — clears the edge by the
  // token, and the control itself by at least that much. When nothing had to scroll, the control
  // sits higher.
  expect(controlBox.bottom, 'the control never touches the bottom edge').toBeLessThanOrEqual(
    vh - (FOOT_GAP_PX - TOLERANCE_PX),
  )
  const padding = await stepArea(page).evaluate((element) => getComputedStyle(element).paddingBlockEnd)
  expect(padding, 'the step carries the 32 px foot gap token').toBe(`${FOOT_GAP_PX}px`)
  if (step.bottom > vh + 1) {
    // The step alone is taller than the room under the header: it leads with its own top and spills
    // below the fold; the focused control stays visible (asserted above).
    expect(step.top, 'the overflowing step leads with its top under the header').toBeGreaterThanOrEqual(
      headerBottom - 1,
    )
  } else {
    expect(step.bottom, 'the step area never spills below the fold').toBeLessThanOrEqual(vh + 1)
  }

  const nextTop = await boxOf(nextSection(page))
  expect(nextTop.top, 'the next section stays below the fold').toBeGreaterThanOrEqual(vh - 1)
  expect(await page.evaluate(() => document.documentElement.scrollLeft), 'no lateral scroll').toBe(0)
}

/** The four viewports of the acceptance, each walked with and without reduced motion. */
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 700 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
] as const

test.describe('assistant section: scroll reveal (issue #157)', () => {
  for (const viewport of VIEWPORTS) {
    for (const reducedMotion of [false, true]) {
      test(`a chatbot answer moves nothing at ${viewport.width}x${viewport.height}${
        reducedMotion ? ' (reduced motion)' : ''
      }`, async ({ page }) => {
        await mockEndpoints(page)
        await page.setViewportSize({ ...viewport })
        if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/preview')
        await expect(agentSection(page)).toBeVisible()

        // The visitor sits in the section with the composer just above the bottom edge: the answer
        // pushes the conversation down, exactly the situation #157 bounced the page for.
        await page.evaluate((composerId) => {
          const composer = document.getElementById(composerId)
          if (composer === null) throw new Error('no composer')
          const bottom = composer.getBoundingClientRect().bottom + window.scrollY
          window.scrollTo({ top: Math.max(0, bottom - window.innerHeight + 40), behavior: 'instant' })
        }, AGENT_QUESTION_INPUT_ID)
        const before = await page.evaluate(() => window.scrollY)

        await agentSection(page).getByRole('button', { name: chatbot.suggestions.process }).click()
        await expect(page.getByText(ANSWER)).toBeVisible()
        await settleScroll(page)

        await expect
          .poll(() => page.evaluate(() => window.scrollY), {
            timeout: 8_000,
            message: 'the page did not move for the answer',
          })
          .toBe(before)
        const nextTop = await boxOf(nextSection(page))
        expect(nextTop.top, 'the next section was not brought into view').toBeGreaterThanOrEqual(
          (await page.evaluate(() => window.innerHeight)) - 1,
        )
      })

      test(`every booking step reveals shortest at ${viewport.width}x${viewport.height}${
        reducedMotion ? ' (reduced motion)' : ''
      }`, async ({ page }) => {
        test.setTimeout(120_000)
        await mockEndpoints(page)
        await page.setViewportSize({ ...viewport })
        if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/preview')

        await page.getByRole('button', { name: chatbot.suggestions.book }).click()
        const accept = bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })
        await assertReveal(page, accept)

        await accept.click()
        const need = page.getByLabel(chatbot.booking.steps.need.field)
        await assertReveal(page, need)

        await need.fill('Automatiser mes devis')
        await bookingRegion(page).getByRole('button', { name: agent.sendLabel }).click()
        await assertReveal(page, stepControl(page))

        await slotChip(page).first().click()
        const firstName = page.getByLabel(chatbot.booking.steps.firstName.field)
        await assertReveal(page, firstName)

        // Closing the flow: the composer takes the focus back, in view.
        await bookingRegion(page).getByRole('button', { name: chatbot.booking.cancel }).click()
        await composer(page).waitFor({ state: 'visible', timeout: 15_000 })
        await settleScroll(page)
        const composerBox = await boxOf(composer(page))
        const focusIsComposer = await composer(page).evaluate((element) => element === document.activeElement)
        expect(focusIsComposer, 'the composer holds the focus after the flow closes').toBe(true)
        const vh = await page.evaluate(() => window.innerHeight)
        expect(composerBox.top, 'composer below the sticky header').toBeGreaterThanOrEqual(
          (await page.evaluate(() => {
            const header = document.querySelector('header')
            return header === null ? 0 : header.getBoundingClientRect().bottom
          })) - 1,
        )
        expect(composerBox.bottom, 'composer inside the viewport').toBeLessThanOrEqual(vh + 1)
      })
    }
  }

  test('the step is revealed alone when the union outgrows the room at 375x667', async ({ page }) => {
    await mockEndpoints(page)
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/preview')

    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    const accept = bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })
    await accept.waitFor({ state: 'visible', timeout: 15_000 })
    await accept.click()
    const need = page.getByLabel(chatbot.booking.steps.need.field)
    await need.waitFor({ state: 'visible', timeout: 15_000 })
    await need.fill(LONG_NEED)
    await bookingRegion(page).getByRole('button', { name: agent.sendLabel }).click()

    // The cap-length visitor line plus the chooser outgrow the room under the header, so the reveal
    // runs its step-alone branch: the control the flow focuses (the picked day card) leads, and the
    // newest line may sit under the header. The precondition is asserted first, so the test proves
    // it exercises that branch and is not a duplicate of the walk.
    await slotChip(page).first().waitFor({ state: 'visible', timeout: 15_000 })
    await settleScroll(page)
    const { vh, headerBottom, room, newest, step, unionHeight } = await measureReveal(page)
    expect(unionHeight, 'the union of the newest line and the step outgrows the room').toBeGreaterThan(room)

    const controlBox = await boxOf(stepControl(page))
    expect(newest.bottom, 'the newest line sits above the revealed step').toBeLessThanOrEqual(step.top + 1)
    expect(controlBox.bottom, 'the focused day card is inside the viewport').toBeLessThanOrEqual(vh)
    expect(controlBox.top, 'the focused day card is below the sticky header').toBeGreaterThanOrEqual(headerBottom - 1)
    const focusIsControl = await stepControl(page).evaluate((element) => element === document.activeElement)
    expect(focusIsControl, 'the flow focused the control it revealed').toBe(true)
  })
})
