import { describe, expect, it } from 'vitest'
import { BOOKING_RULES, manageCancelVerdict, manageRescheduleVerdict, type BookingRules } from './rules'

/**
 * The schedule these assertions were written for, fixed here: `TEST_RULES` is Mel's to edit, and a
 * schedule change must never rewrite a test. Only the time zone and the reschedule notice matter.
 */
const TEST_RULES: BookingRules = {
  timeZone: 'Europe/Paris',
  weekdays: [1, 2, 3, 4, 5],
  excludePublicHolidays: false,
  windows: [{ start: '09:30', end: '12:00' }],
  slotMinutes: 30,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  rescheduleNoticeHours: 12,
  horizonDays: 21,
  maxCallsPerDay: 3,
}

/** Event start used by the boundary assertions: an instant, not a wall clock. */
const START = '2026-06-11T08:00:00.000Z'

const at = (instant: string): Date => new Date(instant)

describe('manageRescheduleVerdict', () => {
  it('allows a reschedule until twelve hours before the event, on the real start', () => {
    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-09T08:00:00.000Z'), rules: TEST_RULES })).toBe(
      'allowed',
    )
    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-10T19:59:59.999Z'), rules: TEST_RULES })).toBe(
      'allowed',
    )
    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-10T20:00:00.000Z'), rules: TEST_RULES })).toBe(
      'allowed',
    )
  })

  it('refuses a reschedule inside the notice, and once the call has started', () => {
    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-10T20:00:00.001Z'), rules: TEST_RULES })).toBe(
      'too-late',
    )
    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-11T07:59:59.999Z'), rules: TEST_RULES })).toBe(
      'too-late',
    )
    expect(manageRescheduleVerdict({ eventStart: START, now: at(START), rules: TEST_RULES })).toBe('started')
    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-11T09:00:00.000Z'), rules: TEST_RULES })).toBe(
      'started',
    )
  })

  it('judges an event moved by hand on its new start, not on the link that came before', () => {
    // The link was built for the 08:00 instant; Mel moved the event two days later. Judged at 19:00
    // the day before the original start, the old link is still inside the notice of the real start.
    const moved = '2026-06-13T08:00:00.000Z'

    expect(manageRescheduleVerdict({ eventStart: moved, now: at('2026-06-10T19:00:00.000Z'), rules: TEST_RULES })).toBe(
      'allowed',
    )
    // And an event moved closer is refused even though its link is not near its expiry.
    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-10T20:00:00.001Z'), rules: TEST_RULES })).toBe(
      'too-late',
    )
  })

  it('fails closed on a start it cannot read', () => {
    expect(manageRescheduleVerdict({ eventStart: 'not-a-date', now: at(START), rules: TEST_RULES })).toBe('started')
  })

  it('reads the notice from the rules, so a change moves the limit with it', () => {
    const oneHour: BookingRules = { ...TEST_RULES, rescheduleNoticeHours: 1 }

    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-11T07:00:00.001Z'), rules: oneHour })).toBe(
      'too-late',
    )
    expect(manageRescheduleVerdict({ eventStart: START, now: at('2026-06-11T07:00:00.000Z'), rules: oneHour })).toBe(
      'allowed',
    )
  })

  it('carries the approved twelve hours in the shipped rules', () => {
    expect(BOOKING_RULES.rescheduleNoticeHours).toBe(12)
  })
})

describe('manageCancelVerdict', () => {
  it('allows a cancellation until the event start, with no other limit', () => {
    expect(manageCancelVerdict({ eventStart: START, now: at('2026-06-01T00:00:00.000Z') })).toBe('allowed')
    // Inside the reschedule notice the cancellation stays open: it has no notice of its own.
    expect(manageCancelVerdict({ eventStart: START, now: at('2026-06-11T07:59:59.999Z') })).toBe('allowed')
  })

  it('refuses a cancellation once the call has started', () => {
    expect(manageCancelVerdict({ eventStart: START, now: at(START) })).toBe('started')
    expect(manageCancelVerdict({ eventStart: START, now: at('2026-06-11T09:00:00.000Z') })).toBe('started')
  })

  it('fails closed on a start it cannot read', () => {
    expect(manageCancelVerdict({ eventStart: 'not-a-date', now: at(START) })).toBe('started')
  })
})
