/*
 * Management route of a booked call: free slots, a reschedule or a cancellation, reached from the
 * signed link of the calendar invitation.
 *
 * Order: same-origin check, JSON content type, shared rate limit, Zod validation, token
 * verification — before any Google call — then the event read, the timing rule and the action.
 * Nothing is written when the re-check of a new slot fails, and an event that does not carry the
 * booking tag is treated as not found whatever its id. Answers carry non-personal codes, logs carry
 * a stage and a code and nothing else: never a name, an address, a slot or an upstream body.
 *
 * Google notifies no guest anymore (`sendUpdates=none`): each action then sends Softn's own email,
 * with the calendar file that follows the change. A failed email leaves a code and a mark on the
 * event and never changes the visitor's answer.
 *
 * The timing rules are read from the event's real start as the calendar holds it, never from the
 * token's expiry: an older link must not get around the reschedule notice after Mel moved the event
 * by hand.
 */

import { checkRateLimit, trustedClientIp, type RateLimitFailure } from '@/lib/assistant/rateLimit'
import { updateBaserowRow, type BaserowFailure, type BaserowFields } from '@/lib/baserow'
import {
  bookingDayRangeOfInstant,
  bookingQueryWindow,
  findFreeSlots,
  isSlotBookable,
  releaseOwnSlot,
  type BookingSlot,
} from '@/lib/booking/availability'
import {
  bookingEventDescriptionWithFreshLink,
  bookingManageLinkOrigin,
  bookingManageUrlOfEvent,
} from '@/lib/booking/event'
import {
  sendBookingCancellationEmail,
  sendBookingUpdateEmail,
  type BookingEmailEvent,
  type BookingEmailOutcome,
} from '@/lib/booking/emails'
import { hasJsonContentType, isSameOriginRequest } from '@/lib/booking/guard'
import { emailSequenceOf } from '@/lib/booking/ics'
import { bookingLeadCancellationFields, bookingLeadRescheduleFields } from '@/lib/booking/lead'
import { readBookingLinkSecret, verifyBookingManageToken } from '@/lib/booking/manageToken'
import { BOOKING_RULES, manageCancelVerdict, manageRescheduleVerdict } from '@/lib/booking/rules'
import { readEnv } from '@/lib/env'
import { readSubjectToken } from '@/lib/google/auth'
import {
  cancelBookingEvent,
  countBookedCallsPerDay,
  queryBusyIntervals,
  readBookingEvent,
  rescheduleBookingEvent,
  type BookingEvent,
  type CalendarFailure,
} from '@/lib/google/calendar'
import {
  BookingManageRequestSchema,
  type BookingCancelReason,
  type BookingManageErrorCode,
} from '@/schemas/bookingManage'

/** The calendar client signs its JWT with `node:crypto`, so this route runs on the Node.js runtime. */
export const runtime = 'nodejs'

/** The reads, the re-check and the write stay well inside this budget. */
export const maxDuration = 30

const MILLISECONDS_PER_MINUTE = 60_000

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

const errorResponse = (error: BookingManageErrorCode, status: number): Response => json({ error }, status)

/** Diagnostic detail of a rate-limit store failure: the code, plus the store status when one answered. */
const rateLimitFailureDetail = (failure: RateLimitFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

/**
 * Diagnostic detail of a Google failure: the step of the credential chain that failed (or the call
 * itself when the chain is not what broke), its code, the upstream status when one answered and
 * Google's machine-readable reason when the answer carried one.
 *
 * The shape matches the rate-limit detail below. It never carries an upstream body beyond that
 * reason token, and never a slot.
 */
const googleFailureDetail = (call: string, failure: CalendarFailure): string =>
  `${failure.step ?? call} ${failure.error}${failure.status === undefined ? '' : ` status=${failure.status}`}${
    failure.reason === undefined ? '' : ` reason=${failure.reason}`
  }`

/** Diagnostic detail of a Baserow failure: the code, plus the upstream status when one answered. */
const baserowFailureDetail = (failure: BaserowFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

/**
 * Writes the single diagnostic line of a failed management action.
 *
 * The detail holds the stage and the code only: never a name, an address, a slot, a token or an
 * upstream body.
 */
const logFailure = (detail: string): void => {
  console.error(`[booking] manage: ${detail}`)
}

/** Arguments of {@link updateLeadRow}. */
type UpdateLeadRowInput = {
  /** Row id read from the event's private properties, absent when the row never reached it. */
  leadRowId: string | undefined
  /** Fields to change. */
  fields: BaserowFields
}

/**
 * Updates the leads row of one managed event, best effort.
 *
 * A missing row id, a missing table and a failed write are all the same to the visitor: the calendar
 * already holds the truth, and the answer never changes. The caller logs the single non-personal
 * code.
 */
const updateLeadRow = async ({ leadRowId, fields }: UpdateLeadRowInput) => {
  if (leadRowId === undefined) return { ok: false as const, error: 'not-configured' as const }

  let tableId: string | undefined
  try {
    tableId = readEnv().BASEROW_LEADS_TABLE_ID
  } catch {
    tableId = undefined
  }
  if (tableId === undefined) return { ok: false as const, error: 'not-configured' as const }

  return updateBaserowRow({ tableId, rowId: Number(leadRowId), fields })
}

/** The current interval of a managed event, the end defaulting to one call length. */
const ownIntervalOf = (event: BookingEvent): { readonly start: string; readonly end: string } | null => {
  if (event.start === undefined) return null

  const startMs = Date.parse(event.start)
  if (!Number.isFinite(startMs)) return null

  const end =
    event.end === undefined
      ? new Date(startMs + BOOKING_RULES.slotMinutes * MILLISECONDS_PER_MINUTE).toISOString()
      : event.end
  return Number.isFinite(Date.parse(end)) ? { start: event.start, end } : null
}

/** One managed event as the booking emails read it. */
const emailEventOf = (event: BookingEvent): BookingEmailEvent => ({
  eventId: event.eventId,
  iCalUid: event.iCalUid,
  guestFirstName: event.guestFirstName,
  guestLastName: event.guestLastName,
  guestEmail: event.guestEmail,
})

/**
 * Logs the outcome of one booking email, without ever touching the visitor's answer.
 *
 * A failed message leaves one non-personal code; when the event could not even be marked, the
 * second code names that failure too, so Mel can decide between a mail problem and a calendar
 * problem.
 */
const logEmailOutcome = (outcome: BookingEmailOutcome): void => {
  if (outcome.ok) return

  logFailure(`email not sent: ${outcome.detail}`)
  if (outcome.markDetail !== undefined) logFailure(`email mark not stored: ${outcome.markDetail}`)
}

/** Arguments of {@link freeSlotsForReschedule}. */
type FreeSlotsForRescheduleInput = {
  /** Current interval of the event being managed, released from the calendar data. */
  own: { readonly start: string; readonly end: string }
  /** Instant the availability is computed for. */
  now: Date
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/**
 * Lists the free slots a reschedule may pick.
 *
 * The managed event's own interval is released first, so it does not block its neighbours nor count
 * against the daily cap of its own day; its exact slot is then left out of the answer, because
 * keeping it is what the visitor already has. The horizon, the notice and every other rule are the
 * booking's own.
 */
const freeSlotsForReschedule = async ({
  own,
  now,
  subjectToken,
}: FreeSlotsForRescheduleInput): Promise<
  { readonly ok: true; readonly data: readonly BookingSlot[] } | CalendarFailure
> => {
  const { timeMin, timeMax } = bookingQueryWindow({ now, rules: BOOKING_RULES })

  const [busy, bookedCalls] = await Promise.all([
    queryBusyIntervals({ timeMin, timeMax, subjectToken }),
    countBookedCallsPerDay({ rules: BOOKING_RULES, timeMin, timeMax, subjectToken }),
  ])
  if (!busy.ok) return busy
  if (!bookedCalls.ok) return bookedCalls

  const released = releaseOwnSlot({
    busy: busy.data,
    bookedCallsPerDay: bookedCalls.data,
    ownStart: own.start,
    ownEnd: own.end,
    rules: BOOKING_RULES,
  })

  const ownStartMs = Date.parse(own.start)
  // The whole horizon is offered: the chooser shows day by day, and the rules already bound the
  // list to the working days and windows ahead.
  const slots = findFreeSlots({
    rules: BOOKING_RULES,
    busy: released.busy,
    bookedCallsPerDay: released.bookedCallsPerDay,
    now,
  })

  return { ok: true, data: slots.filter((slot) => Date.parse(slot.start) !== ownStartMs) }
}

/** Arguments of {@link reschedule}. */
type RescheduleInput = {
  /** Event to move. */
  event: BookingEvent
  /** New slot start, as the instant the client confirmed. */
  slotStart: string
  /** Origin of the fresh manage link, from {@link bookingManageLinkOrigin}. */
  origin: string
  /** Instant the rule was judged at. */
  now: Date
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/**
 * Moves one event to a new slot, after re-checking that slot against the calendar.
 *
 * The slot is re-checked immediately before the patch: the availability the visitor saw may be
 * seconds old, and nothing is written when the re-check fails. The description is rebuilt from the
 * one the calendar holds, with a fresh manage link signed for the same event and the new start,
 * because a patch replaces the whole description and the old link would keep the earlier expiry.
 */
const reschedule = async ({ event, slotStart, origin, now, subjectToken }: RescheduleInput): Promise<Response> => {
  const startMs = Date.parse(slotStart)
  const own = ownIntervalOf(event)
  if (!Number.isFinite(startMs) || own === null) return errorResponse('invalid', 400)

  const slot: BookingSlot = {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + BOOKING_RULES.slotMinutes * MILLISECONDS_PER_MINUTE).toISOString(),
  }

  const dayRange = bookingDayRangeOfInstant(slot.start, BOOKING_RULES)
  if (dayRange === null) return errorResponse('invalid', 400)

  const [busy, bookedCalls] = await Promise.all([
    queryBusyIntervals({ timeMin: dayRange.timeMin, timeMax: dayRange.timeMax, subjectToken }),
    countBookedCallsPerDay({
      rules: BOOKING_RULES,
      timeMin: dayRange.timeMin,
      timeMax: dayRange.timeMax,
      subjectToken,
    }),
  ])
  if (!busy.ok) {
    logFailure(`calendar unavailable: ${googleFailureDetail('freeBusy', busy)}`)
    return errorResponse('unavailable', 503)
  }
  if (!bookedCalls.ok) {
    logFailure(`calendar unavailable: ${googleFailureDetail('events list', bookedCalls)}`)
    return errorResponse('unavailable', 503)
  }

  const released = releaseOwnSlot({
    busy: busy.data,
    bookedCallsPerDay: bookedCalls.data,
    ownStart: own.start,
    ownEnd: own.end,
    rules: BOOKING_RULES,
  })

  const stillFree = isSlotBookable(
    {
      rules: BOOKING_RULES,
      busy: released.busy,
      bookedCallsPerDay: released.bookedCallsPerDay,
      now,
    },
    slot,
  )
  if (!stillFree) return errorResponse('slot-taken', 409)

  const manageUrl = bookingManageUrlOfEvent({ origin, eventId: event.eventId, expiresAt: slot.start })
  // Without a signing secret the deployment cannot build a link: the answers are still kept, and
  // the manage line stays as it was. With one, the line is refreshed for this event and new start.
  const description =
    manageUrl === null
      ? (event.description ?? '')
      : bookingEventDescriptionWithFreshLink({ description: event.description ?? '', manageUrl })

  const moved = await rescheduleBookingEvent({
    eventId: event.eventId,
    slot,
    description,
    // The counter numbers this change's calendar file; the patch stores it so the next change of
    // the same booking counts on from there.
    emailSequence: emailSequenceOf({ counter: event.emailSequence, googleSequence: undefined }),
    rules: BOOKING_RULES,
    subjectToken,
  })
  if (!moved.ok) {
    logFailure(`calendar unavailable: ${googleFailureDetail('events patch', moved)}`)
    return errorResponse('unavailable', 503)
  }

  const row = await updateLeadRow({ leadRowId: event.leadRowId, fields: bookingLeadRescheduleFields({ slot }) })
  if (!row.ok) logFailure(`lead not updated: baserow ${baserowFailureDetail(row)}`)

  // Google notifies nobody (`sendUpdates=none`): Softn sends the update itself, with the calendar
  // file that replaces the appointment in the guest's agenda. A failed email never undoes the
  // reschedule and never changes the answer.
  logEmailOutcome(
    await sendBookingUpdateEmail({
      event: emailEventOf(event),
      slot,
      previousStart: own.start,
      meetLink: event.hangoutLink,
      manageLink: manageUrl ?? undefined,
      emailCounter: event.emailSequence,
      googleSequence: moved.data.sequence,
      rules: BOOKING_RULES,
      subjectToken,
    }),
  )

  return json({ rescheduled: true }, 200)
}

/** Arguments of {@link cancel}. */
type CancelInput = {
  /** Event to cancel. */
  event: BookingEvent
  /** Current interval of the event, released once it is deleted. */
  own: { readonly start: string; readonly end: string }
  /** Code of the reason the visitor picked, absent when none was given. */
  reason: BookingCancelReason | undefined
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/**
 * Cancels one event, then updates its leads row, best effort.
 *
 * The calendar is the source of truth: the deletion happens first, and a failed row update only
 * leaves a code in the log — the visitor is told the cancellation stands. Softn then sends the
 * cancellation itself, with the calendar file that withdraws the appointment; a failed email leaves
 * a code and a mark on the event, and never changes the answer.
 */
const cancel = async ({ event, own, reason, subjectToken }: CancelInput): Promise<Response> => {
  const cancelled = await cancelBookingEvent({ eventId: event.eventId, subjectToken })
  if (!cancelled.ok) {
    logFailure(`calendar unavailable: ${googleFailureDetail('events delete', cancelled)}`)
    return errorResponse('unavailable', 503)
  }

  const row = await updateLeadRow({
    leadRowId: event.leadRowId,
    fields: bookingLeadCancellationFields(reason === undefined ? {} : { reason }),
  })
  if (!row.ok) logFailure(`lead not updated: baserow ${baserowFailureDetail(row)}`)

  // The deletion answers no event to read a sequence from, so the counter the event carried is the
  // only source the cancellation file's SEQUENCE can count on.
  logEmailOutcome(
    await sendBookingCancellationEmail({
      event: emailEventOf(event),
      slot: { start: own.start, end: own.end },
      emailCounter: event.emailSequence,
      rules: BOOKING_RULES,
      subjectToken,
    }),
  )

  return json({ cancelled: true }, 200)
}

/**
 * Answers one management action on a booked call.
 *
 * A request from another origin, without a JSON body, over the rate limit, malformed, or carrying a
 * token this deployment did not sign is refused before any Google call. The token names the event;
 * the event read then decides the timing rule from its real start, and only an allowed action is
 * carried out.
 *
 * @param request Incoming `POST` with the action, the token and their own fields as JSON.
 * @returns `{ slots }`, `{ rescheduled: true }`, `{ cancelled: true }`, or `{ error }` with 400,
 * 403, 409, 410, 415, 429 or 503.
 */
export const POST = async (request: Request): Promise<Response> => {
  if (!isSameOriginRequest(request)) return errorResponse('invalid', 403)
  if (!hasJsonContentType(request)) return errorResponse('invalid', 415)

  const limit = await checkRateLimit(trustedClientIp(request))
  if (!limit.ok) {
    logFailure(`unavailable: rate-limit ${rateLimitFailureDetail(limit)}`)
    return errorResponse('unavailable', 503)
  }
  if (limit.data === 'limited') return errorResponse('rate-limited', 429)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse('invalid', 400)
  }

  const parsed = BookingManageRequestSchema.safeParse(payload)
  if (!parsed.success) return errorResponse('invalid', 400)

  const now = new Date()
  const verified = verifyBookingManageToken({ secret: readBookingLinkSecret(), token: parsed.data.token, now })
  if (!verified.ok) {
    // The link is expired or not one this deployment signed: nothing reaches the calendar.
    if (verified.error !== 'not-configured') logFailure(`token refused: ${verified.error}`)
    return verified.error === 'expired' ? errorResponse('started', 410) : errorResponse('invalid', 403)
  }

  const subjectToken = readSubjectToken(request)
  const event = await readBookingEvent({ eventId: verified.data.eventId, subjectToken })
  if (!event.ok) {
    if (event.error === 'not-found') return errorResponse('invalid', 403)

    logFailure(`calendar unavailable: ${googleFailureDetail('events get', event)}`)
    return errorResponse('unavailable', 503)
  }
  if (event.data.cancelled) return errorResponse('cancelled', 409)

  const own = ownIntervalOf(event.data)
  if (own === null) {
    logFailure('calendar unavailable: events get start-unreadable')
    return errorResponse('unavailable', 503)
  }

  if (parsed.data.action === 'cancel') {
    if (manageCancelVerdict({ eventStart: own.start, now }) === 'started') {
      logFailure('action refused: started')
      return errorResponse('started', 410)
    }

    return cancel({ event: event.data, own, reason: parsed.data.reason, subjectToken })
  }

  const verdict = manageRescheduleVerdict({ eventStart: own.start, now, rules: BOOKING_RULES })
  if (verdict !== 'allowed') {
    logFailure(`action refused: ${verdict}`)
    return verdict === 'too-late' ? errorResponse('late', 409) : errorResponse('started', 410)
  }

  if (parsed.data.action === 'slots') {
    const slots = await freeSlotsForReschedule({ own, now, subjectToken })
    if (!slots.ok) {
      logFailure(`calendar unavailable: ${googleFailureDetail('availability', slots)}`)
      return errorResponse('unavailable', 503)
    }

    return json({ slots: slots.data }, 200)
  }

  return reschedule({
    event: event.data,
    slotStart: parsed.data.slot,
    origin: bookingManageLinkOrigin(request),
    now,
    subjectToken,
  })
}
