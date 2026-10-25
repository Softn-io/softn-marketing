'use client'

import { Check } from 'lucide-react'
import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@components/ui/Button'
import { interpolate } from '@/lib/interpolate'
import { interpolateSegments } from '@/lib/text/interpolateSegments'
import { comingSoon } from '@/locales/fr/comingSoon'
import { WAITLIST_FIELDS, WAITLIST_MIN_DELAY_MS, type WaitlistAction, type WaitlistResult } from '@/schemas/waitlist'
import styles from './styles/WaitlistForm.module.css'

const { form } = comingSoon

/** Same shape the server-side Zod schema accepts; the server stays the source of truth. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldError = 'empty' | 'invalid'

const validateEmail = (value: string): FieldError | null => {
  const trimmed = value.trim()
  if (trimmed === '') return 'empty'
  if (!EMAIL_PATTERN.test(trimmed)) return 'invalid'
  return null
}

type WaitlistFormProps = {
  /** Server Action joining the waitlist, passed by the server component so this island stays server-import free. */
  action: WaitlistAction
}

/**
 * Waitlist form: e-mail field, client-side validation, anti-spam traps and the success state.
 *
 * The form posts to the Server Action through `useActionState`, so a submission still reaches the
 * server without JavaScript. Client-side checks mirror the server: an empty or malformed address is
 * shown on blur or submit, and a filled honeypot or a submit under two seconds answers with the
 * success state without a network call. The Server Action re-checks both signals.
 *
 * The success message needs the address to personalise it, so it renders once the controlled field
 * has a value; a no-JavaScript submission is still stored but keeps the form on screen.
 */
export const WaitlistForm = ({ action }: WaitlistFormProps) => {
  const [state, formAction, pending] = useActionState<WaitlistResult | null, FormData>(action, null)
  const [email, setEmail] = useState('')
  const [showFieldError, setShowFieldError] = useState(false)
  const [trapped, setTrapped] = useState(false)

  const startedAt = useRef<number | null>(null)
  const honeypotRef = useRef<HTMLInputElement>(null)
  const renderedAtRef = useRef<HTMLInputElement>(null)

  const fieldId = useId()
  const errorId = `${fieldId}-error`
  const reassuranceId = `${fieldId}-reassurance`
  const honeypotId = `${fieldId}-reference`

  useEffect(() => {
    startedAt.current = Date.now()
  }, [])

  const fieldError = showFieldError ? validateEmail(email) : null
  const serverError = state?.ok === false ? state.error : null
  const errorMessage =
    fieldError === 'empty'
      ? form.errorEmpty
      : fieldError === 'invalid' || serverError === 'invalid'
        ? form.errorInvalid
        : serverError === 'server'
          ? form.errorServer
          : null

  const isSent = (trapped || state?.ok === true) && email.trim() !== ''
  const successMessage = isSent ? interpolate(form.success, { email: email.trim() }) : ''
  const successSegments = isSent ? interpolateSegments(form.success, { email: email.trim() }) : []
  const announcement = pending ? form.submitBusy : (errorMessage ?? successMessage)

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    if (validateEmail(email) !== null) {
      event.preventDefault()
      setShowFieldError(true)
      return
    }

    const elapsed = startedAt.current === null ? null : Date.now() - startedAt.current
    const submittedTooFast = elapsed !== null && elapsed >= 0 && elapsed < WAITLIST_MIN_DELAY_MS
    if ((honeypotRef.current?.value ?? '') !== '' || submittedTooFast) {
      event.preventDefault()
      setTrapped(true)
      return
    }

    // The hidden value is written just before the browser serialises the form, so the Server
    // Action can re-check the delay; without JavaScript the field stays empty and is ignored.
    if (renderedAtRef.current !== null && startedAt.current !== null) {
      renderedAtRef.current.value = String(startedAt.current)
    }
  }

  const handleBlur = (): void => {
    if (email.trim() !== '') setShowFieldError(true)
  }

  return (
    <div className={styles.waitlist}>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {isSent ? (
        <p className={styles.success}>
          <span aria-hidden="true" className={styles['success-icon']}>
            <Check />
          </span>
          <span>
            {successSegments.map((segment, index) =>
              segment.kind === 'placeholder' ? <strong key={index}>{segment.value}</strong> : segment.value,
            )}
          </span>
        </p>
      ) : (
        <form action={formAction} onSubmit={handleSubmit} noValidate aria-busy={pending} className={styles.form}>
          <div className={styles.row}>
            <label htmlFor={fieldId} className="sr-only">
              {form.label}
            </label>
            <input
              id={fieldId}
              name={WAITLIST_FIELDS.email}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={form.placeholder}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setShowFieldError(false)
              }}
              onBlur={handleBlur}
              aria-invalid={errorMessage !== null ? true : undefined}
              aria-describedby={errorMessage !== null ? errorId : reassuranceId}
              className={`${styles.input} ${errorMessage !== null ? styles['input-error'] : ''}`}
            />
            <Button type="submit" size="lg" disabled={pending} className={styles.submit}>
              {pending ? form.submitBusy : form.submit}
            </Button>
          </div>
          <input ref={renderedAtRef} type="hidden" name={WAITLIST_FIELDS.renderedAt} defaultValue="" />
          <div className={styles.honeypot} aria-hidden="true">
            <label htmlFor={honeypotId}>{form.honeypotLabel}</label>
            <input
              ref={honeypotRef}
              id={honeypotId}
              name={WAITLIST_FIELDS.honeypot}
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          {errorMessage !== null ? (
            <p id={errorId} className={styles.error}>
              {errorMessage}
            </p>
          ) : (
            <p id={reassuranceId} className={styles.reassurance}>
              {form.reassurance}
            </p>
          )}
          <p className={styles.privacy}>{form.privacyNotice}</p>
        </form>
      )}
    </div>
  )
}
