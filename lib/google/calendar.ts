/*
 * Google Calendar client of the booking, on plain `fetch`: availability, the daily call count and
 * the event creation, each with its own timeout.
 *
 * Two calendars are involved, and they are not the same value. `GOOGLE_CALENDAR_ID` is the calendar
 * the booking writes to: it holds the events, so the daily count reads it and the insert and the
 * lead mark write to it. The impersonated owner's own calendar (`GOOGLE_CALENDAR_OWNER`, whose
 * address is also its calendar id) is read for the busy times only, so a busy owner is never booked
 * over. Availability therefore reads both, and the writes stay on one.
 *
 * Two rules hold everywhere in this module. A response body is only ever handed to a Zod schema: the
 * upstream error bodies are never read, returned nor logged, because they can echo the request. And
 * every failure leaves as a `Result` with a non-personal code, so a caller decides what the visitor
 * reads and nothing upstream leaks into a log line.
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  bookingDayKeyOfInstant,
  bookingWallClockOfInstant,
  type BookingDayKey,
  type BookingSlot,
  type BusyInterval,
} from '@/lib/booking/availability'
import type { BookingRules } from '@/lib/booking/rules'
import { readEnv } from '@/lib/env'
import {
  getAccessToken,
  GOOGLE_REQUEST_TIMEOUT_MS,
  isGoogleTimeoutError,
  type GoogleFailure,
  type GoogleFailureCode,
} from './auth'
import { bookingEventId } from './eventId'

/** Calendar API v3 base URL. */
const CALENDAR_API_BASE_URL = 'https://www.googleapis.com/calendar/v3'

/** Conference solution of the call, the one that yields a Google Meet link. */
const MEET_CONFERENCE_SOLUTION = 'hangoutsMeet'

/**
 * Private property every booking event carries, and the value it is set to.
 *
 * It marks the events the studio's own booking created, so the daily call count never counts a
 * personal appointment, and a later cancellation and rebooking can find the event of a slot.
 */
export const BOOKING_EVENT_TAG = { property: 'softnBooking', value: 'discovery' } as const

/** Private property holding the slot start of a booking event, as an ISO 8601 instant. */
export const BOOKING_SLOT_PROPERTY = 'softnSlotStart'

/**
 * Private property holding the instant the visitor accepted the consent, as an ISO 8601 string.
 *
 * The consent is part of the booking, so a copy of it stays with the event: the description itself
 * only carries the visitor's answers.
 */
export const BOOKING_CONSENT_PROPERTY = 'softnConsentAt'

/** Largest page the events list may return; a longer one is refused rather than undercounted. */
const EVENTS_PAGE_SIZE = 2500

/** Failure codes of the calendar calls: the Google codes, plus the one conflict the calendar itself reports. */
export type CalendarFailureCode = GoogleFailureCode | 'slot-taken'

/**
 * Failure of a calendar call: its code, the upstream status when a response answered, and the
 * credential step when the chain is what failed. Never an upstream body.
 */
export type CalendarFailure = Omit<GoogleFailure, 'error'> & { readonly error: CalendarFailureCode }

/** Outcome of a calendar call: its data, or a failure that carries no upstream detail. */
export type CalendarResult<T> = { readonly ok: true; readonly data: T } | CalendarFailure

/**
 * One busy interval of the answer.
 *
 * The bounds must parse and the end must come after the start. An interval that fails this is refused
 * here, at the boundary, rather than skipped later by the availability filter: an interval nobody can
 * read is not a free slot, so the whole query fails closed instead of offering a booking over it.
 */
const BusyIntervalSchema = z
  .object({
    start: z.string().min(1),
    end: z.string().min(1),
  })
  .refine((interval) => {
    const start = Date.parse(interval.start)
    const end = Date.parse(interval.end)
    return Number.isFinite(start) && Number.isFinite(end) && end > start
  })

/**
 * Answer of the free/busy query for the calendars it was asked about.
 *
 * A calendar that could not be read comes back with `errors` instead of `busy`: that is a failure,
 * not an empty calendar, so the entry is checked before its intervals are read.
 */
const FreeBusyResponseSchema = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      busy: z.array(BusyIntervalSchema).optional(),
      errors: z.array(z.unknown()).optional(),
    }),
  ),
})

/**
 * Answer of the events list, restricted to the two fields the count needs.
 *
 * `items` is absent when the window holds nothing, and `nextPageToken` only appears when the page
 * was truncated.
 */
const EventsListResponseSchema = z.object({
  items: z
    .array(
      z.object({
        start: z.object({ dateTime: z.string().min(1) }).optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
})

/** Answer of the event creation: the id of the event that now exists. */
const EventInsertResponseSchema = z.object({
  id: z.string().min(1),
})

/** Answer of the event patch used for the best-effort lead mark: the event that was updated. */
const EventPatchResponseSchema = z.object({
  id: z.string().min(1),
})

/** Arguments of {@link queryBusyIntervals}. */
export type QueryBusyIntervalsInput = {
  /** Inclusive start of the queried window, as an ISO 8601 instant. */
  timeMin: string
  /** Exclusive end of the queried window, as an ISO 8601 instant. */
  timeMax: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** Arguments of {@link countBookedCallsPerDay}. */
export type CountBookedCallsPerDayInput = {
  /** Rules holding the time zone the days are counted in. */
  rules: BookingRules
  /** Inclusive start of the counted window, as an ISO 8601 instant. */
  timeMin: string
  /** Exclusive end of the counted window, as an ISO 8601 instant. */
  timeMax: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** Arguments of {@link insertBookingEvent}. */
export type InsertBookingEventInput = {
  /** The slot the visitor confirmed. */
  slot: BookingSlot
  /** Address the invitation is sent to, the only attendee. */
  attendeeEmail: string
  /** Event title, from the locale. */
  title: string
  /** Event description, from the locale: it carries the visitor's answers. */
  description: string
  /** Instant the visitor accepted the consent, kept with the event. */
  consentAt: string
  /** Rules holding the time zone the event is anchored in. */
  rules: BookingRules
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** The calendar the booking writes to, or `null` when the environment is incomplete. */
const readCalendarId = (): string | null => {
  try {
    return readEnv().GOOGLE_CALENDAR_ID ?? null
  } catch {
    return null
  }
}

/**
 * Calendars the free/busy query asks about: the booking calendar, then the owner's own calendar.
 *
 * Both matter. The booking calendar holds the studio's calls, and the owner's calendar holds
 * everything that makes the owner unavailable, so reading only the first would book over a busy
 * owner. The owner's address is its calendar id, and when the two are the same calendar it is asked
 * for once, not twice.
 *
 * @returns The ids to ask about, or `null` when the environment is incomplete.
 */
const readBusyCalendarIds = (): readonly string[] | null => {
  let environment: ReturnType<typeof readEnv>
  try {
    environment = readEnv()
  } catch {
    return null
  }

  const { GOOGLE_CALENDAR_ID: bookingCalendarId, GOOGLE_CALENDAR_OWNER: owner } = environment
  if (bookingCalendarId === undefined || owner === undefined) return null
  if (bookingCalendarId === owner) return [bookingCalendarId]

  return [bookingCalendarId, owner]
}

/** One Calendar API call: its URL, its JSON body when it writes, and the schema of its answer. */
type CalendarRequestInput<T> = {
  url: string
  schema: z.ZodType<T>
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
  /** Body of a writing call; omitted for a reading one. */
  body?: unknown
  /** HTTP method, `GET` unless the call writes or patches. */
  method?: 'GET' | 'POST' | 'PATCH'
  /** Code to answer with when the response carries an error status. */
  failureForStatus?: (status: number) => CalendarFailureCode
}

/** Failure code of an error status: a refused credential is not the same as a broken call. */
const failureForStatus = (status: number): CalendarFailureCode =>
  status === 401 || status === 403 ? 'unauthorized' : 'request-failed'

/**
 * Runs one authorized Calendar API call and validates its answer.
 *
 * The token is fetched first, so a missing configuration fails before any request. The upstream
 * status decides the failure code; the body of a failed response is never read.
 */
const requestCalendar = async <T>({
  url,
  schema,
  subjectToken,
  body,
  method = body === undefined ? 'GET' : 'POST',
  failureForStatus: mapStatus = failureForStatus,
}: CalendarRequestInput<T>): Promise<CalendarResult<T>> => {
  const token = await getAccessToken({ subjectToken })
  // A chain failure already names its step and its status: it passes through untouched.
  if (!token.ok) return token

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token.data}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    return { ok: false, error: isGoogleTimeoutError(error) ? 'timeout' : 'request-failed' }
  }

  if (!response.ok) return { ok: false, error: mapStatus(response.status), status: response.status }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, error: 'invalid-response' }
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }

  return { ok: true, data: parsed.data }
}

/**
 * Reads the busy intervals of the booking calendar and of the owner's own calendar over one window.
 *
 * One query, two items: a calendar the answer does not carry, or one it could not read
 * (`errors`), fails the whole call rather than passing as empty, so availability never ignores a
 * calendar it could not read. Both the slot lookup and the pre-booking re-check go through here, so
 * both see the same two calendars.
 *
 * @param input Inclusive start and exclusive end of the window.
 * @returns The busy intervals of both calendars, or a non-personal failure code.
 */
export const queryBusyIntervals = async ({
  timeMin,
  timeMax,
  subjectToken,
}: QueryBusyIntervalsInput): Promise<CalendarResult<readonly BusyInterval[]>> => {
  const calendarIds = readBusyCalendarIds()
  if (calendarIds === null) return { ok: false, error: 'not-configured' }

  const response = await requestCalendar({
    url: `${CALENDAR_API_BASE_URL}/freeBusy`,
    schema: FreeBusyResponseSchema,
    subjectToken,
    body: {
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    },
  })
  if (!response.ok) return { ok: false, error: response.error }

  const intervals: BusyInterval[] = []
  for (const calendarId of calendarIds) {
    const calendar = response.data.calendars[calendarId]
    if (calendar === undefined || calendar.errors !== undefined) return { ok: false, error: 'invalid-response' }

    intervals.push(...(calendar.busy ?? []))
  }

  return { ok: true, data: intervals }
}

/**
 * Counts the calls this booking already created, per calendar day.
 *
 * Only the events carrying {@link BOOKING_EVENT_TAG} are counted, so a day full of personal
 * appointments still offers its calls. Cancelled events are left out by the API itself: a cancelled
 * call frees its place. A truncated answer is refused rather than counted short, because an
 * undercount would allow more calls than the rules permit.
 *
 * @param input Rules, inclusive start and exclusive end of the window.
 * @returns One count per day key, absent days being zero, or a non-personal failure code.
 */
export const countBookedCallsPerDay = async ({
  rules,
  timeMin,
  timeMax,
  subjectToken,
}: CountBookedCallsPerDayInput): Promise<CalendarResult<Readonly<Record<BookingDayKey, number>>>> => {
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const search = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    maxResults: String(EVENTS_PAGE_SIZE),
    privateExtendedProperty: `${BOOKING_EVENT_TAG.property}=${BOOKING_EVENT_TAG.value}`,
    fields: 'items(start),nextPageToken',
  })

  const response = await requestCalendar({
    url: `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${search.toString()}`,
    schema: EventsListResponseSchema,
    subjectToken,
  })
  if (!response.ok) return { ok: false, error: response.error }
  if (response.data.nextPageToken !== undefined) return { ok: false, error: 'invalid-response' }

  const counts: Record<BookingDayKey, number> = {}
  for (const event of response.data.items ?? []) {
    const dateTime = event.start?.dateTime
    if (dateTime === undefined) continue

    const dayKey = bookingDayKeyOfInstant(dateTime, rules)
    if (dayKey === null) return { ok: false, error: 'invalid-response' }

    counts[dayKey] = (counts[dayKey] ?? 0) + 1
  }

  return { ok: true, data: counts }
}

/**
 * Creates the booking event, with its Google Meet link and its invited attendee.
 *
 * The event id is derived from the slot ({@link bookingEventId}), so the calendar itself refuses a
 * second event for the same slot: a concurrent confirmation is answered `slot-taken` instead of
 * booking the same slot twice. `sendUpdates=all` has Google email the invitation, and
 * `conferenceDataVersion=1` is what makes the Meet conference stay on the event. The slot and the
 * consent instant travel in the event's private properties, where no guest reads them.
 *
 * @param input Slot, attendee, locale wording, consent instant and rules.
 * @returns The created event id, or a non-personal failure code.
 */
export const insertBookingEvent = async ({
  slot,
  attendeeEmail,
  title,
  description,
  consentAt,
  rules,
  subjectToken,
}: InsertBookingEventInput): Promise<CalendarResult<{ eventId: string }>> => {
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const startWallClock = bookingWallClockOfInstant(slot.start, rules)
  const endWallClock = bookingWallClockOfInstant(slot.end, rules)
  if (startWallClock === null || endWallClock === null) return { ok: false, error: 'invalid-response' }

  const eventId = bookingEventId(slot.start)
  const search = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'all' })

  // The conference request id is unique to this booking, never derived from the slot: a later
  // visitor of a rebooked slot must not be handed the room of the earlier one.
  const conferenceRequestId = `${eventId}-${randomUUID()}`

  const response = await requestCalendar({
    url: `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${search.toString()}`,
    schema: EventInsertResponseSchema,
    subjectToken,
    // A conflict means the calendar already holds this slot: the id it is keyed by is the one
    // derived from the slot, so a duplicate is a taken slot and not a technical failure.
    failureForStatus: (status) => (status === 409 ? 'slot-taken' : failureForStatus(status)),
    body: {
      id: eventId,
      summary: title,
      description,
      start: { dateTime: startWallClock, timeZone: rules.timeZone },
      end: { dateTime: endWallClock, timeZone: rules.timeZone },
      attendees: [{ email: attendeeEmail }],
      extendedProperties: {
        private: {
          [BOOKING_EVENT_TAG.property]: BOOKING_EVENT_TAG.value,
          [BOOKING_SLOT_PROPERTY]: slot.start,
          [BOOKING_CONSENT_PROPERTY]: consentAt,
        },
      },
      conferenceData: {
        createRequest: { requestId: conferenceRequestId, conferenceSolutionKey: { type: MEET_CONFERENCE_SOLUTION } },
      },
    },
  })
  if (!response.ok) return { ok: false, error: response.error }

  return { ok: true, data: { eventId: response.data.id } }
}

/** Arguments of {@link markBookingLeadNotStored}. */
export type MarkBookingLeadNotStoredInput = {
  /** Event whose lead could not be stored. */
  eventId: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** Private property set on an event whose lead never reached Baserow. */
export const BOOKING_LEAD_STORED_PROPERTY = 'softnLeadStored'

/**
 * Best-effort mark on an event whose lead could not be stored anywhere but the calendar.
 *
 * The booking stands — it exists and the visitor was told so — but Mel has to be able to spot the
 * events whose row is missing. `events.patch` merges private properties, so the mark is added
 * beside the slot and the consent instead of replacing them. A failure here is never reported to the
 * visitor and never changes the answer: it is one code in the log line of the caller.
 *
 * @param input Event id, the calendar of this deployment and the subject token of the request.
 * @returns Nothing worth showing a visitor: the success flag of a best-effort write.
 */
export const markBookingLeadNotStored = async ({
  eventId,
  subjectToken,
}: MarkBookingLeadNotStoredInput): Promise<CalendarResult<true>> => {
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const response = await requestCalendar({
    url: `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    schema: EventPatchResponseSchema,
    subjectToken,
    method: 'PATCH',
    body: {
      extendedProperties: { private: { [BOOKING_LEAD_STORED_PROPERTY]: 'false' } },
    },
  })
  if (!response.ok) return { ok: false, error: response.error }

  return { ok: true, data: true }
}
