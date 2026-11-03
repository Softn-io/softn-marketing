'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@components/ui/Button'
import { BOOKING_OPEN_QUERY_KEY, SECTION_IDS } from '@/lib/anchors'
import { bookingDayKeyOfInstant, type BookingSlot } from '@/lib/booking/availability'
import {
  formatBookingDayLabel,
  formatBookingDayLongLabel,
  formatBookingTimeLabel,
  formatSlotLabel,
  type BookingDayLabel,
} from '@/lib/booking/labels'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { interpolate } from '@/lib/interpolate'
import { bookingManage } from '@/locales/fr/bookingManage'
import { isBookingSlotsResponse } from '@/schemas/bookingLimits'
import {
  BOOKING_CANCEL_REASONS,
  isBookingManageCancelResponse,
  isBookingManageErrorResponse,
  isBookingManageRescheduleResponse,
  type BookingCancelReason,
  type BookingManageErrorCode,
} from '@/schemas/bookingManageLimits'
import styles from './styles/BookingManage.module.css'

/** Endpoint of the management actions. */
const MANAGE_ENDPOINT = '/api/booking/manage'

/** Upper bound on one management request: a slow answer offers the retry instead of hanging. */
const MANAGE_REQUEST_TIMEOUT_MS = 10_000

/** Placeholder the locale copy uses where the contact link belongs. */
const CONTACT_PLACEHOLDER = '{contactLink}'

/** State the server rendered the page in. */
export type BookingManageState = 'reschedule' | 'late' | 'started' | 'cancelled' | 'invalid' | 'unavailable'

/** View the island shows, the five design views plus the states of the link and the calendar. */
type BookingManageView =
  'overview' | 'chooser' | 'cancel' | 'moved' | 'cancelled' | 'late' | 'started' | 'invalid' | 'unavailable'

/** Props of {@link BookingManage}. */
export type BookingManageProps = {
  /** Signed token of the link, sent with every action. */
  token: string
  /** State the server rendered the page in. */
  state: BookingManageState
  /** Label of the appointment as the calendar holds it, absent when it cannot be read. */
  slotLabel?: string
  /** Relative URL of this page, used by the retry link of the unavailable state. */
  retryHref: string
}

/** One day of the chooser: its key, its compact label and its free slots. */
type ChooserDay = {
  readonly key: string
  readonly label: BookingDayLabel
  readonly slots: readonly BookingSlot[]
}

/** Groups the free slots by Paris day, oldest day first. */
const groupSlotsByDay = (slots: readonly BookingSlot[]): readonly ChooserDay[] => {
  const grouped = new Map<string, BookingSlot[]>()

  for (const slot of slots) {
    const key = bookingDayKeyOfInstant(slot.start, BOOKING_RULES)
    if (key === null) continue

    const daySlots = grouped.get(key)
    if (daySlots === undefined) grouped.set(key, [slot])
    else daySlots.push(slot)
  }

  return [...grouped.entries()].flatMap(([key, daySlots]) => {
    const label = formatBookingDayLabel(key, BOOKING_RULES)
    return label === null ? [] : [{ key, label, slots: daySlots }]
  })
}

/** Body of one management request: each action carries the token, and its own fields only. */
type ManageActionBody =
  | { readonly action: 'slots'; readonly token: string }
  | { readonly action: 'reschedule'; readonly token: string; readonly slot: string }
  | { readonly action: 'cancel'; readonly token: string; readonly reason?: BookingCancelReason }

/** Outcome of one management request: its body when the route accepted it, or its error code. */
type ManageActionResult =
  { readonly ok: true; readonly payload: unknown } | { readonly ok: false; readonly code: BookingManageErrorCode }

/** Message of every management failure, from the locale: no wording is invented here. */
const ERROR_MESSAGES: Readonly<Record<BookingManageErrorCode, string>> = {
  invalid: bookingManage.states.invalid.message,
  'rate-limited': bookingManage.errors.rateLimit,
  unavailable: bookingManage.errors.unavailable,
  'slot-taken': bookingManage.errors.slotTaken,
  late: bookingManage.states.late.message,
  started: bookingManage.states.started.message,
  cancelled: bookingManage.states.cancelled.message,
}

/** Values every locale message may need besides the contact link. */
const MESSAGE_VALUES = { hours: String(BOOKING_RULES.rescheduleNoticeHours) } as const

/**
 * Renders one locale message, turning its `{contactLink}` placeholder into a real link.
 *
 * Every other `{name}` is filled from the given values, so a message that carries `{hours}` reads
 * the rule's own number, and the words inside the link are the ones the locale places there.
 */
const ManageMessage = ({
  template,
  values = {},
}: {
  /** Locale template, its link placeholder included. */
  template: string
  /** Values of the placeholders other than the contact link. */
  values?: Readonly<Record<string, string>>
}) => {
  const [before, after] = template.split(CONTACT_PLACEHOLDER)

  return (
    <>
      {interpolate(before ?? '', { ...MESSAGE_VALUES, ...values })}
      {after === undefined ? null : (
        <>
          <a className={styles.messageLink} href={bookingManage.contact.href}>
            {bookingManage.contact.linkLabel}
          </a>
          {interpolate(after, { ...MESSAGE_VALUES, ...values })}
        </>
      )}
    </>
  )
}

/**
 * Client island of the manage page: the appointment recap and the two actions it allows.
 *
 * Every change is a `POST` after an explicit click; a page load never writes. The chooser reads its
 * free slots from the `slots` action, offers day by day with plain pressed buttons, and keeps its
 * confirm disabled until a time is picked; the cancellation is a second step, optionally carrying a
 * reason chip. The recap shows the slot and the format only, never a personal field, and each view
 * has one heading, focus moved onto it, and its result announced.
 */
export const BookingManage = ({ token, state, slotLabel, retryHref }: BookingManageProps) => {
  const [view, setView] = useState<BookingManageView>(state === 'reschedule' ? 'overview' : state)
  const [slots, setSlots] = useState<readonly BookingSlot[] | null>(null)
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const [pickedSlot, setPickedSlot] = useState<BookingSlot | null>(null)
  const [reason, setReason] = useState<BookingCancelReason | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<BookingManageErrorCode | null>(null)
  const [previousLabel, setPreviousLabel] = useState<string | null>(null)
  const [movedLabel, setMovedLabel] = useState<string | null>(null)
  const [justCancelled, setJustCancelled] = useState(false)

  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const firstRender = useRef(true)

  // One predictable focus move per view, never on the first paint: the heading of the new view
  // takes focus, so a keyboard or screen-reader visitor lands on what changed.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }

    headingRef.current?.focus()
  }, [view])

  const postAction = useCallback(async (body: ManageActionBody, keepError = false): Promise<ManageActionResult> => {
    setSubmitting(true)
    if (!keepError) setActionError(null)

    try {
      const response = await fetch(MANAGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(MANAGE_REQUEST_TIMEOUT_MS),
      })
      const payload: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        const code = isBookingManageErrorResponse(payload) ? payload.error : 'unavailable'
        setActionError(code)
        return { ok: false, code }
      }

      return { ok: true, payload }
    } catch {
      setActionError('unavailable')
      return { ok: false, code: 'unavailable' }
    } finally {
      setSubmitting(false)
    }
  }, [])

  const loadSlots = useCallback(
    async (keepError = false): Promise<void> => {
      setLoadingSlots(true)
      const result = await postAction({ action: 'slots', token }, keepError)
      setLoadingSlots(false)
      if (!result.ok) return

      if (!isBookingSlotsResponse(result.payload)) {
        setActionError('unavailable')
        return
      }

      setSlots(result.payload.slots)
      const [firstDay] = groupSlotsByDay(result.payload.slots)
      setPickedDay(firstDay?.key ?? null)
      setPickedSlot(null)
    },
    [postAction, token],
  )

  const openChooser = useCallback((): void => {
    setView('chooser')
    void loadSlots()
  }, [loadSlots])

  const confirmReschedule = useCallback(async (): Promise<void> => {
    if (pickedSlot === null) return

    const result = await postAction({ action: 'reschedule', token, slot: pickedSlot.start })
    if (!result.ok) {
      // The slot was taken between the answer and the confirmation: the visitor keeps the message
      // and reads the fresh availability below it, exactly like the reservation flow.
      if (result.code === 'slot-taken') void loadSlots(true)
      return
    }

    if (!isBookingManageRescheduleResponse(result.payload)) {
      setActionError('unavailable')
      return
    }

    setPreviousLabel(slotLabel ?? null)
    setMovedLabel(formatSlotLabel(pickedSlot, BOOKING_RULES))
    setView('moved')
  }, [loadSlots, pickedSlot, postAction, slotLabel, token])

  const confirmCancel = useCallback(async (): Promise<void> => {
    const result = await postAction({
      action: 'cancel',
      token,
      ...(reason === null ? {} : { reason }),
    })
    if (!result.ok) return

    if (!isBookingManageCancelResponse(result.payload)) {
      setActionError('unavailable')
      return
    }

    setJustCancelled(true)
    setView('cancelled')
  }, [postAction, reason, token])

  // The retry of a failure reruns what failed, judged from the view the visitor is on: the
  // cancellation, the last confirmation, or the availability that never arrived.
  const retryCurrent = useCallback((): void => {
    if (view === 'cancel') {
      void confirmCancel()
      return
    }
    if (pickedSlot === null) {
      void loadSlots(actionError === 'slot-taken')
      return
    }
    void confirmReschedule()
  }, [actionError, confirmCancel, confirmReschedule, loadSlots, pickedSlot, view])

  const days = useMemo(() => groupSlotsByDay(slots ?? []), [slots])
  const pickedDayEntry = days.find((day) => day.key === pickedDay) ?? null
  const pickedDayLongLabel = pickedDayEntry === null ? '' : formatBookingDayLongLabel(pickedDayEntry.key, BOOKING_RULES)

  const currentLabel = view === 'moved' ? (movedLabel ?? slotLabel) : slotLabel

  const eyebrow =
    view === 'chooser'
      ? bookingManage.eyebrow.reschedule
      : view === 'cancel'
        ? bookingManage.eyebrow.cancel
        : view === 'moved'
          ? bookingManage.eyebrow.moved
          : view === 'cancelled'
            ? bookingManage.eyebrow.cancelled
            : bookingManage.eyebrow.overview

  const eyebrowTone =
    view === 'cancel' || view === 'invalid'
      ? styles['eyebrow-danger']
      : view === 'moved'
        ? styles['eyebrow-success']
        : view === 'cancelled' || view === 'late' || view === 'started' || view === 'unavailable'
          ? styles['eyebrow-tertiary']
          : styles['eyebrow-brand']

  const heading =
    view === 'chooser'
      ? bookingManage.reschedule.chooser.title
      : view === 'cancel'
        ? interpolate(bookingManage.cancel.confirm.question, { slot: slotLabel ?? '' })
        : view === 'moved'
          ? bookingManage.reschedule.success.title
          : view === 'cancelled'
            ? justCancelled
              ? bookingManage.cancel.success.title
              : bookingManage.states.cancelled.title
            : view === 'late'
              ? bookingManage.states.late.title
              : view === 'started'
                ? bookingManage.states.started.title
                : view === 'invalid'
                  ? bookingManage.states.invalid.title
                  : bookingManage.title

  const lead =
    view === 'overview'
      ? bookingManage.intro
      : view === 'moved'
        ? interpolate(bookingManage.reschedule.success.message, { slot: movedLabel ?? '' })
        : view === 'cancelled'
          ? justCancelled
            ? bookingManage.cancel.success.message
            : bookingManage.states.cancelled.message
          : view === 'late'
            ? bookingManage.states.late.message
            : view === 'started'
              ? bookingManage.states.started.message
              : view === 'invalid'
                ? bookingManage.states.invalid.message
                : view === 'unavailable'
                  ? bookingManage.errors.unavailable
                  : null

  const recap =
    slotLabel === undefined ? null : (
      <dl className={styles.recap}>
        <div className={styles.recapRow}>
          <dt className={`${styles.recapLabel} text-caption uppercase`}>{bookingManage.recap.date}</dt>
          <dd className={styles.recapValue}>
            <span className={view === 'cancelled' ? styles.recapStruck : undefined}>{currentLabel}</span>
            {previousLabel === null ? null : <span className={styles.recapPrevious}>{previousLabel}</span>}
          </dd>
        </div>
        <div className={styles.recapRow}>
          <dt className={`${styles.recapLabel} text-caption uppercase`}>{bookingManage.recap.format}</dt>
          <dd className={`${styles.recapFormat} text-body-md`}>{bookingManage.recap.formatValue}</dd>
        </div>
      </dl>
    )

  const errorNotice =
    actionError === null ? null : (
      <div className={styles.error} role="alert">
        <p className={styles.errorText}>
          <ManageMessage template={ERROR_MESSAGES[actionError]} />
        </p>
        <button type="button" className={styles.quiet} onClick={retryCurrent}>
          {bookingManage.errors.retry}
        </button>
      </div>
    )

  return (
    <main id={SECTION_IDS.main} className={styles.main}>
      <div className={styles.column}>
        <div className={styles.intro}>
          <p className={`${styles.eyebrow} ${eyebrowTone} text-caption uppercase`}>{eyebrow}</p>
          <h1 ref={headingRef} tabIndex={-1} className={`${styles.title} font-display text-display-md text-foreground`}>
            {heading}
          </h1>
          {lead === null ? null : (
            <p
              className={`${styles.lead} text-body-md text-foreground-secondary`}
              role={view === 'moved' || (view === 'cancelled' && justCancelled) ? 'status' : undefined}
            >
              <ManageMessage template={lead} />
            </p>
          )}
        </div>

        {recap}

        {view === 'overview' ? (
          <div className={styles.actions}>
            <Button size="lg" onClick={openChooser}>
              {bookingManage.reschedule.action}
            </Button>
            <button type="button" className={styles.outline} onClick={() => setView('cancel')}>
              {bookingManage.cancel.action}
            </button>
          </div>
        ) : null}

        {view === 'chooser' ? (
          <div className={styles.chooser}>
            {loadingSlots ? (
              <p className={styles.status} role="status">
                {bookingManage.reschedule.loading}
              </p>
            ) : null}

            {!loadingSlots && actionError === null && days.length === 0 ? (
              <p className={styles.status}>
                <ManageMessage template={bookingManage.reschedule.empty} />
              </p>
            ) : null}

            {days.length > 0 && !loadingSlots ? (
              <>
                <div className={styles.chooserBlock}>
                  <p className={styles.chooserLabel}>{bookingManage.reschedule.chooser.dayLabel}</p>
                  <div className={styles.days} role="group" aria-label={bookingManage.reschedule.chooser.dayLabel}>
                    {days.map((day) => (
                      <button
                        key={day.key}
                        type="button"
                        className={`${styles.day} ${day.key === pickedDay ? styles['day-picked'] : ''}`}
                        aria-pressed={day.key === pickedDay}
                        onClick={() => {
                          setPickedDay(day.key)
                          setPickedSlot(null)
                        }}
                      >
                        <span className={`${styles.dayWeekday} text-caption uppercase`}>{day.label.weekday}</span>
                        <span className={`${styles.dayNumber} font-display`}>{day.label.day}</span>
                        <span className={`${styles.dayMonth} text-caption`}>{day.label.month}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {pickedDayEntry === null ? null : (
                  <div className={styles.chooserBlock}>
                    <p className={styles.chooserLabel}>
                      {interpolate(bookingManage.reschedule.chooser.timeLabel, { day: pickedDayLongLabel })}
                    </p>
                    <div
                      className={styles.times}
                      role="group"
                      aria-label={interpolate(bookingManage.reschedule.chooser.timeLabel, { day: pickedDayLongLabel })}
                    >
                      {pickedDayEntry.slots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          className={`${styles.time} ${slot.start === pickedSlot?.start ? styles['time-picked'] : ''}`}
                          aria-pressed={slot.start === pickedSlot?.start}
                          onClick={() => setPickedSlot(slot)}
                        >
                          {formatBookingTimeLabel(slot.start, BOOKING_RULES)}
                        </button>
                      ))}
                    </div>
                    <p className={`${styles.timezoneNote} text-body-sm text-foreground-tertiary`}>
                      {bookingManage.reschedule.chooser.timezoneNote}
                    </p>
                  </div>
                )}

                {pickedSlot === null ? null : (
                  <p className={`${styles.summary} text-body-md text-foreground-secondary`}>
                    <ManageMessage
                      template={bookingManage.reschedule.confirm.summary}
                      values={{ slot: slotLabel ?? '', newSlot: formatSlotLabel(pickedSlot, BOOKING_RULES) }}
                    />
                  </p>
                )}

                <div className={styles.confirmRow}>
                  <Button
                    size="lg"
                    onClick={() => void confirmReschedule()}
                    disabled={pickedSlot === null || submitting}
                  >
                    {bookingManage.reschedule.confirm.submit}
                  </Button>
                  <button type="button" className={styles.outline} onClick={() => setView('overview')}>
                    {bookingManage.reschedule.back}
                  </button>
                </div>
              </>
            ) : null}

            {errorNotice}
          </div>
        ) : null}

        {view === 'cancel' ? (
          <div className={styles.cancelView}>
            <div className={styles.chooserBlock}>
              <p className={styles.chooserLabel}>{bookingManage.cancel.reason.label}</p>
              <div className={styles.reasonChips} role="group" aria-label={bookingManage.cancel.reason.label}>
                {BOOKING_CANCEL_REASONS.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={`${styles.reasonChip} ${reason === code ? styles['reasonChip-picked'] : ''}`}
                    aria-pressed={reason === code}
                    onClick={() => setReason((current) => (current === code ? null : code))}
                  >
                    {bookingManage.cancel.reason.options[code]}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.danger}
                disabled={submitting}
                onClick={() => void confirmCancel()}
              >
                {bookingManage.cancel.confirm.submit}
              </button>
              <button type="button" className={styles.outline} onClick={() => setView('overview')}>
                {bookingManage.cancel.confirm.back}
              </button>
            </div>

            {errorNotice}
          </div>
        ) : null}

        {view === 'late' ? (
          <div className={styles.actions}>
            <button type="button" className={styles.outline} onClick={() => setView('cancel')}>
              {bookingManage.cancel.action}
            </button>
          </div>
        ) : null}

        {view === 'moved' ? (
          <div className={styles.quietActions}>
            <button type="button" className={styles.quiet} onClick={openChooser}>
              {bookingManage.reschedule.changeAgain}
            </button>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                setReason(null)
                setView('cancel')
              }}
            >
              {bookingManage.cancel.shortAction}
            </button>
          </div>
        ) : null}

        {view === 'cancelled' ? (
          <div className={styles.actions}>
            <Button size="lg" href={`/?${BOOKING_OPEN_QUERY_KEY}=1#${SECTION_IDS.agent}`}>
              {justCancelled ? bookingManage.cancel.success.bookAgain : bookingManage.states.cancelled.bookAgain}
            </Button>
          </div>
        ) : null}

        {view === 'unavailable' && actionError === null ? (
          <div className={styles.actions}>
            <a href={retryHref} className={styles.quiet}>
              {bookingManage.errors.retry}
            </a>
          </div>
        ) : null}

        <p className={`${styles.contactLine} text-body-sm text-foreground-tertiary`}>
          <ManageMessage template={bookingManage.contact.sentence} />
        </p>
      </div>
    </main>
  )
}
