/*
 * Slot labels, formatted from the slot instants with the platform's own internationalisation. The
 * words a visitor reads on a slot chip are a date and a time, never a concatenated locale string, so
 * no slot label is written by hand.
 */

import type { BookingSlot } from './availability'
import type { BookingRules } from './rules'

/** BCP 47 tag of the labels. The site ships French only; the tag moves with the locale folder. */
export const BOOKING_LOCALE_TAG = 'fr-FR'

/** Formatters, memoised per tag and time zone: building one is the costly part. */
const slotFormatters = new Map<string, Intl.DateTimeFormat>()

const slotFormatter = (localeTag: string, timeZone: string): Intl.DateTimeFormat => {
  const cacheKey = `${localeTag}|${timeZone}`
  const cached = slotFormatters.get(cacheKey)
  if (cached !== undefined) return cached

  const created = new Intl.DateTimeFormat(localeTag, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
  slotFormatters.set(cacheKey, created)
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

  return slotFormatter(BOOKING_LOCALE_TAG, rules.timeZone).format(instant)
}
