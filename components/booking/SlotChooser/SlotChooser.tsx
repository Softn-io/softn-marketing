'use client'

import { useEffect, useRef } from 'react'
import type { FocusEvent } from 'react'
import type { BookingSlot } from '@/lib/booking/availability'
import type { BookingDayGroup } from '@/lib/booking/days'
import { formatBookingTimeLabel } from '@/lib/booking/labels'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { prefersReducedMotion } from '@/lib/motion'
import styles from './SlotChooser.module.css'

/** Props of {@link SlotChooser}. */
export type SlotChooserProps = {
  /** Days holding at least one free slot, oldest first. */
  days: readonly BookingDayGroup[]
  /** Key of the day whose times are shown, or `null` when no day is picked. */
  pickedDayKey: string | null
  /** Start of the picked slot, or `null` when no time is picked. */
  pickedSlotStart: string | null
  /** Visible label above the day row. */
  dayLabel: string
  /** Visible label above the times, its `{day}` already filled with the picked day's long label. */
  timeLabel: string
  /** Accessible name of the day group. */
  dayGroupLabel: string
  /** Accessible name of the time group, its `{day}` already filled with the picked day's long label. */
  timeGroupLabel: string
  /** Note under the times. */
  timezoneNote: string
  /**
   * True when the caller wants the chooser to carry the booking flow's step-control anchor: the
   * picked day button then holds `data-booking-focus`, so the flow focuses it when the step opens
   * and keeps it, with the times below it, inside the viewport. Off by default, and the manage page
   * never turns it on.
   */
  focusAnchor?: boolean | undefined
  /** Called with the key of the day the visitor picks. */
  onPickDay: (dayKey: string) => void
  /** Called with the slot the visitor picks. */
  onPickTime: (slot: BookingSlot) => void
}

/** Reads a computed length in pixels; anything unreadable (`auto`, an empty value) counts as none. */
const lengthInPixels = (value: string): number => {
  const amount = Number.parseFloat(value)
  return Number.isFinite(amount) ? amount : 0
}

/**
 * Brings one day card fully inside the row's usable strip.
 *
 * The strip is the row's own box inset by its scroll padding, the room the stylesheet reserves for a
 * card's focus ring: a card scrolled to either edge therefore keeps its ring inside the scroll box.
 * Nothing moves when the card already sits inside the strip.
 *
 * @param row The day row's scroll box.
 * @param card The day card to bring into the strip.
 * @param animated True to animate the move. The focus move never animates: it jumps the way the
 * platform's own focus reveal does, so the card is in place as soon as it takes focus, and the
 * reduced-motion preference always wins.
 */
const revealCard = (row: HTMLElement, card: HTMLElement, animated: boolean): void => {
  const style = getComputedStyle(row)
  const rowBox = row.getBoundingClientRect()
  const cardBox = card.getBoundingClientRect()
  const usableLeft = rowBox.left + lengthInPixels(style.scrollPaddingInlineStart)
  const usableRight = rowBox.right - lengthInPixels(style.scrollPaddingInlineEnd)
  const overflowLeft = cardBox.left - usableLeft
  const overflowRight = cardBox.right - usableRight
  if (overflowLeft >= 0 && overflowRight <= 0) return

  row.scrollTo({
    left: row.scrollLeft + (overflowLeft < 0 ? overflowLeft : overflowRight),
    behavior: animated && !prefersReducedMotion() ? 'smooth' : 'auto',
  })
}

/**
 * Day-then-time slot chooser, shared by the chat reservation flow and the manage page.
 *
 * Controlled and presentational: the grouped days, both picks and every string come from the caller,
 * so each section keeps its own copy and both flows show the same control. The day row scrolls
 * sideways, and any day card that takes focus, or that a pick selects, is brought fully inside it —
 * with a jump, not a scroll, when the visitor asked for less motion. Every day button is named by
 * the text it shows, and the time buttons expose their slot start to the end to end tests through
 * `data-booking-slot`.
 */
export const SlotChooser = ({
  days,
  pickedDayKey,
  pickedSlotStart,
  dayLabel,
  timeLabel,
  dayGroupLabel,
  timeGroupLabel,
  timezoneNote,
  focusAnchor,
  onPickDay,
  onPickTime,
}: SlotChooserProps) => {
  const dayRow = useRef<HTMLDivElement | null>(null)

  // A day card that takes focus is brought fully inside the row: the row scrolls sideways, and the
  // browser's own reveal leaves a partly visible card where it is, ring clipped by the edge. The
  // move jumps rather than glides, so the card is in place the moment it takes focus; the move a
  // pick selects (below) keeps its animation.
  const onDayFocus = (event: FocusEvent<HTMLButtonElement>): void => {
    const row = dayRow.current
    if (row === null) return
    revealCard(row, event.currentTarget, false)
  }

  // The row only moves when the picked day sits outside it: the visitor who just clicked a visible
  // day, or the day the flow preselected at the start of the strip, leaves it where it is.
  useEffect(() => {
    const row = dayRow.current
    if (row === null) return

    const picked = row.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (picked === null) return

    revealCard(row, picked, true)
  }, [pickedDayKey])

  const pickedDay = days.find((day) => day.key === pickedDayKey) ?? null

  return (
    <div className={styles.chooser}>
      <div className={styles.block}>
        <p className={styles.label}>{dayLabel}</p>
        <div ref={dayRow} className={styles.days} role="group" aria-label={dayGroupLabel}>
          {days.map((day) => (
            <button
              key={day.key}
              type="button"
              className={`${styles.day} ${day.key === pickedDayKey ? styles['day-picked'] : ''}`}
              aria-pressed={day.key === pickedDayKey}
              {...(focusAnchor === true && day.key === pickedDayKey ? { 'data-booking-focus': true } : {})}
              onFocus={onDayFocus}
              onClick={() => onPickDay(day.key)}
            >
              <span className={`${styles.dayWeekday} text-caption uppercase`}>{day.label.weekday}</span>
              <span className={`${styles.dayNumber} font-display`}>{day.label.day}</span>
              <span className={`${styles.dayMonth} text-caption`}>{day.label.month}</span>
            </button>
          ))}
        </div>
      </div>

      {pickedDay === null ? null : (
        <div className={styles.block}>
          <p className={styles.label}>{timeLabel}</p>
          <div className={styles.times} role="group" aria-label={timeGroupLabel}>
            {pickedDay.slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                className={`${styles.time} ${slot.start === pickedSlotStart ? styles['time-picked'] : ''}`}
                aria-pressed={slot.start === pickedSlotStart}
                data-booking-slot={slot.start}
                onClick={() => onPickTime(slot)}
              >
                {formatBookingTimeLabel(slot.start, BOOKING_RULES)}
              </button>
            ))}
          </div>
          <p className={`${styles.timezoneNote} text-body-sm text-foreground-tertiary`}>{timezoneNote}</p>
        </div>
      )}
    </div>
  )
}
