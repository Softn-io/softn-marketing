import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { findFreeSlots } from '@/lib/booking/availability'
import { BOOKING_LEAD_FIELDS, BOOKING_LEAD_STATUS_CANCELLED } from '@/lib/booking/lead'
import { bookingManageToken, verifyBookingManageToken } from '@/lib/booking/manageToken'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { isBookingSlotsResponse } from '@/schemas/bookingLimits'
import { isBookingManageErrorResponse } from '@/schemas/bookingManageLimits'
import { POST } from './route'

const calendarMock = vi.hoisted(() => ({
  readBookingEvent: vi.fn(),
  queryBusyIntervals: vi.fn(),
  countBookedCallsPerDay: vi.fn(),
  rescheduleBookingEvent: vi.fn(),
  cancelBookingEvent: vi.fn(),
}))

const baserowMock = vi.hoisted(() => ({ updateBaserowRow: vi.fn() }))

const rateLimitMock = vi.hoisted(() => ({ checkRateLimit: vi.fn(), trustedClientIp: vi.fn() }))

vi.mock('@/lib/google/calendar', () => calendarMock)
vi.mock('@/lib/baserow', () => baserowMock)
vi.mock('@/lib/assistant/rateLimit', () => rateLimitMock)

const SECRET = 's'.repeat(48)
const EVENT_ID = 'softnabc0123456789abcdefghijkl'

let errorSpy: MockInstance

/** Instant ten days ahead: a long way past the reschedule notice whatever the hour of the day. */
const FAR_START = new Date(Date.now() + 10 * 86_400_000).toISOString()

/** One live booking event, with the answers and the old manage link its description holds. */
const liveEvent = (start: string = FAR_START) => ({
  eventId: EVENT_ID,
  cancelled: false,
  start,
  end: new Date(Date.parse(start) + BOOKING_RULES.slotMinutes * 60_000).toISOString(),
  description: 'Besoin : automatiser mes devis\nlien: https://softn.io/rendez-vous/old-token',
  leadRowId: '42',
})

const tokenFor = (expiresAt: string = FAR_START): string => {
  const token = bookingManageToken({ secret: SECRET, eventId: EVENT_ID, expiresAt })
  if (token === null) throw new Error('the fixture must build a token')
  return token
}

/** The slot a free list offers, so the fixture is always a real bookable instant. */
const freeSlot = (index = 0): { start: string; end: string } => {
  const slots = findFreeSlots({ rules: BOOKING_RULES, busy: [], bookedCallsPerDay: {}, now: new Date() })
  const slot = slots[index]
  if (slot === undefined) throw new Error('the rules offer no slot to test with')
  return { start: slot.start, end: slot.end }
}

const request = (body: unknown, headers: Readonly<Record<string, string>> = {}): Request =>
  new Request('http://localhost/api/booking/manage', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('BOOKING_LINK_SECRET', SECRET)
  vi.stubEnv('BASEROW_LEADS_TABLE_ID', '42')

  calendarMock.readBookingEvent.mockReset()
  calendarMock.queryBusyIntervals.mockReset()
  calendarMock.countBookedCallsPerDay.mockReset()
  calendarMock.rescheduleBookingEvent.mockReset()
  calendarMock.cancelBookingEvent.mockReset()
  baserowMock.updateBaserowRow.mockReset()
  rateLimitMock.checkRateLimit.mockReset()
  rateLimitMock.trustedClientIp.mockReset()

  calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent() })
  calendarMock.queryBusyIntervals.mockResolvedValue({ ok: true, data: [] })
  calendarMock.countBookedCallsPerDay.mockResolvedValue({ ok: true, data: {} })
  calendarMock.rescheduleBookingEvent.mockResolvedValue({ ok: true, data: { eventId: EVENT_ID } })
  calendarMock.cancelBookingEvent.mockResolvedValue({ ok: true, data: true })
  baserowMock.updateBaserowRow.mockResolvedValue({ ok: true, data: { id: 42 } })
  rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'allowed' })
  rateLimitMock.trustedClientIp.mockReturnValue('test-client')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/booking/manage guards', () => {
  it('refuses a request without a browser origin, before any calendar call', async () => {
    const response = await POST(request({ action: 'cancel', token: tokenFor() }, { origin: '' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request', async () => {
    const response = await POST(request({ action: 'cancel', token: tokenFor() }, { origin: 'https://evil.example' }))

    expect(response.status).toBe(403)
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON', async () => {
    const response = await POST(request('action=slots', { 'content-type': 'text/plain' }))

    expect(response.status).toBe(415)
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
  })

  it('refuses a body that does not parse or does not match the schema', async () => {
    expect((await POST(request('{ not json'))).status).toBe(400)
    expect((await POST(request({ action: 'unknown', token: tokenFor() }))).status).toBe(400)
    expect((await POST(request({ action: 'reschedule', token: tokenFor() }))).status).toBe(400)
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
  })

  it('answers the rate limit with its own code', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'limited' })

    const response = await POST(request({ action: 'cancel', token: tokenFor() }))

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate-limited' })
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
  })

  it('fails closed when the shared rate-limit store is unavailable', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: false, error: 'store-unavailable', status: 500 })

    const response = await POST(request({ action: 'cancel', token: tokenFor() }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledWith('[booking] manage: unavailable: rate-limit store-unavailable status=500')
  })
})

describe('POST /api/booking/manage token', () => {
  it('refuses a token it did not sign, before any Google call', async () => {
    const response = await POST(request({ action: 'slots', token: 'not-a-signed-token' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
    expect(calendarMock.queryBusyIntervals).not.toHaveBeenCalled()
  })

  it('answers an expired token as a started call, before any Google call', async () => {
    const expired = tokenFor(new Date(Date.now() - 60_000).toISOString())

    const response = await POST(request({ action: 'slots', token: expired }))

    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'started' })
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[booking] manage: token refused: expired')
  })

  it('refuses every token when the deployment has no signing secret', async () => {
    vi.stubEnv('BOOKING_LINK_SECRET', '')

    const response = await POST(request({ action: 'slots', token: tokenFor() }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(calendarMock.readBookingEvent).not.toHaveBeenCalled()
  })

  it('treats an event that is not one of ours as not found', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: false, error: 'not-found' })

    const response = await POST(request({ action: 'cancel', token: tokenFor() }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(calendarMock.cancelBookingEvent).not.toHaveBeenCalled()
    expect(baserowMock.updateBaserowRow).not.toHaveBeenCalled()
  })

  it('keeps the calendar failure as a generic unavailable code, without an upstream body', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: false, error: 'request-failed', status: 502 })

    const response = await POST(request({ action: 'cancel', token: tokenFor() }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledWith(
      '[booking] manage: calendar unavailable: events get request-failed status=502',
    )
  })
})

describe('POST /api/booking/manage slots', () => {
  const eventStart = freeSlot(3).start

  it('answers the free slots only, with the current slot left out', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent(eventStart) })

    const response = await POST(request({ action: 'slots', token: tokenFor(eventStart) }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const payload: unknown = await response.json()
    if (!isBookingSlotsResponse(payload)) throw new Error('the answer must be a slots answer')

    const starts = payload.slots.map((slot) => slot.start)
    expect(starts.length).toBeGreaterThan(0)
    expect(starts).not.toContain(new Date(Date.parse(eventStart)).toISOString())
    // Free slot times only: never a busy interval, an event, or a personal field.
    for (const slot of payload.slots) expect(Object.keys(slot).sort()).toEqual(['end', 'start'])
  })

  it('releases the event from its own day before counting, and never answers a refused window', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent(eventStart) })

    const response = await POST(request({ action: 'slots', token: tokenFor(eventStart) }))

    expect(response.status).toBe(200)
    expect(calendarMock.queryBusyIntervals).toHaveBeenCalledWith(
      expect.objectContaining({ timeMin: expect.any(String), timeMax: expect.any(String) }),
    )
    expect(calendarMock.countBookedCallsPerDay).toHaveBeenCalledWith(expect.objectContaining({ rules: BOOKING_RULES }))
  })

  it('fails closed when the availability cannot be read', async () => {
    calendarMock.queryBusyIntervals.mockResolvedValue({ ok: false, error: 'not-configured' })

    const response = await POST(request({ action: 'slots', token: tokenFor() }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it('refuses the chooser inside the reschedule notice, without asking for availability', async () => {
    const soon = new Date(Date.now() + 6 * 3_600_000).toISOString()
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent(soon) })

    const response = await POST(request({ action: 'slots', token: tokenFor(soon) }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'late' })
    expect(calendarMock.queryBusyIntervals).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[booking] manage: action refused: too-late')
  })
})

describe('POST /api/booking/manage reschedule', () => {
  const newSlot = freeSlot(5)

  it('moves the event, refreshes its manage link and patches the slot of the leads row', async () => {
    const response = await POST(request({ action: 'reschedule', token: tokenFor(), slot: newSlot.start }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ rescheduled: true })
    expect(response.headers.get('Cache-Control')).toBe('no-store')

    const move = calendarMock.rescheduleBookingEvent.mock.calls[0]?.[0] as {
      eventId: string
      slot: { start: string; end: string }
      description: string
    }
    expect(move.eventId).toBe(EVENT_ID)
    expect(move.slot).toEqual({
      start: new Date(Date.parse(newSlot.start)).toISOString(),
      end: new Date(Date.parse(newSlot.start) + BOOKING_RULES.slotMinutes * 60_000).toISOString(),
    })
    // The answers are kept and the link is rebuilt for this same event and the new start.
    expect(move.description).toContain('Besoin : automatiser mes devis')
    expect(move.description).not.toContain('old-token')
    expect(move.description).toContain(`http://localhost/rendez-vous/`)
    const freshToken = /rendez-vous\/([A-Za-z0-9_.-]+)/.exec(move.description)?.[1] ?? ''
    expect(verifyBookingManageToken({ secret: SECRET, token: freshToken })).toEqual({
      ok: true,
      data: { eventId: EVENT_ID, expiresAt: Date.parse(newSlot.start) },
    })

    expect(baserowMock.updateBaserowRow).toHaveBeenCalledWith({
      tableId: '42',
      rowId: 42,
      fields: { [BOOKING_LEAD_FIELDS.slot]: new Date(Date.parse(newSlot.start)).toISOString() },
    })
  })

  it('pins the fresh manage link to the canonical site in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')

    const response = await POST(request({ action: 'reschedule', token: tokenFor(), slot: newSlot.start }))

    expect(response.status).toBe(200)
    const move = calendarMock.rescheduleBookingEvent.mock.calls[0]?.[0] as { description: string }
    expect(move.description).toContain('https://softn.io/rendez-vous/')
    expect(move.description).not.toContain('localhost')
  })

  it('writes nothing when the re-check of the new slot fails', async () => {
    calendarMock.queryBusyIntervals.mockResolvedValue({
      ok: true,
      data: [{ start: newSlot.start, end: newSlot.end }],
    })

    const response = await POST(request({ action: 'reschedule', token: tokenFor(), slot: newSlot.start }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'slot-taken' })
    expect(calendarMock.rescheduleBookingEvent).not.toHaveBeenCalled()
    expect(baserowMock.updateBaserowRow).not.toHaveBeenCalled()
  })

  it('refuses a slot that is not one the rules offer, without writing', async () => {
    const offGrid = new Date(Date.parse(newSlot.start) + 7 * 60_000).toISOString()

    const response = await POST(request({ action: 'reschedule', token: tokenFor(), slot: offGrid }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'slot-taken' })
    expect(calendarMock.rescheduleBookingEvent).not.toHaveBeenCalled()
  })

  it('answers a failed patch as unavailable and never touches Baserow', async () => {
    calendarMock.rescheduleBookingEvent.mockResolvedValue({ ok: false, error: 'request-failed', status: 500 })

    const response = await POST(request({ action: 'reschedule', token: tokenFor(), slot: newSlot.start }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(baserowMock.updateBaserowRow).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[booking] manage: calendar unavailable: events patch request-failed status=500',
    )
  })

  it('keeps the moved answer when only Baserow fails, and logs one code without personal data', async () => {
    baserowMock.updateBaserowRow.mockResolvedValue({ ok: false, error: 'request-failed', status: 403 })

    const response = await POST(request({ action: 'reschedule', token: tokenFor(), slot: newSlot.start }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ rescheduled: true })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = String(errorSpy.mock.calls[0]?.[0])
    expect(logged).toBe('[booking] manage: lead not updated: baserow request-failed status=403')
    for (const personal of [EVENT_ID, newSlot.start, tokenFor(), 'marie@example.fr']) {
      expect(logged).not.toContain(personal)
    }
  })

  it('still moves the event when the event carries no row id', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: { ...liveEvent(), leadRowId: undefined } })

    const response = await POST(request({ action: 'reschedule', token: tokenFor(), slot: newSlot.start }))

    expect(response.status).toBe(200)
    expect(calendarMock.rescheduleBookingEvent).toHaveBeenCalledTimes(1)
    expect(baserowMock.updateBaserowRow).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[booking] manage: lead not updated: baserow not-configured')
  })

  it('refuses a started call and an already cancelled one', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent(past) })

    const started = await POST(request({ action: 'reschedule', token: tokenFor(past), slot: newSlot.start }))
    expect(started.status).toBe(410)
    expect(await started.json()).toEqual({ error: 'started' })

    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: { ...liveEvent(), cancelled: true } })
    const cancelled = await POST(request({ action: 'reschedule', token: tokenFor(), slot: newSlot.start }))
    expect(cancelled.status).toBe(409)
    expect(await cancelled.json()).toEqual({ error: 'cancelled' })

    expect(calendarMock.rescheduleBookingEvent).not.toHaveBeenCalled()
  })
})

describe('POST /api/booking/manage cancel', () => {
  it('cancels the event and writes the cancelled status with the reason label', async () => {
    const response = await POST(request({ action: 'cancel', token: tokenFor(), reason: 'prevented' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cancelled: true })
    expect(calendarMock.cancelBookingEvent).toHaveBeenCalledWith({ eventId: EVENT_ID, subjectToken: undefined })
    expect(baserowMock.updateBaserowRow).toHaveBeenCalledWith({
      tableId: '42',
      rowId: 42,
      fields: {
        [BOOKING_LEAD_FIELDS.status]: BOOKING_LEAD_STATUS_CANCELLED,
        [BOOKING_LEAD_FIELDS.cancelReason]: 'Empêchement',
      },
    })
  })

  it('cancels without a reason, leaving the reason column untouched', async () => {
    const response = await POST(request({ action: 'cancel', token: tokenFor() }))

    expect(response.status).toBe(200)
    expect(baserowMock.updateBaserowRow).toHaveBeenCalledWith({
      tableId: '42',
      rowId: 42,
      fields: { [BOOKING_LEAD_FIELDS.status]: BOOKING_LEAD_STATUS_CANCELLED },
    })
  })

  it('refuses a reason outside the four known codes, before any write', async () => {
    const response = await POST(request({ action: 'cancel', token: tokenFor(), reason: 'because I said so' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(calendarMock.cancelBookingEvent).not.toHaveBeenCalled()
    expect(baserowMock.updateBaserowRow).not.toHaveBeenCalled()
  })

  it('allows a cancellation inside the reschedule notice', async () => {
    const soon = new Date(Date.now() + 6 * 3_600_000).toISOString()
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent(soon) })

    const response = await POST(request({ action: 'cancel', token: tokenFor(soon) }))

    expect(response.status).toBe(200)
    expect(calendarMock.cancelBookingEvent).toHaveBeenCalledTimes(1)
  })

  it('refuses a cancellation once the call has started', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    calendarMock.readBookingEvent.mockResolvedValue({ ok: true, data: liveEvent(past) })

    const response = await POST(request({ action: 'cancel', token: tokenFor(past) }))

    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'started' })
    expect(calendarMock.cancelBookingEvent).not.toHaveBeenCalled()
  })

  it('tells the visitor the service is unavailable when the deletion fails, and changes nothing else', async () => {
    calendarMock.cancelBookingEvent.mockResolvedValue({ ok: false, error: 'timeout' })

    const response = await POST(request({ action: 'cancel', token: tokenFor() }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(baserowMock.updateBaserowRow).not.toHaveBeenCalled()
  })

  it('keeps the cancelled answer when only Baserow fails', async () => {
    baserowMock.updateBaserowRow.mockResolvedValue({ ok: false, error: 'not-configured' })

    const response = await POST(request({ action: 'cancel', token: tokenFor() }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cancelled: true })
    expect(errorSpy).toHaveBeenCalledWith('[booking] manage: lead not updated: baserow not-configured')
  })

  it('never logs the token or the reason label', async () => {
    baserowMock.updateBaserowRow.mockResolvedValue({ ok: false, error: 'request-failed' })
    const token = tokenFor()

    await POST(request({ action: 'cancel', token, reason: 'other' }))

    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain(token)
    expect(logged).not.toContain('Autre')
  })
})

describe('POST /api/booking/manage error shapes', () => {
  it('answers only known error codes, without any upstream detail', async () => {
    calendarMock.readBookingEvent.mockResolvedValue({ ok: false, error: 'timeout' })

    const response = await POST(request({ action: 'cancel', token: tokenFor() }))

    const payload: unknown = await response.json()
    expect(isBookingManageErrorResponse(payload)).toBe(true)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
