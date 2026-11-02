import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { findFreeSlots } from '@/lib/booking/availability'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { BOOKING_SLOTS_MAX } from '@/schemas/bookingLimits'
import { GET } from './route'

const calendarMock = vi.hoisted(() => ({
  queryBusyIntervals: vi.fn(),
  countBookedCallsPerDay: vi.fn(),
}))

const rateLimitMock = vi.hoisted(() => ({ checkRateLimit: vi.fn(), trustedClientIp: vi.fn() }))

vi.mock('@/lib/google/calendar', () => calendarMock)
vi.mock('@/lib/assistant/rateLimit', () => rateLimitMock)

let errorSpy: MockInstance

const request = (headers: Readonly<Record<string, string>> = { origin: 'http://localhost' }): Request =>
  new Request('http://localhost/api/booking/slots', { method: 'GET', headers })

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  calendarMock.queryBusyIntervals.mockReset()
  calendarMock.countBookedCallsPerDay.mockReset()
  rateLimitMock.checkRateLimit.mockReset()
  rateLimitMock.trustedClientIp.mockReset()

  calendarMock.queryBusyIntervals.mockResolvedValue({ ok: true, data: [] })
  calendarMock.countBookedCallsPerDay.mockResolvedValue({ ok: true, data: {} })
  rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'allowed' })
  rateLimitMock.trustedClientIp.mockReturnValue('test-client')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/booking/slots', () => {
  it('answers the free slots of the rules, nothing else', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { slots: readonly Record<string, unknown>[] }
    const expected = findFreeSlots({
      rules: BOOKING_RULES,
      busy: [],
      bookedCallsPerDay: {},
      now: new Date(),
      limit: BOOKING_SLOTS_MAX,
    })

    expect(payload.slots).toEqual(expected)
    // Free slot times only: never a busy interval, an event or an attendee.
    for (const slot of payload.slots) expect(Object.keys(slot).sort()).toEqual(['end', 'start'])
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('counts the calls of the day so a full day is not offered', async () => {
    const [first] = findFreeSlots({ rules: BOOKING_RULES, busy: [], bookedCallsPerDay: {}, now: new Date() })
    const dayOfFirst = first?.start.slice(0, 10)
    calendarMock.countBookedCallsPerDay.mockResolvedValue({ ok: true, data: { [String(dayOfFirst)]: 0 } })

    const response = await GET(request())
    const payload = (await response.json()) as { slots: readonly { start: string }[] }

    expect(response.status).toBe(200)
    expect(payload.slots.length).toBeGreaterThan(0)
    expect(calendarMock.countBookedCallsPerDay).toHaveBeenCalledWith({
      rules: BOOKING_RULES,
      timeMin: expect.any(String),
      timeMax: expect.any(String),
    })
  })

  it('forwards the OIDC token of the request to the calendar calls', async () => {
    const response = await GET(
      new Request('http://localhost/api/booking/slots', {
        headers: { origin: 'http://localhost', 'x-vercel-oidc-token': 'oidc-token' },
      }),
    )

    expect(response.status).toBe(200)
    expect(calendarMock.queryBusyIntervals).toHaveBeenCalledWith(
      expect.objectContaining({ subjectToken: 'oidc-token' }),
    )
    expect(calendarMock.countBookedCallsPerDay).toHaveBeenCalledWith(
      expect.objectContaining({ subjectToken: 'oidc-token' }),
    )
  })

  it('names the credential step that failed, with its status', async () => {
    calendarMock.queryBusyIntervals.mockResolvedValue({ ok: false, error: 'unauthorized', status: 403, step: 'sts' })

    const response = await GET(request())

    expect(response.status).toBe(503)
    expect(errorSpy).toHaveBeenCalledWith('[booking] slots unavailable: calendar sts unauthorized status=403')
  })

  it('names the Calendar call that failed, with its status', async () => {
    calendarMock.countBookedCallsPerDay.mockResolvedValue({ ok: false, error: 'request-failed', status: 429 })

    const response = await GET(request())

    expect(response.status).toBe(503)
    expect(errorSpy).toHaveBeenCalledWith('[booking] slots unavailable: calendar events list request-failed status=429')
  })

  it('refuses a request without a browser origin', async () => {
    const response = await GET(request({ 'content-type': 'application/json' }))

    expect(response.status).toBe(403)
    expect(calendarMock.queryBusyIntervals).not.toHaveBeenCalled()
  })

  it('answers the rate limit with its own code', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'limited' })

    const response = await GET(request())

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate-limited' })
    expect(calendarMock.queryBusyIntervals).not.toHaveBeenCalled()
  })

  it('fails closed when the calendar cannot be read', async () => {
    calendarMock.queryBusyIntervals.mockResolvedValue({ ok: false, error: 'not-configured' })

    const response = await GET(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledWith('[booking] slots unavailable: calendar freeBusy not-configured')
  })

  it('fails closed when the call count cannot be read', async () => {
    calendarMock.countBookedCallsPerDay.mockResolvedValue({ ok: false, error: 'timeout' })

    const response = await GET(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledWith('[booking] slots unavailable: calendar events list timeout')
  })

  it('fails closed when the rate-limit store is unavailable', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: false, error: 'store-timeout' })

    const response = await GET(request())

    expect(response.status).toBe(503)
    expect(errorSpy).toHaveBeenCalledWith('[booking] slots unavailable: rate-limit store-timeout')
  })

  it('never leaks a busy interval into the answer', async () => {
    const [slot] = findFreeSlots({ rules: BOOKING_RULES, busy: [], bookedCallsPerDay: {}, now: new Date() })
    calendarMock.queryBusyIntervals.mockResolvedValue({
      ok: true,
      data: [{ start: '2026-01-01T09:00:00.000Z', end: '2026-01-01T10:00:00.000Z' }],
    })

    const response = await GET(request())
    const body = JSON.stringify(await response.json())

    expect(body).not.toContain('2026-01-01T09:00:00.000Z')
    expect(body).not.toContain('busy')
    expect(body).toContain(String(slot?.start))
  })
})
