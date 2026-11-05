/*
 * Slot labels, formatted from the slot instants with the platform's own internationalisation. The
 * words a visitor reads on a slot chip or in the chooser are a date and a time, never a concatenated
 * locale string, so no slot label is written by hand.
 */

import type { BookingDayKey, BookingSlot } from './availability'
import type { BookingRules } from './rules'

/** BCP 47 tag of the labels. The site ships French only; the tag moves with the locale folder. */
export const BOOKING_LOCALE_TAG = 'fr-FR'

/** Formatters, memoised per tag, time zone and shape: building one is the costly part. */
const labelFormatters = new Map<string, Intl.DateTimeFormat>()

const formatterFor = (
  localeTag: string,
  timeZone: string,
  shape: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const cacheKey = `${localeTag}|${timeZone}|${shape}`
  const cached = labelFormatters.get(cacheKey)
  if (cached !== undefined) return cached

  const created = new Intl.DateTimeFormat(localeTag, { timeZone, ...options })
  labelFormatters.set(cacheKey, created)
  return created
}

/**
 * Reads one slot label, in the rules' time zone.
 *
 * The slot is an instant; the label renders it in the studio's time zone with the visitor's
 * platform formatting, e.g. « mardi 3 novembre à 09:30 ». An unreadable instant returns an empty
 * string, which the flow treats as a slot it must not offer.
 *
 * @param slot Slot to label.
 * @param rules Rules holding the time zone.
 * @returns The label, or an empty string when the instant cannot be read.
 */
export const formatSlotLabel = (slot: BookingSlot, rules: BookingRules): string => {
  const instant = new Date(slot.start)
  if (Number.isNaN(instant.getTime())) return ''

  return formatterFor(BOOKING_LOCALE_TAG, rules.timeZone, 'slot', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant)
}

/**
 * Reads the Paris time of one slot, as the chooser writes it: `09:30`.
 *
 * @param instant Slot start as an ISO 8601 instant.
 * @param rules Rules holding the time zone.
 * @returns The label, or an empty string when the instant cannot be read.
 */
export const formatBookingTimeLabel = (instant: string, rules: BookingRules): string => {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ''

  return formatterFor(BOOKING_LOCALE_TAG, rules.timeZone, 'time', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

/**
 * Long date of one instant, as the booking emails write it: « jeudi 12 novembre 2026 ».
 *
 * @param instant Slot start as an ISO 8601 instant.
 * @param rules Rules holding the time zone.
 * @returns The label, or an empty string when the instant cannot be read.
 */
export const formatBookingDateLabel = (instant: string, rules: BookingRules): string => {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ''

  return formatterFor(BOOKING_LOCALE_TAG, rules.timeZone, 'date', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** One day of the chooser: its key and the three parts of its compact label. */
export type BookingDayLabel = {
  /** Day the label belongs to, as `YYYY-MM-DD`. */
  readonly key: BookingDayKey
  /** Short weekday, without its trailing dot, e.g. « jeu ». */
  readonly weekday: string
  /** Day of the month, e.g. « 11 ». */
  readonly day: string
  /** Short month, without its trailing dot, e.g. « juin ». */
  readonly month: string
}

/** Calendar parts of a day key, or `null` when it is not one. */
const dayPartsOf = (
  dayKey: BookingDayKey,
): { readonly year: number; readonly month: number; readonly day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (match === null) return null

  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

/**
 * Compact label of one chooser day: short weekday, day of the month and short month.
 *
 * The day key is read at noon UTC, which belongs to the same Paris day whatever the offset does.
 *
 * @param dayKey Day of the slots, as `YYYY-MM-DD`.
 * @param rules Rules holding the time zone.
 * @returns The three label parts, or `null` when the key cannot be read.
 */
export const formatBookingDayLabel = (dayKey: BookingDayKey, rules: BookingRules): BookingDayLabel | null => {
  const parts = dayPartsOf(dayKey)
  if (parts === null) return null

  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12))
  const formatter = formatterFor(BOOKING_LOCALE_TAG, rules.timeZone, 'day', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const read = (type: 'weekday' | 'day' | 'month'): string =>
    formatter
      .formatToParts(day)
      .find((part) => part.type === type)
      ?.value.replace(/\.$/, '') ?? ''
  const weekday = read('weekday')
  const dayOfMonth = read('day')
  const month = read('month')
  if (weekday === '' || dayOfMonth === '' || month === '') return null

  return { key: dayKey, weekday, day: dayOfMonth, month }
}

/**
 * Long label of one chooser day, for the « Heure · {day} » heading: « jeudi 11 juin ».
 *
 * @param dayKey Day of the slots, as `YYYY-MM-DD`.
 * @param rules Rules holding the time zone.
 * @returns The label, or an empty string when the key cannot be read.
 */
export const formatBookingDayLongLabel = (dayKey: BookingDayKey, rules: BookingRules): string => {
  const parts = dayPartsOf(dayKey)
  if (parts === null) return ''

  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12))
  return formatterFor(BOOKING_LOCALE_TAG, rules.timeZone, 'day-long', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(day)
}
