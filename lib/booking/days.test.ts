import { describe, expect, it } from 'vitest'
import type { BookingSlot } from './availability'
import { groupSlotsByDay } from './days'
import type { BookingRules } from './rules'

/**
 * The schedule these assertions were written for, fixed here: a schedule change must never rewrite a
 * test. Only the time zone and the call length matter below.
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

/** One slot starting at the given instant, as the route answers them. */
const slotOf = (start: string): BookingSlot => ({
  start,
  end: new Date(Date.parse(start) + TEST_RULES.slotMinutes * 60_000).toISOString(),
})

describe('groupSlotsByDay', () => {
  it('groups two days and keeps every slot of each, in arrival order', () => {
    const days = groupSlotsByDay(
      [
        slotOf('2026-11-03T08:30:00.000Z'),
        slotOf('2026-11-03T09:00:00.000Z'),
        slotOf('2026-11-05T08:30:00.000Z'),
        slotOf('2026-11-03T09:30:00.000Z'),
      ],
      TEST_RULES,
    )

    expect(days.map((day) => day.key)).toEqual(['2026-11-03', '2026-11-05'])
    expect(days[0]?.slots.map((slot) => slot.start)).toEqual([
      '2026-11-03T08:30:00.000Z',
      '2026-11-03T09:00:00.000Z',
      '2026-11-03T09:30:00.000Z',
    ])
    expect(days[1]?.slots.map((slot) => slot.start)).toEqual(['2026-11-05T08:30:00.000Z'])
  })

  it('labels each day with the compact parts the chooser draws', () => {
    const [day] = groupSlotsByDay([slotOf('2026-11-03T08:30:00.000Z')], TEST_RULES)

    // The abbreviations carry no trailing dot, as the locale writes them.
    expect(day?.label).toEqual({ key: '2026-11-03', weekday: 'mar', day: '3', month: 'nov' })
  })

  it('orders the days as they first appear, oldest day first for an ordered answer', () => {
    const days = groupSlotsByDay(
      [slotOf('2026-11-03T08:30:00.000Z'), slotOf('2026-11-05T08:30:00.000Z'), slotOf('2026-11-06T08:30:00.000Z')],
      TEST_RULES,
    )

    expect(days.map((day) => day.key)).toEqual(['2026-11-03', '2026-11-05', '2026-11-06'])
    // A day between two offered ones receives no group of its own.
    expect(days.map((day) => day.key)).not.toContain('2026-11-04')
  })

  it('drops a slot whose instant cannot be read, and keeps the readable ones', () => {
    const days = groupSlotsByDay(
      [
        slotOf('2026-11-03T08:30:00.000Z'),
        { start: 'not-a-date', end: '2026-11-03T09:00:00.000Z' },
        { start: '', end: '' },
      ],
      TEST_RULES,
    )

    expect(days).toHaveLength(1)
    expect(days[0]?.slots.map((slot) => slot.start)).toEqual(['2026-11-03T08:30:00.000Z'])
  })

  it('reads the Paris day of an instant, not its UTC day', () => {
    // 23:30 UTC on 3 November is 00:30 in Paris on 4 November, and 22:30 UTC is 23:30 there: the two
    // instants belong to two different Paris days.
    const days = groupSlotsByDay([slotOf('2026-11-03T22:30:00.000Z'), slotOf('2026-11-03T23:30:00.000Z')], TEST_RULES)

    expect(days.map((day) => day.key)).toEqual(['2026-11-03', '2026-11-04'])
  })

  it('keeps both sides of a daylight saving change on their own Paris day', () => {
    // Paris moves back to winter time on 25 October 2026 at 01:00 UTC: 02:30 CEST and 02:30 CET are
    // both 25 October there, while 23:30 UTC belongs to 26 October. The two offsets of the same
    // local day must group together, and the day after must not swallow either of them.
    const days = groupSlotsByDay(
      [
        slotOf('2026-10-24T21:30:00.000Z'),
        slotOf('2026-10-25T00:30:00.000Z'),
        slotOf('2026-10-25T01:30:00.000Z'),
        slotOf('2026-10-25T23:30:00.000Z'),
      ],
      TEST_RULES,
    )

    expect(days.map((day) => day.key)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
    expect(days[1]?.slots.map((slot) => slot.start)).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'])
  })

  it('returns no group at all for an empty answer', () => {
    expect(groupSlotsByDay([], TEST_RULES)).toEqual([])
  })
})
