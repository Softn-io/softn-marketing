/*
 * Booking rules, in one typed constants object so Mel can edit the schedule without touching the
 * availability code. Every value is read through this object: nothing about the schedule is
 * hardcoded elsewhere.
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
  /** Working windows of one working day. */
  windows: readonly BookingWindow[]
  /** Length of one discovery call, in minutes. */
  slotMinutes: number
  /** Travel and preparation time added around every busy interval, in minutes. */
  bufferMinutes: number
  /** Shortest notice between the moment a slot is offered and its start, in hours. */
  minimumNoticeHours: number
  /** How far ahead slots are offered, in days from today. */
  horizonDays: number
  /** Calls already booked on one day before the day stops being offered, inclusive maximum. */
  maxCallsPerDay: number
}

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
  windows: [
    { start: '10:00', end: '12:00' },
    { start: '14:00', end: '15:30' },
  ],
  slotMinutes: 30,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  horizonDays: 21,
  maxCallsPerDay: 4,
}
