'use client'

/*
 * Validation state of the contact form.
 *
 * Every interaction is checked on the same 1000 ms delay: a keystroke hides the message and restarts
 * the timer, and leaving a field schedules the same check instead of revealing anything at once. A
 * field the visitor never filled stays quiet until the submit, so tabbing through the form is not
 * scolded; a field that had content and was emptied shows its required message after the delay, even
 * while it keeps focus. The subject select is the exception, because picking an option is a complete
 * gesture: it validates on change. Nothing here is copy: a problem is a code, and the form maps it
 * to a locale string.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getContactEmailError,
  getContactMessageError,
  getContactRequiredError,
  type ContactFieldError,
  type ContactSubject,
} from '@/schemas/contactLimits'

/** Delay before a problem appears after a keystroke, in milliseconds. */
export const CONTACT_VALIDATION_DEBOUNCE_MS = 1000

/** Fields the form validates itself; the anti-bot check is validated by the form on submit. */
export type ContactFieldName = 'firstName' | 'lastName' | 'email' | 'subject' | 'message' | 'consent'

/** Fields in reading order, which is also the order the first invalid one is looked for in. */
export const CONTACT_FIELD_ORDER: readonly ContactFieldName[] = [
  'firstName',
  'lastName',
  'email',
  'subject',
  'message',
  'consent',
]

/** Values of the form, as the visitor typed them. */
export type ContactValues = {
  firstName: string
  lastName: string
  email: string
  /** Subject code, or an empty string while the select shows its placeholder. */
  subject: ContactSubject | ''
  message: string
  consent: boolean
}

/** Problem of one field, mapped to locale copy by the form. */
export type ContactProblem = ContactFieldError | 'consent'

/** Problems of the form, by field; a field without an entry is valid. */
export type ContactProblems = Partial<Record<ContactFieldName, ContactProblem>>

/** Values of a form no one has touched yet. */
export const EMPTY_CONTACT_VALUES: ContactValues = {
  firstName: '',
  lastName: '',
  email: '',
  subject: '',
  message: '',
  consent: false,
}

/**
 * Validates every field of the form.
 *
 * The rules are the ones the Route Handler enforces, read from the shared limits module: a required
 * name and subject, a well-formed address, a message of at least ten characters and an accepted
 * consent. The server re-validates everything it stores.
 *
 * @param values Values as the visitor typed them.
 * @returns The problem of every invalid field, by field name.
 */
export const contactProblemsOf = (values: ContactValues): ContactProblems => {
  const problems: ContactProblems = {}

  if (getContactRequiredError(values.firstName) !== null) problems.firstName = 'empty'
  if (getContactRequiredError(values.lastName) !== null) problems.lastName = 'empty'

  const emailProblem = getContactEmailError(values.email)
  if (emailProblem !== null) problems.email = emailProblem

  if (values.subject === '') problems.subject = 'empty'

  const messageProblem = getContactMessageError(values.message)
  if (messageProblem !== null) problems.message = messageProblem

  if (!values.consent) problems.consent = 'consent'

  return problems
}

/**
 * Reads the first field carrying a problem, in reading order.
 *
 * @param problems Problems of the form.
 * @returns The first invalid field, or `null` when the form is valid.
 */
export const firstInvalidFieldOf = (problems: ContactProblems): ContactFieldName | null =>
  CONTACT_FIELD_ORDER.find((name) => problems[name] !== undefined) ?? null

/** Copies the problems without the one of a field. */
const withoutField = (problems: ContactProblems, name: ContactFieldName): ContactProblems => {
  const next = { ...problems }
  delete next[name]
  return next
}

/** What the form reads from {@link useContactFields}. */
export type ContactFields = {
  /** Values as the visitor typed them. */
  readonly values: ContactValues
  /** Problems the visitor should see right now. */
  readonly shown: ContactProblems
  /** Updates a text field, hides its message and restarts its delay. */
  readonly setText: (name: 'firstName' | 'lastName' | 'email' | 'message', value: string) => void
  /** Updates the subject and validates it at once. */
  readonly setSubject: (value: ContactSubject | '') => void
  /** Updates the consent and reveals its message when it is withdrawn. */
  readonly setConsent: (value: boolean) => void
  /**
   * Schedules the delayed check of a field the visitor just left. A field never filled stays quiet
   * until the submit; a field that was emptied shows its required message after the delay.
   */
  readonly checkOnBlur: (name: ContactFieldName) => void
  /** Shows every problem, as a submit of an invalid form does. */
  readonly revealAll: () => void
}

/**
 * Holds the values of the contact form and decides when a problem is shown.
 *
 * @returns The values, the problems, the shown subset and the handlers the fields call.
 */
export const useContactFields = (): ContactFields => {
  const [values, setValues] = useState<ContactValues>(EMPTY_CONTACT_VALUES)
  const [shown, setShown] = useState<ContactProblems>({})
  const valuesRef = useRef(values)
  const touchedRef = useRef(new Set<ContactFieldName>())
  const timersRef = useRef(new Map<ContactFieldName, ReturnType<typeof setTimeout>>())

  const clearTimer = useCallback((name: ContactFieldName): void => {
    const timer = timersRef.current.get(name)
    if (timer !== undefined) {
      clearTimeout(timer)
      timersRef.current.delete(name)
    }
  }, [])

  // A field left with a pending timer must not keep the page alive after the form is gone.
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const hide = useCallback((name: ContactFieldName): void => {
    setShown((current) => withoutField(current, name))
  }, [])

  /** Shows the problem of one field as the values stand at this instant. */
  const show = useCallback((name: ContactFieldName): void => {
    const problem = contactProblemsOf(valuesRef.current)[name]
    setShown((current) => (problem === undefined ? withoutField(current, name) : { ...current, [name]: problem }))
  }, [])

  const write = useCallback((next: ContactValues): void => {
    valuesRef.current = next
    setValues(next)
  }, [])

  /**
   * Schedules the check of one field, 1000 ms from now.
   *
   * The timer is replaced, never stacked, so a keystroke restarts the delay and a field left with a
   * pending check only ever has one. A field the visitor never filled is left alone: the required
   * messages appear on the submit.
   */
  const scheduleCheck = useCallback(
    (name: ContactFieldName): void => {
      clearTimer(name)
      timersRef.current.set(
        name,
        setTimeout(() => {
          timersRef.current.delete(name)
          if (!touchedRef.current.has(name)) return
          show(name)
        }, CONTACT_VALIDATION_DEBOUNCE_MS),
      )
    },
    [clearTimer, show],
  )

  const setText = useCallback(
    (name: 'firstName' | 'lastName' | 'email' | 'message', value: string): void => {
      touchedRef.current.add(name)
      write({ ...valuesRef.current, [name]: value })
      hide(name)
      scheduleCheck(name)
    },
    [hide, scheduleCheck, write],
  )

  const setSubject = useCallback(
    (value: ContactSubject | ''): void => {
      touchedRef.current.add('subject')
      clearTimer('subject')
      write({ ...valuesRef.current, subject: value })
      show('subject')
    },
    [clearTimer, show, write],
  )

  const setConsent = useCallback(
    (value: boolean): void => {
      touchedRef.current.add('consent')
      write({ ...valuesRef.current, consent: value })
      if (value) {
        hide('consent')
        return
      }
      show('consent')
    },
    [hide, show, write],
  )

  const checkOnBlur = useCallback(
    (name: ContactFieldName): void => {
      scheduleCheck(name)
    },
    [scheduleCheck],
  )

  const revealAll = useCallback((): void => {
    for (const name of CONTACT_FIELD_ORDER) {
      clearTimer(name)
      touchedRef.current.add(name)
    }
    setShown(contactProblemsOf(valuesRef.current))
  }, [clearTimer])

  return { values, shown, setText, setSubject, setConsent, checkOnBlur, revealAll }
}
