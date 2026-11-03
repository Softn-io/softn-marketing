// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatSlotLabel } from '@/lib/booking/labels'
import { bookingManageToken } from '@/lib/booking/manageToken'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { bookingManage } from '@/locales/fr/bookingManage'
import RendezvousPage, { metadata } from './page'

const calendarMock = vi.hoisted(() => ({
  readBookingEvent: vi.fn(),
  rescheduleBookingEvent: vi.fn(),
  cancelBookingEvent: vi.fn(),
}))

const headersMock = vi.hoisted(() => ({ headers: vi.fn() }))

vi.mock('@/lib/google/calendar', () => calendarMock)
vi.mock('next/headers', () => headersMock)

const SECRET = 's'.repeat(48)
const EVENT_ID = 'softnabc0123456789abcdefghijkl'

/** Instant ten days ahead: well past the reschedule notice. */
const START = new Date(Date.now() + 10 * 86_400_000).toISOString()
const END = new Date(Date.parse(START) + BOOKING_RULES.slotMinutes * 60_000).toISOString()

const tokenFor = (expiresAt: string = START): string => {
  const token = bookingManageToken({ secret: SECRET, eventId: EVENT_ID, expiresAt })
  if (token === null) throw new Error('the fixture must build a token')
  return token
}

const liveEvent = (start: string = START, overrides: Readonly<Record<string, unknown>> = {}) => ({
  eventId: EVENT_ID,
  cancelled: false,
  start,
  end: new Date(Date.parse(start) + BOOKING_RULES.slotMinutes * 60_000).toISOString(),
  description: 'Besoin : automatiser mes devis',
  leadRowId: '42',
  ...overrides,
})

const renderPage = async (token: string): Promise<void> => {
  const ui = await RendezvousPage({ params: Promise.resolve({ token }) })
  render(ui)
}

beforeEach(() => {
  vi.stubEnv('BOOKING_LINK_SECRET', SECRET)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
  headersMock.headers.mockReset()
  headersMock.headers.mockResolvedValue(new Headers())
  calendarMock.readBookingEvent.mockReset()
  calendarMock.rescheduleBookingEvent.mockReset()
  calendarMock.cancelBookingEvent.mockReset()
  calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent() })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('rendez-vous page', () => {
  it('renders the appointment and its two actions for a live event, without writing anything', async () => {
    await renderPage(tokenFor())

    expect(calendarMock.readBookingEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      subjectToken: undefined,
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.title)
    // The recap shows the slot and the format only: the name, the address and the need never render.
    expect(screen.getByText(formatSlotLabel({ start: START, end: END }, BOOKING_RULES))).toBeTruthy()
    expect(screen.getByText(bookingManage.recap.formatValue)).toBeTruthy()
    expect(screen.getByRole('button', { name: bookingManage.reschedule.action })).toBeTruthy()
    expect(screen.getByRole('button', { name: bookingManage.cancel.action })).toBeTruthy()

    // A page load changes nothing: the two writing calls are never made.
    expect(calendarMock.rescheduleBookingEvent).not.toHaveBeenCalled()
    expect(calendarMock.cancelBookingEvent).not.toHaveBeenCalled()
  })

  it('renders the invalid state without any Google call when the token is not signed', async () => {
    await renderPage('not-a-signed-token')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.states.invalid.title)
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
    expect(calendarMock.rescheduleBookingEvent).not.toHaveBeenCalled()
    expect(calendarMock.cancelBookingEvent).not.toHaveBeenCalled()
  })

  it('renders the expired link as a started call, without any Google call', async () => {
    await renderPage(tokenFor(new Date(Date.now() - 60_000).toISOString()))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.states.started.title)
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
  })

  it('renders the unavailable state with a retry link when the calendar cannot answer', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: false, error: 'request-failed', status: 502 })
    const token = tokenFor()

    await renderPage(token)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.title)
    expect(screen.getByRole('link', { name: bookingManage.errors.retry }).getAttribute('href')).toBe(
      `/rendez-vous/${token}`,
    )
  })

  it('renders an event that is not one of ours as an invalid link', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: false, error: 'not-found' })

    await renderPage(tokenFor())

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.states.invalid.title)
  })

  it('renders an already cancelled event with its way back to the reservation', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent(START, { cancelled: true }) })

    await renderPage(tokenFor())

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.states.cancelled.title)
    const bookAgain = screen.getByRole('link', { name: bookingManage.states.cancelled.bookAgain })
    expect(bookAgain.getAttribute('href')).toBe('/?rdv=1#assistant')
  })

  it('renders a call inside the reschedule notice as not movable, cancellation still open', async () => {
    const soon = new Date(Date.now() + 6 * 3_600_000).toISOString()
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent(soon) })

    await renderPage(tokenFor(soon))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.states.late.title)
    expect(screen.getByRole('button', { name: bookingManage.cancel.action })).toBeTruthy()
    expect(screen.queryByRole('button', { name: bookingManage.reschedule.action })).toBeNull()
  })

  it('hides itself from search engines, without a canonical URL', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.alternates?.canonical).toBeNull()
    expect(metadata.title).toBe(bookingManage.meta.title)
  })
})
