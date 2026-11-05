import { checkRateLimit, trustedClientIp, type RateLimitFailure } from '@/lib/assistant/rateLimit'
import { createBaserowRow, type BaserowFailure } from '@/lib/baserow'
import {
  bookingDayKeyOfInstant,
  bookingDayRangeOfInstant,
  isSlotBookable,
  type BookingSlot,
} from '@/lib/booking/availability'
import {
  bookingEventDescription,
  bookingEventTitle,
  bookingManageLinkOrigin,
  bookingManageUrlOfEvent,
  type BookingLead,
} from '@/lib/booking/event'
import { hasJsonContentType, isSameOriginRequest } from '@/lib/booking/guard'
import { sendBookingConfirmationEmail } from '@/lib/booking/emails'
import { bookingLeadFields } from '@/lib/booking/lead'
import { readBookingLinkSecret } from '@/lib/booking/manageToken'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { readEnv } from '@/lib/env'
import { readSubjectToken } from '@/lib/google/auth'
import {
  countBookedCallsPerDay,
  insertBookingEvent,
  markBookingLeadNotStored,
  queryBusyIntervals,
  storeBookingLeadRowId,
  type CalendarFailure,
} from '@/lib/google/calendar'
import { BookingRequestSchema, type BookingRequest } from '@/schemas/booking'
import { BOOKING_HONEYPOT_FIELD, type BookingErrorCode } from '@/schemas/bookingLimits'

/** The calendar client signs its JWT with `node:crypto`, so this route runs on the Node.js runtime. */
export const runtime = 'nodejs'

/** The re-check, the event creation and the lead write stay well inside this budget. */
export const maxDuration = 30

const MILLISECONDS_PER_MINUTE = 60_000

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

const errorResponse = (error: BookingErrorCode, status: number): Response => json({ error }, status)

/** Diagnostic detail of a rate-limit store failure: the code, plus the store status when one answered. */
const rateLimitFailureDetail = (failure: RateLimitFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

/**
 * Diagnostic detail of a Google failure: the step of the credential chain that failed (or the call
 * itself when the chain is not what broke), its code, and the upstream status when one answered.
 *
 * The shape matches the rate-limit detail below. It never carries an upstream body: those can echo
 * the request, and none of them is read.
 */
const googleFailureDetail = (call: string, failure: CalendarFailure): string =>
  `${failure.step ?? call} ${failure.error}${failure.status === undefined ? '' : ` status=${failure.status}`}`

/** Diagnostic detail of a Baserow failure: the code, plus the upstream status when one answered. */
const baserowFailureDetail = (failure: BaserowFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

/**
 * Writes the single diagnostic line of a failed booking.
 *
 * The detail holds the stage and the code only: never a name, an address, a need, a slot or an
 * upstream body.
 */
const logFailure = (detail: string): void => {
  console.error(`[booking] ${detail}`)
}

/**
 * The lead of one validated request, with the optional answers left absent when they are not there.
 *
 * The consent instant comes from the caller, which stamps it on receipt: it is never the value the
 * client sent.
 */
const leadOfRequest = (request: BookingRequest & { readonly consentAt: string }): BookingLead => ({
  need: request.need,
  firstName: request.firstName,
  lastName: request.lastName,
  email: request.email,
  consentAt: request.consentAt,
  ...(request.phone === undefined ? {} : { phone: request.phone }),
  ...(request.structure === undefined ? {} : { structure: request.structure }),
  ...(request.role === undefined ? {} : { role: request.role }),
})

/** Arguments of the private Baserow write, mirroring the booking lead. */
type StoreLeadInput = {
  lead: BookingLead
  slot: BookingSlot
  /** Paris calendar date the consent was given on, as `YYYY-MM-DD`. */
  consentOn: string
}

/**
 * Stores the lead in the Baserow leads table.
 *
 * A missing table id is reported as `not-configured` without a network call, so a preview or a test
 * without the variable keeps working; the caller only logs the code, because the booking already
 * exists in the calendar.
 */
const createBaserowRowWithLeadsTable = async ({ lead, slot, consentOn }: StoreLeadInput) => {
  let tableId: string | undefined
  try {
    tableId = readEnv().BASEROW_LEADS_TABLE_ID
  } catch {
    tableId = undefined
  }
  if (tableId === undefined) return { ok: false as const, error: 'not-configured' as const }

  return createBaserowRow({ tableId, fields: bookingLeadFields({ lead, slot, consentOn }) })
}

/**
 * Books one slot: re-checks it, creates the calendar event, then stores the lead.
 *
 * Order: same-origin check, JSON content type, shared rate limit, Zod validation, honeypot, then the
 * booking itself. The honeypot is answered like a success and stops there, without reaching the
 * calendar: a bot learns nothing from the answer.
 *
 * The slot is re-checked against the calendar before anything is written, then the event is created
 * with a Meet link, a signed manage link and its guest, and then two best-effort writes follow: the
 * confirmation email Softn sends itself, with the calendar file of the booking, and the lead in
 * Baserow; the id of the new row is written back to the event. Every failure before the event
 * exists answers `slot-taken` or the generic error and leaves no trace. When only the email or
 * Baserow fails the booking stands — the visitor is told it succeeded, the failure is logged as a
 * code, and the event carries a mark for Mel, because the event description already carries their
 * answers.
 *
 * @param request Incoming `POST` with the booking request as JSON.
 * @returns `{ booked: true }` on success, or `{ error }` with 400, 403, 409, 415, 429 or 503.
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

  const parsed = BookingRequestSchema.safeParse(payload)
  if (!parsed.success) return errorResponse('invalid', 400)

  if (parsed.data[BOOKING_HONEYPOT_FIELD] !== '') return json({ booked: true }, 200)

  // The consent instant is stamped here, on receipt: a value sent by the client would attest a claim
  // the server never witnessed.
  const consentAt = new Date().toISOString()
  const subjectToken = readSubjectToken(request)
  const dayRange = bookingDayRangeOfInstant(parsed.data.slot, BOOKING_RULES)
  const consentOn = bookingDayKeyOfInstant(consentAt, BOOKING_RULES)
  const slotStartMs = Date.parse(parsed.data.slot)
  if (dayRange === null || consentOn === null || !Number.isFinite(slotStartMs)) return errorResponse('invalid', 400)

  const slot: BookingSlot = {
    start: new Date(slotStartMs).toISOString(),
    end: new Date(slotStartMs + BOOKING_RULES.slotMinutes * MILLISECONDS_PER_MINUTE).toISOString(),
  }

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

  const stillFree = isSlotBookable(
    { rules: BOOKING_RULES, busy: busy.data, bookedCallsPerDay: bookedCalls.data, now: new Date() },
    slot,
  )
  if (!stillFree) return errorResponse('slot-taken', 409)

  const lead = leadOfRequest({ ...parsed.data, consentAt })
  // The manage link is built on the origin of this request — except in production, where it is
  // pinned to the canonical site origin, so a forged Host cannot put a foreign address in the
  // invitation. A preview deployment's links point at the deployment that holds their secret.
  // Without a secret the booking still stands, it just carries no way to manage itself: the fact is
  // logged once, as a code.
  const origin = bookingManageLinkOrigin(request)
  if (readBookingLinkSecret() === undefined) logFailure('manage link: secret-unset')

  const event = await insertBookingEvent({
    slot,
    attendeeEmail: lead.email,
    guest: { firstName: lead.firstName, lastName: lead.lastName },
    title: bookingEventTitle(lead),
    // Each attempt of the event id builds its own description: the manage URL it carries is signed
    // for that id.
    descriptionOfEvent: (eventId) => {
      const manageUrl = bookingManageUrlOfEvent({ origin, eventId, expiresAt: slot.start })
      return bookingEventDescription({ lead, ...(manageUrl === null ? {} : { manageUrl }) })
    },
    consentAt: lead.consentAt,
    rules: BOOKING_RULES,
    subjectToken,
  })
  if (!event.ok) {
    logFailure(`calendar unavailable: ${googleFailureDetail('events insert', event)}`)
    return event.error === 'slot-taken' ? errorResponse('slot-taken', 409) : errorResponse('unavailable', 503)
  }

  const row = await createBaserowRowWithLeadsTable({ lead, slot, consentOn })
  if (!row.ok) {
    logFailure(`lead not stored: baserow ${baserowFailureDetail(row)}`)
    // The lead then lives in the calendar only: a mark lets Mel find the events whose row is
    // missing. It is best effort, and a failed mark never changes what the visitor was told.
    const mark = await markBookingLeadNotStored({ eventId: event.data.eventId, subjectToken })
    if (!mark.ok) logFailure(`lead not stored: calendar ${googleFailureDetail('events patch', mark)}`)
  } else {
    // The id of the row is kept with the event, best effort, so a later reschedule or cancellation
    // updates the row without a lookup by personal data. No notification is sent to the visitor.
    const mark = await storeBookingLeadRowId({ eventId: event.data.eventId, rowId: row.data.id, subjectToken })
    if (!mark.ok) logFailure(`lead row id not stored: calendar ${googleFailureDetail('events patch', mark)}`)
  }

  // Google notifies nobody (`sendUpdates=none`): Softn sends the confirmation itself, with the
  // calendar file that adds the call to the guest's calendar. A failed email never undoes the
  // booking and never changes the answer: the event is marked and Mel reads one code here.
  const confirmation = await sendBookingConfirmationEmail({
    event: {
      eventId: event.data.eventId,
      iCalUid: event.data.iCalUid,
      guestFirstName: lead.firstName,
      guestLastName: lead.lastName,
      guestEmail: lead.email,
    },
    slot,
    meetLink: event.data.hangoutLink,
    manageLink: bookingManageUrlOfEvent({ origin, eventId: event.data.eventId, expiresAt: slot.start }) ?? undefined,
    rules: BOOKING_RULES,
    subjectToken,
  })
  if (!confirmation.ok) {
    logFailure(`email not sent: ${confirmation.detail}`)
    if (confirmation.markDetail !== undefined) logFailure(`email mark not stored: ${confirmation.markDetail}`)
  }

  return json({ booked: true }, 200)
}
