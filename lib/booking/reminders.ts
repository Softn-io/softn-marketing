/*
 * Reminder job of the booking: the email sent about a day before a call.
 *
 * Google Calendar reminders are private to the authenticated user, so the guest never receives one;
 * a scheduled job sends Softn's own reminder instead. Each run lists every booked call starting
 * within the next 24 hours and reminds about the ones it has not reminded about yet, because a
 * scheduler can be delayed or miss a run: the window, not the exact hour, is what decides.
 *
 * Three rules keep the guest from being written to twice or not at all:
 * - the duplicate guard is a private property naming the slot the last reminder was sent for, so a
 *   reschedule re-arms the reminder on its own (the new start no longer matches the flag) without
 *   the reschedule path clearing anything;
 * - a reminder waits a short grace after the confirmation or the update of the same slot, which the
 *   mail path dates with `softnEmailSentAt` (see `lib/google/calendar.ts` for why that instant and
 *   not the event's `updated`), so a booking made just inside the window is not written to twice
 *   within minutes;
 * - the flag is written after the message has left: a run that dies in between retries at the next
 *   one rather than losing the reminder.
 *
 * One call's failure never stops the others, and nothing here is ever logged from this module: the
 * non-personal codes travel back to the route, which is the only place that writes a log line.
 */

import {
  listBookingReminderCandidates,
  markBookingReminderSent,
  type CalendarFailure,
  type ReminderCandidate,
} from '@/lib/google/calendar'
import type { BookingSlot } from './availability'
import { sendBookingReminderEmail } from './emails'
import { bookingManageUrlOfEvent } from './event'
import { BOOKING_RULES } from './rules'

/** How far ahead one run looks for calls to remind, in hours. */
const REMINDER_WINDOW_HOURS = 24

/**
 * Shortest delay between the confirmation or the update of a slot and its reminder, in hours.
 *
 * A guest who books 25 hours ahead enters the reminder window right away; without this grace, the
 * next run would send the reminder minutes after the confirmation.
 */
const REMINDER_GRACE_HOURS = 2

const MILLISECONDS_PER_HOUR = 3_600_000

const MILLISECONDS_PER_MINUTE = 60_000

/** Outcome of one reminder run: its counts, or the reason the whole window could not be read. */
export type BookingReminderJobResult =
  | {
      /** The window was listed and the pass ran; the counts below say what it did. */
      readonly ok: true
      /** Reminders that left, whatever their flag write did. */
      readonly sent: number
      /** Calls whose reminder could not leave, and which the next run retries. */
      readonly failed: number
      /** Calls deliberately left alone: already reminded, inside the grace, or unreadable. */
      readonly skipped: number
      /** Non-personal codes of what went wrong, ready for the caller to log. */
      readonly details: readonly string[]
    }
  | {
      /** The window could not be listed: the run never started, and the caller answers 503. */
      readonly ok: false
      /** Non-personal code of the failed call, ready for the caller to log. */
      readonly detail: string
    }

/** Arguments of {@link runBookingReminders}. */
export type RunBookingRemindersInput = {
  /** Instant the run starts at; the window is the 24 hours that follow it. */
  readonly now: Date
  /** Origin the manage links are built on, from {@link bookingManageLinkOrigin}. */
  readonly origin: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  readonly subjectToken: string | undefined
}

/**
 * Diagnostic detail of a Google failure, in the shape the booking routes already log: the step of
 * the credential chain that failed when one did, the name of the call otherwise, its code and the
 * upstream status when one answered. Never an upstream body, a name, an address or a slot.
 */
const failureDetail = (call: string, failure: CalendarFailure): string =>
  `${failure.step ?? call} ${failure.error}${failure.status === undefined ? '' : ` status=${failure.status}`}`

/** True when two instants name the same moment; an absent or unreadable flag never does. */
const sameInstant = (left: string | undefined, right: string): boolean => {
  if (left === undefined) return false

  const leftMs = Date.parse(left)
  const rightMs = Date.parse(right)
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs
}

/** True when the email of one slot has just left, so its reminder waits for a later run. */
const withinGrace = (emailSentAt: string | undefined, now: Date): boolean => {
  if (emailSentAt === undefined) return false

  const sentMs = Date.parse(emailSentAt)
  return Number.isFinite(sentMs) && now.getTime() - sentMs < REMINDER_GRACE_HOURS * MILLISECONDS_PER_HOUR
}

/** The slot of one candidate: its start, and the end the call length of the rules gives it. */
const slotOf = (candidate: ReminderCandidate): BookingSlot | null => {
  const startMs = Date.parse(candidate.start)
  if (!Number.isFinite(startMs)) return null

  return {
    start: candidate.start,
    end: new Date(startMs + BOOKING_RULES.slotMinutes * MILLISECONDS_PER_MINUTE).toISOString(),
  }
}

/** Sends one reminder, then writes its flag; answers what the run counts and logs. */
const remind = async ({
  candidate,
  origin,
  now,
  subjectToken,
}: {
  candidate: ReminderCandidate
  origin: string
  now: Date
  subjectToken: string | undefined
}): Promise<{ readonly outcome: 'sent' | 'failed' | 'skipped'; readonly details: readonly string[] }> => {
  const slot = slotOf(candidate)
  if (slot === null) return { outcome: 'skipped', details: ['reminder skipped: start-unreadable'] }

  const alreadyReminded = sameInstant(candidate.remindedFor, candidate.start)
  if (alreadyReminded) return { outcome: 'skipped', details: [] }
  if (withinGrace(candidate.emailSentAt, now)) return { outcome: 'skipped', details: [] }

  const sent = await sendBookingReminderEmail({
    event: {
      eventId: candidate.eventId,
      iCalUid: candidate.iCalUid,
      guestFirstName: candidate.guestFirstName,
      guestLastName: candidate.guestLastName,
      guestEmail: candidate.guestEmail,
    },
    slot,
    meetLink: candidate.hangoutLink,
    manageLink: bookingManageUrlOfEvent({ origin, eventId: candidate.eventId, expiresAt: slot.start }) ?? undefined,
    rules: BOOKING_RULES,
    subjectToken,
    sentAt: now,
  })
  if (!sent.ok) {
    const details = [`reminder not sent: ${sent.detail}`]
    if (sent.markDetail !== undefined) details.push(`reminder failure mark not stored: ${sent.markDetail}`)
    return { outcome: 'failed', details }
  }

  // The flag is written once the message has left: when the patch fails here, the reminder of this
  // slot is sent again at the next run — a duplicate is possible — which is the price of never
  // losing one to a failed write. The code below says so in the log line.
  const flag = await markBookingReminderSent({ eventId: candidate.eventId, slotStart: candidate.start, subjectToken })
  return flag.ok
    ? { outcome: 'sent', details: [] }
    : {
        outcome: 'sent',
        details: [`reminder flag not stored: ${failureDetail('events patch', flag)} (duplicate possible)`],
      }
}

/**
 * Runs one reminder pass over the calls of the next 24 hours.
 *
 * @param input Current instant, manage-link origin and subject token of the request.
 * @returns The counts of the run and the non-personal codes its caller logs.
 */
export const runBookingReminders = async ({
  now,
  origin,
  subjectToken,
}: RunBookingRemindersInput): Promise<BookingReminderJobResult> => {
  const timeMax = new Date(now.getTime() + REMINDER_WINDOW_HOURS * MILLISECONDS_PER_HOUR).toISOString()
  const candidates = await listBookingReminderCandidates({ timeMin: now.toISOString(), timeMax, subjectToken })
  if (!candidates.ok) {
    // Without a window there is no pass at all: the caller answers `unavailable`, so a scheduled
    // run fails visibly instead of reporting a green zero.
    return { ok: false, detail: `calendar unavailable: ${failureDetail('events list', candidates)}` }
  }

  let sent = 0
  let failed = 0
  let skipped = 0
  const details: string[] = []

  for (const candidate of candidates.data) {
    // One call's failure never stops the others: every outcome is counted and the walk continues.
    const result = await remind({ candidate, origin, now, subjectToken })
    details.push(...result.details)
    if (result.outcome === 'sent') sent += 1
    if (result.outcome === 'failed') failed += 1
    if (result.outcome === 'skipped') skipped += 1
  }

  return { ok: true, sent, failed, skipped, details }
}
