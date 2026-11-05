'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@components/ui/Button'
import { prefersReducedMotion } from '@/lib/motion'
import { chatbot } from '@/locales/fr/chatbot'
import { type BookingEditChoice, type BookingRecapRow, type BookingStep } from './hooks/useBookingFlow'
import styles from './styles/Booking.module.css'

/**
 * The md breakpoint of the design, as the stylesheets write it (`@media (min-width: 48rem)`).
 *
 * Below it the chooser belongs between the recap table and the action row, where a phone reaches it
 * without the action row standing in the way; from it up the chooser stays where it always was, under
 * the action row. Rendering it in one slot or the other swaps its DOM order, so what a visitor reads
 * and what they see agree at every width.
 */
const MD_QUERY = '(min-width: 48rem)'

/** Id the edit link's `aria-controls` points at. There is one chooser, so the id is unique. */
const CHOOSER_ID = 'booking-edit-chooser'

/** Props of {@link BookingRecap}. */
export type BookingRecapProps = {
  /** Answers given so far, in flow order: the table lists the answered fields only. */
  rows: readonly BookingRecapRow[]
  /** Every question the chooser offers, skipped optional ones included. */
  choices: readonly BookingEditChoice[]
  /** True when the booking can be sent: consent given and the slot still free. */
  canConfirm: boolean
  /** True while the booking is being sent. */
  confirming: boolean
  /** Called with the step to reopen when the visitor edits an answer. */
  onEdit: (step: BookingStep) => void
  /** Called to send the booking. */
  onConfirm: () => void
}

/**
 * Recap step: every answer on its own row, one way back into the answers, then the confirmation.
 *
 * The single edit link asks which answer to change and offers every question of the flow, labelled
 * with the field names the visitor already read: a skipped optional question is offered too, so an
 * answer left out can still be added. Choosing one reopens that step, empty when it had no answer and
 * prefilled when it had one; the flow itself brings the visitor back here once that step is left,
 * answer given or skipped, so no other question is asked again. Below the md breakpoint the chooser
 * renders between the table and the action row, and its first choice takes the focus on opening:
 * ahead of the link in the DOM, Tab from the link would walk past it. From md up the chooser keeps
 * its old place under the action row and the focus stays on the link. The confirm button carries the
 * real state: it stays disabled until the consent is given and the slot is known to be free, which
 * makes a double confirmation impossible from the UI.
 */
export const BookingRecap = ({ rows, choices, canConfirm, confirming, onEdit, onConfirm }: BookingRecapProps) => {
  const [choosing, setChoosing] = useState(false)
  /** True below the md breakpoint, where the chooser renders before the action row. */
  const [chooserFirst, setChooserFirst] = useState(false)
  const editLinkRef = useRef<HTMLButtonElement | null>(null)
  const firstChoiceRef = useRef<HTMLButtonElement | null>(null)

  // Follows the breakpoint while the recap is on screen, so a phone turned sideways, or a window
  // resized, gets the order of its new width with the chooser open or not.
  useEffect(() => {
    const media = window.matchMedia(MD_QUERY)
    const update = (): void => setChooserFirst(!media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Opening below md puts the chooser ahead of the link, so the focus goes to the first choice
  // instead of staying on the link; the choice is then brought into view, smoothly unless the visitor
  // asked for less motion. From md up nothing moves: the chooser is below the action row and the link
  // keeps the focus it was clicked with.
  useEffect(() => {
    if (!choosing || !chooserFirst) return
    const choice = firstChoiceRef.current
    if (choice === null) return

    choice.focus({ preventScroll: true })
    choice.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
  }, [choosing, chooserFirst])

  // One definition, rendered in one of the two slots: the chooser never exists twice, so its id stays
  // unique and no state is duplicated between the widths.
  const chooser = choosing ? (
    <div className={styles.recapChooser} id={CHOOSER_ID}>
      <p className={styles.recapPrompt}>{chatbot.booking.recap.editPrompt}</p>
      <ul className={styles.chips} aria-label={chatbot.booking.recap.edit}>
        {choices.map((choice, index) => (
          <li key={choice.key}>
            <button
              ref={index === 0 ? firstChoiceRef : undefined}
              type="button"
              className={styles.chip}
              data-booking-edit={choice.key}
              onClick={() => {
                setChoosing(false)
                onEdit(choice.key)
              }}
            >
              {choice.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null

  return (
    <div
      className={styles.recap}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !choosing) return

        // Escape closes the chooser only: without this the keypress would reach the flow's own
        // Escape handler, which abandons the flow and drops every answer already given.
        event.stopPropagation()
        setChoosing(false)
        editLinkRef.current?.focus()
      }}
    >
      <h3 className={styles.recapTitle} data-booking-focus tabIndex={-1}>
        {chatbot.booking.recap.title}
      </h3>
      <ul className={styles.recapList}>
        {rows.map((row) => (
          <li key={row.key} className={styles.recapRow}>
            <p className={`${styles.recapLabel} text-caption uppercase`}>{row.label}</p>
            <p className={styles.recapValue}>{row.value}</p>
          </li>
        ))}
      </ul>
      {chooserFirst ? chooser : null}
      <div className={styles.recapActions}>
        <button
          ref={editLinkRef}
          type="button"
          className={styles['quiet-action']}
          aria-expanded={choosing}
          aria-controls={choosing ? CHOOSER_ID : undefined}
          onClick={() => setChoosing((current) => !current)}
        >
          {chatbot.booking.recap.edit}
        </button>
        <Button
          size="lg"
          className={canConfirm && !confirming ? undefined : styles['button-disabled']}
          disabled={!canConfirm || confirming}
          onClick={onConfirm}
        >
          {chatbot.booking.recap.confirm}
        </Button>
      </div>
      {chooserFirst ? null : chooser}
    </div>
  )
}
