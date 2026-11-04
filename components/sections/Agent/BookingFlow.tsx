'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { BookingSlot } from '@/lib/booking/availability'
import { groupSlotsByDay } from '@/lib/booking/days'
import { formatBookingDayLongLabel } from '@/lib/booking/labels'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { interpolate } from '@/lib/interpolate'
import { agent } from '@/locales/fr/agent'
import { chatbot } from '@/locales/fr/chatbot'
import { BOOKING_HONEYPOT_FIELD } from '@/schemas/bookingLimits'
import { SlotChooser } from '@components/booking/SlotChooser/SlotChooser'
import { Button } from '@components/ui/Button'
import { AgentMessageText } from './AgentMessageText'
import { AgentTypingIndicator } from './AgentTypingIndicator'
import { BookingRecap } from './BookingRecap'
import { agentSpeakerLabel } from './data/agentMessages'
import {
  BOOKING_QUESTION_STEPS,
  BOOKING_STEPS,
  prefersReducedMotion,
  useBookingFlow,
  type BookingStep,
} from './hooks/useBookingFlow'
import styles from './styles/Booking.module.css'

/** Text field of a step: its visible label, its example and the error of its format. */
type BookingTextField = {
  readonly label: string
  readonly placeholder?: string
  readonly error?: string
}

/** Day the visitor picked in the slot chooser, with the availability it was picked against. */
type SlotDayPick = {
  readonly dayKey: string
  readonly slots: readonly BookingSlot[]
}

/** Text steps of the flow, with the wording the field renders. */
const TEXT_FIELDS: Partial<Record<BookingStep, BookingTextField>> = {
  [BOOKING_STEPS.need]: {
    label: chatbot.booking.steps.need.field,
    placeholder: chatbot.booking.steps.need.example,
  },
  [BOOKING_STEPS.firstName]: { label: chatbot.booking.steps.firstName.field },
  [BOOKING_STEPS.lastName]: { label: chatbot.booking.steps.lastName.field },
  [BOOKING_STEPS.email]: {
    label: chatbot.booking.steps.email.field,
    error: chatbot.booking.steps.email.error,
  },
  [BOOKING_STEPS.phone]: {
    label: chatbot.booking.steps.phone.field,
    error: chatbot.booking.steps.phone.error,
  },
}

/** Chip steps of the flow: options the visitor picks from, and a way past the question. */
const CHIP_FIELDS: Partial<Record<BookingStep, { readonly label: string; readonly options: readonly string[] }>> = {
  [BOOKING_STEPS.structure]: {
    label: chatbot.booking.steps.structure.field,
    options: chatbot.booking.steps.structure.options,
  },
  [BOOKING_STEPS.role]: {
    label: chatbot.booking.steps.role.field,
    options: chatbot.booking.steps.role.options,
  },
}

/** Text steps a visitor may leave unanswered, with the way past them. */
const OPTIONAL_TEXT_STEPS: readonly BookingStep[] = [BOOKING_STEPS.phone]

/** Props of {@link BookingFlow}. */
export type BookingFlowProps = {
  /** Called when the visitor abandons the flow: nothing collected is kept or sent. */
  onCancel: () => void
  /** Called when the visitor refuses the consent: nothing is collected at all. */
  onDecline: () => void
  /** Called when the visitor starts a new booking after a confirmed one. */
  onRestart: () => void
}

/**
 * Token of the gap kept under the sticky header when the flow scrolls something into view.
 *
 * The offset is the header's own measured height plus this token's value, read from the stylesheet so
 * no hand-written pixel value is involved.
 */
const SCROLL_GAP_TOKEN = '--softn-space-24'

/** Reads a length token, in pixels, from the document root. */
const readLengthToken = (name: string): number => {
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue(name).trim()
  if (value === '') return 0

  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount)) return 0
  if (value.endsWith('rem')) return amount * Number.parseFloat(getComputedStyle(root).fontSize)
  if (value.endsWith('px')) return amount
  return 0
}

/** The box of an element in the viewport, or `null` when there is none. */
type ViewportBox = { readonly top: number; readonly bottom: number }

const boxOf = (element: Element | null | undefined): ViewportBox | null => {
  if (element === null || element === undefined) return null

  const box = element.getBoundingClientRect()
  if (box.height === 0 && box.width === 0) return null
  return { top: box.top, bottom: box.bottom }
}

/**
 * Brings the newest message, then the control of the current step, fully into view.
 *
 * The window is scrolled directly, never an inner box: the section clips its own overflow, so a
 * `scrollIntoView` there can move a container the visitor cannot scroll back. The block to keep
 * visible is the union of the newest transcript line and the step's control — when it is taller than
 * the room left under the sticky header (a long recap), the control that has to be clicked wins and
 * the message above it scrolls out of the way. The page always moves to that block, even for a
 * visitor who scrolled up in the meantime, and the jump is instant when motion is reduced.
 *
 * @param container The flow's root element.
 * @param reducedMotion True when the visitor asked for less motion.
 */
const revealInView = (container: HTMLElement, reducedMotion: boolean): void => {
  const transcript = container.querySelector<HTMLElement>('[data-booking-transcript]')
  const newest = boxOf(transcript?.lastElementChild)
  const controlElement = container.querySelector<HTMLElement>('[data-booking-focus]')
  const control = boxOf(controlElement)

  const boxes = [newest, control].filter((box): box is ViewportBox => box !== null)
  if (boxes.length === 0) return

  const header = document.querySelector('header')
  const headerHeight = header === null ? 0 : header.getBoundingClientRect().height
  const offset = headerHeight + readLengthToken(SCROLL_GAP_TOKEN)

  const blockTop = Math.min(...boxes.map((box) => box.top))
  const blockBottom = Math.max(...boxes.map((box) => box.bottom))
  const room = window.innerHeight - offset
  const anchor = blockBottom - blockTop <= room ? blockTop : (control?.top ?? blockTop)

  window.scrollTo({
    top: Math.max(0, window.scrollY + anchor - offset),
    behavior: reducedMotion ? 'auto' : 'smooth',
  })
}

/**
 * Reservation flow of the assistant section: consent, need, slot, identity, recap, confirmation.
 *
 * The flow is its own island, mounted lazily: it holds its own answers, renders its own transcript
 * and calls its own two endpoints, so no booking answer ever reaches the assistant conversation or
 * its history. Every step is a real form or a group of real buttons, the transcript is a polite live
 * region, focus moves to the control of the new step without scrolling it on its own (the flow
 * scrolls the page itself, so the two cannot fight), Escape abandons the flow, and the honeypot field
 * stays out of both the tab order and the accessibility tree.
 */
export const BookingFlow = ({ onCancel, onDecline, onRestart }: BookingFlowProps) => {
  const flow = useBookingFlow()
  const flowRef = useRef<HTMLElement | null>(null)

  // One predictable focus move per step, once the question of that step is on screen: the field that
  // asks, the chip that answers, the heading that sums up. Nothing else in the page takes focus, and
  // focus never scrolls: the effect below owns scrolling, so a smooth scroll is not cancelled here.
  // The slot step's control is the day-then-time chooser, which appears only once the availability
  // has arrived: the slots are part of the condition, so the move lands on it rather than on the
  // container that was the only thing there while it was loading.
  useEffect(() => {
    if (!flow.stepReady) return

    const container = flowRef.current
    if (container === null) return
    const target = container.querySelector<HTMLElement>('[data-booking-focus]') ?? container
    target.focus({ preventScroll: true })
  }, [flow.slots, flow.step, flow.stepReady])

  // Every new message, and every step whose control appears, brings the conversation with it: the
  // newest line and that control end up fully visible under the sticky header. A new availability
  // counts as the control appearing: the chooser is taller than the question above it, so the page
  // has to follow again once it is there, or its times stay under the fold.
  useEffect(() => {
    const container = flowRef.current
    if (container === null) return

    revealInView(container, prefersReducedMotion())
  }, [flow.entries.length, flow.slots, flow.step, flow.stepReady])

  const textField = TEXT_FIELDS[flow.step]
  const chipField = CHIP_FIELDS[flow.step]
  const confirming = flow.status === 'confirming'
  const showCounter = flow.stepReady && flow.questionNumber > 0 && flow.step !== BOOKING_STEPS.recap
  const fieldErrorText =
    flow.fieldError === null
      ? null
      : (textField?.error ??
        (flow.step === BOOKING_STEPS.email ? chatbot.booking.steps.email.error : chatbot.booking.steps.phone.error))

  const slotDays = useMemo(() => groupSlotsByDay(flow.slots, BOOKING_RULES), [flow.slots])
  const [dayPick, setDayPick] = useState<SlotDayPick | null>(null)

  // The pick only holds for the availability it was made against: a reloaded list (a retry, or the
  // fresh read that follows a slot taken meanwhile) starts again on its first day, so a day that
  // emptied in the meantime is never kept.
  const pickedDayKey = dayPick !== null && dayPick.slots === flow.slots ? dayPick.dayKey : (slotDays[0]?.key ?? null)

  const pickedDayLongLabel = pickedDayKey === null ? '' : formatBookingDayLongLabel(pickedDayKey, BOOKING_RULES)
  const slotsFailed = flow.error === 'slots-unavailable' || flow.error === 'network' || flow.error === 'rate-limited'

  return (
    <section
      className={styles.flow}
      aria-label={chatbot.suggestions.book}
      ref={flowRef}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <ol className={styles.transcript} data-booking-transcript aria-live="polite" aria-relevant="additions text">
        {flow.entries.map((entry) => (
          <li key={entry.key} className={styles.line}>
            <p className={`${styles.speaker} text-caption uppercase`}>{agentSpeakerLabel(entry.speaker)}</p>
            <p className={`${styles.lineText} text-body-md text-foreground`}>
              <AgentMessageText template={entry.template} contactLinkLabel={chatbot.contactPageLinkLabel} />
            </p>
          </li>
        ))}
        {flow.typing ? (
          <li className={styles.line} data-booking-typing>
            <AgentTypingIndicator />
          </li>
        ) : null}
        {confirming ? (
          <li className={styles.line}>
            <p className={`${styles.speaker} text-caption uppercase`}>{agentSpeakerLabel('assistant')}</p>
            <p className={`${styles.lineText} text-body-md text-foreground`} role="status">
              {chatbot.loading.message}
            </p>
          </li>
        ) : null}
      </ol>

      <div className={styles.step}>
        {flow.stepReady ? (
          <>
            {showCounter ? (
              <p className={`${styles.progressLabel} text-caption uppercase`}>
                {interpolate(chatbot.booking.step, {
                  current: String(flow.questionNumber),
                  total: String(BOOKING_QUESTION_STEPS.length),
                })}
              </p>
            ) : null}

            {flow.step === BOOKING_STEPS.consent ? (
              <div className={styles.actions}>
                <Button size="lg" data-booking-focus onClick={flow.acceptConsent}>
                  {chatbot.consent.accept}
                </Button>
                <button type="button" className={styles.quiet} onClick={onDecline}>
                  {chatbot.consent.decline}
                </button>
              </div>
            ) : null}

            {textField !== undefined ? (
              <form
                className={styles.field}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  flow.submitStep()
                }}
              >
                <label className={`${styles.label} text-body-sm`} htmlFor={`booking-${flow.step}`}>
                  {textField.label}
                </label>
                <div className={`${styles.inputRow} ${fieldErrorText === null ? '' : styles['inputRow-invalid']}`}>
                  <input
                    id={`booking-${flow.step}`}
                    className={styles.input}
                    type={
                      flow.step === BOOKING_STEPS.email ? 'email' : flow.step === BOOKING_STEPS.phone ? 'tel' : 'text'
                    }
                    value={flow.fieldValue}
                    placeholder={textField.placeholder}
                    autoComplete={flow.step === BOOKING_STEPS.email ? 'email' : 'off'}
                    data-booking-focus
                    aria-invalid={fieldErrorText === null ? undefined : true}
                    aria-describedby={fieldErrorText === null ? undefined : `booking-${flow.step}-error`}
                    onChange={(event) => flow.setFieldValue(event.target.value)}
                    onBlur={flow.blurStep}
                  />
                  {OPTIONAL_TEXT_STEPS.includes(flow.step) ? (
                    <button type="button" className={styles['skip-inline']} onClick={flow.skipStep}>
                      {chatbot.booking.steps.skip}
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className={styles.send}
                    aria-label={agent.sendLabel}
                    disabled={!flow.canContinue || confirming}
                  >
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
                {fieldErrorText !== null ? (
                  <p id={`booking-${flow.step}-error`} className={`${styles.fieldError} text-body-sm`} role="alert">
                    {fieldErrorText}
                  </p>
                ) : null}
              </form>
            ) : null}

            {flow.step === BOOKING_STEPS.slot ? (
              flow.status === 'loading-slots' ? (
                <p className={styles.status} role="status">
                  {chatbot.booking.slots.loading}
                </p>
              ) : slotsFailed ? (
                <div className={styles.error} role="alert">
                  <p className={styles.errorText}>
                    <AgentMessageText
                      template={chatbot.booking.slots.unavailable}
                      contactLinkLabel={chatbot.contactPageLinkLabel}
                    />
                  </p>
                  <button type="button" className={styles.quiet} onClick={flow.retry}>
                    {chatbot.error.retry}
                  </button>
                </div>
              ) : (
                <>
                  {/* A slot taken between two confirmations keeps its message and shows the fresh
                      availability below it: the visitor reads what happened and picks again from what
                      is really free. */}
                  {flow.error === 'slot-taken' ? (
                    <div className={styles.error} role="alert">
                      <p className={styles.errorText}>{chatbot.error.slotTaken}</p>
                    </div>
                  ) : null}

                  {slotDays.length === 0 ? (
                    <p className={styles.status}>
                      <AgentMessageText
                        template={chatbot.booking.slots.none}
                        contactLinkLabel={chatbot.contactPageLinkLabel}
                      />
                    </p>
                  ) : (
                    <>
                      {/* The chat keeps no pressed time: a tap on a time commits the slot at once. */}
                      <SlotChooser
                        days={slotDays}
                        pickedDayKey={pickedDayKey}
                        pickedSlotStart={null}
                        dayLabel={chatbot.booking.slots.dayLabel}
                        timeLabel={interpolate(chatbot.booking.slots.timeLabel, { day: pickedDayLongLabel })}
                        dayGroupLabel={chatbot.booking.slots.dayGroupLabel}
                        timeGroupLabel={interpolate(chatbot.booking.slots.timeGroupLabel, { day: pickedDayLongLabel })}
                        timezoneNote={chatbot.booking.slots.timezoneNote}
                        daysClassName={styles.slotDays}
                        focusAnchor
                        onPickDay={(dayKey) => setDayPick({ dayKey, slots: flow.slots })}
                        onPickTime={flow.chooseSlot}
                      />
                    </>
                  )}
                </>
              )
            ) : null}

            {chipField !== undefined ? (
              <ul className={styles.chips} aria-label={chipField.label}>
                {chipField.options.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      className={styles.chip}
                      data-booking-option={option}
                      onClick={() => flow.chooseOption(option)}
                    >
                      {option}
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className={styles.chip} data-booking-skip onClick={flow.skipStep}>
                    {chatbot.booking.steps.skip}
                  </button>
                </li>
              </ul>
            ) : null}

            {flow.step === BOOKING_STEPS.recap ? (
              <>
                {flow.error === null ? null : (
                  <div className={styles.error} role="alert">
                    <p className={styles.errorText}>
                      {flow.error === 'rate-limited' ? (
                        chatbot.error.rateLimit
                      ) : flow.error === 'network' ? (
                        chatbot.error.network
                      ) : (
                        <AgentMessageText
                          template={chatbot.error.booking}
                          contactLinkLabel={chatbot.contactPageLinkLabel}
                        />
                      )}
                    </p>
                    <button type="button" className={styles.quiet} onClick={flow.retry}>
                      {chatbot.error.retry}
                    </button>
                  </div>
                )}
                <BookingRecap
                  rows={flow.recap}
                  choices={flow.editChoices}
                  canConfirm={flow.canConfirm}
                  confirming={confirming}
                  onEdit={flow.editStep}
                  onConfirm={flow.confirm}
                />
              </>
            ) : null}

            {flow.step === BOOKING_STEPS.done ? (
              <div className={styles.success}>
                <h3 className={styles.successTitle} data-booking-focus tabIndex={-1}>
                  {chatbot.booking.success.title}
                </h3>
                <button type="button" className={styles.quiet} onClick={onRestart}>
                  {chatbot.booking.success.restart}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Honeypot: a bot fills every field it finds, a visitor never reaches this one. */}
      <div className={styles.honeypot} aria-hidden="true">
        <input
          type="text"
          name={BOOKING_HONEYPOT_FIELD}
          value={flow.honeypot}
          tabIndex={-1}
          autoComplete="off"
          data-booking-honeypot
          onChange={(event) => flow.setHoneypot(event.target.value)}
        />
      </div>

      {flow.step === BOOKING_STEPS.done ? null : (
        <button type="button" className={styles.quiet} onClick={onCancel}>
          {chatbot.booking.cancel}
        </button>
      )}
    </section>
  )
}
