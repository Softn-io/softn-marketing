'use client'

import type { BookingSlot } from '@/lib/booking/availability'
import { chatbot } from '@/locales/fr/chatbot'
import { AgentMessageText } from './AgentMessageText'
import type { BookingFlowError } from './hooks/useBookingFlow'
import styles from './styles/Booking.module.css'

/** Props of {@link BookingSlots}. */
export type BookingSlotsProps = {
  /** Free slots known to the flow, oldest first. */
  slots: readonly BookingSlot[]
  /** One label per slot, indexed like {@link slots}. */
  slotLabels: readonly string[]
  /** How many slots to show at once. */
  visibleSlots: number
  /** True while the availability is being read. */
  loading: boolean
  /** Failure to show, or `null`. */
  error: BookingFlowError | null
  /** Called with the slot the visitor picked. */
  onChoose: (slot: BookingSlot) => void
  /** Called to show the next page of slots. */
  onShowMore: () => void
  /** Called to ask for the availability again. */
  onRetry: () => void
}

/**
 * Slot step: the free slots as chips, three to five at a time, with a way to see others.
 *
 * The list is named by the locale and holds no availability detail beyond the slot times: which
 * intervals are busy, and why, stays on the server. Failures read as the two locale sentences the
 * proposal defines, and an empty horizon is a state of its own, not an error.
 */
export const BookingSlots = ({
  slots,
  slotLabels,
  visibleSlots,
  loading,
  error,
  onChoose,
  onShowMore,
  onRetry,
}: BookingSlotsProps) => {
  if (loading) {
    return (
      <p className={styles.status} role="status">
        {chatbot.booking.slots.loading}
      </p>
    )
  }

  if (error === 'slots-unavailable' || error === 'network' || error === 'rate-limited') {
    return (
      <div className={styles.error} role="alert">
        <p className={styles.errorText}>
          <AgentMessageText
            template={chatbot.booking.slots.unavailable}
            contactLinkLabel={chatbot.contactPageLinkLabel}
          />
        </p>
        <button type="button" className={styles.quiet} onClick={onRetry}>
          {chatbot.error.retry}
        </button>
      </div>
    )
  }

  const offerable = slots
    .map((slot, index) => ({ slot, label: slotLabels[index] ?? '' }))
    .filter((entry) => entry.label !== '')

  // A slot taken between two confirmations keeps its message and shows the fresh availability below
  // it: the visitor reads what happened and picks again from what is really free.
  const takenNotice =
    error === 'slot-taken' ? (
      <div className={styles.error} role="alert">
        <p className={styles.errorText}>{chatbot.error.slotTaken}</p>
      </div>
    ) : null

  if (offerable.length === 0) {
    return (
      <>
        {takenNotice}
        <p className={styles.status}>
          <AgentMessageText template={chatbot.booking.slots.none} contactLinkLabel={chatbot.contactPageLinkLabel} />
        </p>
      </>
    )
  }

  const shown = offerable.slice(0, visibleSlots)
  const remaining = offerable.length - shown.length

  return (
    <>
      {takenNotice}
      <ul className={styles.chips} aria-label={chatbot.booking.slots.listLabel}>
        {shown.map((entry) => (
          <li key={entry.slot.start}>
            <button
              type="button"
              className={`${styles.chip} ${styles.slotChip}`}
              data-booking-slot={entry.slot.start}
              onClick={() => onChoose(entry.slot)}
            >
              {entry.label}
            </button>
          </li>
        ))}
        {remaining > 0 ? (
          <li>
            <button type="button" className={styles.chip} data-booking-more onClick={onShowMore}>
              {chatbot.booking.slots.more}
            </button>
          </li>
        ) : null}
      </ul>
      <p className={`${styles.timezoneNote} text-body-sm text-foreground-tertiary`}>
        {chatbot.booking.slots.timezoneNote}
      </p>
    </>
  )
}
