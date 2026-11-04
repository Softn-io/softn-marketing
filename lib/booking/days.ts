/*
 * Day grouping of the slot chooser: the free slots of one answer, folded into the days the studio
 * works in.
 *
 * A slot is an instant, and the day a visitor reads is the Paris day that instant belongs to: the
 * key and the label both come from the rules' time zone, never from the browser's.
 */

import { bookingDayKeyOfInstant, type BookingDayKey, type BookingSlot } from './availability'
import { formatBookingDayLabel, type BookingDayLabel } from './labels'
import type { BookingRules } from './rules'

/** One day of the slot chooser: its key, the parts of its compact label and its free slots. */
export type BookingDayGroup = {
  /** Day the slots belong to, as `YYYY-MM-DD` in the rules' time zone. */
  readonly key: BookingDayKey
  /** Short weekday, day of the month and short month, as the chooser draws them. */
  readonly label: BookingDayLabel
  /** Free slots of that day, in the order they arrived (oldest first). */
  readonly slots: readonly BookingSlot[]
}

/**
 * Groups the free slots by day, oldest day first.
 *
 * Each slot joins the group of its Paris day; a slot whose day cannot be read is dropped, and so is
 * a day whose label cannot be built, so the chooser never offers a slot under a wrong day. A day
 * that receives no slot is absent, and the groups keep the order the days first appear in.
 *
 * @param slots Free slots, oldest first.
 * @param rules Rules holding the time zone the days are read in.
 * @returns One group per day holding at least one slot.
 */
export const groupSlotsByDay = (slots: readonly BookingSlot[], rules: BookingRules): readonly BookingDayGroup[] => {
  const grouped = new Map<BookingDayKey, BookingSlot[]>()

  for (const slot of slots) {
    const key = bookingDayKeyOfInstant(slot.start, rules)
    if (key === null) continue

    const daySlots = grouped.get(key)
    if (daySlots === undefined) grouped.set(key, [slot])
    else daySlots.push(slot)
  }

  return [...grouped.entries()].flatMap(([key, daySlots]) => {
    const label = formatBookingDayLabel(key, rules)
    return label === null ? [] : [{ key, label, slots: daySlots }]
  })
}
