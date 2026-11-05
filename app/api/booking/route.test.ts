import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { findFreeSlots } from '@/lib/booking/availability'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { BOOKING_LEAD_FIELDS, BOOKING_LEAD_STATUS_BOOKED } from '@/lib/booking/lead'
import { POST } from './route'

const calendarMock = vi.hoisted(() => ({
  queryBusyIntervals: vi.fn(),
  countBookedCallsPerDay: vi.fn(),
  insertBookingEvent: vi.fn(),
  markBookingLeadNotStored: vi.fn(),
  storeBookingLeadRowId: vi.fn(),
}))

const baserowMock = vi.hoisted(() => ({ createBaserowRow: vi.fn() }))

const rateLimitMock = vi.hoisted(() => ({ checkRateLimit: vi.fn(), trustedClientIp: vi.fn() }))

const emailMock = vi.hoisted(() => ({ sendBookingConfirmationEmail: vi.fn() }))

vi.mock('@/lib/google/calendar', () => calendarMock)
vi.mock('@/lib/baserow', () => baserowMock)
vi.mock('@/lib/assistant/rateLimit', () => rateLimitMock)
vi.mock('@/lib/booking/emails', () => emailMock)

let errorSpy: MockInstance

/** First slot the rules offer from the current instant: always inside notice and horizon. */
const freeSlot = (): { start: string; end: string } => {
  const [slot] = findFreeSlots({
    rules: BOOKING_RULES,
    busy: [],
    bookedCallsPerDay: {},
    now: new Date(),
  })

  if (slot === undefined) throw new Error('the rules offer no slot to test with')
  return { start: slot.start, end: slot.end }
}

/** Body of a valid booking, on a slot the rules offer. */
const bookingBody = (overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
  consent: true,
  reference: '',
  need: 'Automatiser mes devis',
  slot: freeSlot().start,
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'marie@example.fr',
  ...overrides,
})

const request = (
  body: unknown,
  headers: Readonly<Record<string, string>> = {
    origin: 'http://localhost',
    'content-type': 'application/json',
  },
): Request =>
  new Request('http://localhost/api/booking', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('BASEROW_LEADS_TABLE_ID', '42')
  vi.stubEnv('BOOKING_LINK_SECRET', 's'.repeat(48))
  calendarMock.queryBusyIntervals.mockReset()
  calendarMock.countBookedCallsPerDay.mockReset()
  calendarMock.insertBookingEvent.mockReset()
  calendarMock.markBookingLeadNotStored.mockReset()
  calendarMock.storeBookingLeadRowId.mockReset()
  baserowMock.createBaserowRow.mockReset()
  rateLimitMock.checkRateLimit.mockReset()
  rateLimitMock.trustedClientIp.mockReset()

  calendarMock.queryBusyIntervals.mockResolvedValue({ ok: true, data: [] })
  calendarMock.countBookedCallsPerDay.mockResolvedValue({ ok: true, data: {} })
  calendarMock.insertBookingEvent.mockResolvedValue({
    ok: true,
    data: { eventId: 'softnabc', iCalUid: 'softnabc@google.com', hangoutLink: 'https://meet.google.com/abc-defg-hij' },
  })
  calendarMock.markBookingLeadNotStored.mockResolvedValue({ ok: true, data: true })
  calendarMock.storeBookingLeadRowId.mockResolvedValue({ ok: true, data: true })
  baserowMock.createBaserowRow.mockResolvedValue({ ok: true, data: { id: 7 } })
  rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'allowed' })
  rateLimitMock.trustedClientIp.mockReturnValue('test-client')
  emailMock.sendBookingConfirmationEmail.mockReset()
  emailMock.sendBookingConfirmationEmail.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/booking guards', () => {
  it('refuses a request without a browser origin', async () => {
    const response = await POST(request(bookingBody(), { 'content-type': 'application/json' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request', async () => {
    const response = await POST(
      request(bookingBody(), { origin: 'https://evil.example', 'content-type': 'application/json' }),
    )

    expect(response.status).toBe(403)
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON', async () => {
    const response = await POST(request('slot=1', { origin: 'http://localhost', 'content-type': 'text/plain' }))

    expect(response.status).toBe(415)
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
  })

  it('refuses a body that does not parse', async () => {
    const response = await POST(
      request('{ not json', { origin: 'http://localhost', 'content-type': 'application/json' }),
    )

    expect(response.status).toBe(400)
  })

  it('answers the rate limit with its own code', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'limited' })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate-limited' })
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
  })

  it('fails closed when the shared rate-limit store is unavailable', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: false, error: 'store-unavailable', status: 500 })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledWith('[booking] unavailable: rate-limit store-unavailable status=500')
  })
})

describe('POST /api/booking phone', () => {
  it.each(['06010203', '601020304', '0012345678', '1111111111'])(
    'refuses %s as invalid, without touching the calendar or Baserow',
    async (phone) => {
      const response = await POST(request(bookingBody({ phone })))

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid' })
      expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
      expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
    },
  )

  it('sends a valid number through, and leaves an absent one out of the stored lead', async () => {
    const withPhone = await POST(request(bookingBody({ phone: '06 01 02 03 04' })))
    expect(withPhone.status).toBe(200)
    expect(baserowMock.createBaserowRow.mock.calls[0]?.[0]).toMatchObject({ fields: { Phone: '06 01 02 03 04' } })

    vi.clearAllMocks()
    const withoutPhone = await POST(request(bookingBody()))
    expect(withoutPhone.status).toBe(200)
    expect(calendarMock.insertBookingEvent).toHaveBeenCalled()
    expect(baserowMock.createBaserowRow.mock.calls[0]?.[0]).toMatchObject({
      fields: expect.not.objectContaining({ Phone: expect.anything() }),
    })
  })
})

describe('POST /api/booking e-mail', () => {
  it.each(['a@b.c', 'a@b.', 'a@b', 'a@.fr', 'a@b.fr.x'])(
    'refuses %s as invalid, without touching the calendar or Baserow',
    async (email) => {
      const response = await POST(request(bookingBody({ email })))

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid' })
      expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
      expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
    },
  )
})

describe('POST /api/booking consent and spam', () => {
  it('rejects a booking without a recorded consent', async () => {
    const response = await POST(request(bookingBody({ consent: false })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(calendarMock.queryBusyIntervals).not.toHaveBeenCalled()
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('stamps the consent instant on the server, never from the payload', async () => {
    const before = Date.now()

    const response = await POST(request(bookingBody({ consentAt: '2000-01-01T00:00:00.000Z' })))

    expect(response.status).toBe(200)
    const row = baserowMock.createBaserowRow.mock.calls[0]?.[0] as { fields: Record<string, unknown> }
    const consentOn = String(row.fields[BOOKING_LEAD_FIELDS.consentOn])
    const stampedDay = new Date(before).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
    expect(consentOn).toBe(stampedDay)
    expect(JSON.stringify(row.fields)).not.toContain('2000-01-01')
  })

  it('answers a filled honeypot like a success, without reaching the calendar or Baserow', async () => {
    const response = await POST(request(bookingBody({ reference: 'https://spam.example' })))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ booked: true })
    expect(calendarMock.queryBusyIntervals).not.toHaveBeenCalled()
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('rejects a slot that is not one of the offered instants', async () => {
    const invalid = new Date(Date.parse(freeSlot().start) + 7 * 60_000).toISOString()

    const response = await POST(request(bookingBody({ slot: invalid })))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'slot-taken' })
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
  })
})

describe('POST /api/booking order', () => {
  it('re-checks the slot, creates the event, then stores the lead', async () => {
    const slot = freeSlot()

    const response = await POST(request(bookingBody({ slot: slot.start })))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ booked: true })

    expect(calendarMock.insertBookingEvent).toHaveBeenCalledTimes(1)
    const insertInput = calendarMock.insertBookingEvent.mock.calls[0]?.[0] as {
      descriptionOfEvent: (eventId: string) => string
      [key: string]: unknown
    }
    expect(insertInput['slot']).toEqual(slot)
    expect(insertInput['attendeeEmail']).toBe('marie@example.fr')
    expect(String(insertInput['consentAt'])).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(insertInput['subjectToken']).toBeUndefined()
    // The description is built per attempt: it carries the answers and a manage link signed for the
    // event id of that attempt.
    const description = insertInput.descriptionOfEvent('softnabc')
    expect(description).toContain('Automatiser mes devis')
    expect(description).toContain('marie@example.fr')
    expect(description).toContain('http://localhost/rendez-vous/')
    expect(description).not.toContain('Consentement')

    expect(baserowMock.createBaserowRow).toHaveBeenCalledTimes(1)
    expect(baserowMock.createBaserowRow).toHaveBeenCalledWith({
      tableId: '42',
      fields: {
        [BOOKING_LEAD_FIELDS.firstName]: 'Marie',
        [BOOKING_LEAD_FIELDS.lastName]: 'Dupont',
        [BOOKING_LEAD_FIELDS.email]: 'marie@example.fr',
        [BOOKING_LEAD_FIELDS.need]: 'Automatiser mes devis',
        [BOOKING_LEAD_FIELDS.slot]: slot.start,
        [BOOKING_LEAD_FIELDS.consent]: true,
        [BOOKING_LEAD_FIELDS.consentOn]: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }),
        [BOOKING_LEAD_FIELDS.source]: 'chatbot',
        [BOOKING_LEAD_FIELDS.status]: BOOKING_LEAD_STATUS_BOOKED,
      },
    })

    // The id of the new row is kept with the event, without notifying the attendee.
    expect(calendarMock.storeBookingLeadRowId).toHaveBeenCalledWith({
      eventId: 'softnabc',
      rowId: 7,
      subjectToken: undefined,
    })

    // Softn sends the confirmation itself, with the event's identity, its Meet link and the signed
    // manage link the answer also carries.
    expect(emailMock.sendBookingConfirmationEmail).toHaveBeenCalledTimes(1)
    const emailInput = emailMock.sendBookingConfirmationEmail.mock.calls[0]?.[0] as {
      event: unknown
      slot: unknown
      meetLink: string
      manageLink: string
    }
    expect(emailInput.event).toEqual({
      eventId: 'softnabc',
      iCalUid: 'softnabc@google.com',
      guestFirstName: 'Marie',
      guestLastName: 'Dupont',
      guestEmail: 'marie@example.fr',
    })
    expect(emailInput.slot).toEqual(slot)
    expect(emailInput.meetLink).toBe('https://meet.google.com/abc-defg-hij')
    expect(emailInput.manageLink.startsWith('http://localhost/rendez-vous/')).toBe(true)
  })

  it('keeps the booking when the confirmation cannot leave, and logs non-personal codes', async () => {
    emailMock.sendBookingConfirmationEmail.mockResolvedValue({
      ok: false,
      detail: 'gmail request-failed status=502',
      markDetail: 'events patch request-failed status=500',
    })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ booked: true })
    expect(errorSpy).toHaveBeenCalledWith('[booking] email not sent: gmail request-failed status=502')
    expect(errorSpy).toHaveBeenCalledWith('[booking] email mark not stored: events patch request-failed status=500')

    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join('\n')
    for (const personal of ['Marie', 'Dupont', 'marie@example.fr', 'Automatiser']) {
      expect(logged).not.toContain(personal)
    }
  })

  it('books without a manage line when the deployment has no signing secret, logging one code', async () => {
    vi.stubEnv('BOOKING_LINK_SECRET', '')

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ booked: true })

    const insertInput = calendarMock.insertBookingEvent.mock.calls[0]?.[0] as {
      descriptionOfEvent: (eventId: string) => string
    }
    expect(insertInput.descriptionOfEvent('softnabc')).not.toContain('/rendez-vous/')
    expect(errorSpy).toHaveBeenCalledWith('[booking] manage link: secret-unset')
    // A failed best-effort mark never changes the answer.
    expect(calendarMock.storeBookingLeadRowId).toHaveBeenCalledTimes(1)
  })

  it('keeps the booking when the row id cannot be kept with the event', async () => {
    calendarMock.storeBookingLeadRowId.mockResolvedValue({ ok: false, error: 'request-failed', status: 500 })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ booked: true })
    expect(errorSpy).toHaveBeenCalledWith(
      '[booking] lead row id not stored: calendar events patch request-failed status=500',
    )
  })

  it('records the Paris calendar date of the stamped consent', async () => {
    // The instant the route stamps decides the day: late in a UTC day is already the next day in
    // Paris, which is why the row stores the Paris date and not the UTC one.
    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(200)
    const row = baserowMock.createBaserowRow.mock.calls[0]?.[0] as { fields: Record<string, unknown> }
    const consentOn = String(row.fields[BOOKING_LEAD_FIELDS.consentOn])
    const stampedDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
    expect(consentOn).toBe(stampedDay)
  })

  it('forwards the OIDC token of the request to the calendar calls', async () => {
    const response = await POST(
      new Request('http://localhost/api/booking', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
          'x-vercel-oidc-token': 'oidc-token',
        },
        body: JSON.stringify(bookingBody()),
      }),
    )

    expect(response.status).toBe(200)
    expect(calendarMock.queryBusyIntervals).toHaveBeenCalledWith(
      expect.objectContaining({ subjectToken: 'oidc-token' }),
    )
    expect(calendarMock.insertBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ subjectToken: 'oidc-token' }),
    )
  })

  it('stores nothing when the slot is taken between the answer and the confirmation', async () => {
    const slot = freeSlot()
    calendarMock.queryBusyIntervals.mockResolvedValue({
      ok: true,
      data: [{ start: slot.start, end: slot.end }],
    })

    const response = await POST(request(bookingBody({ slot: slot.start })))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'slot-taken' })
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('stores nothing when the calendar refuses the event', async () => {
    calendarMock.insertBookingEvent.mockResolvedValue({ ok: false, error: 'request-failed' })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[booking] calendar unavailable: events insert request-failed')
  })

  it('answers a lost race on the event id as a taken slot', async () => {
    calendarMock.insertBookingEvent.mockResolvedValue({ ok: false, error: 'slot-taken' })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'slot-taken' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('stores nothing when the availability cannot be read', async () => {
    calendarMock.queryBusyIntervals.mockResolvedValue({ ok: false, error: 'not-configured' })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('keeps the booking when only Baserow fails, and logs a code without personal data', async () => {
    baserowMock.createBaserowRow.mockResolvedValue({ ok: false, error: 'request-failed', status: 401 })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ booked: true })
    expect(calendarMock.insertBookingEvent).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    const logged = String(errorSpy.mock.calls[0]?.[0])
    // The lead line names the service and carries the upstream status, in the rate-limit shape.
    expect(logged).toBe('[booking] lead not stored: baserow request-failed status=401')
    for (const personal of ['Marie', 'Dupont', 'marie@example.fr', 'Automatiser']) {
      expect(logged).not.toContain(personal)
    }

    // The event is marked so the missing row can be found later, and the answer stays a success.
    expect(calendarMock.markBookingLeadNotStored).toHaveBeenCalledWith({
      eventId: 'softnabc',
      subjectToken: undefined,
    })
  })

  it('keeps the booking when the leads table is not configured', async () => {
    vi.stubEnv('BASEROW_LEADS_TABLE_ID', '')

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ booked: true })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[booking] lead not stored: baserow not-configured')
    expect(calendarMock.markBookingLeadNotStored).toHaveBeenCalledTimes(1)
  })

  it('still answers success when the mark itself fails', async () => {
    baserowMock.createBaserowRow.mockResolvedValue({ ok: false, error: 'request-failed' })
    calendarMock.markBookingLeadNotStored.mockResolvedValue({ ok: false, error: 'unauthorized' })

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ booked: true })
    expect(errorSpy).toHaveBeenCalledWith('[booking] lead not stored: calendar events patch unauthorized')
  })

  it('keeps the optional answers out of the row when the visitor skipped them', async () => {
    const response = await POST(request(bookingBody({ phone: '06 12 34 56 78', structure: 'PME' })))

    expect(response.status).toBe(200)
    expect(baserowMock.createBaserowRow).toHaveBeenCalledWith({
      tableId: '42',
      fields: expect.objectContaining({
        [BOOKING_LEAD_FIELDS.phone]: '06 12 34 56 78',
        [BOOKING_LEAD_FIELDS.companyType]: 'PME',
      }),
    })
    const fields = baserowMock.createBaserowRow.mock.calls[0]?.[0] as { fields: Record<string, unknown> }
    expect(fields.fields[BOOKING_LEAD_FIELDS.role]).toBeUndefined()
  })

  it('rejects an optional answer that is not one of the offered options', async () => {
    const response = await POST(request(bookingBody({ role: 'Astronaute' })))

    expect(response.status).toBe(400)
    expect(calendarMock.insertBookingEvent).not.toHaveBeenCalled()
  })
})

describe('POST /api/booking manage link origin', () => {
  /** Description the route built for the event of this request. */
  const descriptionOfLastInsert = (): string => {
    const insertInput = calendarMock.insertBookingEvent.mock.calls.at(-1)?.[0] as {
      descriptionOfEvent: (eventId: string) => string
    }
    return insertInput.descriptionOfEvent('softnabc')
  }

  it('keeps the origin of the request outside production, so a preview links to itself', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    const response = await POST(request(bookingBody()))

    expect(response.status).toBe(200)
    expect(descriptionOfLastInsert()).toContain('http://localhost/rendez-vous/')
  })

  it('pins the link to the canonical site in production, even when the request forges its origin', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')

    // A forged Host and Origin that agree pass the same-origin guard: only the production pin
    // keeps the attacker's origin out of the invitation e-mailed to the visitor.
    const response = await POST(
      new Request('https://evil.example/api/booking', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        body: JSON.stringify(bookingBody()),
      }),
    )

    expect(response.status).toBe(200)
    const description = descriptionOfLastInsert()
    expect(description).toContain('https://softn.io/rendez-vous/')
    expect(description).not.toContain('evil.example')
  })
})
