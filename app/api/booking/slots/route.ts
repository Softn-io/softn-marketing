import { checkRateLimit, trustedClientIp, type RateLimitFailure } from '@/lib/assistant/rateLimit'
import { bookingQueryWindow, findFreeSlots } from '@/lib/booking/availability'
import { isSameOriginRequest } from '@/lib/booking/guard'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { readSubjectToken } from '@/lib/google/auth'
import { countBookedCallsPerDay, queryBusyIntervals, type CalendarFailure } from '@/lib/google/calendar'
import { BOOKING_SLOTS_MAX, type BookingErrorCode } from '@/schemas/bookingLimits'

/** The calendar client signs its JWT with `node:crypto`, so this route runs on the Node.js runtime. */
export const runtime = 'nodejs'

/** Two bounded Google calls and the availability stay well inside this budget. */
export const maxDuration = 30

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

/**
 * Writes the single diagnostic line of a failed slots answer.
 *
 * The detail holds the failure stage and code only: never a calendar event, an address, a slot or
 * an upstream body.
 */
const logUnavailable = (detail: string): void => {
  console.error(`[booking] slots unavailable: ${detail}`)
}

/**
 * Answers the free slots a visitor may pick from.
 *
 * Order: same-origin check, shared rate limit, then the calendar. The answer carries free slot
 * instants and nothing else: never a busy interval, an event title or an attendee. Missing Google
 * configuration, an upstream failure or a store failure all fail closed with the generic
 * `unavailable` code, which the flow maps to `chatbot.booking.slots.unavailable`.
 *
 * @param request Incoming `GET`.
 * @returns `{ slots }` on success, or `{ error }` with 403, 429 or 503.
 */
export const GET = async (request: Request): Promise<Response> => {
  if (!isSameOriginRequest(request)) return errorResponse('invalid', 403)

  const limit = await checkRateLimit(trustedClientIp(request))
  if (!limit.ok) {
    logUnavailable(`rate-limit ${rateLimitFailureDetail(limit)}`)
    return errorResponse('unavailable', 503)
  }
  if (limit.data === 'limited') return errorResponse('rate-limited', 429)

  const subjectToken = readSubjectToken(request)
  const now = new Date()
  const { timeMin, timeMax } = bookingQueryWindow({ now, rules: BOOKING_RULES })

  // The two queries are independent: the busy intervals and the calls this booking already created.
  const [busy, bookedCalls] = await Promise.all([
    queryBusyIntervals({ timeMin, timeMax, subjectToken }),
    countBookedCallsPerDay({ rules: BOOKING_RULES, timeMin, timeMax, subjectToken }),
  ])
  if (!busy.ok) {
    logUnavailable(`calendar ${googleFailureDetail('freeBusy', busy)}`)
    return errorResponse('unavailable', 503)
  }
  if (!bookedCalls.ok) {
    logUnavailable(`calendar ${googleFailureDetail('events list', bookedCalls)}`)
    return errorResponse('unavailable', 503)
  }

  const slots = findFreeSlots({
    rules: BOOKING_RULES,
    busy: busy.data,
    bookedCallsPerDay: bookedCalls.data,
    now,
    limit: BOOKING_SLOTS_MAX,
  })

  return json({ slots }, 200)
}
