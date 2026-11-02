/*
 * Shared fixtures of the booking-flow tests.
 *
 * The flow is exercised twice: directly, where fake timers can drive its pacing, and through the
 * agent section, where the lazy chunk needs the real event loop. Both need the same slots, the same
 * mocked endpoints and the same way of reading the transcript.
 */

import { vi } from 'vitest'
import { chatbot } from '@/locales/fr/chatbot'

/** Free slots returned by the mocked availability endpoint. */
export const SLOTS = [
  '2026-11-02T08:30:00.000Z',
  '2026-11-02T09:00:00.000Z',
  '2026-11-02T09:30:00.000Z',
  '2026-11-02T10:00:00.000Z',
  '2026-11-02T10:30:00.000Z',
  '2026-11-02T11:00:00.000Z',
  '2026-11-02T13:00:00.000Z',
  '2026-11-02T13:30:00.000Z',
].map((start) => ({ start, end: new Date(Date.parse(start) + 30 * 60_000).toISOString() }))

/** One JSON answer, as the Route Handlers send it. */
export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Answers the two booking endpoints, with the slots of the fixture. */
export const answerBooking = (
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  bookingResponse: () => Response = () => jsonResponse({ booked: true }),
): void => {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input)
    if (url === '/api/booking/slots') return jsonResponse({ slots: SLOTS })
    if (url === '/api/booking') return bookingResponse()
    if (url === '/api/assistant') return jsonResponse({ answer: 'Une réponse du modèle.' })
    throw new Error(`unexpected call to ${url}`)
  })
}

/** Every call the flow made to one endpoint, with its parsed body. */
export const callsTo = (
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  url: string,
): readonly { readonly body: unknown }[] =>
  fetchMock.mock.calls
    .filter(([input]) => String(input) === url)
    .map(([, init]) => ({ body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) }))

/** How many times the availability was asked for. */
export const slotsCalls = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>): number =>
  fetchMock.mock.calls.filter(([input]) => String(input) === '/api/booking/slots').length

/**
 * Answers the motion preference the flow reads.
 *
 * Reduced motion makes the flow reveal its messages without pausing: tests that are not about the
 * pacing use it, so the flow's own behaviour (draft, order, errors) is under test without waiting
 * for a conversation to be typed out. The pacing tests ask for the real preference instead.
 */
export const stubMotionPreference = (reduced: boolean, belowMd = false): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    // The md query and the motion preference are the two the flow asks about. Jsdom has no width, so
    // the test says which side of the breakpoint to be on; the default is the desktop layout.
    matches: query.includes('min-width') ? !belowMd : reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

/**
 * The consent message as it renders: its privacy-policy placeholder is replaced by the words the link
 * carries, so an assertion compares against what a visitor reads, not against the raw template.
 */
export const renderedConsentMessage = (): string =>
  chatbot.consent.message.replace('{privacyPolicyLink}', chatbot.consent.link.inlineLabel)

/** Part of a locale template before the contact-page link, which the component renders apart. */
export const beforeContactLink = (template: string): string => (template.split('{contactPageLink}')[0] ?? '').trim()

/**
 * Text with every non-breaking space turned into an ordinary one.
 *
 * The site's French copy keeps the punctuation attached with U+00A0, and the testing-library
 * normalizer does not collapse that character: comparisons go through this helper instead.
 */
export const sameText = (value: string): string => value.replaceAll('\u00A0', ' ')

/** `getByText` matcher for a locale string, whatever kind of space it holds. */
export const plainSpaces =
  (expected: string) =>
  (content: string): boolean =>
    sameText(content) === sameText(expected)

/** `getByText` matcher for a locale fragment, whatever kind of space it holds. */
export const plainSpacesContaining =
  (expected: string) =>
  (content: string): boolean =>
    sameText(content).includes(sameText(expected))
