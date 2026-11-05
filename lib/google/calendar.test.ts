import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookingRules } from '@/lib/booking/rules'
import { BOOKING_EVENT_ID_ATTEMPTS, bookingEventId, bookingEventIdAttempt } from './eventId'

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
  rescheduleNoticeHours: 12,
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

/** Event id supplied in the body of one insert call. */
const insertedIdOf = (call: { readonly init: RequestInit | undefined }): string => {
  const body = JSON.parse(String(call.init?.body)) as { id: string }
  return body.id
}

/** One event as the API returns it, with the booking tag this application writes. */
const bookingEventResponse = (eventId: string, overrides: Readonly<Record<string, unknown>> = {}): unknown => ({
  id: eventId,
  status: 'confirmed',
  start: { dateTime: '2026-06-11T09:30:00+02:00' },
  end: { dateTime: '2026-06-11T10:00:00+02:00' },
  extendedProperties: { private: { softnBooking: 'discovery' } },
  ...overrides,
})

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
      status: 500,
    })
  })

  it('maps a refusal to unauthorized and a network failure to its own code', async () => {
    withToken(() => new Response('', { status: 403 }))
    const forbidden = await import('./calendar')
    expect(await forbidden.queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'unauthorized',
      status: 403,
    })

    vi.resetModules()
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))
    const timedOut = await import('./calendar')
    expect(await timedOut.queryBusyIntervals({ timeMin: 'a', timeMax: 'b', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'timeout',
      // The step of the credential chain that timed out is kept for the caller's log line.
      step: 'sts',
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

  /** Answers every insert with the id it was called with, so each attempt succeeds on its own id. */
  const answerInserts = (): void => {
    withToken((_url, init) => jsonResponse({ id: insertedIdOf({ init }) }))
  }

  const input = (overrides: Readonly<Record<string, unknown>> = {}) => ({
    slot,
    attendeeEmail: 'marie@example.fr',
    guest: { firstName: 'Marie', lastName: 'Dupont' },
    title: 'Échange Spark — Marie Dupont x Softn.io',
    descriptionOfEvent: (eventId: string) => `Besoin : automatiser mes devis\nlien: ${eventId}`,
    consentAt,
    rules: TEST_RULES,
    subjectToken: SUBJECT_TOKEN,
    ...overrides,
  })

  it('creates the event with its Meet link, its attendee and its guest, without emailing anybody', async () => {
    answerInserts()
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input())

    expect(result).toEqual({ ok: true, data: { eventId: bookingEventId(slot.start) } })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/melanie%40softn.io/events')
    expect(url.searchParams.get('conferenceDataVersion')).toBe('1')
    // Google notifies no guest: Softn sends the confirmation itself.
    expect(url.searchParams.get('sendUpdates')).toBe('none')

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
    // The consent instant, the guest name and the first file counter stay with the event, where no
    // guest reads them, instead of the description.
    expect(body['extendedProperties']).toEqual({
      private: {
        softnBooking: 'discovery',
        softnSlotStart: slot.start,
        softnConsentAt: consentAt,
        softnGuestFirstName: 'Marie',
        softnGuestLastName: 'Dupont',
        softnEmailSequence: '0',
      },
    })
    expect(String(body['description'])).not.toContain(consentAt)
    // The description is built from the id of the attempt: its manage link holds that id.
    expect(body['description']).toContain(bookingEventId(slot.start))
  })

  it('hands back the iCalUID and the Meet link of the created event', async () => {
    withToken((_url, init) =>
      jsonResponse({
        id: insertedIdOf({ init }),
        iCalUID: `${bookingEventId(slot.start)}@google.com`,
        sequence: 0,
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      }),
    )
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input())

    expect(result).toEqual({
      ok: true,
      data: {
        eventId: bookingEventId(slot.start),
        iCalUid: `${bookingEventId(slot.start)}@google.com`,
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      },
    })
  })

  it('writes the event to the booking calendar, not to the owner calendar', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'abc123@group.calendar.google.com')
    answerInserts()
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input())

    expect(result).toEqual({ ok: true, data: { eventId: bookingEventId(slot.start) } })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/abc123%40group.calendar.google.com/events')
  })

  it('fails closed on any other error status', async () => {
    withToken(() => new Response('not json at all', { status: 502 }))
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input())

    expect(result).toEqual({ ok: false, error: 'request-failed', status: 502 })
  })

  it('refuses to write when the event id could not be checked', async () => {
    withToken(() => jsonResponse({ id: 'unused' }))
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input({ slot: { start: 'not-a-date', end: 'not-a-date' } }))

    expect(result).toEqual({ ok: false, error: 'invalid-response' })
    expect(calendarCalls()).toEqual([])
  })
})

describe('insertBookingEvent on a held event id', () => {
  const slot = { start: '2026-06-11T07:30:00.000Z', end: '2026-06-11T08:00:00.000Z' }

  const input = {
    slot,
    attendeeEmail: 'marie@example.fr',
    guest: { firstName: 'Marie', lastName: 'Dupont' },
    title: 'Échange Spark — Marie Dupont x Softn.io',
    descriptionOfEvent: (eventId: string) => `lien: ${eventId}`,
    consentAt: '2026-10-31T09:00:00.000Z',
    rules: TEST_RULES,
    subjectToken: SUBJECT_TOKEN,
  }

  /**
   * Answers the insert of the given event id with a conflict, every other insert with its own id,
   * and every event read with the given event.
   */
  const answerHeldId = (heldEventId: string, eventBody: unknown | (() => Response | Promise<Response>)): void => {
    withToken((url, init) => {
      if (init?.method === 'GET') {
        return typeof eventBody === 'function' ? eventBody() : jsonResponse(eventBody)
      }

      const body = JSON.parse(String(init?.body)) as { id: string }
      if (body.id === heldEventId) return new Response('', { status: 409 })
      return jsonResponse({ id: body.id })
    })
  }

  it('walks past a cancelled event of the same slot and books the next id', async () => {
    const heldId = bookingEventId(slot.start)
    answerHeldId(heldId, bookingEventResponse(heldId, { status: 'cancelled', start: undefined, end: undefined }))
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input)

    expect(result).toEqual({ ok: true, data: { eventId: bookingEventIdAttempt(slot.start, 1) } })

    const calls = calendarCalls()
    const inserted = calls.filter((call) => call.init?.method === 'POST').map(insertedIdOf)
    expect(inserted).toEqual([bookingEventIdAttempt(slot.start, 0), bookingEventIdAttempt(slot.start, 1)])

    // The held id was read before the walk continued, on the booking calendar.
    const read = calls.find((call) => call.init?.method === 'GET')
    expect(new URL(String(read?.url)).pathname).toBe(`/calendar/v3/calendars/melanie%40softn.io/events/${heldId}`)
  })

  it('walks past an event Mel moved to another instant, comparing the real start', async () => {
    const heldId = bookingEventId(slot.start)
    answerHeldId(
      heldId,
      bookingEventResponse(heldId, {
        // The private property still holds the slot, but the real start is elsewhere.
        extendedProperties: { private: { softnBooking: 'discovery', softnSlotStart: slot.start } },
        start: { dateTime: '2026-06-12T09:30:00+02:00' },
        end: { dateTime: '2026-06-12T10:00:00+02:00' },
      }),
    )
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input)

    expect(result).toEqual({ ok: true, data: { eventId: bookingEventIdAttempt(slot.start, 1) } })
  })

  it('answers slot-taken when the held event is live at this very instant', async () => {
    const heldId = bookingEventId(slot.start)
    answerHeldId(heldId, bookingEventResponse(heldId, { start: { dateTime: slot.start } }))
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input)

    expect(result).toEqual({ ok: false, error: 'slot-taken' })

    const calls = calendarCalls()
    expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(1)
  })

  it('treats an event that vanished between the refusal and the read as a free id', async () => {
    const heldId = bookingEventId(slot.start)
    answerHeldId(heldId, () => new Response('', { status: 404 }))
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input)

    expect(result).toEqual({ ok: true, data: { eventId: bookingEventIdAttempt(slot.start, 1) } })
  })

  it('treats an event without the booking tag as not found, and walks on', async () => {
    const heldId = bookingEventId(slot.start)
    answerHeldId(heldId, { id: heldId, status: 'confirmed', extendedProperties: { private: {} } })
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input)

    expect(result).toEqual({ ok: true, data: { eventId: bookingEventIdAttempt(slot.start, 1) } })
  })

  it('answers a generic failure once the whole id list is exhausted', async () => {
    withToken((url, init) =>
      init?.method === 'GET'
        ? jsonResponse(
            bookingEventResponse(url.split('/').at(-1) ?? '', {
              status: 'cancelled',
              start: undefined,
              end: undefined,
            }),
          )
        : new Response('', { status: 409 }),
    )
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input)

    expect(result).toEqual({ ok: false, error: 'request-failed' })

    const calls = calendarCalls()
    const inserted = calls.filter((call) => call.init?.method === 'POST').map(insertedIdOf)
    expect(inserted).toHaveLength(BOOKING_EVENT_ID_ATTEMPTS)
    expect(new Set(inserted).size).toBe(BOOKING_EVENT_ID_ATTEMPTS)
    expect(inserted[0]).toBe(bookingEventId(slot.start))
  })

  it('never keeps walking when the held event cannot be read', async () => {
    withToken((_url, init) =>
      init?.method === 'GET' ? new Response('', { status: 403 }) : new Response('', { status: 409 }),
    )
    const { insertBookingEvent } = await import('./calendar')

    const result = await insertBookingEvent(input)

    expect(result).toEqual({ ok: false, error: 'unauthorized' })
    expect(calendarCalls().filter((call) => call.init?.method === 'POST')).toHaveLength(1)
  })
})

describe('insertBookingEvent conference room', () => {
  const slot = { start: '2026-06-11T07:30:00.000Z', end: '2026-06-11T08:00:00.000Z' }

  it('never asks for the same meeting room twice for one slot', async () => {
    withToken((_url, init) => jsonResponse({ id: insertedIdOf({ init }) }))
    const { insertBookingEvent } = await import('./calendar')

    const input = {
      slot,
      attendeeEmail: 'marie@example.fr',
      guest: { firstName: 'Marie', lastName: 'Dupont' },
      title: 'Échange Spark — Marie Dupont x Softn.io',
      descriptionOfEvent: (eventId: string) => `lien: ${eventId}`,
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

describe('readBookingEvent', () => {
  const EVENT_ID = 'softnabc0123456789abcdefghijkl'

  it('reads the event with its real bounds, its description and its leads row id', async () => {
    withToken(() =>
      jsonResponse(
        bookingEventResponse(EVENT_ID, {
          description: 'Besoin : automatiser mes devis\nlien: https://softn.io/rendez-vous/token',
          extendedProperties: { private: { softnBooking: 'discovery', softnLeadRowId: '42' } },
        }),
      ),
    )
    const { readBookingEvent } = await import('./calendar')

    const result = await readBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })

    expect(result).toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID,
        cancelled: false,
        start: '2026-06-11T09:30:00+02:00',
        end: '2026-06-11T10:00:00+02:00',
        description: 'Besoin : automatiser mes devis\nlien: https://softn.io/rendez-vous/token',
        leadRowId: '42',
      },
    })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe(`/calendar/v3/calendars/melanie%40softn.io/events/${EVENT_ID}`)
    expect(call?.init?.method).toBe('GET')
    expect(call?.init?.body).toBeUndefined()
  })

  it('reads a cancelled event without a start, which is what a cancellation leaves', async () => {
    withToken(() => jsonResponse(bookingEventResponse(EVENT_ID, { status: 'cancelled' })))
    const { readBookingEvent } = await import('./calendar')

    const result = await readBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })

    expect(result).toMatchObject({ ok: true, data: { cancelled: true } })
    if (result.ok) {
      // The API promises nothing but the id on some cancelled copies; unreadable bounds are not an
      // error here, the status is what the caller acts on.
      expect(result.data.start === undefined || typeof result.data.start === 'string').toBe(true)
    }
  })

  it('reads what the booking emails need: uid, Meet link, guest and file counter', async () => {
    withToken(() =>
      jsonResponse(
        bookingEventResponse(EVENT_ID, {
          iCalUID: `${EVENT_ID}@google.com`,
          hangoutLink: 'https://meet.google.com/abc-defg-hij',
          sequence: 1,
          attendees: [{ email: 'marie@example.fr' }],
          extendedProperties: {
            private: {
              softnBooking: 'discovery',
              softnGuestFirstName: 'Marie',
              softnGuestLastName: 'Dupont',
              softnEmailSequence: '1',
            },
          },
        }),
      ),
    )
    const { readBookingEvent } = await import('./calendar')

    const result = await readBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })

    expect(result).toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID,
        cancelled: false,
        start: '2026-06-11T09:30:00+02:00',
        end: '2026-06-11T10:00:00+02:00',
        description: undefined,
        leadRowId: undefined,
        iCalUid: `${EVENT_ID}@google.com`,
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
        guestFirstName: 'Marie',
        guestLastName: 'Dupont',
        guestEmail: 'marie@example.fr',
        emailSequence: '1',
      },
    })
  })

  it('answers an event without the booking tag as not found, like a missing one', async () => {
    withToken(() => jsonResponse({ id: EVENT_ID, status: 'confirmed' }))
    const { readBookingEvent } = await import('./calendar')

    expect(await readBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'not-found',
    })
  })

  it('maps a 404 to not found and any other error status to its code', async () => {
    withToken(() => new Response('', { status: 404 }))
    const missing = await import('./calendar')
    expect(await missing.readBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'not-found',
      status: 404,
    })

    vi.resetModules()
    fetchMock.mockReset()
    withToken(() => new Response('', { status: 500 }))
    const broken = await import('./calendar')
    expect(await broken.readBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
      status: 500,
    })
  })

  it('fails closed when the answer names another event', async () => {
    withToken(() => jsonResponse(bookingEventResponse('another-event-id')))
    const { readBookingEvent } = await import('./calendar')

    expect(await readBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
    })
  })
})

describe('rescheduleBookingEvent', () => {
  const EVENT_ID = 'softnabc0123456789abcdefghijkl'
  const slot = { start: '2026-06-12T07:30:00.000Z', end: '2026-06-12T08:00:00.000Z' }

  it('patches the new bounds, the private slot, the file counter and the description, without emailing', async () => {
    withToken(() => jsonResponse({ id: EVENT_ID }))
    const { rescheduleBookingEvent } = await import('./calendar')

    const result = await rescheduleBookingEvent({
      eventId: EVENT_ID,
      slot,
      description: 'Besoin : automatiser mes devis\nlien: https://softn.io/rendez-vous/token',
      emailSequence: 1,
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: true, data: { eventId: EVENT_ID, iCalUid: undefined, sequence: undefined } })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe(`/calendar/v3/calendars/melanie%40softn.io/events/${EVENT_ID}`)
    expect(call?.init?.method).toBe('PATCH')
    // Google requires conferenceDataVersion=1 on every modification of an event with a Meet link, so
    // the conference survives the patch; sendUpdates=none keeps Google from emailing the guest a
    // second time, because Softn sends the update itself.
    expect(url.searchParams.get('conferenceDataVersion')).toBe('1')
    expect(url.searchParams.get('sendUpdates')).toBe('none')

    const body = JSON.parse(String(call?.init?.body)) as Record<string, unknown>
    expect(body['start']).toEqual({ dateTime: '2026-06-12T09:30:00', timeZone: 'Europe/Paris' })
    expect(body['end']).toEqual({ dateTime: '2026-06-12T10:00:00', timeZone: 'Europe/Paris' })
    // Only the named fields travel: the attendee, the conference and the other private properties
    // are left out and survive the patch.
    expect(body['attendees']).toBeUndefined()
    expect(body['conferenceData']).toBeUndefined()
    expect(body['extendedProperties']).toEqual({ private: { softnSlotStart: slot.start, softnEmailSequence: '1' } })
    expect(String(body['description'])).toContain('https://softn.io/rendez-vous/token')
  })

  it('leaves the file counter alone when the caller does not number the change', async () => {
    withToken(() => jsonResponse({ id: EVENT_ID }))
    const { rescheduleBookingEvent } = await import('./calendar')

    await rescheduleBookingEvent({
      eventId: EVENT_ID,
      slot,
      description: 'd',
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    })

    const [call] = calendarCalls()
    const body = JSON.parse(String(call?.init?.body)) as { extendedProperties: { private: Record<string, string> } }
    expect(body.extendedProperties.private).toEqual({ softnSlotStart: slot.start })
  })

  it('hands back the iCalUID and the sequence the patched event answered', async () => {
    withToken(() =>
      jsonResponse({ id: EVENT_ID, iCalUID: `${EVENT_ID}@google.com`, sequence: 1, hangoutLink: 'https://meet' }),
    )
    const { rescheduleBookingEvent } = await import('./calendar')

    const result = await rescheduleBookingEvent({
      eventId: EVENT_ID,
      slot,
      description: 'd',
      emailSequence: 1,
      rules: TEST_RULES,
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({
      ok: true,
      data: { eventId: EVENT_ID, iCalUid: `${EVENT_ID}@google.com`, sequence: 1 },
    })
  })

  it('reports an upstream failure as its code, without reading the body', async () => {
    withToken(() => new Response('not json at all', { status: 412 }))
    const { rescheduleBookingEvent } = await import('./calendar')

    expect(
      await rescheduleBookingEvent({
        eventId: EVENT_ID,
        slot,
        description: 'd',
        rules: TEST_RULES,
        subjectToken: SUBJECT_TOKEN,
      }),
    ).toEqual({ ok: false, error: 'request-failed', status: 412 })
  })

  it('refuses an unreadable slot before any network call', async () => {
    withToken(() => jsonResponse({ id: EVENT_ID }))
    const { rescheduleBookingEvent } = await import('./calendar')

    expect(
      await rescheduleBookingEvent({
        eventId: EVENT_ID,
        slot: { start: 'not-a-date', end: 'not-a-date' },
        description: 'd',
        rules: TEST_RULES,
        subjectToken: SUBJECT_TOKEN,
      }),
    ).toEqual({ ok: false, error: 'invalid-response' })
    expect(calendarCalls()).toEqual([])
  })
})

describe('cancelBookingEvent', () => {
  const EVENT_ID = 'softnabc0123456789abcdefghijkl'

  it('deletes the event with sendUpdates=none, so Google emails no cancellation', async () => {
    withToken(() => new Response(null, { status: 204 }))
    const { cancelBookingEvent } = await import('./calendar')

    const result = await cancelBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })

    expect(result).toEqual({ ok: true, data: true })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe(`/calendar/v3/calendars/melanie%40softn.io/events/${EVENT_ID}`)
    expect(call?.init?.method).toBe('DELETE')
    // Softn sends the cancellation itself, with the calendar file that withdraws the appointment.
    expect(url.searchParams.get('sendUpdates')).toBe('none')
    expect(call?.init?.body).toBeUndefined()
  })

  it('reports an upstream failure as its code', async () => {
    withToken(() => new Response('', { status: 410 }))
    const { cancelBookingEvent } = await import('./calendar')

    expect(await cancelBookingEvent({ eventId: EVENT_ID, subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
      status: 410,
    })
  })
})

describe('storeBookingLeadRowId', () => {
  it('patches the private row id, without sending any notification', async () => {
    withToken(() => jsonResponse({ id: 'softnabc' }))
    const { storeBookingLeadRowId } = await import('./calendar')

    const result = await storeBookingLeadRowId({ eventId: 'softnabc', rowId: 42, subjectToken: SUBJECT_TOKEN })

    expect(result).toEqual({ ok: true, data: true })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/melanie%40softn.io/events/softnabc')
    expect(call?.init?.method).toBe('PATCH')
    // The mark is internal: Google is told not to notify anybody about it.
    expect(url.searchParams.get('sendUpdates')).toBe('none')
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      extendedProperties: { private: { softnLeadRowId: '42' } },
    })
  })

  it('reports a failure as a code, so the caller logs it without changing the visitor answer', async () => {
    withToken(() => new Response('not json at all', { status: 404 }))
    const { storeBookingLeadRowId } = await import('./calendar')

    expect(await storeBookingLeadRowId({ eventId: 'softnabc', rowId: 42, subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
      status: 404,
    })
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
    // The mark is internal: Google is told not to notify anybody about it.
    expect(url.searchParams.get('sendUpdates')).toBe('none')
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
      status: 404,
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

describe('markBookingEmailFailed', () => {
  it('marks the event with the kind of message that failed, beside the other properties', async () => {
    withToken(() => jsonResponse({ id: 'softnabc' }))
    const { markBookingEmailFailed } = await import('./calendar')

    const result = await markBookingEmailFailed({
      eventId: 'softnabc',
      email: 'confirmation',
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: true, data: true })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/melanie%40softn.io/events/softnabc')
    expect(call?.init?.method).toBe('PATCH')
    // The mark is an internal one: it never asks Google to notify anybody.
    expect(url.searchParams.get('sendUpdates')).toBe('none')
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      extendedProperties: { private: { softnEmailFailed: 'confirmation' } },
    })
  })

  it('reports a failure as a code, so the caller logs it without changing the visitor answer', async () => {
    withToken(() => new Response('not json at all', { status: 404 }))
    const { markBookingEmailFailed } = await import('./calendar')

    expect(await markBookingEmailFailed({ eventId: 'softnabc', email: 'update', subjectToken: SUBJECT_TOKEN })).toEqual(
      { ok: false, error: 'request-failed', status: 404 },
    )
  })
})

/** One event of the reminder window, as the API returns it, with everything the job reads. */
const reminderEventResponse = (eventId: string, overrides: Readonly<Record<string, unknown>> = {}): unknown => ({
  id: eventId,
  status: 'confirmed',
  start: { dateTime: '2026-06-11T09:30:00+02:00' },
  iCalUID: `${eventId}@google.com`,
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  attendees: [{ email: 'marie@example.fr' }],
  extendedProperties: {
    private: {
      softnBooking: 'discovery',
      softnGuestFirstName: 'Marie',
      softnGuestLastName: 'Dupont',
      softnReminderSentFor: '2026-06-10T09:30:00+02:00',
      softnEmailSentAt: '2026-06-10T08:00:00.000Z',
    },
  },
  ...overrides,
})

describe('listBookingReminderCandidates', () => {
  const timeMin = '2026-06-11T00:00:00.000Z'
  const timeMax = '2026-06-12T00:00:00.000Z'

  it('asks for the window, the booking tag and the fields a reminder reads', async () => {
    withToken(() => jsonResponse({ items: [reminderEventResponse('softnabc')] }))
    const { listBookingReminderCandidates } = await import('./calendar')

    const result = await listBookingReminderCandidates({ timeMin, timeMax, subjectToken: SUBJECT_TOKEN })

    expect(result).toEqual({
      ok: true,
      data: [
        {
          eventId: 'softnabc',
          start: '2026-06-11T09:30:00+02:00',
          iCalUid: 'softnabc@google.com',
          hangoutLink: 'https://meet.google.com/abc-defg-hij',
          guestFirstName: 'Marie',
          guestLastName: 'Dupont',
          guestEmail: 'marie@example.fr',
          remindedFor: '2026-06-10T09:30:00+02:00',
          emailSentAt: '2026-06-10T08:00:00.000Z',
        },
      ],
    })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/melanie%40softn.io/events')
    expect(url.searchParams.get('timeMin')).toBe(timeMin)
    expect(url.searchParams.get('timeMax')).toBe(timeMax)
    expect(url.searchParams.get('singleEvents')).toBe('true')
    expect(url.searchParams.get('maxResults')).toBe('250')
    // Only the events this application booked: a personal appointment is never reminded about.
    expect(url.searchParams.get('privateExtendedProperty')).toBe('softnBooking=discovery')
    expect(url.searchParams.has('pageToken')).toBe(false)
  })

  it('walks the pages the API hands back, token by token', async () => {
    withToken((url) =>
      new URL(url).searchParams.get('pageToken') === 'page-2'
        ? jsonResponse({ items: [reminderEventResponse('second')] })
        : jsonResponse({ items: [reminderEventResponse('first')], nextPageToken: 'page-2' }),
    )
    const { listBookingReminderCandidates } = await import('./calendar')

    const result = await listBookingReminderCandidates({ timeMin, timeMax, subjectToken: SUBJECT_TOKEN })

    expect(result.ok && result.data.map((candidate) => candidate.eventId)).toEqual(['first', 'second'])

    const calls = calendarCalls()
    expect(calls).toHaveLength(2)
    expect(new URL(String(calls[1]?.url)).searchParams.get('pageToken')).toBe('page-2')
  })

  it('leaves out a cancelled event and one that starts on a whole day', async () => {
    withToken(() =>
      jsonResponse({
        items: [
          reminderEventResponse('live'),
          reminderEventResponse('cancelled', { status: 'cancelled' }),
          reminderEventResponse('all-day', { start: { date: '2026-06-11' } }),
          { id: 'no-start', status: 'confirmed' },
        ],
      }),
    )
    const { listBookingReminderCandidates } = await import('./calendar')

    const result = await listBookingReminderCandidates({ timeMin, timeMax, subjectToken: SUBJECT_TOKEN })

    expect(result.ok && result.data.map((candidate) => candidate.eventId)).toEqual(['live'])
  })

  it('fails closed rather than paging forever when the list never ends', async () => {
    withToken(() => jsonResponse({ items: [], nextPageToken: 'always-more' }))
    const { listBookingReminderCandidates } = await import('./calendar')

    expect(await listBookingReminderCandidates({ timeMin, timeMax, subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
    })
    expect(calendarCalls()).toHaveLength(10)
  })

  it('reports an upstream failure as its code', async () => {
    withToken(() => new Response('not json at all', { status: 502 }))
    const { listBookingReminderCandidates } = await import('./calendar')

    expect(await listBookingReminderCandidates({ timeMin, timeMax, subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
      status: 502,
    })
  })
})

describe('markBookingReminderSent', () => {
  it('writes the slot the reminder was sent for, without notifying anybody', async () => {
    withToken(() => jsonResponse({ id: 'softnabc' }))
    const { markBookingReminderSent } = await import('./calendar')

    const result = await markBookingReminderSent({
      eventId: 'softnabc',
      slotStart: '2026-06-11T09:30:00+02:00',
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: true, data: true })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(url.pathname).toBe('/calendar/v3/calendars/melanie%40softn.io/events/softnabc')
    expect(call?.init?.method).toBe('PATCH')
    expect(url.searchParams.get('sendUpdates')).toBe('none')
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      extendedProperties: { private: { softnReminderSentFor: '2026-06-11T09:30:00+02:00' } },
    })
  })

  it('reports a failure as a code, so the caller logs it without changing anything for the guest', async () => {
    withToken(() => new Response('', { status: 412 }))
    const { markBookingReminderSent } = await import('./calendar')

    expect(await markBookingReminderSent({ eventId: 'softnabc', slotStart: 'x', subjectToken: SUBJECT_TOKEN })).toEqual(
      { ok: false, error: 'request-failed', status: 412 },
    )
  })
})

describe('storeBookingEmailSentAt', () => {
  it('dates the slot with the instant its confirmation or update left', async () => {
    withToken(() => jsonResponse({ id: 'softnabc' }))
    const { storeBookingEmailSentAt } = await import('./calendar')

    const result = await storeBookingEmailSentAt({
      eventId: 'softnabc',
      sentAt: '2026-06-10T08:00:00.000Z',
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: true, data: true })

    const [call] = calendarCalls()
    const url = new URL(String(call?.url))
    expect(call?.init?.method).toBe('PATCH')
    expect(url.searchParams.get('sendUpdates')).toBe('none')
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      extendedProperties: { private: { softnEmailSentAt: '2026-06-10T08:00:00.000Z' } },
    })
  })

  it('reports a failure as a code, so the caller can carry on without a grace to observe', async () => {
    withToken(() => new Response('', { status: 500 }))
    const { storeBookingEmailSentAt } = await import('./calendar')

    expect(await storeBookingEmailSentAt({ eventId: 'softnabc', sentAt: 'x', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
      status: 500,
    })
  })
})
