'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookingSlot } from '@/lib/booking/availability'
import { formatSlotLabel } from '@/lib/booking/labels'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { interpolate } from '@/lib/interpolate'
import { prefersReducedMotion } from '@/lib/motion'
import { chatbot } from '@/locales/fr/chatbot'
import {
  BOOKING_HONEYPOT_FIELD,
  getBookingEmailError,
  getBookingPhoneError,
  isBookingErrorResponse,
  isBookingSlotsResponse,
  isBookingSuccessResponse,
  type BookingErrorCode,
} from '@/schemas/bookingLimits'

/** Steps of the booking flow, in the order the visitor walks them. */
export const BOOKING_STEPS = {
  consent: 'consent',
  need: 'need',
  slot: 'slot',
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  phone: 'phone',
  structure: 'structure',
  role: 'role',
  recap: 'recap',
  done: 'done',
} as const

/** One step of the booking flow. */
export type BookingStep = (typeof BOOKING_STEPS)[keyof typeof BOOKING_STEPS]

/** Steps that ask a question, in order: what the step counter counts. */
export const BOOKING_QUESTION_STEPS: readonly BookingStep[] = [
  BOOKING_STEPS.need,
  BOOKING_STEPS.slot,
  BOOKING_STEPS.firstName,
  BOOKING_STEPS.lastName,
  BOOKING_STEPS.email,
  BOOKING_STEPS.phone,
  BOOKING_STEPS.structure,
  BOOKING_STEPS.role,
]

/** Steps in the order the flow advances, consent and recap included. */
const STEP_ORDER: readonly BookingStep[] = [BOOKING_STEPS.consent, ...BOOKING_QUESTION_STEPS, BOOKING_STEPS.recap]

/**
 * Pause between two messages of the flow, in milliseconds: long enough to read as someone answering,
 * short enough not to feel slow. This is the one value to change to make the flow talk faster or
 * slower.
 */
export const BOOKING_TYPING_DELAY_MS = 700

/** Failure the flow can show, mapped to locale copy by the component. */
export type BookingFlowError = 'slots-unavailable' | 'slot-taken' | 'booking' | 'rate-limited' | 'network'

/** What the flow is busy with, when it is busy. */
export type BookingFlowStatus = 'idle' | 'loading-slots' | 'confirming'

/** One line of the flow's own transcript, in render order. */
export type BookingEntry = {
  /** Stable identity of the line. */
  key: string
  /** Who wrote the line. */
  speaker: 'assistant' | 'visitor'
  /** Locale template of the line, its known parameters already filled. */
  template: string
}

/** One line of the flow script, before it is revealed one message at a time. */
type BookingScriptEntry = BookingEntry & {
  /** Step whose controls this line unlocks, or `null` for a line that unlocks nothing. */
  gating: BookingStep | null
}

/** One answered value of the flow, as the recap lists it. */
export type BookingRecapRow = {
  /** Step the row belongs to, used as its identity and as the way back to it. */
  key: BookingStep
  /** Label of the field, from the locale. */
  label: string
  /** Answer the visitor gave. */
  value: string
}

/**
 * One choice of the recap's edit chooser: a question of the flow and the label of its field.
 *
 * The chooser offers every question, including the optional ones the visitor left unanswered, so an
 * answer given up during the flow can still be added from the recap.
 */
export type BookingEditChoice = {
  /** Step the choice reopens. */
  key: BookingStep
  /** Label of the field, from the locale. */
  label: string
}

/** Answers the flow collects, as the visitor gave them. */
export type BookingAnswers = {
  /** Need in the visitor's own words. */
  need: string
  /** Chosen slot start, as an ISO 8601 instant, or `null` before one is chosen. */
  slot: string | null
  /** Visitor's first name. */
  firstName: string
  /** Visitor's last name. */
  lastName: string
  /** Invitation address. */
  email: string
  /** Optional phone number, empty when left out. */
  phone: string
  /** Optional structure, or `null` when skipped. */
  structure: string | null
  /** Optional role, or `null` when skipped. */
  role: string | null
}

/** Values the flow needs to render, and the actions that move it. */
export type BookingFlow = {
  /** Current step. */
  step: BookingStep
  /** Own transcript of the flow: never mixed into the assistant conversation. */
  entries: readonly BookingEntry[]
  /** True while the assistant is writing its next message: the typing indicator shows. */
  typing: boolean
  /** True once the question of the current step is on screen: its controls can appear. */
  stepReady: boolean
  /** What the flow is busy with. */
  status: BookingFlowStatus
  /** Failure to show, or `null`. */
  error: BookingFlowError | null
  /** Current value of the text field of the step, bound to the input. */
  fieldValue: string
  /** Problem of the current text field, or `null`. */
  fieldError: 'empty' | 'invalid' | null
  /** Free slots known to the flow, oldest first. */
  slots: readonly BookingSlot[]
  /** Labels of the free slots, indexed like {@link slots}. */
  slotLabels: readonly string[]
  /** Answers already given, in recap order. */
  recap: readonly BookingRecapRow[]
  /**
   * Every question the chooser of the recap offers, skipped optional ones included: picking one
   * reopens that step, empty or prefilled, and nothing else is asked again.
   */
  editChoices: readonly BookingEditChoice[]
  /** True when the current step can be left with the current value. */
  canContinue: boolean
  /** True when the booking can be sent: consent given and the slot still in the list. */
  canConfirm: boolean
  /** Value of the honeypot field the flow sends. A visitor never fills it. */
  honeypot: string
  /** Number of the current question in the counter, from 1. */
  questionNumber: number
  /** Updates the text field of the step. Typed text stays out of the transcript until it is sent. */
  setFieldValue: (value: string) => void
  /** Updates the honeypot field. */
  setHoneypot: (value: string) => void
  /** Leaves the consent step with the consent accepted. */
  acceptConsent: () => void
  /** Leaves the current question step, or shows why it cannot. */
  submitStep: () => void
  /**
   * Reports the phone or e-mail field on blur, without moving the flow.
   *
   * These are the two fields whose value is checked while the visitor is still on the step: a value
   * the rule refuses shows its error as soon as the field is left. Nothing else happens — no advance,
   * no transcript line, no focus move — and an empty value stays quiet, since the phone is optional
   * and the e-mail, required, says so on submit only, so merely passing through a field never
   * accuses anyone. The other steps ignore it.
   */
  blurStep: () => void
  /** Answers a chip step with one option and moves on. */
  chooseOption: (value: string) => void
  /** Leaves an optional question step without answering it. */
  skipStep: () => void
  /** Picks one slot. */
  chooseSlot: (slot: BookingSlot) => void
  /**
   * Reopens one answered step from the recap, prefilled, to change that answer only: submitting it
   * returns to the recap, and every other answer is kept as it was.
   */
  editStep: (step: BookingStep) => void
  /** Sends the booking. */
  confirm: () => void
  /** Retries what failed: the slots query on the slot step, the booking anywhere else. */
  retry: () => void
}

/** Steps whose answer is a free-text field. */
const TEXT_STEPS: Readonly<Partial<Record<BookingStep, 'need' | 'firstName' | 'lastName' | 'email' | 'phone'>>> = {
  [BOOKING_STEPS.need]: 'need',
  [BOOKING_STEPS.firstName]: 'firstName',
  [BOOKING_STEPS.lastName]: 'lastName',
  [BOOKING_STEPS.email]: 'email',
  [BOOKING_STEPS.phone]: 'phone',
}

/** Optional steps, the ones the visitor may leave unanswered. */
const OPTIONAL_STEPS: readonly BookingStep[] = [BOOKING_STEPS.phone, BOOKING_STEPS.structure, BOOKING_STEPS.role]

/**
 * Field label of every question step, in the order the flow asks them.
 *
 * The chooser reads this list, not the recap rows: a skipped optional question has no row, and still
 * has to be reachable. The consent is not a question and never appears here.
 */
const QUESTION_FIELDS: readonly BookingEditChoice[] = [
  { key: BOOKING_STEPS.need, label: chatbot.booking.steps.need.field },
  { key: BOOKING_STEPS.slot, label: chatbot.booking.steps.slot.field },
  { key: BOOKING_STEPS.firstName, label: chatbot.booking.steps.firstName.field },
  { key: BOOKING_STEPS.lastName, label: chatbot.booking.steps.lastName.field },
  { key: BOOKING_STEPS.email, label: chatbot.booking.steps.email.field },
  { key: BOOKING_STEPS.phone, label: chatbot.booking.steps.phone.field },
  { key: BOOKING_STEPS.structure, label: chatbot.booking.steps.structure.field },
  { key: BOOKING_STEPS.role, label: chatbot.booking.steps.role.field },
]

/** The empty flow, before any answer. */
const EMPTY_ANSWERS: BookingAnswers = {
  need: '',
  slot: null,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  structure: null,
  role: null,
}

/** Arguments of {@link buildScript}. */
type ScriptInput = {
  /** True once the visitor accepted the consent. */
  consentAccepted: boolean
  /** Answers already given. */
  answers: BookingAnswers
  /** Furthest step the visitor reached, which only ever moves forward. */
  furthest: BookingStep
  /** Answers allowed on the chip steps. */
  slotLabels: readonly string[]
  /** Slots known to the flow, indexed like `slotLabels`. */
  slots: readonly BookingSlot[]
  /** True once the booking is confirmed. */
  booked: boolean
}

/** Step index used for the ordering rules, with the confirmation counted as the recap. */
const orderOf = (step: BookingStep): number =>
  STEP_ORDER.indexOf(step === BOOKING_STEPS.done ? BOOKING_STEPS.recap : step)

/**
 * Builds the whole transcript the flow will show, before any pacing.
 *
 * A line exists only once it can be true: the consent message until the consent is accepted, then
 * every question whose step was reached, each followed by the answer actually given. A step that was
 * never reached contributes nothing, so the need and slot questions cannot appear together.
 */
const buildScript = ({
  consentAccepted,
  answers,
  furthest,
  slotLabels,
  slots,
  booked,
}: ScriptInput): readonly BookingScriptEntry[] => {
  const entries: BookingScriptEntry[] = [
    { key: 'intro', speaker: 'assistant', template: chatbot.booking.intro, gating: null },
    { key: 'consent', speaker: 'assistant', template: chatbot.consent.message, gating: BOOKING_STEPS.consent },
  ]

  if (!consentAccepted) return entries

  const reached = (step: BookingStep): boolean => orderOf(furthest) >= orderOf(step)
  const slotLabel =
    answers.slot === null ? undefined : slotLabels[slots.findIndex((slot) => slot.start === answers.slot)]

  entries.push({ key: 'consent-answer', speaker: 'visitor', template: chatbot.consent.accept, gating: null })
  entries.push({ key: 'consent-accepted', speaker: 'assistant', template: chatbot.consent.accepted, gating: null })

  if (reached(BOOKING_STEPS.need)) {
    entries.push({
      key: 'need-question',
      speaker: 'assistant',
      template: chatbot.booking.steps.need.question,
      gating: BOOKING_STEPS.need,
    })
    if (answers.need.trim() !== '') {
      entries.push({ key: 'need-answer', speaker: 'visitor', template: answers.need.trim(), gating: null })
    }
  }

  if (reached(BOOKING_STEPS.slot)) {
    entries.push({
      key: 'slot-question',
      speaker: 'assistant',
      template: chatbot.booking.steps.slot.question,
      gating: BOOKING_STEPS.slot,
    })
    if (slotLabel !== undefined && slotLabel !== '') {
      entries.push({ key: 'slot-answer', speaker: 'visitor', template: slotLabel, gating: null })
    }
  }

  if (reached(BOOKING_STEPS.firstName)) {
    entries.push({
      key: 'identity-intro',
      speaker: 'assistant',
      template: chatbot.booking.identityIntro,
      gating: null,
    })
  }

  const identitySteps: readonly {
    readonly step: BookingStep
    readonly key: 'firstName' | 'lastName' | 'email' | 'phone'
    readonly question: string
  }[] = [
    { step: BOOKING_STEPS.firstName, key: 'firstName', question: chatbot.booking.steps.firstName.question },
    { step: BOOKING_STEPS.lastName, key: 'lastName', question: chatbot.booking.steps.lastName.question },
    { step: BOOKING_STEPS.email, key: 'email', question: chatbot.booking.steps.email.question },
    { step: BOOKING_STEPS.phone, key: 'phone', question: chatbot.booking.steps.phone.question },
  ]

  for (const { step: textStep, key, question } of identitySteps) {
    if (!reached(textStep)) continue

    entries.push({ key: `${textStep}-question`, speaker: 'assistant', template: question, gating: textStep })
    const answer = answers[key].trim()
    if (answer !== '') entries.push({ key: `${textStep}-answer`, speaker: 'visitor', template: answer, gating: null })
  }

  const chipSteps: readonly {
    readonly step: BookingStep
    readonly key: 'structure' | 'role'
    readonly question: string
  }[] = [
    { step: BOOKING_STEPS.structure, key: 'structure', question: chatbot.booking.steps.structure.question },
    { step: BOOKING_STEPS.role, key: 'role', question: chatbot.booking.steps.role.question },
  ]

  for (const { step: chipStep, key, question } of chipSteps) {
    if (!reached(chipStep)) continue

    entries.push({ key: `${chipStep}-question`, speaker: 'assistant', template: question, gating: chipStep })
    const answer = answers[key]
    if (answer !== null) entries.push({ key: `${chipStep}-answer`, speaker: 'visitor', template: answer, gating: null })
  }

  if (booked) {
    entries.push({
      key: 'booking-confirmed',
      speaker: 'assistant',
      template: interpolate(chatbot.booking.success.message, {
        firstName: answers.firstName.trim(),
        slot: slotLabel ?? '',
      }),
      gating: BOOKING_STEPS.done,
    })
  }

  return entries
}

/**
 * Owns the booking flow: its answers, its step, its transcript, its pacing and its requests.
 *
 * The answers never enter the assistant conversation: the flow keeps its own state, builds its own
 * transcript from it, and the only two endpoints it calls are the booking ones. Typed text is a
 * draft until a valid submit turns it into an answer, so the transcript only ever holds what the
 * visitor really sent. The transcript is revealed one message at a time, with a short pause before
 * each assistant message, and the controls of a step appear only once its question is on screen. A
 * cancelled or refused flow is dropped with its state, and a request in flight is aborted when the
 * flow unmounts.
 *
 * @returns The state to render and the actions that move the flow.
 */
export const useBookingFlow = (): BookingFlow => {
  const [step, setStep] = useState<BookingStep>(BOOKING_STEPS.consent)
  const [furthest, setFurthest] = useState<BookingStep>(BOOKING_STEPS.consent)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [answers, setAnswers] = useState<BookingAnswers>(EMPTY_ANSWERS)
  const [draft, setDraft] = useState('')
  const [booked, setBooked] = useState(false)
  /**
   * True while the visitor is changing one answer from the recap: the step they reopened then leads
   * back to the recap instead of walking the rest of the flow again.
   */
  const [editing, setEditing] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [status, setStatus] = useState<BookingFlowStatus>('idle')
  const [error, setError] = useState<BookingFlowError | null>(null)
  const [fieldError, setFieldError] = useState<'empty' | 'invalid' | null>(null)
  const [slots, setSlots] = useState<readonly BookingSlot[]>([])
  const [honeypot, setHoneypot] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const slotLabels = useMemo(() => slots.map((slot) => formatSlotLabel(slot, BOOKING_RULES)), [slots])

  const script = useMemo(
    () => buildScript({ consentAccepted, answers, furthest, slotLabels, slots, booked }),
    [answers, booked, consentAccepted, furthest, slotLabels, slots],
  )

  /**
   * Reveals the next line of the script after its pause.
   *
   * One line at a time, and one timer: a visitor line follows immediately, an assistant line comes
   * after {@link BOOKING_TYPING_DELAY_MS} of typing indicator. When the visitor asked for less
   * motion the whole script is revealed at once, without any pause. Nothing is scheduled when the
   * script is fully shown, and the timer dies with the flow.
   */
  useEffect(() => {
    const next = script[revealed]
    if (next === undefined) return

    const delay = reducedMotion || next.speaker === 'visitor' ? 0 : BOOKING_TYPING_DELAY_MS
    const timer = setTimeout(() => {
      setRevealed((count) => (reducedMotion ? script.length : count + 1))
    }, delay)

    return () => clearTimeout(timer)
  }, [reducedMotion, revealed, script])

  const entries = useMemo(
    () => script.slice(0, revealed).map(({ key, speaker, template }) => ({ key, speaker, template })),
    [revealed, script],
  )

  const typing = !reducedMotion && revealed < script.length && script[revealed]?.speaker === 'assistant'
  const questionIndex = script.findIndex((entry) => entry.gating === step)
  const stepReady =
    step === BOOKING_STEPS.recap || step === BOOKING_STEPS.done
      ? revealed >= script.length
      : questionIndex !== -1 && revealed > questionIndex

  /**
   * Loads the free slots.
   *
   * @param keepError True when the caller already shows a failure (a slot taken between two
   * confirmations) that must survive the reload.
   */
  const loadSlots = useCallback(async (keepError: boolean): Promise<void> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading-slots')
    if (!keepError) setError(null)

    try {
      const response = await fetch('/api/booking/slots', { signal: controller.signal })
      const payload: unknown = response.ok ? await response.json().catch(() => null) : null
      if (!response.ok || !isBookingSlotsResponse(payload)) {
        if (!keepError) setError('slots-unavailable')
        return
      }

      setSlots(payload.slots)
    } catch {
      if (controller.signal.aborted) return
      if (!keepError) setError('network')
    } finally {
      if (!controller.signal.aborted) setStatus('idle')
    }
  }, [])

  const fieldValue = draft

  const canContinue = useMemo(() => {
    if (TEXT_STEPS[step] === undefined) return true
    return draft.trim() !== ''
  }, [draft, step])

  const canConfirm = useMemo(
    () => consentAccepted && slots.some((slot) => slot.start === answers.slot),
    [answers.slot, consentAccepted, slots],
  )

  const goToStep = useCallback(
    (next: BookingStep): void => {
      setStep(next)
      setFurthest((current) => (orderOf(next) > orderOf(current) ? next : current))
      setFieldError(null)
      setError(null)
      // The availability is asked for when the visitor arrives on the slot step, and never before
      // the consent is accepted: no calendar call happens for a flow that stops at the consent.
      if (next === BOOKING_STEPS.slot) void loadSlots(false)
    },
    [loadSlots],
  )

  const advance = useCallback(
    (from: BookingStep): void => {
      if (editing) {
        setEditing(false)
        goToStep(BOOKING_STEPS.recap)
        return
      }

      const index = STEP_ORDER.indexOf(from)
      goToStep(STEP_ORDER[index + 1] ?? BOOKING_STEPS.recap)
    },
    [editing, goToStep],
  )

  const setFieldValue = useCallback((value: string): void => {
    setDraft(value)
    setFieldError(null)
  }, [])

  const commit = useCallback((step: BookingStep, value: string | null): void => {
    setAnswers((current) => {
      switch (step) {
        case BOOKING_STEPS.need:
          return { ...current, need: value ?? '' }
        case BOOKING_STEPS.firstName:
          return { ...current, firstName: value ?? '' }
        case BOOKING_STEPS.lastName:
          return { ...current, lastName: value ?? '' }
        case BOOKING_STEPS.email:
          return { ...current, email: value ?? '' }
        case BOOKING_STEPS.phone:
          return { ...current, phone: value ?? '' }
        case BOOKING_STEPS.structure:
          return { ...current, structure: value }
        case BOOKING_STEPS.role:
          return { ...current, role: value }
        default:
          return current
      }
    })
  }, [])

  const submitStep = useCallback((): void => {
    if (step === BOOKING_STEPS.email) {
      const problem = getBookingEmailError(draft)
      if (problem !== null) {
        setFieldError(problem)
        return
      }
    }
    if (step === BOOKING_STEPS.phone) {
      const problem = getBookingPhoneError(draft)
      if (problem !== null) {
        setFieldError(problem)
        return
      }
    }
    if (step === BOOKING_STEPS.slot) return

    const key = TEXT_STEPS[step]
    if (key !== undefined) {
      const value = draft.trim()
      if (value === '') return
      commit(step, value)
      setDraft('')
    }

    advance(step)
  }, [advance, commit, draft, step])

  const blurStep = useCallback((): void => {
    if (step !== BOOKING_STEPS.phone && step !== BOOKING_STEPS.email) return

    // An empty value stays quiet on both, and clears anything a previous value left: the phone is
    // optional, and the e-mail, required, reports that on submit.
    if (draft.trim() === '') {
      setFieldError(null)
      return
    }

    // The same rule as the submit decides the rest. The draft stays a draft, so the transcript gains
    // nothing and the step does not move.
    setFieldError(step === BOOKING_STEPS.phone ? getBookingPhoneError(draft) : getBookingEmailError(draft))
  }, [draft, step])

  const skipStep = useCallback((): void => {
    if (!OPTIONAL_STEPS.includes(step)) return

    commit(step, step === BOOKING_STEPS.phone ? '' : null)
    setDraft('')
    advance(step)
  }, [advance, commit, step])

  const chooseOption = useCallback(
    (value: string): void => {
      if (step !== BOOKING_STEPS.structure && step !== BOOKING_STEPS.role) return

      commit(step, value)
      advance(step)
    },
    [advance, commit, step],
  )

  const chooseSlot = useCallback(
    (slot: BookingSlot): void => {
      setAnswers((current) => ({ ...current, slot: slot.start }))
      advance(BOOKING_STEPS.slot)
    },
    [advance],
  )

  const acceptConsent = useCallback((): void => {
    setConsentAccepted(true)
    advance(BOOKING_STEPS.consent)
  }, [advance])

  const confirm = useCallback(async (): Promise<void> => {
    const slot = slots.find((candidate) => candidate.start === answers.slot)
    if (!consentAccepted || slot === undefined) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('confirming')
    setError(null)

    const phone = answers.phone.trim()
    const body = {
      // Consent is a literal `true`: the instant is stamped by the server when it receives the
      // booking, never taken from this payload.
      consent: true,
      [BOOKING_HONEYPOT_FIELD]: honeypot,
      need: answers.need.trim(),
      slot: slot.start,
      firstName: answers.firstName.trim(),
      lastName: answers.lastName.trim(),
      email: answers.email.trim(),
      ...(phone === '' ? {} : { phone }),
      ...(answers.structure === null ? {} : { structure: answers.structure }),
      ...(answers.role === null ? {} : { role: answers.role }),
    }

    try {
      const response = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const payload: unknown = await response.json().catch(() => null)

      if (response.ok && isBookingSuccessResponse(payload)) {
        setBooked(true)
        setStep(BOOKING_STEPS.done)
        setFurthest(BOOKING_STEPS.recap)
        return
      }

      const code: BookingErrorCode | null = isBookingErrorResponse(payload) ? payload.error : null
      if (code === 'slot-taken') {
        setError('slot-taken')
        setStep(BOOKING_STEPS.slot)
        await loadSlots(true)
        return
      }

      setError(code === 'rate-limited' ? 'rate-limited' : 'booking')
    } catch {
      if (controller.signal.aborted) return
      setError('network')
    } finally {
      if (!controller.signal.aborted) setStatus('idle')
    }
  }, [answers, consentAccepted, honeypot, loadSlots, slots])

  const retry = useCallback((): void => {
    if (step === BOOKING_STEPS.slot) {
      void loadSlots(false)
      return
    }
    void confirm()
  }, [confirm, loadSlots, step])

  const editStep = useCallback(
    (next: BookingStep): void => {
      const key = TEXT_STEPS[next]
      setDraft(key === undefined ? '' : answers[key])
      setEditing(true)
      goToStep(next)
    },
    [answers, goToStep],
  )

  const recap = useMemo((): readonly BookingRecapRow[] => {
    const rows: BookingRecapRow[] = []

    if (answers.need.trim() !== '')
      rows.push({ key: 'need', label: chatbot.booking.steps.need.field, value: answers.need.trim() })

    const slotIndex = slots.findIndex((slot) => slot.start === answers.slot)
    const slotLabel = slotIndex === -1 ? undefined : slotLabels[slotIndex]
    if (slotLabel !== undefined) {
      rows.push({ key: 'slot', label: chatbot.booking.steps.slot.field, value: slotLabel })
    }

    const textRows: readonly {
      readonly key: 'firstName' | 'lastName' | 'email' | 'phone' | 'structure' | 'role'
      readonly label: string
    }[] = [
      { key: 'firstName', label: chatbot.booking.steps.firstName.field },
      { key: 'lastName', label: chatbot.booking.steps.lastName.field },
      { key: 'email', label: chatbot.booking.steps.email.field },
      { key: 'phone', label: chatbot.booking.steps.phone.field },
      { key: 'structure', label: chatbot.booking.steps.structure.field },
      { key: 'role', label: chatbot.booking.steps.role.field },
    ]

    for (const { key, label } of textRows) {
      const value = answers[key]
      if (value !== null && value.trim() !== '') rows.push({ key, label, value: value.trim() })
    }

    return rows
  }, [answers, slotLabels, slots])

  return {
    step,
    entries,
    typing,
    stepReady,
    status,
    error,
    fieldValue,
    fieldError,
    slots,
    slotLabels,
    recap,
    editChoices: QUESTION_FIELDS,
    canContinue,
    canConfirm,
    honeypot,
    questionNumber: BOOKING_QUESTION_STEPS.indexOf(step) + 1,
    setFieldValue,
    setHoneypot,
    acceptConsent,
    submitStep,
    chooseOption,
    blurStep,
    skipStep,
    chooseSlot,
    editStep,
    confirm: () => void confirm(),
    retry,
  }
}
