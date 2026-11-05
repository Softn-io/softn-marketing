/*
 * Google Calendar client of the booking, on plain `fetch`: availability, the daily call count, the
 * event creation, the management of one event (read, reschedule, cancel) and the best-effort marks
 * written back to the event, each with its own timeout.
 *
 * Google notifies no guest anymore (`sendUpdates=none`): Softn sends the confirmation, the update
 * and the cancellation itself (`lib/booking/emails.ts`), and this client carries what those emails
 * need — the event's `iCalUID`, its `sequence`, its Meet link, the guest and the counters kept in
 * the event's private properties — plus the mark of a message that never left. The reminder job
 * reads its window from the list helper below and writes its own flag, beside the instant the last
 * email of the slot was sent.
 *
 * Two calendars are involved, and they are not the same value. `GOOGLE_CALENDAR_ID` is the calendar
 * the booking writes to: it holds the events, so the daily count reads it and the insert, the
 * management calls and the lead marks write to it. The impersonated owner's own calendar
 * (`GOOGLE_CALENDAR_OWNER`, whose address is also its calendar id) is read for the busy times only,
 * so a busy owner is never booked over. Availability therefore reads both, and the writes stay on
 * one.
 *
 * A supplied event id that is already held is a conflict, not a technical failure: the insert walks
 * the slot's ordered ids ({@link BOOKING_EVENT_ID_ATTEMPTS} of them) and reads the event holding
 * each one, so a cancelled or hand-moved event of an earlier booking is passed while a live event of
 * the same instant answers `slot-taken`. When the whole list is exhausted the failure is the generic
 * one, never a personal detail.
 *
 * Two rules hold everywhere in this module. A response body is only ever handed to a Zod schema, or,
 * on a failure, read for the machine-readable reason of Google's error envelope — never a message,
 * never a field that could echo the request. And every failure leaves as a `Result` with a
 * non-personal code, so a caller decides what the visitor reads and nothing upstream leaks into a
 * log line beyond that reason token.
 *
 * One exception to the "answer as it is" walk, and it is a narrow one: the private-property marks
 * retry a rate-limited answer with a bounded backoff (`markRetry.ts`), because they are internal
 * best-effort writes with nothing to duplicate. The insert, the reschedule patch, the deletion and
 * the mail send never retry.
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
import { readGoogleErrorReason } from './errorReason'
import { BOOKING_EVENT_ID_ATTEMPTS, bookingEventIdAttempt } from './eventId'
import { retryMarkPatch, type MarkRetryOptions } from './markRetry'

/** Calendar API v3 base URL. */
const CALENDAR_API_BASE_URL = 'https://www.googleapis.com/calendar/v3'

/** Conference solution of the call, the one that yields a Google Meet link. */
const MEET_CONFERENCE_SOLUTION = 'hangoutsMeet'

/**
 * Private property every booking event carries, and the value it is set to.
 *
 * It marks the events the studio's own booking created, so the daily call count never counts a
 * personal appointment, a management call never touches a foreign event, and a later cancellation
 * and rebooking can find the event of a slot.
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

/**
 * Private property holding the numeric id of the event's row in the leads table.
 *
 * Written best effort once the row exists, and read back by a reschedule or a cancellation so the
 * row is updated without a lookup by personal data.
 */
export const BOOKING_LEAD_ROW_ID_PROPERTY = 'softnLeadRowId'

/** Private property set on an event whose lead never reached Baserow. */
export const BOOKING_LEAD_STORED_PROPERTY = 'softnLeadStored'

/**
 * Private properties holding the guest's name parts, written at booking.
 *
 * The update and the cancellation emails are sent from a later request, which knows nothing but
 * the event: they greet the guest by their first name, and their calendar file rebuilds the event
 * title, so the two name parts travel with the event. Private properties are the organizer's copy
 * only — a guest's own copy never carries them — and the name is already in the title and the e-mail
 * in the attendee list.
 */
export const BOOKING_GUEST_FIRST_NAME_PROPERTY = 'softnGuestFirstName'

/** Second half of {@link BOOKING_GUEST_FIRST_NAME_PROPERTY}. */
export const BOOKING_GUEST_LAST_NAME_PROPERTY = 'softnGuestLastName'

/**
 * Private property holding the sequence of the last calendar file sent for the event.
 *
 * The rule is 0 at booking and +1 at each change, and the counter is what makes it exact: Google's
 * own `sequence` also moves for changes no email was sent about (Mel editing the event by hand), so
 * only a counter this application owns can number its files.
 */
export const BOOKING_EMAIL_SEQUENCE_PROPERTY = 'softnEmailSequence'

/**
 * Private property marking an event whose booking email could not be sent.
 *
 * Its value is the kind of message that failed ({@link BookingEmailKind}), so Mel can find the
 * guest who never got their confirmation, their update, their cancellation or their reminder.
 */
export const BOOKING_EMAIL_FAILED_PROPERTY = 'softnEmailFailed'

/**
 * Private property holding the instant the confirmation or the update email of the current slot
 * was sent, as an ISO 8601 string.
 *
 * The reminder job waits a short grace after it, so a booking made just inside the reminder window
 * never receives the confirmation and the reminder within minutes of each other. The mail path
 * writes it once the message has really left, which is why it is preferred over the event's own
 * `updated`: every internal mark — the lead row id, a failure mark, the reminder flag itself —
 * moves `updated` without any email being sent, and a hand edit by Mel moves it too.
 */
export const BOOKING_EMAIL_SENT_PROPERTY = 'softnEmailSentAt'

/**
 * Private property holding the slot start the last reminder was sent for, as the calendar holds it.
 *
 * It is the reminder job's duplicate guard: a run skips an event whose flag names the slot it is
 * about to remind about. Keyed on the slot rather than on a boolean, a reschedule re-arms the
 * reminder on its own — the patch writes a new start, the flag still names the old one — without
 * the reschedule path having to clear anything.
 */
export const BOOKING_REMINDER_SENT_PROPERTY = 'softnReminderSentFor'

/** The four emails of a booking, as the failure mark and the mail paths name them. */
export type BookingEmailKind = 'confirmation' | 'update' | 'cancellation' | 'reminder'

/** Largest page the events list may return; a longer one is refused rather than undercounted. */
const EVENTS_PAGE_SIZE = 2500

/** Page size of the reminder window list: the API default, well below its 2500 ceiling. */
const REMINDER_EVENTS_PAGE_SIZE = 250

/**
 * Largest number of pages one reminder run reads.
 *
 * A 24-hour window holds a handful of calls at the booking rules' daily cap; a list that long means
 * the query is wrong, and the run fails closed rather than reminding from a partial list.
 */
const REMINDER_EVENTS_MAX_PAGES = 10

/**
 * Failure codes of the calendar calls: the Google codes, plus the two the calendar itself reports —
 * a conflict, and an event this application does not own.
 */
export type CalendarFailureCode = GoogleFailureCode | 'slot-taken' | 'not-found'

/**
 * Failure of a calendar call: its code, the upstream status when a response answered, the credential
 * step when the chain is what failed, and Google's machine-readable reason when the answer carried
 * one. Never an upstream body.
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

/**
 * Answer of the reminder window list, restricted to the fields the job reads.
 *
 * The query already filters on the booking tag; the status and the guest fields travel because a
 * reminder is sent from this answer alone, without a second read of every event.
 */
const ReminderEventsResponseSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        status: z.enum(['confirmed', 'tentative', 'cancelled']),
        // An event of a whole day carries a `date` instead of a `dateTime`: it is left out below,
        // not refused by the schema, which would fail the whole run for one foreign event.
        start: z.object({ dateTime: z.string().min(1).optional() }).optional(),
        iCalUID: z.string().min(1).optional(),
        hangoutLink: z.string().min(1).optional(),
        attendees: z.array(z.object({ email: z.string().min(1) })).optional(),
        extendedProperties: z
          .object({
            private: z.record(z.string(), z.string()).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
})

/**
 * Fields of an event answer the booking emails read.
 *
 * Each one is optional on purpose: an answer that does not carry one is not a broken calendar call,
 * it is an event the emails cannot describe. The insert and the patch still answer `ok`, and the
 * mail path fails closed and marks the event instead. `iCalUID` identifies the event across
 * calendaring systems and becomes the `UID` of the calendar file, `sequence` is the event's own
 * iCalendar sequence and `hangoutLink` its Meet address.
 */
const EventAnswerFieldsSchema = {
  iCalUID: z.string().min(1).optional(),
  sequence: z.number().int().min(0).optional(),
  hangoutLink: z.string().min(1).optional(),
}

/** Answer of the event creation: the id of the event that now exists, and what the emails need. */
const EventInsertResponseSchema = z.object({
  id: z.string().min(1),
  ...EventAnswerFieldsSchema,
})

/** Answer of the event patch used by the management and the best-effort marks. */
const EventPatchResponseSchema = z.object({
  id: z.string().min(1),
})

/** Answer of the reschedule patch: the patched event, as the update email reads it. */
const EventUpdateResponseSchema = z.object({
  id: z.string().min(1),
  ...EventAnswerFieldsSchema,
})

/**
 * Answer of one event read, restricted to the fields the management needs.
 *
 * A cancelled event may carry neither a start nor an end: the API promises the details only on the
 * organizer's own copy, and nothing but the id on a copy that only saw a deletion. The status
 * therefore decides what the rest of the answer may be used for.
 */ const BookingEventResponseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['confirmed', 'tentative', 'cancelled']),
  start: z.object({ dateTime: z.string().min(1) }).optional(),
  end: z.object({ dateTime: z.string().min(1) }).optional(),
  description: z.string().optional(),
  hangoutLink: z.string().min(1).optional(),
  iCalUID: z.string().min(1).optional(),
  sequence: z.number().int().min(0).optional(),
  attendees: z.array(z.object({ email: z.string().min(1) })).optional(),
  extendedProperties: z
    .object({
      private: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
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
  /** Guest's name, kept in the event's private properties for the later emails and their files. */
  guest: { readonly firstName: string; readonly lastName: string }
  /** Event title, from the locale. */
  title: string
  /**
   * Builds the event description from the id of the attempt: the signed manage link it carries is
   * derived from that id, so each attempt writes its own description.
   */
  descriptionOfEvent: (eventId: string) => string
  /** Instant the visitor accepted the consent, kept with the event. */
  consentAt: string
  /** Rules holding the time zone the event is anchored in. */
  rules: BookingRules
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** One created event, as the confirmation email reads it. */
export type InsertedBookingEvent = {
  /** Id of the event, as the calendar holds it. */
  readonly eventId: string
  /** `iCalUID` of the event, the `UID` of every calendar file of the booking; absent without one. */
  readonly iCalUid: string | undefined
  /** Meet link of the event, absent when the answer did not carry one. */
  readonly hangoutLink: string | undefined
}

/** Arguments of {@link readBookingEvent}. */
export type ReadBookingEventInput = {
  /** Event to read. */
  eventId: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** One booking event as the management reads it. */
export type BookingEvent = {
  /** Id of the event, as the calendar holds it. */
  readonly eventId: string
  /** True when the event was cancelled (deleted) and nothing may act on it anymore. */
  readonly cancelled: boolean
  /** Real start of the event, absent on a cancelled event whose details were dropped. */
  readonly start: string | undefined
  /** Real end of the event, absent on a cancelled event whose details were dropped. */
  readonly end: string | undefined
  /** Description as the calendar holds it, answers and manage link included. */
  readonly description: string | undefined
  /** Numeric id of the event's leads row, absent when the row never reached the event. */
  readonly leadRowId: string | undefined
  /** `iCalUID` of the event, the `UID` of every calendar file of the booking; absent without one. */
  readonly iCalUid: string | undefined
  /** Meet link of the event, which the update email offers the guest; absent when unset. */
  readonly hangoutLink: string | undefined
  /** Guest's first name, written at booking; absent on an event booked before the emails existed. */
  readonly guestFirstName: string | undefined
  /** Guest's last name, written at booking; absent on an event booked before the emails existed. */
  readonly guestLastName: string | undefined
  /** Address of the event's first attendee, which the guest emails are sent to. */
  readonly guestEmail: string | undefined
  /** Counter of the last calendar file sent, absent until one is written. */
  readonly emailSequence: string | undefined
}

/** Arguments of {@link rescheduleBookingEvent}. */
export type RescheduleBookingEventInput = {
  /** Event to move. */
  eventId: string
  /** New slot the visitor confirmed. */
  slot: BookingSlot
  /** Description to write, built for this event id so its manage link is fresh and valid. */
  description: string
  /**
   * Counter the event's calendar file carries, written with the new slot.
   *
   * The caller numbers the update email's file with it; the patch stores it so the next change of
   * the same booking counts on from there. Absent, the counter is left as it is.
   */
  emailSequence?: number
  /** Rules holding the time zone the event is anchored in. */
  rules: BookingRules
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** One rescheduled event, as the update email reads it. */
export type RescheduledBookingEvent = {
  /** Id of the patched event. */
  readonly eventId: string
  /** `iCalUID` of the event; absent when the answer did not carry one. */
  readonly iCalUid: string | undefined
  /** Sequence the event carries after the patch; absent when the answer did not carry one. */
  readonly sequence: number | undefined
}

/** Arguments of {@link cancelBookingEvent}. */
export type CancelBookingEventInput = {
  /** Event to cancel. */
  eventId: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** Arguments of {@link markBookingLeadNotStored}. */
export type MarkBookingLeadNotStoredInput = MarkRetryOptions & {
  /** Event whose lead could not be stored. */
  eventId: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** Arguments of {@link storeBookingLeadRowId}. */
export type StoreBookingLeadRowIdInput = MarkRetryOptions & {
  /** Event whose row now exists. */
  eventId: string
  /** Numeric id of the row in the leads table. */
  rowId: number
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** Arguments of {@link markBookingEmailFailed}. */
export type MarkBookingEmailFailedInput = MarkRetryOptions & {
  /** Event whose booking email could not be sent. */
  eventId: string
  /** Kind of message that failed, written as the mark's value. */
  email: BookingEmailKind
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** Arguments of {@link listBookingReminderCandidates}. */
export type ListBookingReminderCandidatesInput = {
  /** Inclusive start of the window, normally now: a call that already started is not reminded. */
  timeMin: string
  /** Exclusive end of the window: a call starting at or after it is left to a later run. */
  timeMax: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/**
 * One booked call of the reminder window, as the job reads it.
 *
 * Everything a reminder needs travels here, from one paginated list: the mail path is called once
 * per candidate, without a second read of each event.
 */
export type ReminderCandidate = {
  /** Id of the event, as the calendar holds it. */
  readonly eventId: string
  /** Start of the call, as the calendar holds it. */
  readonly start: string
  /** `iCalUID` of the event, absent when the answer did not carry one. */
  readonly iCalUid: string | undefined
  /** Meet link of the event, absent when the answer did not carry one. */
  readonly hangoutLink: string | undefined
  /** Guest's first name, written at booking. */
  readonly guestFirstName: string | undefined
  /** Guest's last name, written at booking. */
  readonly guestLastName: string | undefined
  /** Address of the event's first attendee, which the reminder is sent to. */
  readonly guestEmail: string | undefined
  /** Slot start the last reminder was sent for, absent when none was sent. */
  readonly remindedFor: string | undefined
  /** Instant the confirmation or update of this slot was sent, absent when it never was. */
  readonly emailSentAt: string | undefined
}

/** Arguments of {@link markBookingReminderSent}. */
export type MarkBookingReminderSentInput = MarkRetryOptions & {
  /** Event the reminder was sent for. */
  eventId: string
  /** Slot start the reminder was sent for, written as the flag's value. */
  slotStart: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/** Arguments of {@link storeBookingEmailSentAt}. */
export type StoreBookingEmailSentAtInput = MarkRetryOptions & {
  /** Event whose confirmation or update has just left. */
  eventId: string
  /** Instant the message was sent, as an ISO 8601 string. */
  sentAt: string
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

/** One Calendar API call: its URL, its JSON body when it writes, and the method to use. */
type CalendarApiRequestInput = {
  url: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
  /** Body of a writing call; omitted for a reading one. */
  body?: unknown
  /** HTTP method, `GET` unless the call writes, patches or deletes. */
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Code to answer with when the response carries an error status. */
  failureForStatus?: (status: number) => CalendarFailureCode
}

/** One Calendar API call whose answer is a JSON body validated against a schema. */
type CalendarRequestInput<T> = CalendarApiRequestInput & { schema: z.ZodType<T> }

/** Failure code of an error status: a refused credential is not the same as a broken call. */
const failureForStatus = (status: number): CalendarFailureCode =>
  status === 401 || status === 403 ? 'unauthorized' : 'request-failed'

/** Failure code of an event read: a missing event is a recorded answer, not a broken call. */
const readFailureForStatus = (status: number): CalendarFailureCode =>
  status === 404 ? 'not-found' : failureForStatus(status)

/**
 * Runs one authorized Calendar API call and hands back the raw answer.
 *
 * The token is fetched first, so a missing configuration fails before any request. The upstream
 * status decides the failure code, and the failed body is read for its machine-readable reason
 * alone ({@link readGoogleErrorReason}) — never a message, never a field the caller would have to
 * interpret. Keeping the raw response here is what lets a call with an empty success body share this
 * path with the JSON ones.
 */
const callCalendarApi = async ({
  url,
  subjectToken,
  body,
  method = body === undefined ? 'GET' : 'POST',
  failureForStatus: mapStatus = failureForStatus,
}: CalendarApiRequestInput): Promise<CalendarResult<Response>> => {
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

  if (!response.ok) {
    const reason = await readGoogleErrorReason(response)
    return {
      ok: false,
      error: mapStatus(response.status),
      status: response.status,
      ...(reason === undefined ? {} : { reason }),
    }
  }

  return { ok: true, data: response }
}

/** Runs one authorized Calendar API call and validates its JSON answer. */
const requestCalendar = async <T>(input: CalendarRequestInput<T>): Promise<CalendarResult<T>> => {
  const response = await callCalendarApi(input)
  if (!response.ok) return response

  let payload: unknown
  try {
    payload = await response.data.json()
  } catch {
    return { ok: false, error: 'invalid-response' }
  }

  const parsed = input.schema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }

  return { ok: true, data: parsed.data }
}

/** Runs one authorized Calendar API call whose success carries no body. */
const requestCalendarWithoutBody = async (input: CalendarApiRequestInput): Promise<CalendarResult<true>> => {
  const response = await callCalendarApi(input)
  return response.ok ? { ok: true, data: true } : response
}

/**
 * URL of one private-property patch: the event of the booking calendar, with `sendUpdates=none`.
 *
 * Every mark this module writes — the lead row id, the "lead not stored" flag, the failure mark,
 * the reminder flag, the sent instant — is internal, so no guest is ever notified about it. Google
 * documents no default for an omitted `sendUpdates` on `events.patch` (only the deprecated
 * `sendNotifications` defaulted to `false`), so the premise that Google mails nobody is written out
 * rather than assumed.
 */
const markUrl = (calendarId: string, eventId: string): string =>
  `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${new URLSearchParams(
    { sendUpdates: 'none' },
  ).toString()}`

/** True when two ISO instants name the same moment; an absent or unreadable one never does. */
const sameInstant = (left: string | undefined, right: string): boolean => {
  if (left === undefined) return false

  const leftMs = Date.parse(left)
  const rightMs = Date.parse(right)
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs
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
  if (!response.ok) return response

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
  if (!response.ok) return response
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
 * Lists the booked calls of one window, one page at a time.
 *
 * The query walks the pages the API hands back with `pageToken` (the documented way to page through
 * an events list), asking for the fields a reminder reads. Listing the instances of recurring events
 * (`singleEvents`) and filtering on the booking tag keeps a personal appointment out of the result.
 * A cancelled event never reaches the job — the API leaves deleted events out of a list — and the
 * status is checked anyway: a reminder to a guest whose call no longer exists is worse than a
 * skipped one. An event without a `dateTime` start, one of a whole day, is left out for the same
 * reason.
 *
 * @param input Inclusive start and exclusive end of the window, as ISO 8601 instants.
 * @returns The calls of the window, or a non-personal failure code.
 */
export const listBookingReminderCandidates = async ({
  timeMin,
  timeMax,
  subjectToken,
}: ListBookingReminderCandidatesInput): Promise<CalendarResult<readonly ReminderCandidate[]>> => {
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const search = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    maxResults: String(REMINDER_EVENTS_PAGE_SIZE),
    privateExtendedProperty: `${BOOKING_EVENT_TAG.property}=${BOOKING_EVENT_TAG.value}`,
    fields: 'items(id,status,start,iCalUID,hangoutLink,attendees,extendedProperties),nextPageToken',
  })

  const candidates: ReminderCandidate[] = []
  let pageToken: string | undefined

  for (let page = 0; page < REMINDER_EVENTS_MAX_PAGES; page += 1) {
    if (pageToken !== undefined) search.set('pageToken', pageToken)

    const response = await requestCalendar({
      url: `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${search.toString()}`,
      schema: ReminderEventsResponseSchema,
      subjectToken,
    })
    if (!response.ok) return response

    for (const event of response.data.items ?? []) {
      const start = event.start?.dateTime
      if (event.status === 'cancelled' || start === undefined) continue

      const privateProperties = event.extendedProperties?.private
      candidates.push({
        eventId: event.id,
        start,
        iCalUid: event.iCalUID,
        hangoutLink: event.hangoutLink,
        guestFirstName: privateProperties?.[BOOKING_GUEST_FIRST_NAME_PROPERTY],
        guestLastName: privateProperties?.[BOOKING_GUEST_LAST_NAME_PROPERTY],
        guestEmail: event.attendees?.[0]?.email,
        remindedFor: privateProperties?.[BOOKING_REMINDER_SENT_PROPERTY],
        emailSentAt: privateProperties?.[BOOKING_EMAIL_SENT_PROPERTY],
      })
    }

    pageToken = response.data.nextPageToken
    if (pageToken === undefined) return { ok: true, data: candidates }
  }

  return { ok: false, error: 'invalid-response' }
}

/**
 * Creates the booking event, with its Google Meet link and its invited attendee.
 *
 * The event id is the first free id of the slot ({@link bookingEventIdAttempt}), so the calendar
 * itself refuses a second event for the same slot: a concurrent confirmation is answered
 * `slot-taken` instead of booking the same slot twice. `sendUpdates=none` keeps Google from
 * emailing the guest — Softn sends the confirmation itself — while Google still syncs the event
 * into a Google guest's calendar. `conferenceDataVersion=1` is what makes the Meet conference stay
 * on the event, and its `hangoutLink` comes back in the answer. The slot, the consent instant, the
 * guest's name parts and the first calendar-file counter travel in the event's private properties,
 * where no guest reads them.
 *
 * A conflict on an id means an earlier booking of the slot still holds it. The event holding the id
 * is read: a cancelled one, or one whose real start has moved elsewhere, frees the id, and the walk
 * continues with the next id; a live one whose start is this very instant means the slot is really
 * taken, whichever writer got there first. The comparison is made on the real start, never on the
 * private property, because Mel also moves events by hand in Google Calendar.
 *
 * @param input Slot, attendee, guest name, locale wording, consent instant and rules.
 * @returns The created event — id, `iCalUID` and Meet link — or a non-personal failure code.
 */
export const insertBookingEvent = async ({
  slot,
  attendeeEmail,
  guest,
  title,
  descriptionOfEvent,
  consentAt,
  rules,
  subjectToken,
}: InsertBookingEventInput): Promise<CalendarResult<InsertedBookingEvent>> => {
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const startWallClock = bookingWallClockOfInstant(slot.start, rules)
  const endWallClock = bookingWallClockOfInstant(slot.end, rules)
  if (startWallClock === null || endWallClock === null) return { ok: false, error: 'invalid-response' }

  const search = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'none' })

  for (let attempt = 0; attempt < BOOKING_EVENT_ID_ATTEMPTS; attempt += 1) {
    const eventId = bookingEventIdAttempt(slot.start, attempt)

    // The conference request id is unique to this attempt, never derived from the slot: a later
    // visitor of a rebooked slot must not be handed the room of the earlier one.
    const conferenceRequestId = `${eventId}-${randomUUID()}`

    const response = await requestCalendar({
      url: `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${search.toString()}`,
      schema: EventInsertResponseSchema,
      subjectToken,
      // A conflict means the calendar already holds this id: it is then the walk below that decides
      // between a taken slot, a cancelled event and an event that moved away.
      failureForStatus: (status) => (status === 409 ? 'slot-taken' : failureForStatus(status)),
      body: {
        id: eventId,
        summary: title,
        description: descriptionOfEvent(eventId),
        start: { dateTime: startWallClock, timeZone: rules.timeZone },
        end: { dateTime: endWallClock, timeZone: rules.timeZone },
        attendees: [{ email: attendeeEmail }],
        extendedProperties: {
          private: {
            [BOOKING_EVENT_TAG.property]: BOOKING_EVENT_TAG.value,
            [BOOKING_SLOT_PROPERTY]: slot.start,
            [BOOKING_CONSENT_PROPERTY]: consentAt,
            [BOOKING_GUEST_FIRST_NAME_PROPERTY]: guest.firstName,
            [BOOKING_GUEST_LAST_NAME_PROPERTY]: guest.lastName,
            // Booking is the first calendar file of the booking, so its rule gives SEQUENCE 0.
            [BOOKING_EMAIL_SEQUENCE_PROPERTY]: '0',
          },
        },
        conferenceData: {
          createRequest: { requestId: conferenceRequestId, conferenceSolutionKey: { type: MEET_CONFERENCE_SOLUTION } },
        },
      },
    })
    if (response.ok) {
      return {
        ok: true,
        data: {
          eventId: response.data.id,
          iCalUid: response.data.iCalUID,
          hangoutLink: response.data.hangoutLink,
        },
      }
    }
    if (response.error !== 'slot-taken') return response

    const held = await readBookingEvent({ eventId, subjectToken })
    // An event that vanished between the refusal and the read frees its id like a cancelled one; any
    // other read failure leaves the booking unanswered rather than guessing about the slot.
    if (!held.ok) {
      if (held.error === 'not-found') continue
      return { ok: false, error: held.error }
    }

    // All writers walk the same list, so a live event of this instant is this very slot, and the
    // second writer is refused here as the calendar refused the first id.
    if (!held.data.cancelled && sameInstant(held.data.start, slot.start)) {
      return { ok: false, error: 'slot-taken' }
    }
  }

  return { ok: false, error: 'request-failed' }
}

/**
 * Reads one booking event.
 *
 * An event that does not carry the booking tag is answered as not found, like one that is really
 * absent: only the events this application created may be managed from a link, whatever id the link
 * was built from.
 *
 * @param input Event id and the subject token of the request.
 * @returns The event as the management reads it, or a non-personal failure code.
 */
export const readBookingEvent = async ({
  eventId,
  subjectToken,
}: ReadBookingEventInput): Promise<CalendarResult<BookingEvent>> => {
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const response = await requestCalendar({
    url: `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    schema: BookingEventResponseSchema,
    subjectToken,
    failureForStatus: readFailureForStatus,
  })
  if (!response.ok) return response

  const event = response.data
  if (event.id !== eventId) return { ok: false, error: 'invalid-response' }

  const privateProperties = event.extendedProperties?.private
  if (privateProperties?.[BOOKING_EVENT_TAG.property] !== BOOKING_EVENT_TAG.value) {
    return { ok: false, error: 'not-found' }
  }

  return {
    ok: true,
    data: {
      eventId: event.id,
      cancelled: event.status === 'cancelled',
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      description: event.description,
      leadRowId: privateProperties[BOOKING_LEAD_ROW_ID_PROPERTY],
      iCalUid: event.iCalUID,
      hangoutLink: event.hangoutLink,
      guestFirstName: privateProperties[BOOKING_GUEST_FIRST_NAME_PROPERTY],
      guestLastName: privateProperties[BOOKING_GUEST_LAST_NAME_PROPERTY],
      // The sole attendee is the guest the invitation was sent to.
      guestEmail: event.attendees?.[0]?.email,
      emailSequence: privateProperties[BOOKING_EMAIL_SEQUENCE_PROPERTY],
    },
  }
}

/**
 * Moves one booking event to a new slot; Softn's update email carries the news itself.
 *
 * The patch names only what changes: the start, the end, the private slot instant, the
 * calendar-file counter and the description with a fresh manage link. Every other field — the
 * attendee, the Meet conference, the consent, the guest name and the lead mark — is left out and
 * survives the patch, per patch semantics. The description is rebuilt by the caller (answers
 * included), because the link in it holds the event id and would otherwise point at an expired
 * page. `conferenceDataVersion=1` is set because the documentation requires it on every
 * modification of an event that carries conference data, and `sendUpdates=none` keeps Google from
 * emailing the guest a second time.
 *
 * @param input Event id, new slot, description, optional file counter and rules.
 * @returns The patched event — its id, its `iCalUID` and the sequence its answer carries.
 */
export const rescheduleBookingEvent = async ({
  eventId,
  slot,
  description,
  emailSequence,
  rules,
  subjectToken,
}: RescheduleBookingEventInput): Promise<CalendarResult<RescheduledBookingEvent>> => {
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const startWallClock = bookingWallClockOfInstant(slot.start, rules)
  const endWallClock = bookingWallClockOfInstant(slot.end, rules)
  if (startWallClock === null || endWallClock === null) return { ok: false, error: 'invalid-response' }

  const search = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'none' })

  const response = await requestCalendar({
    url: `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${search.toString()}`,
    schema: EventUpdateResponseSchema,
    subjectToken,
    method: 'PATCH',
    body: {
      description,
      start: { dateTime: startWallClock, timeZone: rules.timeZone },
      end: { dateTime: endWallClock, timeZone: rules.timeZone },
      extendedProperties: {
        private: {
          [BOOKING_SLOT_PROPERTY]: slot.start,
          ...(emailSequence === undefined ? {} : { [BOOKING_EMAIL_SEQUENCE_PROPERTY]: String(emailSequence) }),
        },
      },
    },
  })
  if (!response.ok) return response

  return {
    ok: true,
    data: { eventId: response.data.id, iCalUid: response.data.iCalUID, sequence: response.data.sequence },
  }
}

/**
 * Cancels one booking event; Softn's cancellation email carries the news itself.
 *
 * The event is deleted, which is the cancellation Google Calendar knows: the event keeps answering
 * as cancelled to a read, so a manage page opened afterwards still tells the visitor what happened.
 * `sendUpdates=none` keeps Google from emailing the guest, because Softn sends the cancellation
 * with the calendar file that withdraws the appointment. The deletion answers no body, so the
 * cancellation email's file takes its sequence from the counter the event holds.
 *
 * @param input Event id and the subject token of the request.
 * @returns Nothing worth showing a visitor: the success flag of the deletion.
 */
export const cancelBookingEvent = async ({
  eventId,
  subjectToken,
}: CancelBookingEventInput): Promise<CalendarResult<true>> => {
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const search = new URLSearchParams({ sendUpdates: 'none' })

  return requestCalendarWithoutBody({
    url: `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${search.toString()}`,
    subjectToken,
    method: 'DELETE',
  })
}

/**
 * Writes the leads row id into the event's private properties.
 *
 * Best effort, and `sendUpdates=none` so the visitor is not emailed about an internal mark.
 * `events.patch` merges private properties, so the id lands beside the slot, the consent and the
 * lead mark instead of replacing them. A rate-limited answer is retried with backoff
 * ({@link retryMarkPatch}); any other failure is returned as it is.
 *
 * @param input Event id, row id and the subject token of the request.
 * @returns Nothing worth showing a visitor: the success flag of a best-effort write.
 */
export const storeBookingLeadRowId = async (input: StoreBookingLeadRowIdInput): Promise<CalendarResult<true>> => {
  const { eventId, rowId, subjectToken } = input
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const response = await retryMarkPatch(
    () =>
      requestCalendar({
        url: markUrl(calendarId, eventId),
        schema: EventPatchResponseSchema,
        subjectToken,
        method: 'PATCH',
        body: {
          extendedProperties: { private: { [BOOKING_LEAD_ROW_ID_PROPERTY]: String(rowId) } },
        },
      }),
    input,
  )
  if (!response.ok) return response

  return { ok: true, data: true }
}

/**
 * Best-effort mark on an event whose lead could not be stored anywhere but the calendar.
 *
 * The booking stands — it exists and the visitor was told so — but Mel has to be able to spot the
 * events whose row is missing. `events.patch` merges private properties, so the mark is added
 * beside the slot and the consent instead of replacing them, and `sendUpdates=none` keeps Google
 * from notifying anybody about an internal mark. A failure here is never reported to the visitor
 * and never changes the answer: it is one code in the log line of the caller. A rate-limited answer
 * is retried with backoff ({@link retryMarkPatch}); any other failure is returned as it is.
 *
 * @param input Event id, the calendar of this deployment and the subject token of the request.
 * @returns Nothing worth showing a visitor: the success flag of a best-effort write.
 */
export const markBookingLeadNotStored = async (input: MarkBookingLeadNotStoredInput): Promise<CalendarResult<true>> => {
  const { eventId, subjectToken } = input
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const response = await retryMarkPatch(
    () =>
      requestCalendar({
        url: markUrl(calendarId, eventId),
        schema: EventPatchResponseSchema,
        subjectToken,
        method: 'PATCH',
        body: {
          extendedProperties: { private: { [BOOKING_LEAD_STORED_PROPERTY]: 'false' } },
        },
      }),
    input,
  )
  if (!response.ok) return response

  return { ok: true, data: true }
}

/**
 * Best-effort mark on an event whose booking email could not be sent.
 *
 * The booking, the reschedule or the cancel stands — the visitor was told so and nothing here
 * changes it — but Mel has to be able to spot the guests who never got their message.
 * `events.patch` merges private properties, so the mark is added beside the slot, the consent and
 * the guest name instead of replacing them, and no notification is sent to anybody. A failure here
 * is never reported to the visitor and never changes the answer: it is one code in the log line of
 * the caller. A rate-limited answer is retried with backoff ({@link retryMarkPatch}); any other
 * failure is returned as it is.
 *
 * @param input Event id, the kind of message that failed and the subject token of the request.
 * @returns Nothing worth showing a visitor: the success flag of a best-effort write.
 */
export const markBookingEmailFailed = async (input: MarkBookingEmailFailedInput): Promise<CalendarResult<true>> => {
  const { eventId, email, subjectToken } = input
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const response = await retryMarkPatch(
    () =>
      requestCalendar({
        url: markUrl(calendarId, eventId),
        schema: EventPatchResponseSchema,
        subjectToken,
        method: 'PATCH',
        body: {
          extendedProperties: { private: { [BOOKING_EMAIL_FAILED_PROPERTY]: email } },
        },
      }),
    input,
  )
  if (!response.ok) return response

  return { ok: true, data: true }
}

/**
 * Writes the reminder flag of one slot into the event's private properties.
 *
 * The flag is written once the message has really left, never before: a run that fails in between
 * sends the reminder again at the next run rather than losing it. `events.patch` merges private
 * properties, so the flag is added beside the slot, the guest, the file counter and the sent
 * instant, and `sendUpdates=none` keeps Google from notifying anybody about an internal mark.
 *
 * The flag names the slot the reminder was sent for, so a reschedule re-arms the reminder by itself:
 * the new start no longer matches the flag, without the reschedule path clearing anything. A
 * rate-limited answer is retried with backoff ({@link retryMarkPatch}); any other failure is returned
 * as it is.
 *
 * @param input Event id, the slot the reminder was sent for and the subject token of the request.
 * @returns Nothing worth showing a visitor: the success flag of a best-effort write.
 */
export const markBookingReminderSent = async (input: MarkBookingReminderSentInput): Promise<CalendarResult<true>> => {
  const { eventId, slotStart, subjectToken } = input
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const response = await retryMarkPatch(
    () =>
      requestCalendar({
        url: markUrl(calendarId, eventId),
        schema: EventPatchResponseSchema,
        subjectToken,
        method: 'PATCH',
        body: {
          extendedProperties: { private: { [BOOKING_REMINDER_SENT_PROPERTY]: slotStart } },
        },
      }),
    input,
  )
  if (!response.ok) return response

  return { ok: true, data: true }
}

/**
 * Writes the instant the confirmation or the update of one slot left, best effort.
 *
 * The reminder job waits a short grace after this instant, so a guest who booked just inside the
 * reminder window is not written to twice within minutes. It is a mark of its own rather than a
 * reading of the event's `updated`, which every internal patch and every hand edit by Mel moves
 * without any email being sent; `sendUpdates=none` keeps Google from notifying anybody about it. A
 * failure here is never reported to the visitor and never changes the answer: it only means the
 * reminder has no grace to observe, which is still better than no reminder at all. A rate-limited
 * answer is retried with backoff ({@link retryMarkPatch}); any other failure is returned as it is.
 *
 * @param input Event id, the instant the message was sent and the subject token of the request.
 * @returns Nothing worth showing a visitor: the success flag of a best-effort write.
 */
export const storeBookingEmailSentAt = async (input: StoreBookingEmailSentAtInput): Promise<CalendarResult<true>> => {
  const { eventId, sentAt, subjectToken } = input
  const calendarId = readCalendarId()
  if (calendarId === null) return { ok: false, error: 'not-configured' }

  const response = await retryMarkPatch(
    () =>
      requestCalendar({
        url: markUrl(calendarId, eventId),
        schema: EventPatchResponseSchema,
        subjectToken,
        method: 'PATCH',
        body: {
          extendedProperties: { private: { [BOOKING_EMAIL_SENT_PROPERTY]: sentAt } },
        },
      }),
    input,
  )
  if (!response.ok) return response

  return { ok: true, data: true }
}
