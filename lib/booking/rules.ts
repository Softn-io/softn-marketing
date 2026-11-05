/*
 * Booking rules, in one typed constants object so Mel can edit the schedule without touching the
 * availability code. Every value is read through this object: nothing about the schedule is
 * hardcoded elsewhere.
 *
 * The manage rules below read the real start of the event as the calendar holds it, never the
 * expiry of the visitor's link: a link built before Mel moved an event by hand must still be judged
 * against the event's new start.
 */

/** One working window of a day, as Paris wall-clock times (`HH:MM`). */
export type BookingWindow = {
  /** Inclusive start of the window, Paris time. */
  start: string
  /** Exclusive end of the window, Paris time. */
  end: string
}

/** Booking rules, as edited by Mel. */
export type BookingRules = {
  /** IANA time zone every wall-clock time below is written in. */
  timeZone: string
  /** ISO weekday numbers the studio takes calls on (1 = Monday, 7 = Sunday). */
  weekdays: readonly number[]
  /** True when the French national public holidays are never offered, whatever the weekday. */
  excludePublicHolidays: boolean
  /** Working windows of one working day. */
  windows: readonly BookingWindow[]
  /** Length of one discovery call, in minutes. */
  slotMinutes: number
  /** Travel and preparation time added around every busy interval, in minutes. */
  bufferMinutes: number
  /** Shortest notice between the moment a slot is offered and its start, in hours. */
  minimumNoticeHours: number
  /** Hours before the call's own start up to which a reschedule stays available. */
  rescheduleNoticeHours: number
  /** How far ahead slots are offered, in days from today. */
  horizonDays: number
  /** Calls already booked on one day before the day stops being offered, inclusive maximum. */
  maxCallsPerDay: number
}

/** Outcome of the timing rule of one management action. */
export type BookingManageVerdict = 'allowed' | 'too-late' | 'started'

/** Real start and current instant, shared by the management verdicts. */
export type BookingManageStartInput = {
  /** Start of the event as the calendar holds it, as an ISO 8601 instant. */
  eventStart: string
  /** Instant the rule is judged at. */
  now: Date
}

/** Arguments of {@link manageRescheduleVerdict}: the shared instants, plus the rules. */
export type BookingManageRuleInput = BookingManageStartInput & {
  /** Rules holding the reschedule notice. */
  rules: BookingRules
}

const MILLISECONDS_PER_HOUR = 3_600_000

/**
 * True when the event has started, which no management action may cross.
 *
 * An unreadable start answers `true`: a start nobody can read is not a start in the future, so the
 * link fails closed instead of acting on a wrong instant.
 */
const hasStarted = (startMs: number, now: Date): boolean => !Number.isFinite(startMs) || startMs <= now.getTime()

/**
 * Verdict of a reschedule on one event: allowed until the reschedule notice before its real start.
 *
 * The comparison is made on instants: the start read from the calendar carries an offset, and the
 * event may have been moved by hand since the link was built.
 *
 * @param input Real start, current instant and rules.
 * @returns `started`, `too-late` or `allowed`.
 */
export const manageRescheduleVerdict = ({ eventStart, now, rules }: BookingManageRuleInput): BookingManageVerdict => {
  const startMs = Date.parse(eventStart)
  if (hasStarted(startMs, now)) return 'started'

  return startMs - now.getTime() < rules.rescheduleNoticeHours * MILLISECONDS_PER_HOUR ? 'too-late' : 'allowed'
}

/**
 * Verdict of a cancellation on one event: allowed until the event's real start, with no other limit.
 *
 * @param input Real start and current instant.
 * @returns `started` or `allowed`.
 */
export const manageCancelVerdict = ({ eventStart, now }: BookingManageStartInput): BookingManageVerdict =>
  hasStarted(Date.parse(eventStart), now) ? 'started' : 'allowed'

/**
 * The booking rules of the discovery call, a 30-minute call on Google Meet.
 *
 * Every value below is Mel's to edit: the weekdays, the windows, the call length, the buffer, the
 * notice, the horizon and the daily cap are hers, and she changes them without touching the
 * availability code. Nothing here is repeated in prose, here or elsewhere in the application, so no
 * comment can drift from the values; each test file carries its own fixture for the same reason.
 */
export const BOOKING_RULES: BookingRules = {
  timeZone: 'Europe/Paris',
  weekdays: [1, 2, 4],
  excludePublicHolidays: true,
  windows: [
    { start: '10:00', end: '12:00' },
    { start: '14:00', end: '15:30' },
  ],
  slotMinutes: 30,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  rescheduleNoticeHours: 12,
  horizonDays: 21,
  maxCallsPerDay: 4,
}
