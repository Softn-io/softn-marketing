/*
 * Slot computation: the pure heart of the booking. It takes the rules, the calendar's busy
 * intervals and the calls already booked, and returns the instants a visitor may pick.
 *
 * Two invariants matter here. Working hours are Paris wall-clock times, so every slot is built from
 * the local time and then resolved to an instant: the same 09:30 stays 09:30 across both daylight
 * saving changes. Busy intervals never change the rules, they only remove slots, and the personal
 * ones are limited to the days the rules make bookable.
 */

import { isFrenchPublicHoliday } from './holidays'
import type { BookingRules } from './rules'

/** One busy interval reported by a calendar, as ISO 8601 instants. */
export type BusyInterval = {
  /** Start of the interval, included. */
  readonly start: string
  /** End of the interval, excluded. */
  readonly end: string
  /**
   * True when the interval comes from the personal calendar.
   *
   * Such an interval only removes slots of the days the rules make bookable. Absent, the interval
   * comes from the booking or the owner calendar and applies on every day.
   */
  readonly personal?: true
}

/** One bookable slot, as ISO 8601 instants in UTC. */
export type BookingSlot = {
  /** Start of the call, included. */
  readonly start: string
  /** End of the call, excluded. */
  readonly end: string
}

/** One calendar day in the rules' time zone, as `YYYY-MM-DD`. */
export type BookingDayKey = string

/** Arguments of {@link findFreeSlots}. */
export type FindFreeSlotsInput = {
  /** Working hours, call length, notice, horizon and daily maximum. */
  rules: BookingRules
  /**
   * Intervals already taken in the calendars, before the buffer is applied. A personal interval
   * only counts on the days the rules make bookable.
   */
  busy: readonly BusyInterval[]
  /**
   * Calls already booked per day, keyed by {@link BookingDayKey}. A day at `rules.maxCallsPerDay`
   * stops being offered; a missing key counts as zero.
   */
  bookedCallsPerDay: Readonly<Record<BookingDayKey, number>>
  /** Instant the availability is computed for: notice and horizon are measured from it. */
  now: Date
  /** Upper bound on the returned slots, oldest first. Omitted when the caller wants them all. */
  limit?: number
}

/** Wall-clock reading of one instant, in the rules' time zone. */
type WallClock = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** One calendar day, without a time of day. */
type CalendarDay = {
  year: number
  month: number
  day: number
}

const MILLISECONDS_PER_MINUTE = 60_000
const MILLISECONDS_PER_HOUR = 3_600_000
const MILLISECONDS_PER_DAY = 86_400_000
const MINUTES_PER_HOUR = 60
/** ISO weekday of Sunday, the last day of the week. */
const SUNDAY = 7

/** Formatters are memoised per time zone: building one is the costly part, formatting is not. */
const wallClockFormatters = new Map<string, Intl.DateTimeFormat>()

const wallClockFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = wallClockFormatters.get(timeZone)
  if (cached !== undefined) return cached

  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  wallClockFormatters.set(timeZone, created)
  return created
}

/** Reads a wall-clock time of one instant; a missing part reads as `NaN`. */
const readWallClock = (formatter: Intl.DateTimeFormat, instantMs: number): WallClock => {
  const parts = formatter.formatToParts(new Date(instantMs))
  const read = (type: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'): number => {
    const value = parts.find((part) => part.type === type)?.value
    return value === undefined ? Number.NaN : Number(value)
  }

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

/**
 * Offset of the time zone at one instant, in milliseconds.
 *
 * The offset is read from the zone itself rather than kept in a table, so a daylight saving change
 * is followed without any date library.
 */
const zoneOffsetMs = (formatter: Intl.DateTimeFormat, instantMs: number): number => {
  const wall = readWallClock(formatter, instantMs)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  // Whole seconds only: the wall-clock reading has no millisecond, so comparing it to a fractional
  // instant would add that fraction to the offset.
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * Resolves a wall-clock reading of the rules' time zone back to an instant.
 *
 * Two passes are enough: the first guesses the instant with the offset of the reading taken as UTC,
 * the second re-reads the offset at that guess. Across a daylight saving change the second pass
 * lands on the side the offset already points to, which is what makes a working hour keep its local
 * time.
 *
 * @returns The instant in milliseconds, or `null` when the zone gave no readable wall clock.
 */
const instantOfWallClock = (formatter: Intl.DateTimeFormat, wall: WallClock): number | null => {
  const naiveUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second, 0)
  if (!Number.isFinite(naiveUtc)) return null

  let guess = naiveUtc - zoneOffsetMs(formatter, naiveUtc)
  guess = naiveUtc - zoneOffsetMs(formatter, guess)
  return Number.isFinite(guess) ? guess : null
}

/** Calendar day of an instant in the rules' time zone, or `null` when the zone gave no readable day. */
const dayOf = (formatter: Intl.DateTimeFormat, instantMs: number): CalendarDay | null => {
  const wall = readWallClock(formatter, instantMs)
  const day = { year: wall.year, month: wall.month, day: wall.day }
  return Number.isFinite(day.year) && Number.isFinite(day.month) && Number.isFinite(day.day) ? day : null
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** `YYYY-MM-DD` key of a calendar day. */
const dayKeyOf = (day: CalendarDay): BookingDayKey => `${day.year}-${pad(day.month)}-${pad(day.day)}`

/** Shifts a calendar day by a whole number of days, without leaving the calendar. */
const addDays = (day: CalendarDay, days: number): CalendarDay => {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day + days))
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }
}

/** ISO weekday of a calendar day: Monday is 1, Sunday is 7. */
const isoWeekdayOf = (day: CalendarDay): number => {
  const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
  return weekday === 0 ? SUNDAY : weekday
}

/** Minutes since midnight of a `HH:MM` time, or `null` when the value is not one. */
const minutesOfTime = (time: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (match === null) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * MINUTES_PER_HOUR + minutes
}

/** Reads one instant from an ISO string, or `null` when it is not a usable one. */
const instantOfIso = (value: string): number | null => {
  const instant = Date.parse(value)
  return Number.isFinite(instant) ? instant : null
}

/**
 * Busy intervals widened by the buffer, so a call never starts or ends flush against another one.
 *
 * @param busy Intervals reported by the calendar.
 * @param bufferMinutes Minutes kept free before and after each interval.
 * @returns Intervals in milliseconds, unreadable ones dropped.
 */
const withBuffer = (
  busy: readonly BusyInterval[],
  bufferMinutes: number,
): readonly { readonly start: number; readonly end: number }[] => {
  const bufferMs = bufferMinutes * MILLISECONDS_PER_MINUTE

  return busy.reduce<{ start: number; end: number }[]>((intervals, interval) => {
    const start = instantOfIso(interval.start)
    const end = instantOfIso(interval.end)
    if (start === null || end === null || end <= start) return intervals

    intervals.push({ start: start - bufferMs, end: end + bufferMs })
    return intervals
  }, [])
}

/** True when a slot overlaps an interval: touching edges do not overlap. */
const overlaps = (slotStart: number, slotEnd: number, interval: { start: number; end: number }): boolean =>
  slotStart < interval.end && slotEnd > interval.start

/**
 * True when one personal interval touches at least one day the rules make bookable.
 *
 * The days are read in the rules' time zone. An interval that crosses midnight from a day off into
 * a working day stays whole, so its working-day part keeps blocking; a day the rules do not offer
 * has no slot to protect, which is why an interval entirely on such a day is dropped. An interval
 * whose bounds or days cannot be read is kept: an unreadable calendar must never free a slot.
 *
 * @param interval Interval reported by the personal calendar.
 * @param rules Rules holding the time zone and the bookable weekdays.
 * @param formatter Wall-clock formatter of the rules' time zone.
 * @returns True when the interval removes slots of at least one bookable day, or when it cannot be read.
 */
const touchesBookingWeekday = (
  interval: BusyInterval,
  rules: BookingRules,
  formatter: Intl.DateTimeFormat,
): boolean => {
  const start = instantOfIso(interval.start)
  const end = instantOfIso(interval.end)
  if (start === null || end === null || end <= start) return true

  const firstDay = dayOf(formatter, start)
  if (firstDay === null) return true

  const dayCount = Math.ceil((end - start) / MILLISECONDS_PER_DAY) + 1
  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = addDays(firstDay, offset)
    const dayStart = instantOfWallClock(formatter, { ...day, hour: 0, minute: 0, second: 0 })
    if (dayStart === null) return true
    if (dayStart >= end) return false
    if (rules.weekdays.includes(isoWeekdayOf(day))) return true
  }

  return true
}

/**
 * Free slots of the booking window, oldest first.
 *
 * A slot is free when it fits entirely inside a working window of a working weekday that is not a
 * French public holiday when the rules exclude them, starts at least `rules.minimumNoticeHours`
 * after `now`, stays inside the `rules.horizonDays` horizon, is clear of every buffered busy
 * interval, and the day is below `rules.maxCallsPerDay` calls. A personal busy interval only counts
 * on the days the rules make bookable. Slots are generated from Paris wall-clock times, so both
 * daylight saving changes keep the published hours.
 *
 * The function is pure and never throws: it is the only place that decides what a visitor may pick,
 * and the booking route re-runs it before writing anything.
 *
 * @param input Rules, busy intervals, per-day call counts, current instant and optional cap.
 * @returns Bookable slots as ISO 8601 instants, oldest first.
 */
export const findFreeSlots = ({
  rules,
  busy,
  bookedCallsPerDay,
  now,
  limit,
}: FindFreeSlotsInput): readonly BookingSlot[] => {
  const formatter = wallClockFormatter(rules.timeZone)
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) return []

  const noticeMs = nowMs + rules.minimumNoticeHours * MILLISECONDS_PER_HOUR
  const applicableBusy = busy.filter(
    (interval) => interval.personal !== true || touchesBookingWeekday(interval, rules, formatter),
  )
  const blocked = withBuffer(applicableBusy, rules.bufferMinutes)
  const firstDay = dayOf(formatter, nowMs)
  if (firstDay === null) return []

  const slotMs = rules.slotMinutes * MILLISECONDS_PER_MINUTE
  const slots: BookingSlot[] = []

  for (let offset = 0; offset <= rules.horizonDays; offset += 1) {
    if (limit !== undefined && slots.length >= limit) break

    const day = addDays(firstDay, offset)
    if (!rules.weekdays.includes(isoWeekdayOf(day))) continue

    const dayKey = dayKeyOf(day)
    if (rules.excludePublicHolidays && isFrenchPublicHoliday(dayKey)) continue
    if ((bookedCallsPerDay[dayKey] ?? 0) >= rules.maxCallsPerDay) continue

    for (const window of rules.windows) {
      const windowStartMinutes = minutesOfTime(window.start)
      const windowEndMinutes = minutesOfTime(window.end)
      if (windowStartMinutes === null || windowEndMinutes === null) continue

      const stepCount = Math.floor((windowEndMinutes - windowStartMinutes) / rules.slotMinutes)
      for (let step = 0; step < stepCount; step += 1) {
        const startMinutes = windowStartMinutes + step * rules.slotMinutes
        const start = instantOfWallClock(formatter, {
          ...day,
          hour: Math.floor(startMinutes / MINUTES_PER_HOUR),
          minute: startMinutes % MINUTES_PER_HOUR,
          second: 0,
        })
        const end = instantOfWallClock(formatter, {
          ...day,
          hour: Math.floor((startMinutes + rules.slotMinutes) / MINUTES_PER_HOUR),
          minute: (startMinutes + rules.slotMinutes) % MINUTES_PER_HOUR,
          second: 0,
        })
        if (start === null || end === null || end - start !== slotMs) continue
        if (start < noticeMs) continue
        if (blocked.some((interval) => overlaps(start, end, interval))) continue

        slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() })
        if (limit !== undefined && slots.length >= limit) break
      }

      if (limit !== undefined && slots.length >= limit) break
    }
  }

  return slots
}

/**
 * True when one slot is currently offered by {@link findFreeSlots}.
 *
 * Used to re-check a slot just before booking: the availability the visitor saw may be seconds old,
 * and two visitors may have confirmed the same slot in the meantime.
 *
 * @param input Same rules and calendar data as {@link findFreeSlots}.
 * @param slot The slot the visitor confirmed.
 * @returns True when the slot is still bookable.
 */
export const isSlotBookable = (input: FindFreeSlotsInput, slot: BookingSlot): boolean =>
  findFreeSlots(input).some((free) => free.start === slot.start)

/**
 * Calendar day key of one instant, in the rules' time zone.
 *
 * The Google client groups the calls it counts by this key, so the daily maximum is applied to the
 * days the studio works in, not to UTC days.
 *
 * @param instant Instant as an ISO 8601 string.
 * @param rules Rules holding the time zone.
 * @returns The `YYYY-MM-DD` day of that instant, or `null` when it cannot be read.
 */
export const bookingDayKeyOfInstant = (instant: string, rules: BookingRules): BookingDayKey | null => {
  const instantMs = instantOfIso(instant)
  if (instantMs === null) return null

  const day = dayOf(wallClockFormatter(rules.timeZone), instantMs)
  return day === null ? null : dayKeyOf(day)
}

/**
 * Wall-clock time of one instant, in the rules' time zone, without any offset.
 *
 * Written into a calendar event as `dateTime` beside the rules' `timeZone`: an event anchored on a
 * wall-clock time stays on 09:30 for the studio whatever the offset does, and the invitation renders
 * it in the guest's own time zone.
 *
 * @param instant Instant as an ISO 8601 string.
 * @param rules Rules holding the time zone.
 * @returns The local date-time (`YYYY-MM-DDTHH:MM:SS`), or `null` when it cannot be read.
 */
export const bookingWallClockOfInstant = (instant: string, rules: BookingRules): string | null => {
  const instantMs = instantOfIso(instant)
  if (instantMs === null) return null

  const wall = readWallClock(wallClockFormatter(rules.timeZone), instantMs)
  const readable = Object.values(wall).every((part) => Number.isFinite(part))
  if (!readable) return null

  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`
}

/**
 * Calendar day of one instant, as the instant range of that whole day.
 *
 * The re-check queries the calendar for one day only; the day is read in the rules' time zone, so
 * the range is 23, 24 or 25 hours long around a daylight saving change and never cuts a working day.
 *
 * @param instant Instant inside the day, as an ISO 8601 string.
 * @param rules Rules holding the time zone.
 * @returns Inclusive start and exclusive end of the day, or `null` when the day cannot be read.
 */
export const bookingDayRangeOfInstant = (
  instant: string,
  rules: BookingRules,
): { readonly timeMin: string; readonly timeMax: string } | null => {
  const dayKey = bookingDayKeyOfInstant(instant, rules)
  if (dayKey === null) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (match === null) return null

  const day: CalendarDay = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  const formatter = wallClockFormatter(rules.timeZone)
  const start = instantOfWallClock(formatter, { ...day, hour: 0, minute: 0, second: 0 })
  const next = addDays(day, 1)
  const end = instantOfWallClock(formatter, { ...next, hour: 0, minute: 0, second: 0 })
  if (start === null || end === null || end <= start) return null

  return { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() }
}

/**
 * Days added after the horizon when the calendar is queried: the query works on instants while the
 * horizon is counted in Paris days, and a daylight saving change makes one of them longer.
 */
export const BOOKING_CALENDAR_QUERY_MARGIN_DAYS = 2

/** Arguments of {@link bookingQueryWindow}. */
export type BookingQueryWindowInput = {
  /** Instant the availability is computed for. */
  now: Date
  /** Rules holding the horizon. */
  rules: BookingRules
}

/**
 * Window a full availability query spans: from now to the end of the horizon, margin included.
 *
 * Shared by the slots answer and the reschedule chooser, so a visitor is offered the same horizon
 * whichever page they come from.
 *
 * @param input Current instant and rules.
 * @returns Inclusive start and exclusive end of the queried window, as ISO 8601 instants.
 */
export const bookingQueryWindow = ({ now, rules }: BookingQueryWindowInput): { timeMin: string; timeMax: string } => ({
  timeMin: now.toISOString(),
  timeMax: new Date(
    now.getTime() + (rules.horizonDays + BOOKING_CALENDAR_QUERY_MARGIN_DAYS) * MILLISECONDS_PER_DAY,
  ).toISOString(),
})

/** Busy intervals and per-day counts once the managed event's own slot is released. */
export type ReleasedOwnSlot = {
  /** Busy intervals with the event's own interval removed, or the same list when it cannot be. */
  readonly busy: readonly BusyInterval[]
  /** Per-day counts with one call removed from the event's own day, or the same counts. */
  readonly bookedCallsPerDay: Readonly<Record<BookingDayKey, number>>
}

/** Arguments of {@link releaseOwnSlot}. */
export type ReleaseOwnSlotInput = {
  /** Intervals already taken in the owner's calendar, before the buffer is applied. */
  busy: readonly BusyInterval[]
  /** Calls already booked per day, keyed by {@link BookingDayKey}. */
  bookedCallsPerDay: Readonly<Record<BookingDayKey, number>>
  /** Current start of the event being managed, as an ISO 8601 instant. */
  ownStart: string
  /** Current end of the event being managed, as an ISO 8601 instant. */
  ownEnd: string
  /** Rules holding the time zone the day is read in. */
  rules: BookingRules
}

/**
 * Releases the managed event's own slot, so it neither blocks its neighbours nor counts against the
 * daily cap of its own day.
 *
 * Only the busy interval that exactly matches the event's current start and end is removed: an
 * interval the calendar merged with another appointment carries wider bounds, so it stays busy and
 * the day keeps its count, which fails towards refusing a slot rather than overbooking. The
 * comparison is made on instants, so an offset written differently by the calendar matches all the
 * same.
 *
 * @param input Busy intervals, counts, the event's own interval and the rules.
 * @returns The intervals and counts without the event's own slot, or the inputs unchanged.
 */
export const releaseOwnSlot = ({
  busy,
  bookedCallsPerDay,
  ownStart,
  ownEnd,
  rules,
}: ReleaseOwnSlotInput): ReleasedOwnSlot => {
  const startMs = instantOfIso(ownStart)
  const endMs = instantOfIso(ownEnd)
  if (startMs === null || endMs === null || endMs <= startMs) return { busy, bookedCallsPerDay }

  const index = busy.findIndex(
    (interval) => instantOfIso(interval.start) === startMs && instantOfIso(interval.end) === endMs,
  )
  if (index === -1) return { busy, bookedCallsPerDay }

  const dayKey = bookingDayKeyOfInstant(ownStart, rules)
  if (dayKey === null) return { busy, bookedCallsPerDay }

  const remaining = (bookedCallsPerDay[dayKey] ?? 0) - 1

  return {
    busy: busy.filter((_interval, position) => position !== index),
    bookedCallsPerDay: { ...bookedCallsPerDay, [dayKey]: remaining < 0 ? 0 : remaining },
  }
}
