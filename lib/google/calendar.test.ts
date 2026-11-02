import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookingRules } from '@/lib/booking/rules'
import { bookingEventId } from './eventId'

/**
 * The schedule these assertions were written for, fixed here: `TEST_RULES` is Mel's to edit, and a
 * schedule change must never rewrite a test. Only the time zone and the call length matter below.
 */
const TEST_RULES: BookingRules = {
  timeZone: 'Europe/Paris',
  weekdays: [1, 2, 3, 4, 5],
  windows: [{ start: '09:30', end: '12:00' }],
  slotMinutes: 30,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  horizonDays: 21,
  maxCallsPerDay: 3,
}

const SUBJECT_TOKEN = 'subject-token-value'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fetchMock = vi.fn<typeof fetch>()

/** Endpoints of the keyless credential chain, which is always answered the same way here. */
const CHAIN_ENDPOINTS = ['https://sts.googleapis.com/v1/token', 'https://oauth2.googleapis.com/token']

/**
 * Answers the keyless credential chain, then hands the Calendar call to the given responder.
 *
 * The credential chain has its own tests; answering it here keeps every test focused on the call it
 * is about.
 */
const withToken = (responder: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): void => {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input)
    if (url === CHAIN_ENDPOINTS[0]) return jsonResponse({ access_token: 'federated-token', expires_in: 3600 })
    if (url.includes('iamcredentials.googleapis.com')) return jsonResponse({ signedJwt: 'signed-assertion' })
    if (url === CHAIN_ENDPOINTS[1]) return jsonResponse({ access_token: 'token-value', expires_in: 3600 })
    return responder(url, init)
  })
}

/** Every call that is not part of the credential chain. */
const calendarCalls = (): readonly { readonly url: string; readonly init: RequestInit | undefined }[] =>
  fetchMock.mock.calls
    .filter(([input]) => {
      const url = String(input)
      return !CHAIN_ENDPOINTS.includes(url) && !url.includes('iamcredentials.googleapis.com')
    })
    .map(([input, init]) => ({ url: String(input), init }))

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'booking@softn-io.iam.gserviceaccount.com')
  vi.stubEnv('GOOGLE_CALENDAR_OWNER', 'melanie@softn.io')
  // The owner's own calendar is also the booking calendar here: one id, asked once.
  vi.stubEnv('GOOGLE_CALENDAR_ID', 'melanie@softn.io')
  vi.stubEnv('GCP_PROJECT_NUMBER', '123456789012')
  vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_ID', 'vercel')
  vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', 'softn-site')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('queryBusyIntervals', () => {
  it('reads the busy intervals of the studio calendar, in the requested window', async () => {
    withToken(() =>
      jsonResponse({
        calendars: {
          'melanie@softn.io': {
            busy: [{ start: '2026-06-11T07:30:00Z', end: '2026-06-11T08:00:00Z' }],
          },
        },
      }),
    )
    const { queryBusyIntervals } = await import('./calendar')

    const result = await queryBusyIntervals({
      timeMin: '2026-06-11T00:00:00Z',
      timeMax: '2026-06-12T00:00:00Z',
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({
      ok: true,
      data: [{ start: '2026-06-11T07:30:00Z', end: '2026-06-11T08:00:00Z' }],
    })

    const [call] = calendarCalls()
    expect(call?.url).toBe('https://www.googleapis.com/calendar/v3/freeBusy')
    expect(call?.init?.method).toBe('POST')
    expect(call?.init?.headers).toEqual({ Authorization: 'Bearer token-value', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      timeMin: '2026-06-11T00:00:00Z',
      timeMax: '2026-06-12T00:00:00Z',
      items: [{ id: 'melanie@softn.io' }],
    })
  })

  it('reads a calendar without intervals as free', async () => {
    withToken(() => jsonResponse({ calendars: { 'melanie@softn.io': {} } }))
    const { queryBusyIntervals } = await import('./calendar')

    expect(await queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: true,
      data: [],
    })
  })

  it('fails closed when the calendar answers with an error of its own', async () => {
    withToken(() => jsonResponse({ calendars: { 'melanie@softn.io': { errors: [{ reason: 'notFound' }] } } }))
    const { queryBusyIntervals } = await import('./calendar')

    expect(await queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
    })
  })

  it('asks the booking calendar and the owner calendar, and merges their busy intervals', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'abc123@group.calendar.google.com')
    withToken(() =>
      jsonResponse({
        calendars: {
          'abc123@group.calendar.google.com': {
            busy: [{ start: '2026-06-11T07:30:00Z', end: '2026-06-11T08:00:00Z' }],
          },
          'melanie@softn.io': {
            busy: [{ start: '2026-06-11T09:00:00Z', end: '2026-06-11T09:30:00Z' }],
          },
        },
      }),
    )
    const { queryBusyIntervals } = await import('./calendar')

    const result = await queryBusyIntervals({
      timeMin: '2026-06-11T00:00:00Z',
      timeMax: '2026-06-12T00:00:00Z',
      subjectToken: SUBJECT_TOKEN,
    })

    // The owner's own appointment is as unavailable as a call already on the booking calendar.
    expect(result).toEqual({
      ok: true,
      data: [
        { start: '2026-06-11T07:30:00Z', end: '2026-06-11T08:00:00Z' },
        { start: '2026-06-11T09:00:00Z', end: '2026-06-11T09:30:00Z' },
      ],
    })

    const [call] = calendarCalls()
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      timeMin: '2026-06-11T00:00:00Z',
      timeMax: '2026-06-12T00:00:00Z',
      items: [{ id: 'abc123@group.calendar.google.com' }, { id: 'melanie@softn.io' }],
    })
  })

  it('asks one item when the owner calendar is the booking calendar', async () => {
    withToken(() => jsonResponse({ calendars: { 'melanie@softn.io': {} } }))
    const { queryBusyIntervals } = await import('./calendar')

    expect(await queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: true,
      data: [],
    })

    const [call] = calendarCalls()
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      timeMin: 'a',
      timeMax: 'b',
      items: [{ id: 'melanie@softn.io' }],
    })
  })

  it("fails closed when the owner's own calendar answers with an error", async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'abc123@group.calendar.google.com')
    withToken(() =>
      jsonResponse({
        calendars: {
          'abc123@group.calendar.google.com': { busy: [] },
          'melanie@softn.io': { errors: [{ reason: 'notFound' }] },
        },
      }),
    )
    const { queryBusyIntervals } = await import('./calendar')

    expect(await queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
    })
  })

  it('fails closed on a busy interval it cannot read, on either calendar', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'abc123@group.calendar.google.com')

    // A bound that does not parse, on the booking calendar.
    withToken(() =>
      jsonResponse({
        calendars: {
          'abc123@group.calendar.google.com': { busy: [{ start: 'not-a-date', end: '2026-06-11T08:00:00Z' }] },
          'melanie@softn.io': {},
        },
      }),
    )
    const { queryBusyIntervals } = await import('./calendar')
    expect(await queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
    })

    // An end before its start, on the owner's own calendar.
    vi.resetModules()
    fetchMock.mockReset()
    withToken(() =>
      jsonResponse({
        calendars: {
          'abc123@group.calendar.google.com': {},
          'melanie@softn.io': { busy: [{ start: '2026-06-11T08:00:00Z', end: '2026-06-11T07:30:00Z' }] },
        },
      }),
    )
    const again = await import('./calendar')
    expect(await again.queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
    })
  })

  it('fails closed when the answer does not hold the asked calendar', async () => {
    withToken(() => jsonResponse({ calendars: {} }))
    const { queryBusyIntervals } = await import('./calendar')

    expect(await queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
    })
  })

  it('never reads the body of a failed answer', async () => {
    withToken(() => new Response('not json at all', { status: 500 }))
    const { queryBusyIntervals } = await import('./calendar')

    expect(await queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
    })
  })

  it('maps a refusal to unauthorized and a network failure to its own code', async () => {
    withToken(() => new Response('', { status: 403 }))
    const forbidden = await import('./calendar')
    expect(await forbidden.queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'unauthorized',
    })

    vi.resetModules()
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))
    const timedOut = await import('./calendar')
    expect(await timedOut.queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'timeout',
    })
  })

  it('fails closed without configuration, without any network call', async () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
    vi.stubEnv('GOOGLE_CALENDAR_OWNER', '')
    vi.stubEnv('GOOGLE_CALENDAR_ID', '')
    vi.stubEnv('GCP_PROJECT_NUMBER', '')
    vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_ID', '')
    vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', '')
    const { queryBusyIntervals } = await import('./calendar')

    expect(await queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'not-configured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('countBookedCallsPerDay', () => {
  it('counts the tagged events per Paris day, and asks for nothing else than their start', async () => {
    withToken(() =>
      jsonResponse({
        items: [
          { start: { dateTime: '2026-06-11T07:30:00Z' } },
          { start: { dateTime: '2026-06-11T08:00:00Z' } },
          // 22:30 UTC is already the next day in Paris.
          { start: { dateTime: '2026-06-11T22:30:00Z' } },
          // An event without a start time is not one of ours: it is ignored.
          {},
        ],
      }),
    )
    const { countBookedCallsPerDay } = await import('./calendar')

    const result = await countBookedCallsPerDay({
      rules: TEST_RULES,
      timeMin: '2026-06-01T00:00:00Z',
      timeMax: '2026-06-30T00:00:00Z',
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: true, data: { '2026-06-11': 2, '2026-06-12': 1 } })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/calendar/v3/calendars/melanie%40softn.io/events')
    expect(url.searchParams.get('privateExtendedProperty')).toBe('softnBooking=discovery')
    expect(url.searchParams.get('singleEvents')).toBe('true')
    expect(url.searchParams.get('timeMin')).toBe('2026-06-01T00:00:00Z')
    expect(url.searchParams.get('timeMax')).toBe('2026-06-30T00:00:00Z')
    expect(call?.init?.method).toBe('GET')
  })

  it('refuses a truncated page instead of counting short', async () => {
    withToken(() => jsonResponse({ items: [{ start: { dateTime: '2026-06-11T07:30:00Z' } }], nextPageToken: 'more' }))
    const { countBookedCallsPerDay } = await import('./calendar')

    const result = await countBookedCallsPerDay({
      rules: TEST_RULES,
      timeMin: 'a',
      timeMax: 'b',
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: false, error: 'invalid-response' })
  })

  it('counts an empty window as zero calls', async () => {
    withToken(() => jsonResponse({}))
    const { countBookedCallsPerDay } = await import('./calendar')

    expect(
      await countBookedCallsPerDay({ rules: TEST_RULES, timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN }),
    ).toEqual({
      ok: true,
      data: {},
    })
  })

  it('fails closed when an event carries an unreadable start', async () => {
    withToken(() => jsonResponse({ items: [{ start: { dateTime: 'not-a-date' } }] }))
    const { countBookedCallsPerDay } = await import('./calendar')

    expect(
      await countBookedCallsPerDay({ rules: TEST_RULES, timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN }),
    ).toEqual({
      ok: false,
      error: 'invalid-response',
    })
  })
})

describe('insertBookingEvent', () => {
  const slot = { start: '2026-06-11T07:30:00.000Z', end: '2026-06-11T08:00:00.000Z' }
  const consentAt = '2026-10-31T09:00:00.000Z'

  const insert = (responder: () => Response | Promise<Response>) => {
    withToken(responder)
    return import('./calendar')
  }

  it('creates the event with its Meet link, its attendee and its invitation', async () => {
    const { insertBookingEvent } = await insert(() => jsonResponse({ id: bookingEventId(slot.start) }))

    const result = await insertBookingEvent({
      slot,
      attendeeEmail: 'marie@example.fr',
      title: 'Échange Spark — Marie Dupont x Softn.io',
      description: 'Besoin : automatiser mes devis',
      consentAt,
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: true, data: { eventId: bookingEventId(slot.start) } })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/melanie%40softn.io/events')
    expect(url.searchParams.get('conferenceDataVersion')).toBe('1')
    expect(url.searchParams.get('sendUpdates')).toBe('all')

    const body = JSON.parse(String(call?.init?.body)) as Record<string, unknown>
    expect(body['id']).toBe(bookingEventId(slot.start))
    expect(body['attendees']).toEqual([{ email: 'marie@example.fr' }])
    expect(body['start']).toEqual({ dateTime: '2026-06-11T09:30:00', timeZone: 'Europe/Paris' })
    expect(body['end']).toEqual({ dateTime: '2026-06-11T10:00:00', timeZone: 'Europe/Paris' })
    // A unique request id per booking: a rebooked slot must not hand over the earlier room.
    const conference = body['conferenceData'] as {
      createRequest: { requestId: string; conferenceSolutionKey: unknown }
    }
    expect(conference.createRequest.requestId.startsWith(`${bookingEventId(slot.start)}-`)).toBe(true)
    expect(conference.createRequest.requestId).not.toBe(bookingEventId(slot.start))
    expect(conference.createRequest.conferenceSolutionKey).toEqual({ type: 'hangoutsMeet' })
    // The consent instant stays with the event, where no guest reads it, instead of the description.
    expect(body['extendedProperties']).toEqual({
      private: { softnBooking: 'discovery', softnSlotStart: slot.start, softnConsentAt: consentAt },
    })
    expect(String(body['description'])).not.toContain(consentAt)
  })

  it('writes the event to the booking calendar, not to the owner calendar', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'abc123@group.calendar.google.com')
    const { insertBookingEvent } = await insert(() => jsonResponse({ id: bookingEventId(slot.start) }))

    const result = await insertBookingEvent({
      slot,
      attendeeEmail: 'marie@example.fr',
      title: 'Échange Spark — Marie Dupont x Softn.io',
      description: 'Besoin : automatiser mes devis',
      consentAt,
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: true, data: { eventId: bookingEventId(slot.start) } })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/abc123%40group.calendar.google.com/events')
  })

  it('answers a duplicate identifier as a taken slot, without reading the body', async () => {
    const { insertBookingEvent } = await insert(() => new Response('not json at all', { status: 409 }))

    const result = await insertBookingEvent({
      slot,
      attendeeEmail: 'marie@example.fr',
      title: 'Échange Spark — Marie Dupont x Softn.io',
      description: 'Besoin : automatiser mes devis',
      consentAt,
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: false, error: 'slot-taken' })
  })

  it('fails closed on any other error status', async () => {
    const { insertBookingEvent } = await insert(() => new Response('not json at all', { status: 502 }))

    const result = await insertBookingEvent({
      slot,
      attendeeEmail: 'marie@example.fr',
      title: 't',
      description: 'd',
      consentAt,
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: false, error: 'request-failed' })
  })

  it('refuses to write when the event id could not be checked', async () => {
    const { insertBookingEvent } = await insert(() => jsonResponse({ id: 'unused' }))

    const result = await insertBookingEvent({
      slot: { start: 'not-a-date', end: 'not-a-date' },
      attendeeEmail: 'marie@example.fr',
      title: 't',
      description: 'd',
      consentAt,
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: false, error: 'invalid-response' })
    expect(calendarCalls()).toEqual([])
  })
})

describe('insertBookingEvent conference room', () => {
  const slot = { start: '2026-06-11T07:30:00.000Z', end: '2026-06-11T08:00:00.000Z' }

  it('never asks for the same meeting room twice for one slot', async () => {
    withToken(() => jsonResponse({ id: bookingEventId(slot.start) }))
    const { insertBookingEvent } = await import('./calendar')

    const input = {
      slot,
      attendeeEmail: 'marie@example.fr',
      title: 'Échange Spark — Marie Dupont x Softn.io',
      description: 'Besoin : automatiser mes devis',
      consentAt: '2026-10-31T09:00:00.000Z',
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    }

    await insertBookingEvent(input)
    await insertBookingEvent(input)

    const requests = calendarCalls().map((call) => {
      const body = JSON.parse(String(call.init?.body)) as { conferenceData: { createRequest: { requestId: string } } }
      return body.conferenceData.createRequest.requestId
    })

    expect(requests).toHaveLength(2)
    expect(requests[0]).not.toBe(requests[1])
    expect(requests[0]?.startsWith(bookingEventId(slot.start))).toBe(true)
  })
})

describe('markBookingLeadNotStored', () => {
  it('patches the event with the private mark, leaving the other properties alone', async () => {
    withToken(() => jsonResponse({ id: 'softnabc' }))
    const { markBookingLeadNotStored } = await import('./calendar')

    const result = await markBookingLeadNotStored({ eventId: 'softnabc', subjectToken: SUBJECT_TOKEN })

    expect(result).toEqual({ ok: true, data: true })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/melanie%40softn.io/events/softnabc')
    expect(call?.init?.method).toBe('PATCH')
    // A patch merges private properties: the mark is added beside slot and consent.
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      extendedProperties: { private: { softnLeadStored: 'false' } },
    })
  })

  it('reports a failure as a code, so the caller can log it without changing the visitor answer', async () => {
    withToken(() => new Response('not json at all', { status: 404 }))
    const { markBookingLeadNotStored } = await import('./calendar')

    expect(await markBookingLeadNotStored({ eventId: 'softnabc', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
    })
  })

  it('fails closed without configuration, without any network call', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', '')
    vi.stubEnv('GCP_PROJECT_NUMBER', '')
    vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_ID', '')
    vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', '')
    const { markBookingLeadNotStored } = await import('./calendar')

    expect(await markBookingLeadNotStored({ eventId: 'softnabc', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'not-configured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
