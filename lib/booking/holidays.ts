/*
 * French national public holidays, computed for any Gregorian year.
 *
 * The eleven days are fixed dates and movable days anchored on Easter Sunday: the Easter Monday, the
 * Ascension and the Whit Monday. Easter Sunday comes from the Gregorian computus (the anonymous /
 * Meeus algorithm), so no list of years is kept and no dependency or network call is involved.
 */

/** One calendar day, without a time of day. */
export type PublicHolidayDay = {
  /** Gregorian year. */
  readonly year: number
  /** Month of the year, 1 for January. */
  readonly month: number
  /** Day of the month. */
  readonly day: number
}

/** Fixed-date holidays, as month and day, in calendar order. */
const FIXED_HOLIDAYS: readonly { readonly month: number; readonly day: number }[] = [
  { month: 1, day: 1 },
  { month: 5, day: 1 },
  { month: 5, day: 8 },
  { month: 7, day: 14 },
  { month: 8, day: 15 },
  { month: 11, day: 1 },
  { month: 11, day: 11 },
  { month: 12, day: 25 },
]

/**
 * Easter Sunday of one Gregorian year, from the anonymous / Meeus computus.
 *
 * @param year Gregorian year.
 * @returns Easter Sunday as a calendar day.
 */
const easterSundayOf = (year: number): PublicHolidayDay => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return { year, month, day }
}

/** Shifts one calendar day by a whole number of days, without leaving the calendar. */
const dayAfter = (day: PublicHolidayDay, days: number): PublicHolidayDay => {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day + days))
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }
}

/**
 * The distinct days of the eleven French national public holidays of one Gregorian year, in
 * calendar order.
 *
 * They are the 1st of January, Easter Monday, the 1st and the 8th of May, the Ascension, the Whit
 * Monday, the 14th of July, the 15th of August, the 1st and the 11th of November and the 25th of
 * December. Two of them can fall on the same day, as the Ascension does when it lands on the 1st of
 * May: the answer then holds that day once, which is why it can hold fewer than eleven days. A year
 * that is not a positive integer answers an empty list.
 *
 * @param year Gregorian year the holidays are computed for.
 * @returns The distinct holiday days of that year, January first.
 */
export const frenchPublicHolidays = (year: number): readonly PublicHolidayDay[] => {
  if (!Number.isInteger(year) || year < 1) return []

  const easter = easterSundayOf(year)
  const fixed = FIXED_HOLIDAYS.map(({ month, day }) => ({ year, month, day }))
  const holidays = [...fixed, dayAfter(easter, 1), dayAfter(easter, 39), dayAfter(easter, 50)]

  const distinctDays = new Map<string, PublicHolidayDay>()
  for (const holiday of holidays) distinctDays.set(`${holiday.month}-${holiday.day}`, holiday)

  return [...distinctDays.values()].sort((left, right) => left.month - right.month || left.day - right.day)
}

/**
 * True when a `YYYY-MM-DD` day key names a French national public holiday of its year.
 *
 * The day is compared to the computed holidays of its own year, so a movable day such as Easter
 * Monday is recognised without any stored table. A key that is not a calendar day is not a holiday.
 *
 * @param dayKey Calendar day, as `YYYY-MM-DD`.
 * @returns True when that day is one of the French national public holidays of its year.
 */
export const isFrenchPublicHoliday = (dayKey: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (match === null) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  return frenchPublicHolidays(year).some((holiday) => holiday.month === month && holiday.day === day)
}
