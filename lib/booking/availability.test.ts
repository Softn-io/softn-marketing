import { describe, expect, it } from 'vitest'
import {
  BOOKING_CALENDAR_QUERY_MARGIN_DAYS,
  bookingDayKeyOfInstant,
  bookingDayRangeOfInstant,
  bookingQueryWindow,
  bookingWallClockOfInstant,
  findFreeSlots,
  isSlotBookable,
  releaseOwnSlot,
  type BusyInterval,
} from './availability'
import type { BookingRules } from './rules'

/**
 * The schedule these assertions were written for, fixed here.
 *
 * `TEST_RULES` is Mel's: she edits it for the studio's real schedule, so a test that reads it is
 * rewritten by a schedule change instead of testing the code under it. The fixture holds the
 * Monday-to-Friday 09:30-12:00 and 14:00-17:30 Paris windows, 30-minute calls, a 15-minute buffer,
 * 24 hours of notice, 21 days of horizon and at most three calls a day: the values every expected
 * instant below encodes.
 */
const TEST_RULES: BookingRules = {
  timeZone: 'Europe/Paris',
  weekdays: [1, 2, 3, 4, 5],
  windows: [
    { start: '09:30', end: '12:00' },
    { start: '14:00', end: '17:30' },
  ],
  slotMinutes: 30,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  rescheduleNoticeHours: 12,
  horizonDays: 21,
  maxCallsPerDay: 3,
}

/** Paris wall clock of one instant, as `HH:MM`, read independently of the module under test. */
const parisTime = (instant: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TEST_RULES.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant))

/** Paris weekday of one instant, as an ISO number. */
const parisWeekday = (instant: string): number => {
  const short = new Intl.DateTimeFormat('en-GB', { timeZone: TEST_RULES.timeZone, weekday: 'short' }).format(
    new Date(instant),
  )
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return names.indexOf(short) + 1
}

/** Starts of the slots, as ISO instants. */
const starts = (slots: readonly { readonly start: string }[]): readonly string[] => slots.map((slot) => slot.start)

/** Slots of one Paris day, from the full list. */
const onDay = (slots: readonly { readonly start: string; readonly end: string }[], day: string) =>
  slots.filter((slot) => bookingDayKeyOfInstant(slot.start, TEST_RULES) === day)

const find = (input: {
  busy?: readonly BusyInterval[]
  bookedCallsPerDay?: Readonly<Record<string, number>>
  now: string
  limit?: number
}) =>
  findFreeSlots({
    rules: TEST_RULES,
    busy: input.busy ?? [],
    bookedCallsPerDay: input.bookedCallsPerDay ?? {},
    now: new Date(input.now),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  })

/** Wednesday 08:00 in Paris, a working day with no daylight saving change around it. */
const WEDNESDAY_MORNING = '2026-06-10T06:00:00.000Z'

describe('findFreeSlots', () => {
  it('offers every 30-minute step of both working windows, on working days only', () => {
    const slots = find({ now: WEDNESDAY_MORNING })

    const nextDay = onDay(slots, '2026-06-11')
    expect(starts(nextDay)).toEqual([
      '2026-06-11T07:30:00.000Z',
      '2026-06-11T08:00:00.000Z',
      '2026-06-11T08:30:00.000Z',
      '2026-06-11T09:00:00.000Z',
      '2026-06-11T09:30:00.000Z',
      '2026-06-11T12:00:00.000Z',
      '2026-06-11T12:30:00.000Z',
      '2026-06-11T13:00:00.000Z',
      '2026-06-11T13:30:00.000Z',
      '2026-06-11T14:00:00.000Z',
      '2026-06-11T14:30:00.000Z',
      '2026-06-11T15:00:00.000Z',
    ])

    // Every slot starts and ends inside a working window, on a weekday, and a call fits in it.
    for (const slot of slots) {
      expect(TEST_RULES.weekdays).toContain(parisWeekday(slot.start))
      expect([
        '09:30',
        '10:00',
        '10:30',
        '11:00',
        '11:30',
        '14:00',
        '14:30',
        '15:00',
        '15:30',
        '16:00',
        '16:30',
        '17:00',
      ]).toContain(parisTime(slot.start))
      expect((Date.parse(slot.end) - Date.parse(slot.start)) / 60_000).toBe(TEST_RULES.slotMinutes)
    }
  })

  it('never offers a Saturday or a Sunday', () => {
    const days = find({ now: WEDNESDAY_MORNING }).map((slot) => bookingDayKeyOfInstant(slot.start, TEST_RULES))

    expect(days).toContain('2026-06-12')
    expect(days).not.toContain('2026-06-13')
    expect(days).not.toContain('2026-06-14')
  })

  it('keeps the buffer free around an existing appointment', () => {
    const busy = [{ start: '2026-06-11T08:00:00.000Z', end: '2026-06-11T08:30:00.000Z' }]
    const withoutBuffer = onDay(find({ now: WEDNESDAY_MORNING }), '2026-06-11')
    const withBuffer = onDay(find({ now: WEDNESDAY_MORNING, busy }), '2026-06-11')

    expect(starts(withoutBuffer)).toContain('2026-06-11T07:30:00.000Z')
    expect(starts(withoutBuffer)).toContain('2026-06-11T08:30:00.000Z')
    // 10:00-10:30 Paris is taken: the 15-minute buffer removes 09:30, 10:00 and 10:30 as well.
    expect(starts(withBuffer)).not.toContain('2026-06-11T07:30:00.000Z')
    expect(starts(withBuffer)).not.toContain('2026-06-11T08:00:00.000Z')
    expect(starts(withBuffer)).not.toContain('2026-06-11T08:30:00.000Z')
    expect(starts(withBuffer)).toContain('2026-06-11T09:00:00.000Z')
  })

  it('removes the slots that a busy interval only clips, buffer included', () => {
    // 09:45-10:00 Paris clips the 09:30 slot; with the 15-minute buffer it clips 10:00 as well.
    const busy = [{ start: '2026-06-11T07:45:00.000Z', end: '2026-06-11T08:00:00.000Z' }]
    const slots = starts(onDay(find({ now: WEDNESDAY_MORNING, busy }), '2026-06-11'))

    expect(slots).not.toContain('2026-06-11T07:30:00.000Z')
    expect(slots).not.toContain('2026-06-11T08:00:00.000Z')
    expect(slots).toContain('2026-06-11T08:30:00.000Z')
  })

  it('ignores a busy interval that cannot be read', () => {
    // Defence in depth: `queryBusyIntervals` refuses such an answer at the boundary now, so no slot
    // is ever offered over a busy time; the filter keeps skipping one rather than blocking a day.

    const busy = [
      { start: 'not-a-date', end: '2026-06-11T08:30:00.000Z' },
      { start: '2026-06-11T10:00:00.000Z', end: '2026-06-11T09:00:00.000Z' },
    ]
    const slots = starts(onDay(find({ now: WEDNESDAY_MORNING, busy }), '2026-06-11'))

    expect(slots).toContain('2026-06-11T09:00:00.000Z')
    expect(slots).toHaveLength(TEST_RULES.windows.length * 6)
  })

  it('honours the 24-hour minimum notice', () => {
    // 08:00 Paris on a Wednesday: nothing of that day is at least 24 hours away.
    const slots = find({ now: WEDNESDAY_MORNING })

    expect(onDay(slots, '2026-06-10')).toEqual([])
    expect(onDay(slots, '2026-06-11')).not.toEqual([])
  })

  it('keeps the last 21 days and drops what is beyond', () => {
    const slots = find({ now: WEDNESDAY_MORNING })
    const days = slots.map((slot) => bookingDayKeyOfInstant(slot.start, TEST_RULES))

    expect(days).toContain('2026-07-01')
    expect(days).not.toContain('2026-07-02')
    expect(Math.max(...slots.map((slot) => Date.parse(slot.start)))).toBeLessThanOrEqual(
      Date.parse('2026-07-01T16:30:00.000Z'),
    )
  })

  it('stops offering a day once the maximum of calls is booked', () => {
    const underneath = find({ now: WEDNESDAY_MORNING, bookedCallsPerDay: { '2026-06-11': 2 } })
    const atMaximum = find({ now: WEDNESDAY_MORNING, bookedCallsPerDay: { '2026-06-11': 3 } })
    const aboveMaximum = find({ now: WEDNESDAY_MORNING, bookedCallsPerDay: { '2026-06-11': 4 } })

    expect(onDay(underneath, '2026-06-11')).not.toEqual([])
    expect(onDay(atMaximum, '2026-06-11')).toEqual([])
    expect(onDay(aboveMaximum, '2026-06-11')).toEqual([])
  })

  it('counts a day of the Paris calendar, not a UTC day', () => {
    // 17:00 Paris is 15:00 UTC: the count of that Paris day removes its afternoon.
    const slots = find({ now: WEDNESDAY_MORNING, bookedCallsPerDay: { '2026-06-11': 3 } })

    expect(onDay(slots, '2026-06-11')).toEqual([])
    expect(starts(onDay(slots, '2026-06-12'))).toContain('2026-06-12T15:00:00.000Z')
  })

  it('caps the answer when the caller asks for a bounded list', () => {
    const slots = find({ now: WEDNESDAY_MORNING, limit: 4 })

    expect(slots).toHaveLength(4)
    expect(starts(slots)).toEqual([
      '2026-06-11T07:30:00.000Z',
      '2026-06-11T08:00:00.000Z',
      '2026-06-11T08:30:00.000Z',
      '2026-06-11T09:00:00.000Z',
    ])
  })

  it('offers nothing when the current instant cannot be read', () => {
    expect(find({ now: 'invalid' })).toEqual([])
  })
})

describe('findFreeSlots across the spring daylight saving change', () => {
  /** Wednesday 25 March 2026, 07:00 Paris: the Thursday and the Monday after the change are offered. */
  const BEFORE_SPRING = '2026-03-25T06:00:00.000Z'

  it('keeps 09:30 Paris on both sides of the change', () => {
    const slots = find({ now: BEFORE_SPRING })

    expect(starts(onDay(slots, '2026-03-26'))).toContain('2026-03-26T08:30:00.000Z')
    expect(parisTime('2026-03-26T08:30:00.000Z')).toBe('09:30')
    // 29 March is the change: the offset moves from +01:00 to +02:00, so 09:30 Paris is 07:30 UTC.
    expect(starts(onDay(slots, '2026-03-30'))).toContain('2026-03-30T07:30:00.000Z')
    expect(parisTime('2026-03-30T07:30:00.000Z')).toBe('09:30')
  })

  it('never offers a slot outside the Paris working hours on a change week', () => {
    for (const slot of find({ now: BEFORE_SPRING })) {
      expect(parisTime(slot.start)).toMatch(
        /^(09:30|10:00|10:30|11:00|11:30|14:00|14:30|15:00|15:30|16:00|16:30|17:00)$/,
      )
      expect(TEST_RULES.weekdays).toContain(parisWeekday(slot.start))
    }
  })
})

describe('findFreeSlots across the autumn daylight saving change', () => {
  /** Wednesday 21 October 2026, 08:00 Paris, two days before the change of the 25th. */
  const BEFORE_AUTUMN = '2026-10-21T06:00:00.000Z'

  it('keeps 09:30 Paris on both sides of the change', () => {
    const slots = find({ now: BEFORE_AUTUMN })

    expect(starts(onDay(slots, '2026-10-22'))).toContain('2026-10-22T07:30:00.000Z')
    expect(parisTime('2026-10-22T07:30:00.000Z')).toBe('09:30')
    expect(starts(onDay(slots, '2026-10-26'))).toContain('2026-10-26T08:30:00.000Z')
    expect(parisTime('2026-10-26T08:30:00.000Z')).toBe('09:30')
  })
})

describe('Paris calendar helpers', () => {
  it('reads the Paris day of an instant', () => {
    expect(bookingDayKeyOfInstant('2026-06-10T22:30:00.000Z', TEST_RULES)).toBe('2026-06-11')
    expect(bookingDayKeyOfInstant('2026-06-10T21:30:00.000Z', TEST_RULES)).toBe('2026-06-10')
    expect(bookingDayKeyOfInstant('not-a-date', TEST_RULES)).toBeNull()
  })

  it('reads the Paris day range, 23 and 25 hours long around the changes', () => {
    const spring = bookingDayRangeOfInstant('2026-03-29T12:00:00.000Z', TEST_RULES)
    const autumn = bookingDayRangeOfInstant('2026-10-25T12:00:00.000Z', TEST_RULES)
    const ordinary = bookingDayRangeOfInstant('2026-06-10T12:00:00.000Z', TEST_RULES)

    const hours = (range: { timeMin: string; timeMax: string } | null): number =>
      range === null ? 0 : (Date.parse(range.timeMax) - Date.parse(range.timeMin)) / 3_600_000

    expect(hours(spring)).toBe(23)
    expect(hours(autumn)).toBe(25)
    expect(hours(ordinary)).toBe(24)
    expect(bookingDayRangeOfInstant('not-a-date', TEST_RULES)).toBeNull()
  })

  it('reads the Paris wall clock of an instant, without an offset', () => {
    expect(bookingWallClockOfInstant('2026-01-15T08:30:00.000Z', TEST_RULES)).toBe('2026-01-15T09:30:00')
    expect(bookingWallClockOfInstant('2026-07-15T07:30:00.000Z', TEST_RULES)).toBe('2026-07-15T09:30:00')
    expect(bookingWallClockOfInstant('2026-03-30T07:30:00.000Z', TEST_RULES)).toBe('2026-03-30T09:30:00')
    expect(bookingWallClockOfInstant('2026-10-26T08:30:00.000Z', TEST_RULES)).toBe('2026-10-26T09:30:00')
    expect(bookingWallClockOfInstant('nope', TEST_RULES)).toBeNull()
  })
})

describe('isSlotBookable', () => {
  const input = {
    rules: TEST_RULES,
    busy: [],
    bookedCallsPerDay: {},
    now: new Date(WEDNESDAY_MORNING),
  }

  it('accepts a slot of the answer', () => {
    expect(isSlotBookable(input, { start: '2026-06-11T07:30:00.000Z', end: '2026-06-11T08:00:00.000Z' })).toBe(true)
  })

  it('refuses a slot that is not offered: wrong hour, weekend, notice or horizon', () => {
    expect(isSlotBookable(input, { start: '2026-06-11T07:37:00.000Z', end: '2026-06-11T08:07:00.000Z' })).toBe(false)
    expect(isSlotBookable(input, { start: '2026-06-13T07:30:00.000Z', end: '2026-06-13T08:00:00.000Z' })).toBe(false)
    expect(isSlotBookable(input, { start: '2026-06-10T08:30:00.000Z', end: '2026-06-10T09:00:00.000Z' })).toBe(false)
    expect(isSlotBookable(input, { start: '2026-08-05T07:30:00.000Z', end: '2026-08-05T08:00:00.000Z' })).toBe(false)
  })
})

describe('bookingQueryWindow', () => {
  it('spans from now to the horizon, with the margin of the day edges', () => {
    const window = bookingQueryWindow({ now: new Date(WEDNESDAY_MORNING), rules: { ...TEST_RULES, horizonDays: 21 } })

    expect(window.timeMin).toBe(WEDNESDAY_MORNING)
    expect(window.timeMax).toBe(
      new Date(Date.parse(WEDNESDAY_MORNING) + (BOOKING_CALENDAR_QUERY_MARGIN_DAYS + 21) * 86_400_000).toISOString(),
    )
  })
})

describe('releaseOwnSlot', () => {
  /** The event being managed: 10:00-10:30 Paris on Thursday 11 June 2026. */
  const OWN_START = '2026-06-11T08:00:00.000Z'
  const OWN_END = '2026-06-11T08:30:00.000Z'
  const other = { start: '2026-06-11T09:00:00.000Z', end: '2026-06-11T09:30:00.000Z' }

  const release = (overrides: Partial<Parameters<typeof releaseOwnSlot>[0]> = {}) =>
    releaseOwnSlot({
      busy: [other, { start: OWN_START, end: OWN_END }],
      bookedCallsPerDay: { '2026-06-11': 2 },
      ownStart: OWN_START,
      ownEnd: OWN_END,
      rules: TEST_RULES,
      ...overrides,
    })

  it('removes the interval that exactly matches the event, and one from its own day', () => {
    const released = release()

    expect(released.busy).toEqual([other])
    expect(released.bookedCallsPerDay).toEqual({ '2026-06-11': 1 })
  })

  it('matches on instants, whatever offset the calendar wrote', () => {
    const released = release({
      busy: [{ start: '2026-06-11T10:00:00+02:00', end: '2026-06-11T10:30:00+02:00' }],
    })

    expect(released.busy).toEqual([])
    expect(released.bookedCallsPerDay).toEqual({ '2026-06-11': 1 })
  })

  it('leaves a merged interval busy, and its day counted, which fails safe', () => {
    // Another appointment merged into the event's interval: its bounds are wider than the event's.
    const merged = [{ start: OWN_START, end: '2026-06-11T10:00:00.000Z' }]
    const released = release({ busy: merged })

    expect(released.busy).toEqual(merged)
    expect(released.bookedCallsPerDay).toEqual({ '2026-06-11': 2 })
  })

  it('changes nothing when the interval is absent, the bounds are unreadable or reversed', () => {
    const busy = [other]
    expect(release({ busy }).busy).toEqual(busy)
    expect(release({ busy }).bookedCallsPerDay).toEqual({ '2026-06-11': 2 })
    expect(release({ ownStart: 'not-a-date' }).busy).toHaveLength(2)
    expect(release({ ownEnd: OWN_START }).busy).toHaveLength(2)
  })

  it('never counts a day below zero', () => {
    const released = release({ bookedCallsPerDay: {} })

    expect(released.bookedCallsPerDay).toEqual({ '2026-06-11': 0 })
  })

  it('frees the event slot for its own reschedule without freeing its neighbours', () => {
    const released = release()
    const slots = starts(
      onDay(
        find({
          now: WEDNESDAY_MORNING,
          busy: released.busy,
          bookedCallsPerDay: released.bookedCallsPerDay,
          limit: 60,
        }),
        '2026-06-11',
      ),
    )

    expect(slots).toContain(OWN_START)
    expect(slots).not.toContain('2026-06-11T08:30:00.000Z')
  })
})
