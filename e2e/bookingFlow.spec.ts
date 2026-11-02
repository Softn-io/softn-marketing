/**
 * QA coverage of the reservation flow inside the assistant section (GitHub issues #17 and #18).
 *
 * The unit tests (`components/sections/Agent/tests/BookingFlow.test.tsx`) prove the hook contract
 * in jsdom. What only a real browser proves is covered here, on `/preview`, with the two booking
 * endpoints mocked through `page.route`: no run of this suite can reach Google or Baserow.
 *
 * - The booking chip, the hero CTA and the offer-sheet CTA open the flow, and none of them calls
 *   `/api/assistant`: a booking never goes through the model.
 * - The regressions Mel found by hand, each on the real page: typed text adds no line before a
 *   valid submit; a step's question is absent until the previous step is submitted; the consent
 *   message stays after accepting, followed by the visitor's accept line and the confirmation; and
 *   the accept/decline pair sits centred on one line at 1280 px, stacked flush at 375 px.
 * - The pacing, driven by a fake clock: one message at a time with the typing indicator for about
 *   700 ms (`BOOKING_TYPING_DELAY_MS`), a step's control hidden until its question shows and then
 *   focused, the newest message scrolled into view, and — under `prefers-reduced-motion: reduce` —
 *   no indicator and no delay at all.
 * - A keyboard-only walk through every step, with focus landing on the control of the new step;
 *   Escape, the cancel button and declining the consent return to the conversation with nothing sent.
 * - The slot states: a page of chips (3 to 5), «voir plus de créneaux», an empty horizon, an availability
 *   failure with its retry, and a slot taken that reloads a fresh list.
 * - The confirmation states: a booking failure with its retry, the invalid e-mail and phone
 *   messages, and the honeypot that stays out of the Tab order.
 * - No personal answer ever reaches `/api/assistant`, including when the visitor asks a question
 *   after the flow — the promise the consent copy makes, so it is blocking.
 * - No third-party request fires in the browser during the whole flow, the booking request body
 *   carries no `consentAt` (the server stamps the instant), and an axe pass keeps the section clean.
 * - Two simultaneous confirmations of one slot: the UI keeps the confirm button disabled while
 *   confirming, so a double click cannot send the same booking twice.
 * - The recap's single edit link, keyboard only: the chooser opens with Enter, picking a chip lands
 *   on the prefilled field, Escape must close only the chooser and keep the flow (the Escape
 *   assertion pins the defect reported in `.orchestration/reports/qa/qa-18.md` round 4 until it is
 *   fixed), and the full edit challenge — one edit per answer type with a skipped optional answer —
 *   sends every edited and kept value in one booking body.
 * - Two themes and `prefers-reduced-motion`: the flow's transitions stop under reduce.
 * - Spacing at 375, 768 and 1280 px: every computed length is a package space token, or a clamp
 *   interpolating between two token bounds (the section's own rhythm, the same fluid clamp Mel
 *   accepted for the hero). Step screenshots at 375 and 1280 px are written for Mel in
 *   `.orchestration/reports/qa/screenshots-18/` when `QA_BOOKING_SCREENSHOTS` is set, so the suite
 *   stays read-only in CI.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { SECTION_IDS } from '../lib/anchors'
import { interpolate } from '../lib/interpolate'
import { ASSISTANT_NAME, chatbot } from '../locales/fr/chatbot'
import { offers } from '../locales/fr/offers'
import { withAssistantName } from '../components/sections/Agent/data/agentMessages'
import { findFreeSlots, type BookingSlot } from '../lib/booking/availability'
import { BOOKING_RULES } from '../lib/booking/rules'
import { BOOKING_TYPING_DELAY_MS } from '../components/sections/Agent/hooks/useBookingFlow'

/**
 * Fills the placeholders of a locale template with the values the UI renders, so a
 * `toContainText` comparison compares the sentence the visitor reads.
 *
 * The copy renders `{contactPageLink}` as the contact-page link labelled
 * `chatbot.contactPageLinkLabel` (`AgentMessageText.tsx`) and `{assistantName}` as
 * `ASSISTANT_NAME`: comparing against the raw template fails on every such sentence. Both
 * placeholders are filled in one call, because `withAssistantName` alone throws on a template
 * holding `{contactPageLink}` — `interpolate` refuses every placeholder without a value.
 */
const filled = (template: string): string =>
  interpolate(template, { contactPageLink: chatbot.contactPageLinkLabel, assistantName: ASSISTANT_NAME })

/** Slots the mocked availability answers: the first eight free slots the rules offer. */
const SLOTS: readonly BookingSlot[] = findFreeSlots({
  rules: BOOKING_RULES,
  busy: [],
  bookedCallsPerDay: {},
  now: new Date('2026-11-02T09:00:00Z'),
  limit: 8,
})

/** One answer of a mocked endpoint: a status and a body. */
type MockAnswer = { status: number; body: unknown }

/** A booking answer may be given outright, computed per call, or held until the test releases it. */
type MockAnswerSource = MockAnswer | (() => MockAnswer) | Promise<MockAnswer>

/** Every call the page makes to the three endpoints. */
type RecordedCalls = {
  slotsCalls: number
  bookingCalls: { readonly body: unknown }[]
  assistantCalls: { readonly body: unknown }[]
}

/** Answers the visitor gives to the flow, in fictional values. */
const ANSWERS = {
  need: 'Automatiser mes devis',
  firstName: 'Camille',
  lastName: 'Test',
  email: 'camille.test@example.fr',
  phone: '0601020304',
} as const

/** Where the screenshots for Mel land when `QA_BOOKING_SCREENSHOTS` is set. */
const SHOT_DIR = process.env.QA_BOOKING_SCREENSHOTS_DIR ?? '.orchestration/reports/qa/screenshots-18'

/** The machine-known viewport widths of the spacing audit (role contract 4a-1). */
const SPACING_VIEWPORTS = [375, 768, 1280] as const

/** Viewports Mel asked for the step screenshots, at 375 and 1280 px. */
const SHOT_VIEWPORTS = [375, 1280] as const

/** The assistant section, which holds the conversation and the reservation flow. */
const assistantSection = (page: Page): Locator => page.locator(`section#${SECTION_IDS.agent}`)

/** The flow region, named by the locale like the chip that opens it (`BookingFlow.tsx`). */
const bookingRegion = (page: Page): Locator => page.getByRole('region', { name: chatbot.suggestions.book })

/** One slot chip of the slot step (`BookingSlots.tsx`). */
const slotChip = (page: Page): Locator => bookingRegion(page).locator('[data-booking-slot]')

/** The conversation list, named by the locale with the assistant name interpolated. */
const conversationList = (page: Page): Locator =>
  page.getByRole('list', { name: withAssistantName(chatbot.panel.ariaLabel) })

/** The composer input, back once the flow is closed (`AgentComposer.tsx`). */
const composer = (page: Page): Locator => page.locator('#agent-question')

/** The honeypot input: never reachable, never visible (`BookingFlow.tsx`). */
const honeypot = (page: Page): Locator => page.locator('[data-booking-honeypot]')

/** The conversation notice the conversation shows once the flow is ended or refused. */
const conversationNotice = (page: Page): Locator => assistantSection(page).getByRole('status')

/** The lines of the flow's own transcript, excluding the typing-indicator line. */
const flowLines = (page: Page): Locator =>
  bookingRegion(page).locator('[data-booking-transcript] > li:not([data-booking-typing])')

/**
 * Mocks the two booking endpoints (the flow never reaches Google or Baserow this way) and records
 * the assistant endpoint, which the flow must never call. The `slots` and `booking` answers accept
 * a value, a function returning one, or a promise held until the test releases it, so a test can
 * replay a failure, an empty list, or freeze a confirmation in flight.
 */
const mockBooking = async (
  page: Page,
  answer: {
    slots: MockAnswerSource
    booking: MockAnswerSource
  },
): Promise<RecordedCalls> => {
  const calls: RecordedCalls = { slotsCalls: 0, bookingCalls: [], assistantCalls: [] }
  const resolve = async (given: MockAnswerSource): Promise<MockAnswer> => {
    if (given instanceof Promise) return given
    if (typeof given === 'function') return given()
    return given
  }

  await page.route('**/api/booking/slots', async (route: Route) => {
    calls.slotsCalls += 1
    const given = await resolve(answer.slots)
    await route.fulfill({
      status: given.status,
      contentType: 'application/json',
      body: JSON.stringify(given.body),
    })
  })

  await page.route('**/api/booking', async (route: Route) => {
    calls.bookingCalls = [...calls.bookingCalls, { body: await route.request().postDataJSON() }]
    const given = await resolve(answer.booking)
    await route.fulfill({
      status: given.status,
      contentType: 'application/json',
      body: JSON.stringify(given.body),
    })
  })

  await page.route('**/api/assistant', async (route: Route) => {
    calls.assistantCalls = [...calls.assistantCalls, { body: await route.request().postDataJSON() }]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ answer: 'Réponse du modèle.' }),
    })
  })

  return calls
}

/** The happy-path mocks: 8 slots, one booking. */
const mockHappyPath = async (page: Page): Promise<RecordedCalls> =>
  mockBooking(page, {
    slots: () => ({ status: 200, body: { slots: SLOTS } }),
    booking: () => ({ status: 200, body: { booked: true } }),
  })

/**
 * The consent message as it renders: its privacy-policy placeholder is replaced by the words its
 * inline link carries, so an assertion compares what a visitor reads, not the raw template.
 */
const CONSENT_MESSAGE = chatbot.consent.message.replace('{privacyPolicyLink}', chatbot.consent.link.inlineLabel)

/** Opens the recap's single edit link and picks one answer to change, by its row label. */
const editAnswer = async (page: Page, label: string): Promise<void> => {
  await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit }).click()
  await bookingRegion(page).getByRole('button', { name: label }).click()
}

/** Accepts the consent step. */
const acceptConsent = async (page: Page): Promise<void> => {
  await bookingRegion(page).getByRole('button', { name: chatbot.consent.accept }).click()
}

/** Types the need and sends it, waiting for the mocked slots to arrive. */
const answerNeed = async (page: Page): Promise<void> => {
  await page.getByLabel(chatbot.booking.steps.need.field).fill(ANSWERS.need)
  await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
  await expect(slotChip(page).first()).toBeVisible()
}

/** Picks the first slot chip, then answers the identity questions up to the recap. */
const answerIdentity = async (page: Page): Promise<void> => {
  await slotChip(page).first().click()
  await page.getByLabel(chatbot.booking.steps.firstName.field).fill(ANSWERS.firstName)
  await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
  await page.getByLabel(chatbot.booking.steps.lastName.field).fill(ANSWERS.lastName)
  await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
  await page.getByLabel(chatbot.booking.steps.email.field).fill(ANSWERS.email)
  await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
  // The phone is answered so the walk meets an answered optional question; a skipped one now has
  // no recap row either, but the «Modifier une réponse» chooser offers it all the same.
  await page.getByLabel(chatbot.booking.steps.phone.field).fill(ANSWERS.phone)
  await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
  await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
  await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
  await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
}

/**
 * Box of one control, plus whether its own label is fully rendered inside it.
 *
 * Three things tell a clipped label apart from a wrapped one: the box itself (does it end inside the
 * viewport), `scrollWidth` against `clientWidth` (does the content overflow its own box), and the
 * client rectangles of the text lines (does a line run past the box, which is what `white-space:
 * nowrap` does on a narrow screen). A wrapped label has several line rectangles, all inside the box.
 */
const measureControl = async (
  locator: Locator,
): Promise<{
  left: number
  right: number
  top: number
  bottom: number
  height: number
  lineCount: number
  insideOwnBox: boolean
  overflowInside: number
}> =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const lines = [...range.getClientRects()]
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      height: box.height,
      lineCount: lines.length,
      insideOwnBox: lines.every((line) => line.left >= box.left - 1 && line.right <= box.right + 1),
      overflowInside: element.scrollWidth - element.clientWidth,
    }
  })

/** Tab presses until `target` holds DOM focus, so a test never hardcodes the number of stops. */
const tabUntilFocused = async (page: Page, target: Locator, maxPresses = 16): Promise<void> => {
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('Tab never reached the expected control')
}

test.describe('booking flow: opening', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the booking chip opens the flow, with no call to the assistant and none to the calendar', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')

    await page.getByRole('button', { name: chatbot.suggestions.book }).click()

    await expect(bookingRegion(page)).toBeVisible()
    await expect(bookingRegion(page)).toContainText(chatbot.booking.intro)
    await expect(bookingRegion(page)).toContainText(CONSENT_MESSAGE)
    await expect(bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })).toBeFocused()
    expect(calls.slotsCalls).toBe(0)
    expect(calls.bookingCalls).toEqual([])
    expect(calls.assistantCalls).toEqual([])
  })

  test('the hero CTA opens the flow, with no call to the assistant', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')

    await page.locator('#hero-cta').click()
    await expect(page).toHaveURL(new RegExp(`#${SECTION_IDS.agent}`))

    await expect(bookingRegion(page)).toBeVisible()
    await expect(bookingRegion(page)).toContainText(CONSENT_MESSAGE)
    expect(calls.assistantCalls).toEqual([])
    expect(calls.slotsCalls).toBe(0)
    expect(calls.bookingCalls).toEqual([])
  })

  test('the offer-sheet CTA opens the flow, with no call to the assistant', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')

    await page.getByRole('button', { name: offers.create.cardTitle }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('link', { name: offers.create.sheet.cta.primary }).click()

    await expect(sheet).not.toBeVisible()
    await expect(page).toHaveURL(new RegExp(`#${SECTION_IDS.agent}`))
    await expect(bookingRegion(page)).toBeVisible()
    await expect(bookingRegion(page)).toContainText(CONSENT_MESSAGE)
    expect(calls.assistantCalls).toEqual([])
    expect(calls.slotsCalls).toBe(0)
    expect(calls.bookingCalls).toEqual([])
  })
})

test.describe('booking flow: regressions Mel found', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('typing in a field adds no line to any transcript before a valid submit', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await expect(page.getByLabel(chatbot.booking.steps.need.field)).toBeVisible()

    // The draft lives in the field only: neither the flow's own transcript nor the conversation
    // shows a line for it, before the submit turns it into an answer.
    await page.getByLabel(chatbot.booking.steps.need.field).fill(ANSWERS.need)
    const flowTexts = await flowLines(page).allTextContents()
    expect(flowTexts.some((text) => text.includes(ANSWERS.need))).toBe(false)
    await expect(conversationList(page)).not.toContainText(ANSWERS.need)

    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()

    await expect(flowLines(page).last()).toContainText(ANSWERS.need)
    expect(calls.assistantCalls).toEqual([])
  })

  test('each question appears only once the previous step is submitted, all the way to the recap', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()

    // The questions of the steps ahead are nowhere on screen at the consent.
    await expect(bookingRegion(page)).toContainText(CONSENT_MESSAGE)
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.need.question)
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.slot.question)

    await acceptConsent(page)
    await expect(page.getByLabel(chatbot.booking.steps.need.field)).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.slot.question)
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.firstName.question)

    await page.getByLabel(chatbot.booking.steps.need.field).fill(ANSWERS.need)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(slotChip(page).first()).toBeVisible()
    await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.slot.question)
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.firstName.question)

    await slotChip(page).first().click()
    await expect(page.getByLabel(chatbot.booking.steps.firstName.field)).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.lastName.question)

    await page.getByLabel(chatbot.booking.steps.firstName.field).fill(ANSWERS.firstName)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(page.getByLabel(chatbot.booking.steps.lastName.field)).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.email.question)

    await page.getByLabel(chatbot.booking.steps.lastName.field).fill(ANSWERS.lastName)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(page.getByLabel(chatbot.booking.steps.email.field)).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.phone.question)

    await page.getByLabel(chatbot.booking.steps.email.field).fill(ANSWERS.email)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(page.getByLabel(chatbot.booking.steps.phone.field)).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.structure.question)

    await page.getByLabel(chatbot.booking.steps.phone.field).fill(ANSWERS.phone)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page).getByRole('button', { name: 'PME' })).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.role.question)
    await expect(bookingRegion(page).getByRole('button', { name: 'Dirigeant' })).toHaveCount(0)

    await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
    await expect(bookingRegion(page).getByRole('button', { name: 'Dirigeant' })).toBeVisible()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toHaveCount(0)

    await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    expect(calls.bookingCalls).toEqual([])
  })

  test('the consent message stays after accepting, then the visitor line, then the confirmation', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await expect(bookingRegion(page)).toContainText(CONSENT_MESSAGE)

    await acceptConsent(page)

    // The consent message is still on screen, now followed by the visitor's accept line and the
    // assistant's confirmation, in that order, on the flow's own transcript.
    await expect(flowLines(page).last()).toContainText(chatbot.consent.accepted)
    const texts = await flowLines(page).allTextContents()
    const messageIndex = texts.findIndex((text) => text.includes(CONSENT_MESSAGE))
    const answerIndex = texts.findIndex((text) => text.endsWith(chatbot.consent.accept))
    const acceptedIndex = texts.findIndex((text) => text.includes(chatbot.consent.accepted))
    expect(messageIndex).toBeGreaterThanOrEqual(0)
    expect(answerIndex).toBeGreaterThan(messageIndex)
    expect(acceptedIndex).toBeGreaterThan(answerIndex)
    expect(calls.slotsCalls).toBe(0)
  })

  for (const width of [768, 1280] as const) {
    test(`accept and decline share one line, centred against each other, at ${width} px`, async ({ page }) => {
      const calls = await mockHappyPath(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await page.getByRole('button', { name: chatbot.suggestions.book }).click()

      const accept = bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })
      const decline = bookingRegion(page).getByRole('button', { name: chatbot.consent.decline })
      await expect(accept).toBeVisible()
      const [acceptBox, declineBox] = await Promise.all([accept.boundingBox(), decline.boundingBox()])
      expect(acceptBox).not.toBeNull()
      expect(declineBox).not.toBeNull()
      const acceptRect = acceptBox as { x: number; y: number; width: number; height: number }
      const declineRect = declineBox as { x: number; y: number; width: number; height: number }

      // Same line: their vertical centres match, so neither floats above the other.
      const centre = (box: { y: number; height: number }): number => box.y + box.height / 2
      expect(
        Math.abs(centre(acceptRect) - centre(declineRect)),
        'the two controls are centred against each other',
      ).toBeLessThanOrEqual(2)
      expect(declineRect.x, 'the decline sits to the right of the accept button').toBeGreaterThan(
        acceptRect.x + acceptRect.width,
      )
      // The inline privacy link took the standalone one's place, and is a real, named link.
      const privacy = bookingRegion(page).getByRole('link', { name: chatbot.consent.link.inlineLabel })
      await expect(privacy).toBeVisible()
      expect(calls.slotsCalls).toBe(0)
    })
  }

  test('accept and decline are stacked flush left at 375 px', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()

    const accept = bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })
    const decline = bookingRegion(page).getByRole('button', { name: chatbot.consent.decline })
    await expect(accept).toBeVisible()
    const [acceptBox, declineBox] = await Promise.all([accept.boundingBox(), decline.boundingBox()])
    expect(acceptBox).not.toBeNull()
    expect(declineBox).not.toBeNull()
    const left = (box: { x: number }): number => box.x
    expect(
      Math.abs(left(declineBox as { x: number }) - left(acceptBox as { x: number })),
      'the decline is flush with the accept button',
    ).toBeLessThanOrEqual(1)
    expect((declineBox as { y: number }).y, 'the decline sits below the accept button').toBeGreaterThan(
      (acceptBox as { y: number }).y + (acceptBox as { height: number }).height,
    )
    expect(calls.slotsCalls).toBe(0)
  })
})

test.describe('booking flow: pacing', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('reveals one message per typing pause, with the control hidden until its question shows', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.clock.install()
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()

    // Nothing is on screen yet: the assistant is writing the introduction.
    await expect(bookingRegion(page).locator('[data-booking-typing]')).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.intro)
    await expect(bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })).toHaveCount(0)

    await page.clock.fastForward(BOOKING_TYPING_DELAY_MS)
    await expect(bookingRegion(page)).toContainText(chatbot.booking.intro)
    await expect(bookingRegion(page)).not.toContainText(CONSENT_MESSAGE)

    await page.clock.fastForward(BOOKING_TYPING_DELAY_MS)
    await expect(bookingRegion(page)).toContainText(CONSENT_MESSAGE)
    const accept = bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })
    await expect(accept).toBeVisible()
    await expect(accept).toBeFocused()

    // Accepting reveals the visitor line at once; the next assistant messages each take a pause,
    // and the need field appears only once its question is on screen, already focused.
    await accept.click()
    await page.clock.fastForward(1)
    await expect(flowLines(page).last()).toContainText(chatbot.consent.accept)
    await expect(page.getByLabel(chatbot.booking.steps.need.field)).toHaveCount(0)

    await page.clock.fastForward(BOOKING_TYPING_DELAY_MS)
    await expect(bookingRegion(page)).toContainText(chatbot.consent.accepted)
    await expect(page.getByLabel(chatbot.booking.steps.need.field)).toHaveCount(0)

    await page.clock.fastForward(BOOKING_TYPING_DELAY_MS)
    const field = page.getByLabel(chatbot.booking.steps.need.field)
    await expect(field).toBeVisible()
    await expect(field).toBeFocused()

    // The visitor's answer lands without a pause, then the indicator covers the assistant's question.
    await page.getByLabel(chatbot.booking.steps.need.field).fill(ANSWERS.need)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await page.clock.fastForward(1)
    await expect(flowLines(page).last()).toContainText(ANSWERS.need)
    await expect(bookingRegion(page).locator('[data-booking-typing]')).toBeVisible()
    await page.clock.fastForward(BOOKING_TYPING_DELAY_MS)
    await expect(slotChip(page).first()).toBeVisible()
    expect(calls.slotsCalls).toBe(1)
    expect(calls.assistantCalls).toEqual([])
  })

  for (const cfg of [
    { width: 375, height: 667, reducedMotion: false },
    { width: 375, height: 667, reducedMotion: true },
    { width: 1280, height: 720, reducedMotion: false },
    { width: 1280, height: 720, reducedMotion: true },
  ] as const) {
    test(`follows the newest message and step control at ${cfg.width}x${cfg.height}${cfg.reducedMotion ? ' (reduced motion)' : ''}`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const calls = await mockHappyPath(page)
      await page.setViewportSize({ width: cfg.width, height: cfg.height })
      if (cfg.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/preview')
      await page.getByRole('button', { name: chatbot.suggestions.book }).click()

      /** Waits until the smooth scroll animation has finished. */
      const waitScrollSettled = async (): Promise<void> => {
        await page.waitForFunction(
          () =>
            new Promise<boolean>((resolve) => {
              let last = window.scrollY
              const tick = (): void => {
                const now = window.scrollY
                if (now === last) resolve(true)
                else {
                  last = now
                  requestAnimationFrame(tick)
                }
              }
              requestAnimationFrame(tick)
            }),
          { timeout: 8000 },
        )
      }

      /**
       * After a reveal: the newest line and the current step's control sit fully inside the
       * viewport, below the sticky header, the section never shifts sideways, and the page really
       * scrolled whenever content was added below the fold.
       */
      const assertFollow = async (control: Locator, allowRightOverflow = false): Promise<void> => {
        await control.waitFor({ state: 'visible', timeout: 30_000 })
        await waitScrollSettled()
        const vh = await page.evaluate(() => window.innerHeight)
        const vw = await page.evaluate(() => window.innerWidth)
        const headerBottom = await page.evaluate(() => {
          const header = document.querySelector('header')
          return header === null ? 0 : header.getBoundingClientRect().bottom
        })
        const newestBox = await flowLines(page).last().boundingBox()
        const controlBox = await control.boundingBox()
        expect(newestBox).not.toBeNull()
        expect(controlBox).not.toBeNull()
        const newest = newestBox as { x: number; y: number; width: number; height: number }
        const box = controlBox as { x: number; y: number; width: number; height: number }
        expect(newest.y + newest.height, 'newest message is inside the viewport').toBeLessThanOrEqual(vh)
        expect(newest.y, 'newest message is below the sticky header').toBeGreaterThanOrEqual(headerBottom - 1)
        expect(newest.x, 'newest message inside viewport horizontally').toBeGreaterThanOrEqual(-1)
        expect(newest.x + newest.width, 'newest message inside viewport horizontally').toBeLessThanOrEqual(vw + 1)
        expect(box.y + box.height, 'step control is inside the viewport').toBeLessThanOrEqual(vh)
        expect(box.y, 'step control is below the sticky header').toBeGreaterThanOrEqual(headerBottom - 1)
        expect(box.x, 'step control inside viewport horizontally').toBeGreaterThanOrEqual(-1)
        if (!allowRightOverflow) {
          expect(box.x + box.width, 'step control inside viewport horizontally').toBeLessThanOrEqual(vw + 1)
        }
        const lateral = await page.evaluate(() => {
          const region = document.querySelector('[aria-label="Prendre rendez-vous"]')
          const section = region?.closest('section')
          return {
            section: section?.scrollLeft ?? 0,
            document: document.documentElement.scrollLeft,
          }
        })
        expect(lateral.section, 'section scrollLeft stays 0').toBe(0)
        expect(lateral.document, 'document scrollLeft stays 0').toBe(0)
      }

      /**
       * A reveal must move the page down whenever content was added below the fold.
       *
       * These walks run on a mocked clock, and the page's own rAF is faked with it, so the browser's
       * smooth scroll is given real time to land before the position is read: polling on the driver's
       * clock waits for the animation instead of catching it mid-flight.
       */
      const assertScrollMoved = async (preScrollY: number): Promise<void> => {
        await expect
          .poll(async () => Math.round(await page.evaluate(() => window.scrollY)), {
            message: 'window scrolled down to follow the new message',
            timeout: 5000,
          })
          .toBeGreaterThan(preScrollY)
      }

      await assertFollow(bookingRegion(page).getByRole('button', { name: chatbot.consent.accept }), cfg.width === 375)

      const preAccept = await page.evaluate(() => window.scrollY)
      await acceptConsent(page)
      await expect(page.getByLabel(chatbot.booking.steps.need.field)).toBeVisible()
      await assertFollow(page.getByLabel(chatbot.booking.steps.need.field))
      await assertScrollMoved(preAccept)

      const preNeed = await page.evaluate(() => window.scrollY)
      await page.getByLabel(chatbot.booking.steps.need.field).fill(ANSWERS.need)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await expect(slotChip(page).first()).toBeVisible()
      await assertFollow(slotChip(page).first())
      await assertScrollMoved(preNeed)

      // The visitor scrolls back to the top; the next message must bring the page back down. The
      // click is dispatched, not clicked, so Playwright's own auto-scroll cannot fake the return.
      await page.evaluate(() => window.scrollTo(0, 0))
      const preChip = await page.evaluate(() => window.scrollY)
      await slotChip(page).first().dispatchEvent('click')
      await expect(page.getByLabel(chatbot.booking.steps.firstName.field)).toBeVisible()
      await assertFollow(page.getByLabel(chatbot.booking.steps.firstName.field))
      await assertScrollMoved(preChip)

      await page.getByLabel(chatbot.booking.steps.firstName.field).fill(ANSWERS.firstName)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await expect(page.getByLabel(chatbot.booking.steps.lastName.field)).toBeVisible()
      await assertFollow(page.getByLabel(chatbot.booking.steps.lastName.field))

      await page.getByLabel(chatbot.booking.steps.lastName.field).fill(ANSWERS.lastName)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await expect(page.getByLabel(chatbot.booking.steps.email.field)).toBeVisible()
      await assertFollow(page.getByLabel(chatbot.booking.steps.email.field))

      await page.getByLabel(chatbot.booking.steps.email.field).fill(ANSWERS.email)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await expect(page.getByLabel(chatbot.booking.steps.phone.field)).toBeVisible()
      await assertFollow(page.getByLabel(chatbot.booking.steps.phone.field))

      await page.getByLabel(chatbot.booking.steps.phone.field).fill(ANSWERS.phone)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await expect(bookingRegion(page).getByRole('button', { name: 'PME' })).toBeVisible()
      await assertFollow(bookingRegion(page).getByRole('button', { name: 'PME' }))

      await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
      await expect(bookingRegion(page).getByRole('button', { name: 'Dirigeant' })).toBeVisible()
      await assertFollow(bookingRegion(page).getByRole('button', { name: 'Dirigeant' }))

      await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
      await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
      await assertFollow(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title }))

      // Scroll to the top once more before confirming: the flow must bring the visitor back. The
      // click is dispatched, not clicked, so Playwright's own auto-scroll cannot fake the return.
      await page.evaluate(() => window.scrollTo(0, 0))
      const preConfirm = await page.evaluate(() => window.scrollY)
      await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).dispatchEvent('click')
      await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()
      // The success heading carries `data-booking-focus`: it is the control the flow itself brings
      // into view and focuses, so it is the control asserted here.
      await assertFollow(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title }))
      await assertScrollMoved(preConfirm)

      expect(calls.bookingCalls).toHaveLength(1)
      expect(calls.assistantCalls).toEqual([])
    })
  }

  test('shows no typing indicator and takes no pause under prefers-reduced-motion: reduce', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.clock.install()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()

    // One tick is enough: the whole script is already on screen, without any indicator.
    await page.clock.fastForward(1)
    await expect(bookingRegion(page)).toContainText(chatbot.booking.intro)
    await expect(bookingRegion(page)).toContainText(CONSENT_MESSAGE)
    await expect(bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })).toBeVisible()
    await expect(bookingRegion(page).locator('[data-booking-typing]')).toHaveCount(0)

    await acceptConsent(page)
    await page.clock.fastForward(1)
    const field = page.getByLabel(chatbot.booking.steps.need.field)
    await expect(field).toBeVisible()
    await expect(bookingRegion(page).locator('[data-booking-typing]')).toHaveCount(0)
    expect(calls.slotsCalls).toBe(0)
    expect(calls.assistantCalls).toEqual([])
  })
})

test.describe('booking flow: keyboard-only walk', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('walks every step with the keyboard, focus landing on the control of each new step', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')

    // Opening the flow with the booking chip puts focus on the accept button.
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    const accept = bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })
    await expect(accept).toBeFocused()

    // Enter accepts the consent; focus lands on the need field.
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(chatbot.booking.steps.need.field)).toBeFocused()

    // Enter submits the need; the flow shows the slots and the container takes focus.
    await page.keyboard.type(ANSWERS.need)
    await page.keyboard.press('Enter')
    await expect(slotChip(page).first()).toBeVisible()
    await expect(bookingRegion(page)).toBeFocused()

    // Tab reaches the first slot chip; Enter picks it and focus moves to the first name field.
    await tabUntilFocused(page, slotChip(page).first())
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(chatbot.booking.steps.firstName.field)).toBeFocused()

    await page.keyboard.type(ANSWERS.firstName)
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(chatbot.booking.steps.lastName.field)).toBeFocused()

    await page.keyboard.type(ANSWERS.lastName)
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(chatbot.booking.steps.email.field)).toBeFocused()

    await page.keyboard.type(ANSWERS.email)
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(chatbot.booking.steps.phone.field)).toBeFocused()

    // The send button is disabled on an empty phone, so Tab reaches «Passer cette question».
    await tabUntilFocused(page, bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip }))
    await page.keyboard.press('Enter')

    // Chip steps: the container takes focus, Tab reaches the first option.
    await expect(bookingRegion(page)).toBeFocused()
    await tabUntilFocused(page, bookingRegion(page).getByRole('button', { name: 'PME' }))
    await page.keyboard.press('Enter')
    await expect(bookingRegion(page)).toBeFocused()
    await tabUntilFocused(page, bookingRegion(page).getByRole('button', { name: 'Dirigeant' }))
    await page.keyboard.press('Enter')

    // Recap: Tab reaches the confirm button, Enter sends the booking.
    await tabUntilFocused(page, bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }))
    await page.keyboard.press('Enter')

    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()
    expect(calls.bookingCalls).toHaveLength(1)
    expect(calls.slotsCalls).toBe(1)
    expect(calls.assistantCalls).toEqual([])
  })

  test('Escape and the cancel button return to the conversation with nothing sent', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')

    // Escape from the consent step: back to the conversation, nothing sent.
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await expect(bookingRegion(page)).toBeVisible()
    await expect(bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(bookingRegion(page)).toHaveCount(0)
    await expect(conversationList(page)).toBeVisible()
    await expect(conversationNotice(page)).toContainText(chatbot.booking.cancelled)
    await expect(composer(page)).toBeFocused()
    expect(calls.slotsCalls).toBe(0)
    expect(calls.bookingCalls).toEqual([])
    expect(calls.assistantCalls).toEqual([])

    // Reopen and abandon with the cancel button from a later step: same outcome, nothing sent.
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await expect(bookingRegion(page)).toBeVisible()
    await acceptConsent(page)
    await answerNeed(page)
    await expect(slotChip(page).first()).toBeVisible()
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.cancel }).click()
    await expect(bookingRegion(page)).toHaveCount(0)
    await expect(conversationList(page)).toBeVisible()
    await expect(conversationNotice(page)).toContainText(chatbot.booking.cancelled)
    await expect(composer(page)).toBeFocused()
    expect(calls.bookingCalls).toEqual([])
  })

  test('declining the consent returns to the conversation with nothing sent', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await expect(bookingRegion(page)).toBeVisible()

    await bookingRegion(page).getByRole('button', { name: chatbot.consent.decline }).click()

    await expect(bookingRegion(page)).toHaveCount(0)
    // The notice is `consent.declined`, whose `{contactPageLink}` renders as the contact link.
    await expect(conversationNotice(page)).toContainText(filled(chatbot.consent.declined))
    await expect(composer(page)).toBeFocused()
    expect(calls.slotsCalls).toBe(0)
    expect(calls.bookingCalls).toEqual([])
    expect(calls.assistantCalls).toEqual([])
  })

  test('the honeypot field is never reachable by Tab', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await expect(bookingRegion(page)).toBeVisible()

    // The honeypot sits outside the tab order and the accessibility tree: its wrapper is
    // `aria-hidden` and the input itself carries `tabindex="-1"`, so Tab skips it every time.
    const wrapper = honeypot(page).locator('xpath=..')
    await expect(wrapper).toHaveAttribute('aria-hidden', 'true')
    await expect(honeypot(page)).toHaveAttribute('tabindex', '-1')
    for (let press = 0; press < 20; press += 1) {
      await page.keyboard.press('Tab')
      const focused = await honeypot(page).evaluate((element) => element === document.activeElement)
      expect(focused, `Tab #${press + 1} landed on the honeypot`).toBe(false)
    }
    expect(calls.bookingCalls).toEqual([])
  })
})

test.describe('booking flow: assistant privacy', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a question asked after the flow never carries an answer of the flow to the model', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()

    // Back in the conversation: an ordinary question after the flow.
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.success.restart }).click()
    await expect(composer(page)).toBeVisible()
    await composer(page).fill('Comment se passe un projet ?')
    await assistantSection(page).getByRole('button', { name: 'Envoyer' }).click()

    // The model saw the question and its history, never an answer of the flow.
    expect(calls.assistantCalls).toHaveLength(1)
    const payload = JSON.stringify(calls.assistantCalls[0])
    expect(payload).not.toContain('Automatiser mes devis')
    expect(payload).not.toContain('Camille')
    expect(payload).not.toContain('camille.test@example.fr')
    expect(payload).not.toContain('Test')
    expect(payload).not.toContain(JSON.stringify(SLOTS[0]))
  })

  test('no third-party request fires in the browser during the whole flow', async ({ page }) => {
    const calls = await mockHappyPath(page)
    const external: string[] = []
    page.on('request', (request) => {
      const host = new URL(request.url()).hostname
      if (host !== 'localhost' && !host.startsWith('127.')) external.push(request.url())
    })

    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()

    expect(external, 'every request during the flow stayed on the site origin').toEqual([])
    expect(calls.bookingCalls).toHaveLength(1)
  })
})

test.describe('booking flow: slot and booking states', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('shows a page of 3 to 5 chips, then the rest behind «voir plus de créneaux», and books the pick', async ({
    page,
  }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)

    // BOOKING_SLOTS_PAGE_SIZE is 4: a page the proposal allows (3 to 5 chips).
    await expect(slotChip(page)).toHaveCount(4)
    const more = bookingRegion(page).getByRole('button', { name: chatbot.booking.slots.more })
    await expect(more).toBeVisible()

    await more.click()
    await expect(slotChip(page)).toHaveCount(SLOTS.length)
    await expect(bookingRegion(page).getByRole('button', { name: chatbot.booking.slots.more })).toHaveCount(0)

    // A picked slot reaches the recap and books, once.
    await answerIdentity(page)
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()

    expect(calls.bookingCalls).toHaveLength(1)
    const body = calls.bookingCalls[0]?.body as Record<string, unknown>
    expect(body['need']).toBe(ANSWERS.need)
    expect(body['email']).toBe(ANSWERS.email)
    expect(body['slot']).toBe(SLOTS[0]?.start)
    // The client never declares when the consent was given: the server stamps the instant itself.
    expect(JSON.stringify(body), 'the booking body carries no consentAt').not.toContain('consentAt')
  })

  test('answers an empty horizon as a state of its own, not an error', async ({ page }) => {
    const calls = await mockBooking(page, {
      slots: () => ({ status: 200, body: { slots: [] } }),
      booking: () => ({ status: 200, body: { booked: true } }),
    })
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    // The need is submitted without waiting for chips: the horizon is empty by design here.
    await page.getByLabel(chatbot.booking.steps.need.field).fill(ANSWERS.need)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()

    // The empty horizon is its own state, whose `{contactPageLink}` renders as the contact link.
    await expect(bookingRegion(page)).toContainText(filled(chatbot.booking.slots.none))
    await expect(slotChip(page)).toHaveCount(0)
    expect(calls.slotsCalls).toBe(1)
    expect(calls.bookingCalls).toEqual([])
  })

  test('recovers from an availability failure with the retry button', async ({ page }) => {
    const calls = await mockBooking(page, {
      slots: () =>
        calls.slotsCalls === 1
          ? { status: 503, body: { error: 'unavailable' } }
          : { status: 200, body: { slots: SLOTS } },
      booking: () => ({ status: 200, body: { booked: true } }),
    })
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await page.getByLabel(chatbot.booking.steps.need.field).fill(ANSWERS.need)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()

    await expect(bookingRegion(page)).toContainText(filled(chatbot.booking.slots.unavailable))
    await expect(slotChip(page)).toHaveCount(0)

    await bookingRegion(page).getByRole('button', { name: chatbot.error.retry }).click()
    await expect(slotChip(page).first()).toBeVisible()
    expect(calls.slotsCalls).toBe(2)
    expect(calls.bookingCalls).toEqual([])
  })

  test('a slot taken between two confirmations returns the visitor to a fresh list', async ({ page }) => {
    const calls = await mockBooking(page, {
      slots: () =>
        calls.slotsCalls === 1
          ? { status: 200, body: { slots: SLOTS } }
          : { status: 200, body: { slots: SLOTS.slice(1) } },
      booking: () =>
        calls.bookingCalls.length === 1
          ? { status: 409, body: { error: 'slot-taken' } }
          : { status: 200, body: { booked: true } },
    })
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)

    const firstChip = await slotChip(page).first().textContent()
    await answerIdentity(page)
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).click()

    await expect(bookingRegion(page)).toContainText(chatbot.error.slotTaken)
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toHaveCount(0)

    // A fresh list is loaded again, and the visitor picks a new slot to finish the booking.
    await expect(slotChip(page).first()).toBeVisible()
    const freshChip = await slotChip(page).first().textContent()
    expect(freshChip).not.toBe(firstChip)
    await expect(slotChip(page)).toHaveCount(4)
  })

  test('a booking failure keeps the recap, and the retry confirms on the second attempt', async ({ page }) => {
    const calls = await mockBooking(page, {
      slots: () => ({ status: 200, body: { slots: SLOTS } }),
      booking: () =>
        calls.bookingCalls.length === 1
          ? { status: 503, body: { error: 'unavailable' } }
          : { status: 200, body: { booked: true } },
    })
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)

    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).click()
    // The booking failure keeps the recap; its `{contactPageLink}` renders as the contact link.
    await expect(bookingRegion(page)).toContainText(filled(chatbot.error.booking))
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()

    await bookingRegion(page).getByRole('button', { name: chatbot.error.retry }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()
    expect(calls.bookingCalls).toHaveLength(2)
  })

  test('rejects a malformed e-mail and phone before anything is sent', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    // The identity steps come after the slot: first name, then last name, then e-mail.
    await answerIdentity(page)

    // The e-mail step is reached through the recap's edit link, then its «E-mail» choice.
    await editAnswer(page, chatbot.booking.steps.email.field)

    const email = page.getByLabel(chatbot.booking.steps.email.field)
    await email.fill('camille.test@example')
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.email.error)
    await expect(email).toHaveAttribute('aria-invalid', 'true')

    // A valid e-mail returns to the recap: changing one answer never walks the rest of the flow
    // again, and the phone is reached the same way, where its own error reports in place.
    await email.fill(ANSWERS.email)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    await editAnswer(page, chatbot.booking.steps.phone.field)
    const phone = page.getByLabel(chatbot.booking.steps.phone.field)
    await phone.fill('abc')
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.phone.error)

    // Nine digits, the length the old rule still let through, is refused like the short ones: the
    // recap stays out of reach until the number is a real one, and a valid number returns to it.
    await phone.fill('601020304')
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.phone.error)
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toHaveCount(0)

    await phone.fill('06 01 02 03 04')
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()

    expect(calls.bookingCalls).toEqual([])
  })

  test('refuses a short phone at the phone step itself, before anything is sent', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await slotChip(page).first().click()
    for (const [label, value] of [
      [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
      [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
      [chatbot.booking.steps.email.field, ANSWERS.email],
    ] as const) {
      await page.getByLabel(label).fill(value)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    }

    // The phone step of the normal walk: eight and nine digits both report in place, and neither
    // lets the flow move on to the structure question.
    const phone = page.getByLabel(chatbot.booking.steps.phone.field)
    for (const short of ['06010203', '601020304']) {
      await phone.fill(short)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.phone.error)
      await expect(phone).toHaveAttribute('aria-invalid', 'true')
      await expect(bookingRegion(page).getByRole('button', { name: 'PME' })).toHaveCount(0)
    }

    // A valid number moves on, and the recap keeps it.
    await phone.fill('06 01 02 03 04')
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
    await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    await expect(bookingRegion(page)).toContainText('06 01 02 03 04')
    expect(calls.bookingCalls).toEqual([])
  })

  test('reports the blur error in the recap edit flow, and a valid number brings the recap back', async ({ page }) => {
    await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)

    await editAnswer(page, chatbot.booking.steps.phone.field)
    const phone = page.getByLabel(chatbot.booking.steps.phone.field)
    await phone.fill('601020304')
    await page.keyboard.press('Tab')

    // Leaving the field reports the number and nothing else: the recap stays out of reach.
    await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.phone.error)
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toHaveCount(0)

    // Correcting the value clears the error, and submitting then returns to the recap.
    await phone.fill('06 01 02 03 04')
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.phone.error)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
  })

  test('reports an invalid e-mail on blur in the recap edit flow, and a valid one brings the recap back', async ({
    page,
  }) => {
    await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)

    await editAnswer(page, chatbot.booking.steps.email.field)
    const email = page.getByLabel(chatbot.booking.steps.email.field)
    await email.fill('a@b.c')
    await page.keyboard.press('Tab')

    // Leaving the field reports the address and nothing else: the recap stays out of reach.
    await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.email.error)
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toHaveCount(0)

    // Correcting the value clears the error, and submitting then returns to the recap.
    await email.fill(ANSWERS.email)
    await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.email.error)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
  })

  for (const width of [1280, 375] as const) {
    test(`reports an invalid e-mail on blur, and the cancel control still cancels under the pointer, at ${width} px`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const calls = await mockHappyPath(page)
      await page.setViewportSize({ width, height: width === 375 ? 667 : 800 })
      await page.goto('/preview')
      await page.getByRole('button', { name: chatbot.suggestions.book }).click()
      await acceptConsent(page)
      await answerNeed(page)
      await slotChip(page).first().click()
      for (const [label, value] of [
        [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
        [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
      ] as const) {
        await page.getByLabel(label).fill(value)
        await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      }

      // Leaving the field with the keyboard reports the address, and only reports it.
      const email = page.getByLabel(chatbot.booking.steps.email.field)
      await email.fill('a@b.c')
      await page.keyboard.press('Tab')
      await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.email.error)
      await expect(email).toHaveAttribute('aria-invalid', 'true')
      await expect(bookingRegion(page).getByLabel(chatbot.booking.steps.phone.field)).toHaveCount(0)

      // The real pointer case: the field holds the refused address and has the focus, so the click on
      // the cancel blurs it first, the error line lands under the input row, and the same click still
      // reaches the control it was aimed at.
      await email.fill('a@b.c')
      const cancel = bookingRegion(page).getByRole('button', { name: chatbot.booking.cancel })
      await cancel.scrollIntoViewIfNeeded()
      const aimed = await cancel.boundingBox()
      await page.mouse.click((aimed?.x ?? 0) + (aimed?.width ?? 0) / 2, (aimed?.y ?? 0) + (aimed?.height ?? 0) / 2)

      await expect(bookingRegion(page)).toHaveCount(0)
      await expect(conversationNotice(page)).toContainText(chatbot.booking.cancelled)
      expect(calls.bookingCalls, 'nothing was sent').toEqual([])
    })
  }

  for (const width of [1280, 375] as const) {
    test(`reports an invalid phone on blur, and «Passer cette question» still works under the pointer, at ${width} px`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await mockHappyPath(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await page.getByRole('button', { name: chatbot.suggestions.book }).click()
      await acceptConsent(page)
      await answerNeed(page)
      await slotChip(page).first().click()
      for (const [label, value] of [
        [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
        [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
        [chatbot.booking.steps.email.field, ANSWERS.email],
      ] as const) {
        await page.getByLabel(label).fill(value)
        await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      }

      const phone = page.getByLabel(chatbot.booking.steps.phone.field)
      const skip = bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip })

      // Leaving the field with the keyboard reports the number, and only reports it.
      await phone.fill('601020304')
      await page.keyboard.press('Tab')
      await expect(bookingRegion(page)).toContainText(chatbot.booking.steps.phone.error)
      await expect(phone).toHaveAttribute('aria-invalid', 'true')
      await expect(bookingRegion(page).getByRole('button', { name: 'PME' })).toHaveCount(0)

      // The real pointer case: the field holds the refused number and has the focus, so the click on
      // the skip blurs it first, the error line lands under the input row, and the same click still
      // reaches the control it was aimed at and skips.
      await phone.fill('601020304')
      await skip.scrollIntoViewIfNeeded()
      const aimed = await skip.boundingBox()
      await page.mouse.click((aimed?.x ?? 0) + (aimed?.width ?? 0) / 2, (aimed?.y ?? 0) + (aimed?.height ?? 0) / 2)

      await expect(bookingRegion(page).getByRole('button', { name: 'PME' })).toBeVisible()
      await expect(bookingRegion(page)).not.toContainText(chatbot.booking.steps.phone.error)
    })
  }

  test('an edit changes one answer and returns to the recap, keeping every other one', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)

    await editAnswer(page, chatbot.booking.steps.email.field)
    const email = page.getByLabel(chatbot.booking.steps.email.field)
    await expect(email).toBeVisible()
    await expect(email).toBeFocused()
    await expect(email).toHaveValue(ANSWERS.email)

    // Submitting the edited answer comes straight back to the recap: no other question is asked
    // again, and the answers already given stay on their rows.
    const changed = 'camille.modifiee@example.fr'
    await email.fill(changed)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    await expect(page.getByLabel(chatbot.booking.steps.phone.field)).toHaveCount(0)

    const recap = bookingRegion(page)
    await expect(recap).toContainText(changed)
    for (const kept of [ANSWERS.need, ANSWERS.firstName, ANSWERS.lastName, ANSWERS.phone, 'PME', 'Dirigeant']) {
      await expect(recap, `the recap keeps "${kept}"`).toContainText(kept)
    }
    expect(calls.bookingCalls).toEqual([])
  })

  test('two simultaneous confirmations of one slot cannot both succeed', async ({ page }) => {
    // The booking answer is held until the test releases it, so the confirming state is stable.
    let releaseBooking: (answer: MockAnswer) => void = () => {}
    const held = new Promise<MockAnswer>((resolve) => {
      releaseBooking = resolve
    })
    const calls = await mockBooking(page, {
      slots: () => ({ status: 200, body: { slots: SLOTS } }),
      booking: held,
    })
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)
    const confirm = bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm })

    // The first click fires the request; the button stays disabled while confirming, so a second
    // click can never be queued by the browser, whatever the timing.
    await confirm.click()
    await expect(confirm).toBeDisabled()

    releaseBooking({ status: 200, body: { booked: true } })
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()
    expect(calls.bookingCalls, 'the confirm button sent one booking only').toHaveLength(1)
    expect(calls.bookingCalls[0]?.body).toMatchObject({ slot: SLOTS[0]?.start })
  })
})

test.describe('booking flow: accessibility (axe)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the assistant section is free of critical and serious violations, idle and with the flow open', async ({
    page,
  }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')

    // The scan is scoped to the assistant section: the whole page is Lighthouse's accessibility
    // category, this test pins the section the booking flow lives in.
    const scan = async (): Promise<string[]> =>
      (await new AxeBuilder({ page }).include(`#${SECTION_IDS.agent}`).analyze()).violations
        .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
        .map((violation) => `${violation.id} (${violation.impact})`)

    expect(await scan(), 'idle conversation').toEqual([])

    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)

    expect(await scan(), 'flow open on the slot step').toEqual([])
    expect(calls.assistantCalls).toEqual([])
  })
})

test.describe('booking flow: themes and reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('renders in both themes with the flow styles intact', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')

    // The flow renders and works in both themes.
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await expect(bookingRegion(page)).toBeVisible()
    await acceptConsent(page)
    await answerNeed(page)
    await expect(slotChip(page)).toHaveCount(4)
    expect(calls.bookingCalls).toEqual([])
  })

  test('stops the flow transitions under prefers-reduced-motion: reduce', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)

    const chipTransition = await slotChip(page)
      .first()
      .evaluate((element) => getComputedStyle(element).transition)
    expect(chipTransition, 'the slot chip transition is none under reduced motion').toBe('none')
    expect(calls.bookingCalls).toEqual([])
  })
})

test.describe('booking flow: spacing on the section rhythm (Mel)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  /** Resolves a `clamp(min, {vwPercent}vw, max)` length at a viewport width, in px at 16px root. */
  const clampPx = (min: number, vwPercent: number, max: number, width: number): number =>
    Math.min(Math.max(min, (width * vwPercent) / 100), max)

  /** The expected computed spacing of the flow's elements, at a viewport width. */
  const expectedSpacing = (width: number): Record<string, number> => ({
    // The flow's own gaps: the section rhythm, the transcript, the step and the text-field gap.
    flowGap: clampPx(32, 5, 48, width),
    transcriptGap: clampPx(24, 4, 40, width),
    stepGap: clampPx(20, 3.4, 32, width),
    fieldGap: clampPx(12, 2, 20, width),
    // The recap step: the same step gap, the list gap and the row padding.
    recapGap: clampPx(20, 3.4, 32, width),
    recapListGap: 16,
    recapRowPaddingBlockEnd: 16,
    // The chips row and the chips themselves.
    chipsRowGap: 16,
    chipsColumnGap: 24,
    chipPaddingBlock: 8,
    chipPaddingInline: 20,
    // The «voir plus de créneaux» control, now a chip inside the slot list.
    morePaddingBlockEnd: 8,
    // The input row of a text step: its bottom padding keeps the underline readable.
    inputRowPaddingBlockEnd: 12,
  })

  /** Reads the computed spacing of the flow's spacing elements, at the current viewport. */
  const readFlowSpacing = async (
    page: Page,
    region: Locator,
    settle: { question: string; control: Locator },
  ): Promise<Record<string, number | null>> => {
    // The step's controls unmount while the flow is writing its next question: wait for the step's
    // question and its control before reading, so no value is read from an unmounted step.
    await expect(region).toContainText(settle.question)
    await expect(settle.control).toBeVisible()
    return region.evaluate((root) => {
      const px = (element: Element | null | undefined, property: string): number | null => {
        if (element === null || element === undefined) return null
        const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(property))
        return Number.isFinite(value) ? value : null
      }
      // The flow's elements are selected by structure, not by hashed CSS-module class.
      const step = root.querySelector('ol + div')
      const form = root.querySelector('ol + div form')
      const chipsList = root.querySelector('ul[aria-label="Créneaux disponibles"]')
      const recap = root.querySelector('ol + div > div')
      return {
        flowGap: px(root, 'gap'),
        transcriptGap: px(root.querySelector('ol'), 'gap'),
        stepGap: px(step, 'gap'),
        fieldGap: px(form, 'gap'),
        inputRowPaddingBlockEnd: px(form?.querySelector('div'), 'padding-block-end'),
        chipsRowGap: px(chipsList, 'row-gap'),
        chipsColumnGap: px(chipsList, 'column-gap'),
        chipPaddingBlock: px(chipsList?.querySelector('button'), 'padding-block-end'),
        chipPaddingInline: px(chipsList?.querySelector('button'), 'padding-inline-start'),
        morePaddingBlockEnd: px(root.querySelector('[data-booking-more]'), 'padding-block-end'),
        recapGap: px(recap, 'gap'),
        recapListGap: px(recap?.querySelector('ul'), 'gap'),
        recapRowPaddingBlockEnd: px(recap?.querySelector('li'), 'padding-block-end'),
      }
    })
  }

  for (const width of SPACING_VIEWPORTS) {
    test(`every computed spacing at ${width}px is a package token value, and the fluid clamps sit between their bounds`, async ({
      page,
    }) => {
      const calls = await mockHappyPath(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await page.getByRole('button', { name: chatbot.suggestions.book }).click()
      await acceptConsent(page)
      await answerNeed(page)

      // Slot step: the chips row, the chips themselves and the way out of the step.
      const slotSpacing = await readFlowSpacing(page, bookingRegion(page), {
        question: chatbot.booking.steps.slot.question,
        control: slotChip(page).first(),
      })

      // Email step: the text-field gap and the input row padding.
      await slotChip(page).first().click()
      await page.getByLabel(chatbot.booking.steps.firstName.field).fill(ANSWERS.firstName)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await page.getByLabel(chatbot.booking.steps.lastName.field).fill(ANSWERS.lastName)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await page.getByLabel(chatbot.booking.steps.email.field).fill(ANSWERS.email)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      // The read lands on the phone step, whose field carries the same text-field spacing.
      const emailSpacing = await readFlowSpacing(page, bookingRegion(page), {
        question: chatbot.booking.steps.phone.question,
        control: page.getByLabel(chatbot.booking.steps.phone.field),
      })

      // Recap step: the recap gap and the recap rows.
      await page.getByLabel(chatbot.booking.steps.phone.field).fill('0601020304')
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
      await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
      const recapSpacing = await readFlowSpacing(page, bookingRegion(page), {
        question: chatbot.booking.recap.title,
        control: bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }),
      })

      const expected = expectedSpacing(width)
      for (const [key, value] of Object.entries(expected)) {
        // A step that does not render the element reads `null`, not `undefined`: the value lives on
        // the first step that does render it, so the `null` readings are skipped here.
        const candidates = [slotSpacing[key], emailSpacing[key], recapSpacing[key]]
        const actual = candidates.find((candidate) => candidate !== null)
        if (actual === undefined) throw new Error(`no computed spacing for ${key}`)
        expect(actual, `${key} at ${width}px`).toBeCloseTo(value, 1)
      }
      expect(calls.bookingCalls).toEqual([])
    })
  }

  test('saves a screenshot of each step at 375 and 1280 px for Mel', async ({ page }) => {
    // The screenshots are written for Mel only: the suite stays read-only in CI, where the
    // env gate is not set.
    test.skip(process.env.QA_BOOKING_SCREENSHOTS !== '1', 'screenshots are written when QA_BOOKING_SCREENSHOTS is set')
    // Two widths times six steps, each paced by the flow's typing pauses: the default 30 s is too
    // tight, and a timeout here would leave half the shots behind.
    test.setTimeout(180_000)
    const shots = join(process.cwd(), SHOT_DIR)
    await mkdirSync(shots, { recursive: true })
    for (const width of SHOT_VIEWPORTS) {
      const calls = await mockHappyPath(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await page.getByRole('button', { name: chatbot.suggestions.book }).click()
      // The sticky site header and the fixed skip link are page chrome, not part of the section: left
      // visible, they land on the capture — over the section top at the scroll position, and once
      // in the middle when the shot is stitched. Hidden for the capture only, so the section is
      // really cropped alone.
      await page.addStyleTag({ content: 'header, a[href="#main"] { display: none !important; }' })

      /**
       * Captures the agent section alone — never the full page, which is how the previous captures
       * became unusable — once the step's question is on screen and its control is visible, so a
       * shot always shows the step it is named for.
       */
      const save = async (
        step: 'consent' | 'need' | 'slot' | 'identity' | 'recap' | 'edit-chooser' | 'success',
        question: string,
        control: Locator,
      ): Promise<void> => {
        await expect(bookingRegion(page)).toContainText(question)
        await expect(control).toBeVisible()
        await assistantSection(page).screenshot({ path: join(shots, `booking-${step}-${width}.png`) })
      }

      await save(
        'consent',
        // The message renders its privacy-policy placeholder as the inline link label.
        CONSENT_MESSAGE,
        bookingRegion(page).getByRole('button', { name: chatbot.consent.accept }),
      )
      await acceptConsent(page)
      await save('need', chatbot.booking.steps.need.question, page.getByLabel(chatbot.booking.steps.need.field))
      await answerNeed(page)
      await save('slot', chatbot.booking.steps.slot.question, slotChip(page).first())
      await slotChip(page).first().click()
      await save(
        'identity',
        chatbot.booking.steps.firstName.question,
        page.getByLabel(chatbot.booking.steps.firstName.field),
      )
      await page.getByLabel(chatbot.booking.steps.firstName.field).fill(ANSWERS.firstName)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await page.getByLabel(chatbot.booking.steps.lastName.field).fill(ANSWERS.lastName)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await page.getByLabel(chatbot.booking.steps.email.field).fill(ANSWERS.email)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await page.getByLabel(chatbot.booking.steps.phone.field).fill(ANSWERS.phone)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
      await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
      await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
      await save(
        'recap',
        chatbot.booking.recap.title,
        bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }),
      )
      // The chooser Mel asked to see: the prompt and one chip per recap row, before the confirm.
      await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit }).click()
      await save(
        'edit-chooser',
        chatbot.booking.recap.editPrompt,
        bookingRegion(page).locator('[data-booking-edit]').first(),
      )
      await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit }).click()
      await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).click()
      await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()
      await save(
        'success',
        chatbot.booking.success.title,
        bookingRegion(page).getByRole('button', { name: chatbot.booking.success.restart }),
      )
      expect(calls.bookingCalls).toHaveLength(1)
    }

    // The chooser after a skipped phone: the recap has one row fewer than the chooser has chips,
    // because the question the visitor left out is still offered there.
    const skippedWidth = 375
    await page.setViewportSize({ width: skippedWidth, height: 800 })
    const skippedCalls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await page.addStyleTag({ content: 'header, a[href="#main"] { display: none !important; }' })
    await acceptConsent(page)
    await answerNeed(page)
    await slotChip(page).first().click()
    for (const [label, value] of [
      [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
      [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
      [chatbot.booking.steps.email.field, ANSWERS.email],
    ] as const) {
      await page.getByLabel(label).fill(value)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    }
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip }).click()
    await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
    await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(ANSWERS.phone)
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit }).click()
    await expect(bookingRegion(page).locator('[data-booking-edit]')).toHaveCount(8)
    await expect(bookingRegion(page)).toContainText(chatbot.booking.recap.editPrompt)
    const skippedChip = bookingRegion(page).locator('[data-booking-edit="phone"]')
    await expect(skippedChip).toBeVisible()
    await assistantSection(page).screenshot({ path: join(shots, `booking-edit-chooser-skipped-${skippedWidth}.png`) })
    expect(skippedCalls.bookingCalls).toHaveLength(0)
  })
})

test.describe('booking flow: primary controls inside the viewport', () => {
  test('accept and confirm, and the slot chips, stay fully inside a 375 px viewport', async ({ page }) => {
    test.setTimeout(120_000)
    const calls = await mockHappyPath(page)
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()

    const inside = (box: { left: number; right: number }, label: string): void => {
      expect(box.left, `${label} starts inside the viewport`).toBeGreaterThanOrEqual(0)
      expect(box.right, `${label} ends inside the viewport`).toBeLessThanOrEqual(375)
    }

    // The consent label is the longest one in the flow: 596 px of text in a 335 px column, so it has
    // to wrap. Before the fix the pill ran to x 616 in a 375 px viewport and the section clipped it.
    const accept = bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })
    await expect(accept).toBeVisible()
    const acceptBox = await measureControl(accept)
    inside(acceptBox, 'the accept button')
    expect(acceptBox.overflowInside, 'the accept label does not overflow its own pill').toBeLessThanOrEqual(1)
    expect(acceptBox.insideOwnBox, 'every line of the accept label sits inside the pill').toBe(true)
    expect(acceptBox.lineCount, 'the short accept label stays on one line').toBe(1)
    await expect(accept).toHaveText(chatbot.consent.accept)

    await acceptConsent(page)
    await answerNeed(page)

    const chips = await slotChip(page).all()
    expect(chips.length).toBeGreaterThan(0)
    for (const [index, chip] of chips.entries()) {
      const chipBox = await measureControl(chip)
      inside(chipBox, `slot chip ${index}`)
      expect(chipBox.overflowInside, `slot chip ${index} does not overflow its own box`).toBeLessThanOrEqual(1)
      expect(chipBox.insideOwnBox, `slot chip ${index} renders its whole label inside`).toBe(true)
    }

    await answerIdentity(page)

    const confirm = bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm })
    await expect(confirm).toBeVisible()
    const confirmBox = await measureControl(confirm)
    inside(confirmBox, 'the confirm button')
    expect(confirmBox.overflowInside, 'the confirm label does not overflow its own pill').toBeLessThanOrEqual(1)
    expect(confirmBox.insideOwnBox, 'every line of the confirm label sits inside the pill').toBe(true)
    await expect(confirm).toHaveText(chatbot.booking.recap.confirm)

    expect(calls.slotsCalls).toBe(1)
  })
})

test.describe("booking flow: Mel's review of the consent, the chips, the recap and the success", () => {
  test('the consent step offers «Continuer», keeps the privacy link inline, and lines both controls up', async ({
    page,
  }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()

    // 1 + 2: Mel's sentence ends the message, and the accept control is the word she validated.
    await expect(bookingRegion(page)).toContainText(CONSENT_MESSAGE)
    await expect(bookingRegion(page)).toContainText(
      'En cliquant sur le bouton «\u00A0Continuer\u00A0», vous acceptez que vos informations soient utilisées',
    )
    const accept = bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })
    await expect(accept).toHaveText(chatbot.consent.accept)

    // 4: one inline link to the policy inside the sentence, and no standalone link left.
    const inline = bookingRegion(page).getByRole('link', { name: chatbot.consent.link.inlineLabel })
    await expect(inline).toBeVisible()
    await expect(inline).toHaveAttribute('href', chatbot.consent.link.href)
    await expect(bookingRegion(page).getByRole('link', { name: chatbot.consent.link.label, exact: true })).toHaveCount(
      0,
    )
    await inline.focus()
    await expect(inline).toBeFocused()

    // The accepted consent still shows as the visitor's own line, so the click is explicit.
    await acceptConsent(page)
    await expect(flowLines(page).last()).toContainText(chatbot.consent.accepted)
    await expect(bookingRegion(page).getByText(chatbot.consent.accept, { exact: true })).toHaveCount(1)
    expect(calls.slotsCalls).toBe(0)
  })

  test('the skip control shares the field row with the send button, at its own width', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await slotChip(page).first().click()
    for (const [label, value] of [
      [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
      [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
      [chatbot.booking.steps.email.field, ANSWERS.email],
    ] as const) {
      await page.getByLabel(label).fill(value)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    }

    // 5: the optional step's skip link sits in the field's own row, before the send button.
    const skip = bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip })
    const send = bookingRegion(page).getByRole('button', { name: 'Envoyer' })
    await expect(skip).toBeVisible()
    const [skipBox, sendBox, regionBox] = await Promise.all([
      skip.boundingBox(),
      send.boundingBox(),
      bookingRegion(page).boundingBox(),
    ])
    expect(skipBox).not.toBeNull()
    expect(sendBox).not.toBeNull()
    expect(regionBox).not.toBeNull()
    const skipRect = skipBox as { x: number; y: number; width: number; height: number }
    const sendRect = sendBox as { x: number; y: number; width: number; height: number }
    const regionRect = regionBox as { width: number }

    expect(skipRect.width, 'the skip control keeps its own width, not the column width').toBeLessThan(
      regionRect.width * 0.6,
    )
    expect(skipRect.x + skipRect.width, 'the skip control sits before the send button').toBeLessThanOrEqual(sendRect.x)
    expect(
      Math.abs(skipRect.y + skipRect.height / 2 - (sendRect.y + sendRect.height / 2)),
      'the skip control is vertically aligned with the send button',
    ).toBeLessThanOrEqual(2)

    // 6: «voir plus de créneaux» joins the chips, in the same row flow rather than on its own line.
    await skip.click()
    await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
    await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()

    await editAnswer(page, chatbot.booking.steps.slot.field)
    await expect(slotChip(page)).toHaveCount(4)
    const more = bookingRegion(page).locator('ul > li > [data-booking-more]')
    await expect(more, 'the «voir plus de créneaux» control is a chip of the slot list').toHaveCount(1)
    const chipBoxes = await Promise.all((await slotChip(page).all()).map((chip) => chip.boundingBox()))
    const moreBox = await more.boundingBox()
    expect(moreBox).not.toBeNull()
    const moreRect = moreBox as { y: number; height: number }
    const centres = chipBoxes.filter((box) => box !== null).map((box) => box.y + box.height / 2)
    expect(
      centres.some((centre) => Math.abs(centre - (moreRect.y + moreRect.height / 2)) <= 2),
      'the control shares one of the chips rows',
    ).toBe(true)
    expect(calls.bookingCalls).toEqual([])
  })

  test('the edit link offers every answer row but not the consent, and the success drops the recap', async ({
    page,
  }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()

    // 7: one edit link, then a prompt and one choice per recap row. The consent is not a row.
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit }).click()
    await expect(bookingRegion(page)).toContainText(chatbot.booking.recap.editPrompt)
    const choices = await bookingRegion(page).locator('[data-booking-edit]').allTextContents()
    expect(choices, 'one choice per recap row, in order, and no consent choice').toEqual([
      chatbot.booking.steps.need.field,
      chatbot.booking.steps.slot.field,
      chatbot.booking.steps.firstName.field,
      chatbot.booking.steps.lastName.field,
      chatbot.booking.steps.email.field,
      chatbot.booking.steps.phone.field,
      chatbot.booking.steps.structure.field,
      chatbot.booking.steps.role.field,
    ])

    // 8: once booked, only the success message, its title and the restart control remain.
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).click()
    const successTitle = bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })
    await expect(successTitle).toBeVisible()
    await expect(successTitle).toBeFocused()
    const [successLead = ''] = chatbot.booking.success.message.replace('{firstName}', ANSWERS.firstName).split('{slot}')
    await expect(flowLines(page).last()).toContainText(successLead)
    await expect(bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm })).toHaveCount(0)
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toHaveCount(0)
    await expect(bookingRegion(page).locator('[data-booking-edit]')).toHaveCount(0)
    await expect(bookingRegion(page).getByRole('button', { name: chatbot.booking.success.restart })).toBeVisible()
    expect(calls.bookingCalls).toHaveLength(1)
  })
})

test.describe('booking flow: the success step', () => {
  for (const width of [375, 1280] as const) {
    test(`« Recommencer » keeps its own width, its target and the flow's left edge at ${width} px`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const calls = await mockHappyPath(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await page.getByRole('button', { name: chatbot.suggestions.book }).click()
      await acceptConsent(page)
      await answerNeed(page)
      await answerIdentity(page)
      await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.confirm }).click()
      await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()

      // 1: the way to start again is a control of its own width, never a full-width block, and it
      // stays a comfortable target at the flow's left edge.
      const restart = bookingRegion(page).getByRole('button', { name: chatbot.booking.success.restart })
      await expect(restart).toBeVisible()
      const [restartBox, regionBox] = await Promise.all([restart.boundingBox(), bookingRegion(page).boundingBox()])
      expect(restartBox).not.toBeNull()
      expect(regionBox).not.toBeNull()
      const restartRect = restartBox as { x: number; y: number; width: number; height: number }
      const regionRect = regionBox as { x: number; width: number }

      expect(restartRect.width, 'the control is narrower than the flow').toBeLessThan(regionRect.width)
      expect(restartRect.height, 'the control keeps a 44 px minimum target').toBeGreaterThanOrEqual(44)
      expect(restartRect.x, 'the control starts at the flow content left edge').toBeCloseTo(regionRect.x, 0)

      // The success message carries Mel's final sentence, both channels announced.
      await expect(flowLines(page).last()).toContainText('par e-mail ou directement dans votre agenda')
      expect(calls.bookingCalls).toHaveLength(1)
    })
  }
})

test.describe('booking flow: the edit chooser, keyboard only', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  /** Walks to the recap with the phone skipped: no recap row for it, and the chooser still offers it. */
  const walkToRecap = async (page: Page): Promise<RecordedCalls> => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await slotChip(page).first().click()
    for (const [label, value] of [
      [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
      [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
      [chatbot.booking.steps.email.field, ANSWERS.email],
    ] as const) {
      await page.getByLabel(label).fill(value)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    }
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip }).click()
    await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
    await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    return calls
  }

  test('opens with the keyboard, and picking a chip lands on the prefilled field of that step', async ({ page }) => {
    await walkToRecap(page)

    // The edit link is the first control of the actions row: Tab reaches it before the confirm.
    const editLink = bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit })
    await tabUntilFocused(page, editLink)
    await page.keyboard.press('Enter')
    await expect(bookingRegion(page)).toContainText(chatbot.booking.recap.editPrompt)

    // One choice per question of the flow: 7 answered fields, plus the phone the visitor skipped.
    const choices = await bookingRegion(page).locator('[data-booking-edit]').allTextContents()
    expect(choices).toHaveLength(8)
    expect(choices).toContain(chatbot.booking.steps.phone.field)

    await tabUntilFocused(page, bookingRegion(page).locator('[data-booking-edit="email"]'))
    await page.keyboard.press('Enter')
    const email = page.getByLabel(chatbot.booking.steps.email.field)
    await expect(email).toBeFocused()
    await expect(email).toHaveValue(ANSWERS.email)

    // Submitting the unchanged value comes back to the recap with everything intact.
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
  })

  test('Escape on the edit link and on a chooser chip closes only the chooser, keeps the flow, and returns the focus', async ({
    page,
  }) => {
    await walkToRecap(page)
    const editLink = bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit })
    const prompt = bookingRegion(page).getByText(chatbot.booking.recap.editPrompt)

    // Escape on the edit link: the chooser closes, the flow stays, focus returns to the edit link.
    await editLink.focus()
    await page.keyboard.press('Enter')
    await expect(prompt).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(
      bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title }),
      'Escape on the edit link keeps the flow alive',
    ).toBeVisible()
    await expect(editLink, 'focus returns to the edit link after Escape').toBeFocused()

    // Escape on a chooser chip: same outcome, the flow stays and the chooser closes.
    await editLink.click()
    await expect(prompt).toBeVisible()
    const chip = bookingRegion(page).locator('[data-booking-edit="email"]')
    await chip.focus()
    await page.keyboard.press('Escape')
    await expect(
      bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title }),
      'Escape on a chooser chip keeps the flow alive',
    ).toBeVisible()
    await expect(prompt).not.toBeVisible()
    await expect(editLink, 'focus returns to the edit link after Escape').toBeFocused()
  })
})

test.describe('booking flow: the recap edit chooser across the md breakpoint', () => {
  /** Walks to the recap with the phone skipped, so the chooser holds eight choices. */
  const walkToRecap = async (page: Page): Promise<RecordedCalls> => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await slotChip(page).first().click()
    for (const [label, value] of [
      [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
      [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
      [chatbot.booking.steps.email.field, ANSWERS.email],
    ] as const) {
      await page.getByLabel(label).fill(value)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    }
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip }).click()
    await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
    await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    return calls
  }

  test('puts the chooser between the table and the action row, focuses its first choice in view, at 375 px', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 375, height: 667 })
    await walkToRecap(page)

    const region = bookingRegion(page)
    const link = region.getByRole('button', { name: chatbot.booking.recap.edit })
    await link.click()

    const chooser = region.locator('#booking-edit-chooser')
    await expect(chooser).toBeVisible()
    await expect(link).toHaveAttribute('aria-expanded', 'true')
    await expect(link).toHaveAttribute('aria-controls', 'booking-edit-chooser')

    // Below md the chooser is between the table and the action row, in the DOM order the boxes show.
    const table = await region.locator('ul').first().boundingBox()
    const chooserBox = await chooser.boundingBox()
    const confirm = await region.getByRole('button', { name: chatbot.booking.recap.confirm }).boundingBox()
    expect(chooserBox?.y ?? 0, 'the chooser starts below the recap table').toBeGreaterThanOrEqual(
      (table?.y ?? 0) + (table?.height ?? 0) - 1,
    )
    expect(chooserBox?.y ?? 0, 'the chooser ends above the action row').toBeLessThanOrEqual((confirm?.y ?? 0) + 1)

    // Opening moved the focus to the first choice, and brought it into view at 375 x 667.
    const first = region.locator('[data-booking-edit="need"]')
    await expect(first, 'the first choice takes the focus below md').toBeFocused()
    await expect(first, 'and it is fully in the viewport').toBeInViewport({ ratio: 1 })

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'no horizontal overflow at 375 px').toBeLessThanOrEqual(1)
  })

  for (const width of [768, 1280] as const) {
    test(`keeps the chooser under the action row, at ${width} px`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 800 })
      await walkToRecap(page)

      const region = bookingRegion(page)
      await region.getByRole('button', { name: chatbot.booking.recap.edit }).click()
      await expect(region.locator('#booking-edit-chooser')).toBeVisible()

      // From md up the action row comes first, and the chooser keeps the place it always had.
      const confirm = await region.getByRole('button', { name: chatbot.booking.recap.confirm }).boundingBox()
      const chooserBox = await region.locator('#booking-edit-chooser').boundingBox()
      expect(chooserBox?.y ?? 0, 'the chooser starts below the action row').toBeGreaterThanOrEqual(
        (confirm?.y ?? 0) + (confirm?.height ?? 0) - 1,
      )
    })
  }

  for (const width of [375, 1280] as const) {
    test(`returns the focus to the link on Escape, with every answer intact, at ${width} px`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: width === 375 ? 667 : 800 })
      const calls = await walkToRecap(page)

      const region = bookingRegion(page)
      const link = region.getByRole('button', { name: chatbot.booking.recap.edit })
      await link.click()
      await expect(region.locator('#booking-edit-chooser')).toBeVisible()

      await region.locator('[data-booking-edit="email"]').focus()
      await page.keyboard.press('Escape')

      await expect(link, 'Escape puts the focus back on the edit link').toBeFocused()
      await expect(region.locator('#booking-edit-chooser')).toHaveCount(0)
      await expect(region.getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
      for (const kept of [ANSWERS.need, ANSWERS.firstName, ANSWERS.lastName, ANSWERS.email]) {
        await expect(region, `the recap keeps "${kept}"`).toContainText(kept)
      }
      expect(calls.bookingCalls, 'nothing was sent').toEqual([])
    })
  }
})

test.describe('booking flow: the edit challenge, one booking body', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('editing every answer type, with one optional answer skipped, sends the edited values and keeps the others', async ({
    page,
  }) => {
    const EDITED = {
      need: 'Automatiser la facturation',
      firstName: 'Léa',
      structure: 'Association',
    } as const
    const calls = await mockHappyPath(page)

    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await slotChip(page).first().click()
    for (const [label, value] of [
      [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
      [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
      [chatbot.booking.steps.email.field, ANSWERS.email],
    ] as const) {
      await page.getByLabel(label).fill(value)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    }
    // The phone is skipped: the walk challenges the recap and the body with one absent answer.
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip }).click()
    await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
    await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()

    const edit = async (label: string, redo: () => Promise<void>): Promise<void> => {
      await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit }).click()
      await expect(bookingRegion(page)).toContainText(chatbot.booking.recap.editPrompt)
      await bookingRegion(page).locator(`[data-booking-edit="${label}"]`).click()
      await redo()
      await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    }

    // One edit per answer type: a text answer, the slot, a name, and an optional chip answer.
    await edit('need', async () => {
      await page.getByLabel(chatbot.booking.steps.need.field).fill(EDITED.need)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    })
    await edit('slot', async () => {
      await slotChip(page).nth(1).click()
    })
    await edit('firstName', async () => {
      await page.getByLabel(chatbot.booking.steps.firstName.field).fill(EDITED.firstName)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    })
    await edit('structure', async () => {
      await bookingRegion(page).getByRole('button', { name: EDITED.structure }).click()
    })

    const recap = bookingRegion(page)
    for (const kept of [
      EDITED.need,
      EDITED.firstName,
      ANSWERS.lastName,
      ANSWERS.email,
      EDITED.structure,
      'Dirigeant',
    ]) {
      await expect(recap, `the recap keeps "${kept}"`).toContainText(kept)
    }
    await expect(recap).not.toContainText(ANSWERS.phone)

    await recap.getByRole('button', { name: chatbot.booking.recap.confirm }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()

    // One booking, and its body carries the edited values plus every kept one, without the answer
    // the visitor skipped: the phone key is absent, never an empty string.
    expect(calls.bookingCalls, 'one booking only').toHaveLength(1)
    expect(calls.bookingCalls[0]?.body).toMatchObject({
      consent: true,
      need: EDITED.need,
      slot: SLOTS[1]?.start,
      firstName: EDITED.firstName,
      lastName: ANSWERS.lastName,
      email: ANSWERS.email,
      structure: EDITED.structure,
      role: 'Dirigeant',
    })
    expect('phone' in (calls.bookingCalls[0]?.body as object), 'the skipped phone stays out of the body').toBe(false)
  })

  test('adds a skipped optional answer back from the chooser, sends it, and shows it in the recap', async ({
    page,
  }) => {
    const calls = await mockHappyPath(page)

    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await slotChip(page).first().click()
    for (const [label, value] of [
      [chatbot.booking.steps.firstName.field, ANSWERS.firstName],
      [chatbot.booking.steps.lastName.field, ANSWERS.lastName],
      [chatbot.booking.steps.email.field, ANSWERS.email],
    ] as const) {
      await page.getByLabel(label).fill(value)
      await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    }
    // The phone is skipped: no recap row for it, and the chooser offers it anyway.
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip }).click()
    await bookingRegion(page).getByRole('button', { name: 'PME' }).click()
    await bookingRegion(page).getByRole('button', { name: 'Dirigeant' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(ANSWERS.phone)

    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit }).click()
    await expect(bookingRegion(page).locator('[data-booking-edit]')).toHaveCount(8)
    await bookingRegion(page).locator('[data-booking-edit="phone"]').click()

    // Reopened empty, with its usual skip control; answering it lands straight back on the recap.
    const phone = page.getByLabel(chatbot.booking.steps.phone.field)
    await expect(phone).toHaveValue('')
    await expect(bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip })).toBeVisible()
    await phone.fill(ANSWERS.phone)
    await bookingRegion(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()

    const recap = bookingRegion(page)
    await expect(recap).toContainText(ANSWERS.phone)
    for (const kept of [ANSWERS.need, ANSWERS.firstName, ANSWERS.lastName, ANSWERS.email, 'PME', 'Dirigeant']) {
      await expect(recap, `the recap keeps "${kept}"`).toContainText(kept)
    }

    await recap.getByRole('button', { name: chatbot.booking.recap.confirm }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()

    expect(calls.bookingCalls, 'one booking only').toHaveLength(1)
    expect(calls.bookingCalls[0]?.body).toMatchObject({
      consent: true,
      need: ANSWERS.need,
      slot: SLOTS[0]?.start,
      firstName: ANSWERS.firstName,
      lastName: ANSWERS.lastName,
      email: ANSWERS.email,
      phone: ANSWERS.phone,
      structure: 'PME',
      role: 'Dirigeant',
    })
  })

  test('removes an answered optional answer when it is skipped while editing, from the recap and the body', async ({
    page,
  }) => {
    const calls = await mockHappyPath(page)

    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)
    await expect(bookingRegion(page)).toContainText(ANSWERS.phone)

    // The chooser reopens the answered phone, prefilled; skipping it there drops the answer.
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.recap.edit }).click()
    await bookingRegion(page).locator('[data-booking-edit="phone"]').click()
    await expect(page.getByLabel(chatbot.booking.steps.phone.field)).toHaveValue(ANSWERS.phone)
    await bookingRegion(page).getByRole('button', { name: chatbot.booking.steps.skip }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()
    await expect(bookingRegion(page)).not.toContainText(ANSWERS.phone)

    const recap = bookingRegion(page)
    for (const kept of [ANSWERS.need, ANSWERS.firstName, ANSWERS.email, 'PME', 'Dirigeant']) {
      await expect(recap, `the recap keeps "${kept}"`).toContainText(kept)
    }

    await recap.getByRole('button', { name: chatbot.booking.recap.confirm }).click()
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()

    expect(calls.bookingCalls, 'one booking only').toHaveLength(1)
    expect(calls.bookingCalls[0]?.body).toMatchObject({
      consent: true,
      need: ANSWERS.need,
      firstName: ANSWERS.firstName,
      lastName: ANSWERS.lastName,
      email: ANSWERS.email,
      structure: 'PME',
      role: 'Dirigeant',
    })
    expect('phone' in (calls.bookingCalls[0]?.body as object), 'the skipped phone stays out of the body').toBe(false)
  })
})

test.describe('booking flow: layout and copy checks', () => {
  for (const width of [1280, 375] as const) {
    test(`recap values share one label column with no overlap, and the cancel link is left-aligned at text width, at ${width} px`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const calls = await mockHappyPath(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await page.getByRole('button', { name: chatbot.suggestions.book }).click()
      await acceptConsent(page)
      await answerNeed(page)
      await answerIdentity(page)
      await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()

      const rows = await page.evaluate(() => {
        const region = document.querySelector('[aria-label="Prendre rendez-vous"]')
        const list = region?.querySelector('ol + div ul')
        const lis = list ? Array.from(list.querySelectorAll(':scope > li')) : []
        const box = (el: Element | null): { x: number; y: number; w: number; h: number } | null => {
          if (el === null) return null
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }
        const regionBox = box(region)
        return {
          regionBox,
          rows: lis.map((li) => {
            const ps = li.querySelectorAll('p')
            return { label: box(ps[0] ?? null), value: box(ps[1] ?? null) }
          }),
        }
      })
      expect(rows.rows.length, 'the recap lists every answer').toBeGreaterThan(0)
      const regionBox = rows.regionBox as { x: number; y: number; w: number; h: number }

      const firstValueX = rows.rows[0]!.value!.x
      for (const [index, entry] of rows.rows.entries()) {
        expect(
          Math.abs(entry.value!.x - firstValueX),
          `row ${index}: values share one column at ${width}px`,
        ).toBeLessThanOrEqual(1)
        expect(
          entry.value!.x,
          `row ${index}: value does not overlap the label column at ${width}px`,
        ).toBeGreaterThanOrEqual(entry.label!.x + entry.label!.w - 1)
        expect(
          entry.value!.x + entry.value!.w,
          `row ${index}: value stays inside the region at ${width}px`,
        ).toBeLessThanOrEqual(regionBox.x + regionBox.w + 1)
      }

      // The cancel link sits at the very left of the flow, only as wide as its own text: the
      // underline the `.quiet` style draws is the content box, and the content box is the text
      // (no inline padding), so the measured text range must match the button's own box.
      const cancel = await page.evaluate(() => {
        const region = document.querySelector('[aria-label="Prendre rendez-vous"]')
        const cancel = [...(region?.querySelectorAll(':scope > button') || [])].find((b) =>
          b.textContent?.includes('Annuler'),
        )
        if (cancel === undefined) return null
        const r = cancel.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(cancel)
        const text = range.getBoundingClientRect()
        const contentLeft = region!.querySelector('[data-booking-transcript]')!.getBoundingClientRect().x
        return {
          x: r.x,
          w: r.width,
          textW: text.width,
          contentLeft,
          regionW: region!.getBoundingClientRect().width,
        }
      })
      expect(cancel).not.toBeNull()
      const cancelBox = cancel as { x: number; w: number; textW: number; contentLeft: number; regionW: number }
      expect(
        Math.abs(cancelBox.x - cancelBox.contentLeft),
        `the cancel link is left-aligned at ${width}px`,
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(cancelBox.w - cancelBox.textW),
        `the cancel link is only as wide as its text at ${width}px`,
      ).toBeLessThanOrEqual(2)
      expect(calls.bookingCalls).toEqual([])
    })
  }

  test('no ordinary space appears before French question marks or colons in the rendered flow', async ({ page }) => {
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await acceptConsent(page)
    await answerNeed(page)
    await answerIdentity(page)
    await expect(bookingRegion(page).getByRole('heading', { name: chatbot.booking.recap.title })).toBeVisible()

    const offenders = await page.evaluate((sectionId) => {
      const section = document.querySelector(`section#${sectionId}`)
      const walker = document.createTreeWalker(section ?? document.body, NodeFilter.SHOW_TEXT)
      const bad: string[] = []
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent ?? ''
        const matches = text.match(/[ \t][?:]/g)
        if (matches) bad.push(text.trim().slice(0, 60))
      }
      return bad
    }, SECTION_IDS.agent)
    expect(offenders, 'no ordinary space before ? or : in the rendered flow').toEqual([])
    expect(calls.bookingCalls).toEqual([])
  })
})

test.describe('booking flow: token fidelity (4a-1)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  /** Values of the @softnio-labs/tokens package (0.3.1), read from its source files (core/*.css). */
  const PACKAGE_SIZES = [32, 36, 44, 52, 60]
  const PACKAGE_RADII = [8, 12, 16, 24, 100]
  const PACKAGE_FONT_SIZES = [86, 48, 36, 24, 20, 18, 16, 14, 12, 11]
  const PACKAGE_FONT_WEIGHTS = [400, 500, 600, 700, 800]

  /** Resolved value of a --softn-* token for the current theme. */
  const tokenValue = (page: Page, name: string): Promise<string> =>
    page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name)

  /** One computed style of one element. */
  const styleOf = (locator: Locator, property: string): Promise<string> =>
    locator.evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property)

  /** True when two colors paint the same rgb pixel (colors compare as rendered, not as written). */
  const sameColor = (page: Page, left: string, right: string): Promise<boolean> =>
    page.evaluate(
      ([a, b]: [string, string]) => {
        const pixel = (color: string): string => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')
          if (context === null) throw new Error('no canvas context')
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          return `${context.getImageData(0, 0, 1, 1).data}`
        }
        return pixel(a) === pixel(b)
      },
      [left, right] as [string, string],
    )

  /** The full 4a-1 assertion set on the booking flow, in one walk of the flow. */
  const expectBookingTokenValues = async (page: Page, calls: RecordedCalls): Promise<void> => {
    const region = bookingRegion(page)
    const step = region.locator('ol + div')
    // The typing-indicator line carries its own `p` (the waiting sentence, body-sm at 14 px): the
    // speaker and the message text are read inside a real transcript line, so the indicator line
    // can never be mistaken for one while the flow is writing its first sentence.
    const firstLine = flowLines(page).first()
    const speaker = firstLine.locator('p').first()
    const lineText = firstLine.locator('p').nth(1)

    // The first line is the introduction: it is on screen once the opening pause has run.
    await expect(region).toContainText(chatbot.booking.intro)

    // Fonts the package declares are really loaded (next/font self-hosts the same faces).
    const fonts = await page.evaluate(() => ({
      zalando: Array.from(document.fonts).some((face) => /zalando/i.test(face.family)),
      jakarta: Array.from(document.fonts).some((face) => /jakarta/i.test(face.family)),
    }))
    expect(fonts.zalando, 'ZalandoSans declared and loaded').toBe(true)
    expect(fonts.jakarta, 'PlusJakartaSans declared and loaded').toBe(true)

    // Speaker line: the caption token, the brand-foreground color.
    expect(Number.parseFloat(await styleOf(speaker, 'font-size')), 'speaker is caption (11px)').toBe(11)
    expect(PACKAGE_FONT_WEIGHTS, 'speaker weight').toContain(Number.parseFloat(await styleOf(speaker, 'font-weight')))
    expect(
      await sameColor(page, await styleOf(speaker, 'color'), await tokenValue(page, '--softn-brand-foreground')),
      'speaker color is --softn-brand-foreground',
    ).toBe(true)

    // Transcript message text: the body-md token, the --softn-color color.
    expect(Number.parseFloat(await styleOf(lineText, 'font-size')), 'message text is body-md (16px)').toBe(16)
    expect(PACKAGE_FONT_WEIGHTS, 'message weight').toContain(Number.parseFloat(await styleOf(lineText, 'font-weight')))
    expect(
      await sameColor(page, await styleOf(lineText, 'color'), await tokenValue(page, '--softn-color')),
      'message text color is --softn-color',
    ).toBe(true)

    // Consent step: the accept button is the site's primary Button; the decline is quiet.
    const accept = region.getByRole('button', { name: chatbot.consent.accept })
    const decline = region.getByRole('button', { name: chatbot.consent.decline })
    expect(
      await sameColor(
        page,
        await styleOf(accept, 'background-color'),
        await tokenValue(page, '--softn-button-primary-background-default'),
      ),
      'accept background is --softn-button-primary-background-default',
    ).toBe(true)
    expect(
      await sameColor(
        page,
        await styleOf(accept, 'color'),
        await tokenValue(page, '--softn-button-primary-text-default'),
      ),
      'accept text color is --softn-button-primary-text-default',
    ).toBe(true)
    expect(Number.parseFloat(await styleOf(accept, 'min-height')), 'accept height is --softn-size-lg (52px)').toBe(52)
    expect(
      Number.parseFloat(await styleOf(accept, 'padding-inline-start')),
      'accept padding-inline is --softn-space-5 (20px)',
    ).toBe(20)
    expect(PACKAGE_RADII, 'accept radius is --softn-radius-pill (100px)').toContain(
      Number.parseFloat(await styleOf(accept, 'border-radius')),
    )
    // Hover uses the primary hover token pair.
    await accept.hover()
    await expect
      .poll(
        async () =>
          sameColor(
            page,
            await styleOf(accept, 'background-color'),
            await tokenValue(page, '--softn-button-primary-background-hover'),
          ),
        'accept hover background is --softn-button-primary-background-hover',
      )
      .toBe(true)
    expect(
      await sameColor(page, await styleOf(decline, 'color'), await tokenValue(page, '--softn-color-tertiary')),
      'decline text color is --softn-color-tertiary',
    ).toBe(true)

    // The need step: the input, its underline row and the send button.
    await acceptConsent(page)
    const input = page.getByLabel(chatbot.booking.steps.need.field)
    const inputRow = input.locator('xpath=..')
    const send = region.locator('form button[type="submit"]')
    expect(PACKAGE_FONT_SIZES, 'input font size is body-lg (18px)').toContain(
      Number.parseFloat(await styleOf(input, 'font-size')),
    )
    expect(Number.parseFloat(await styleOf(input, 'font-size')), 'input font size is body-lg (18px)').toBe(18)
    // The body-lg token is unitless 1.5; on the input, Chrome reports the used value (18 × 1.5 = 27px).
    expect(
      Math.abs(
        Number.parseFloat(await styleOf(input, 'line-height')) / Number.parseFloat(await styleOf(input, 'font-size')) -
          1.5,
      ),
      'input line height is the body-lg token (1.5)',
    ).toBeLessThan(0.01)
    expect(
      await sameColor(page, await styleOf(input, 'color'), await tokenValue(page, '--softn-input-text')),
      'input text color is --softn-input-text',
    ).toBe(true)
    // The input takes focus on arrival, so the underline first shows the focus token; blurred, the
    // default token comes back.
    expect(
      await sameColor(
        page,
        await styleOf(inputRow, 'border-bottom-color'),
        await tokenValue(page, '--softn-input-border-focus'),
      ),
      'input underline (focused) is --softn-input-border-focus',
    ).toBe(true)
    await input.evaluate((element) => (element as HTMLInputElement).blur())
    // The row transitions its border colour back: poll until the default token is restored.
    await expect
      .poll(
        async () =>
          sameColor(
            page,
            await styleOf(inputRow, 'border-bottom-color'),
            await tokenValue(page, '--softn-input-border-default'),
          ),
        'input underline (blurred) is --softn-input-border-default',
      )
      .toBe(true)
    expect(PACKAGE_SIZES, 'send button is --softn-size-md (44px)').toContain(
      Number.parseFloat(await styleOf(send, 'width')),
    )
    expect(Number.parseFloat(await styleOf(send, 'height')), 'send button is square').toBe(44)
    expect(PACKAGE_RADII, 'send radius is pill').toContain(Number.parseFloat(await styleOf(send, 'border-radius')))
    expect(
      await sameColor(page, await styleOf(send, 'border-top-color'), await tokenValue(page, '--softn-border-active')),
      'send border is --softn-border-active',
    ).toBe(true)

    // The progress label: the caption token and the brand-foreground color.
    const progressLabel = step.locator('p').first()
    expect(Number.parseFloat(await styleOf(progressLabel, 'font-size')), 'progress label is caption (11px)').toBe(11)
    expect(
      await sameColor(page, await styleOf(progressLabel, 'color'), await tokenValue(page, '--softn-brand-foreground')),
      'progress label color is --softn-brand-foreground',
    ).toBe(true)

    // The slot step: the chips list, a slot chip and the timezone note.
    await answerNeed(page)
    const chipsList = step.locator('ul').first()
    const chip = region.locator('[data-booking-slot]').first()
    const timezoneNote = step.locator('p').nth(1)
    expect(Number.parseFloat(await styleOf(chipsList, 'row-gap')), 'chips row gap is --softn-space-4 (16px)').toBe(16)
    expect(
      Number.parseFloat(await styleOf(chipsList, 'column-gap')),
      'chips column gap is --softn-space-6 (24px)',
    ).toBe(24)
    expect(
      Number.parseFloat(await styleOf(chip, 'padding-block-end')),
      'chip padding-block is --softn-space-2 (8px)',
    ).toBe(8)
    expect(
      Number.parseFloat(await styleOf(chip, 'padding-inline-start')),
      'chip padding-inline is --softn-space-5 (20px)',
    ).toBe(20)
    expect(PACKAGE_RADII, 'chip radius is pill').toContain(Number.parseFloat(await styleOf(chip, 'border-radius')))
    expect(Number.parseFloat(await styleOf(chip, 'font-size')), 'slot chip is body-md (16px)').toBe(16)
    expect(
      await sameColor(page, await styleOf(chip, 'color'), await tokenValue(page, '--softn-color-secondary')),
      'slot chip text color is --softn-color-secondary',
    ).toBe(true)
    expect(
      await sameColor(page, await styleOf(chip, 'border-top-color'), await tokenValue(page, '--softn-border-default')),
      'slot chip border is --softn-border-default',
    ).toBe(true)
    expect(Number.parseFloat(await styleOf(timezoneNote, 'font-size')), 'timezone note is body-sm (14px)').toBe(14)
    expect(
      await sameColor(page, await styleOf(timezoneNote, 'color'), await tokenValue(page, '--softn-color-tertiary')),
      'timezone note color is --softn-color-tertiary',
    ).toBe(true)

    // The recap step: the recap title, the rows and the confirm button.
    await answerIdentity(page)
    const recapTitle = region.getByRole('heading', { name: chatbot.booking.recap.title })
    const recapList = region.locator('ol + div > div ul')
    const recapRow = region.locator('ol + div > div ul li').first()
    const confirm = region.getByRole('button', { name: chatbot.booking.recap.confirm })
    expect(PACKAGE_FONT_SIZES, 'recap title font size is a package font size').toContain(
      Number.parseFloat(await styleOf(recapTitle, 'font-size')),
    )
    expect(PACKAGE_FONT_WEIGHTS, 'recap title weight').toContain(
      Number.parseFloat(await styleOf(recapTitle, 'font-weight')),
    )
    expect(
      await sameColor(page, await styleOf(recapTitle, 'color'), await tokenValue(page, '--softn-color')),
      'recap title color is --softn-color',
    ).toBe(true)
    expect(Number.parseFloat(await styleOf(recapList, 'row-gap')), 'recap list gap is --softn-space-4 (16px)').toBe(16)
    expect(
      Number.parseFloat(await styleOf(recapRow, 'padding-block-end')),
      'recap row padding-block-end is --softn-space-4 (16px)',
    ).toBe(16)
    const recapLabel = recapRow.locator('p').first()
    const recapValue = recapRow.locator('p').nth(1)
    expect(Number.parseFloat(await styleOf(recapLabel, 'font-size')), 'recap label is caption (11px)').toBe(11)
    expect(
      await sameColor(page, await styleOf(recapLabel, 'color'), await tokenValue(page, '--softn-color-tertiary')),
      'recap label color is --softn-color-tertiary',
    ).toBe(true)
    expect(Number.parseFloat(await styleOf(recapValue, 'font-size')), 'recap value is body-md (16px)').toBe(16)
    expect(
      await sameColor(page, await styleOf(recapValue, 'color'), await tokenValue(page, '--softn-color')),
      'recap value color is --softn-color',
    ).toBe(true)
    expect(
      await sameColor(
        page,
        await styleOf(confirm, 'background-color'),
        await tokenValue(page, '--softn-button-primary-background-default'),
      ),
      'confirm background is --softn-button-primary-background-default',
    ).toBe(true)
    expect(
      await sameColor(
        page,
        await styleOf(confirm, 'color'),
        await tokenValue(page, '--softn-button-primary-text-default'),
      ),
      'confirm text color is --softn-button-primary-text-default',
    ).toBe(true)
    expect(Number.parseFloat(await styleOf(confirm, 'min-height')), 'confirm height is --softn-size-lg (52px)').toBe(52)

    // The success step: the title, the list and the restart button.
    await confirm.click()
    await expect(region.getByRole('heading', { name: chatbot.booking.success.title })).toBeVisible()
    const successTitle = region.getByRole('heading', { name: chatbot.booking.success.title })
    expect(PACKAGE_FONT_SIZES, 'success title font size is a package font size').toContain(
      Number.parseFloat(await styleOf(successTitle, 'font-size')),
    )
    expect(
      await sameColor(page, await styleOf(successTitle, 'color'), await tokenValue(page, '--softn-success')),
      'success title color is --softn-success',
    ).toBe(true)
    expect(calls.bookingCalls, 'the walk confirmed one booking').toHaveLength(1)
  }

  test('uses only package token values on the booking flow elements, in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await expectBookingTokenValues(page, calls)
  })

  test('uses only package token values on the booking flow elements, in the light theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    const calls = await mockHappyPath(page)
    await page.goto('/preview')
    await page.getByRole('button', { name: chatbot.suggestions.book }).click()
    await expectBookingTokenValues(page, calls)
  })
})
