'use client'

/*
 * Contact form: the client island of the contact page.
 *
 * Every string comes from `locales/fr/contact.ts` and every colour, radius and length from a
 * `--softn-*` token. The form validates on touch: a problem is shown 1000 ms after the last
 * keystroke and after a field is left, and at once when the subject is picked; an invalid submit
 * reveals everything and focuses the first field to fix. The anti-bot check is the Altcha widget, loaded
 * as its own chunk; the honeypot and the minimum fill time answer a bot with the success state
 * before anything else, so a bot learns nothing from the answer.
 *
 * The submission posts the answers as JSON to the contact Route Handler, which stores the lead
 * before sending anything. A failure keeps the answers on screen, offers a retry, and never promises
 * an e-mail: only the success state does, and only once the message was stored.
 */

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@components/ui/Button'
import { interpolate } from '@/lib/interpolate'
import { SITE_ROUTES } from '@/lib/routes'
import { interpolateSegments } from '@/lib/text/interpolateSegments'
import { contact } from '@/locales/fr/contact'
import {
  CONTACT_FIELDS,
  CONTACT_HONEYPOT_FIELD,
  CONTACT_MESSAGE_MIN_LENGTH,
  CONTACT_SUBJECTS,
  isContactSubmissionTooFast,
  type ContactSubject,
} from '@/schemas/contactLimits'
import type { ContactAltchaState } from './ContactAltcha'
import {
  contactProblemsOf,
  firstInvalidFieldOf,
  useContactFields,
  type ContactFieldName,
  type ContactProblem,
} from './hooks/useContactFields'
import { useContactSubmission, type ContactSubmissionError } from './hooks/useContactSubmission'
import styles from './styles/ContactForm.module.css'

/**
 * The anti-bot widget: a sizeable chunk of its own, which arrives after hydration so the page's
 * JavaScript stays small. It renders nothing on the server, and its group reserves the height, so
 * the wait costs no layout shift.
 */
const ContactAltcha = dynamic(() => import('./ContactAltcha').then((module) => module.ContactAltcha), {
  ssr: false,
  loading: () => null,
})

/** Subjects of the select, in the order the copy lists them. */
const SUBJECT_OPTIONS: ReadonlyArray<{ readonly code: ContactSubject; readonly label: string }> = CONTACT_SUBJECTS.map(
  (code) => ({ code, label: contact.form.subject.options[code] }),
)

/** Wording of each state the widget reports; the unverified state says nothing. */
const ALTCHA_ANNOUNCEMENTS: Readonly<Record<ContactAltchaState, string>> = {
  unverified: '',
  verifying: contact.a11y.altcha.verifying,
  verified: contact.a11y.altcha.verified,
  error: contact.a11y.altcha.error,
  expired: contact.a11y.altcha.expired,
}

/** Body of the failure the form shows, by the failure it read from the submission. */
const FAILURE_BODIES: Readonly<Record<ContactSubmissionError, string>> = {
  generic: contact.error.generic.body,
  network: contact.error.network.body,
  'rate-limit': contact.error.rateLimit.body,
  unavailable: contact.fallback.unavailable,
}

/**
 * What the live region announces: the submission in progress, the failure, or the state of the
 * anti-bot check. Nothing once the message was accepted — the screen announces that itself.
 */
const announcementOf = ({
  sending,
  failed,
  altchaState,
}: {
  sending: boolean
  failed: boolean
  altchaState: ContactAltchaState
}): string => {
  if (sending) return contact.status.sending.ariaLabel
  if (failed) return contact.a11y.status.error

  return ALTCHA_ANNOUNCEMENTS[altchaState]
}

/**
 * Reads the payload the widget wrote into the form, or an empty string while it is unsolved.
 *
 * The widget associates its hidden input with the form, so the payload is read the same way a
 * browser would submit it.
 */
const readAltchaPayload = (form: HTMLFormElement): string => {
  const value = new FormData(form).get(CONTACT_FIELDS.altcha)
  return typeof value === 'string' ? value : ''
}

/** True when the value of the select is one of the subjects the form offers. */
const isContactSubject = (value: string): value is ContactSubject =>
  CONTACT_SUBJECTS.some((subject) => subject === value)

/** Message of one problem, from the copy. */
const problemMessageOf = (name: ContactFieldName, problem: ContactProblem): string => {
  switch (name) {
    case 'firstName':
      return contact.errors.firstName.required
    case 'lastName':
      return contact.errors.lastName.required
    case 'email':
      return problem === 'empty' ? contact.errors.email.required : contact.errors.email.invalid
    case 'subject':
      return contact.errors.subject.required
    case 'message':
      return problem === 'empty'
        ? contact.errors.message.required
        : interpolate(contact.errors.message.tooShort, { min: String(CONTACT_MESSAGE_MIN_LENGTH) })
    case 'consent':
      return contact.errors.consent
  }
}

/**
 * One sentence of the copy whose `{privacyLink}` placeholder is the link to the privacy policy.
 *
 * The sentence stays one locale string: only the placeholder is rendered as an anchor.
 */
const PrivacySentence = ({ template }: { template: string }) => (
  <>
    {interpolateSegments(template, { privacyLink: contact.consent.privacyLink.label }).map((segment, index) =>
      segment.kind === 'placeholder' ? (
        <Link key={index} href={SITE_ROUTES.privacyPolicy} className={styles.link}>
          {segment.value}
        </Link>
      ) : (
        segment.value
      ),
    )}
  </>
)

/** Props of the private field component below. */
type ContactFieldProps = {
  /** Id of the control, scoped to this form so it can never collide with another page element. */
  readonly id: string
  /** Field the control belongs to; used to register it, never as an id. */
  readonly name: ContactFieldName
  /** Accessible label, from the copy. */
  readonly label: string
  /** Placeholder, from the copy. */
  readonly placeholder: string
  /** Help text, from the copy; it becomes the control's description when there is no error. */
  readonly help: string | undefined
  /** Error message to show, or `null`. */
  readonly error: string | null
  /** Current value. */
  readonly value: string
  /** Hint the browser autofills from. */
  readonly autoComplete: string
  /** Whether the control is a textarea rather than an input. */
  readonly multiline?: boolean | undefined
  /** Id of the error paragraph. */
  readonly errorId: string
  /** Id of the help paragraph. */
  readonly helpId: string
  /** Called on every keystroke. */
  readonly onChange: (value: string) => void
  /** Called when the control loses focus. */
  readonly onBlur: () => void
  /** Registers the control so the form can focus it. */
  readonly register: (name: ContactFieldName, element: HTMLElement | null) => void
}

/**
 * One labelled field of the contact form, with its help text, its error and its accessibility wiring.
 *
 * The error is announced by `role="alert"`, and the control points at it through `aria-describedby`
 * while marking itself invalid, so a screen reader reads the message with the field it belongs to.
 */
const ContactField = ({
  id,
  name,
  label,
  placeholder,
  help,
  error,
  value,
  autoComplete,
  multiline,
  errorId,
  helpId,
  onChange,
  onBlur,
  register,
}: ContactFieldProps) => {
  const registerRef = useCallback(
    (element: HTMLElement | null): void => {
      register(name, element)
    },
    [name, register],
  )

  const describedBy = error === null ? (help === undefined ? undefined : helpId) : errorId
  const controlClassName = `${multiline === true ? styles.textarea : styles.input} ${
    error === null ? '' : styles['input-error']
  }`

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={`${styles.label} ${styles.required}`}>
        {label}
      </label>
      {multiline === true ? (
        <textarea
          id={id}
          ref={registerRef}
          placeholder={placeholder}
          value={value}
          required
          aria-invalid={error === null ? undefined : true}
          aria-describedby={describedBy}
          className={controlClassName}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <input
          id={id}
          ref={registerRef}
          type="text"
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          required
          aria-invalid={error === null ? undefined : true}
          aria-describedby={describedBy}
          className={controlClassName}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      )}
      {error !== null ? (
        <span id={errorId} role="alert" className={styles.error}>
          {error}
        </span>
      ) : help === undefined ? null : (
        <span id={helpId} className={styles.help}>
          {help}
        </span>
      )}
    </div>
  )
}

/**
 * Form of the contact page.
 *
 * The confirmation is not this island's to render: once the message is accepted — or once a bot was
 * answered with a fake success — the form reports the visitor's first name through {@link onSent} and
 * leaves the screen to replace the heading, the intro and this form.
 *
 * @param props Callback the screen gives the form to report an accepted message.
 * @returns The form, while no message was accepted.
 */
export const ContactForm = ({ onSent }: { readonly onSent: (firstName: string) => void }) => {
  const formId = useId()
  const fields = useContactFields()
  const submission = useContactSubmission()
  const [altchaState, setAltchaState] = useState<ContactAltchaState>('unverified')
  const [altchaProblem, setAltchaProblem] = useState(false)
  const [altchaResetToken, setAltchaResetToken] = useState(0)

  const formRef = useRef<HTMLFormElement | null>(null)
  const honeypotRef = useRef<HTMLInputElement | null>(null)
  const mountedAtRef = useRef<number | null>(null)
  const altchaGroupRef = useRef<HTMLDivElement | null>(null)
  const fieldRefs = useRef(new Map<ContactFieldName, HTMLElement>())

  useEffect(() => {
    mountedAtRef.current = Date.now()
  }, [])

  const registerField = useCallback((name: ContactFieldName, element: HTMLElement | null): void => {
    if (element === null) {
      fieldRefs.current.delete(name)
      return
    }
    fieldRefs.current.set(name, element)
  }, [])

  const sending = submission.status === 'sending'

  const problemOf = (name: ContactFieldName): string | null => {
    const problem = fields.shown[name]
    return problem === undefined ? null : problemMessageOf(name, problem)
  }

  /** Sends the message as the form stands, and resets the anti-bot check when the server refused it. */
  const submit = useCallback(async (): Promise<void> => {
    const form = formRef.current
    if (form === null) return

    // A bot is answered before anything else, and with the success state: the honeypot and a form
    // filled in under the minimum delay are the two signals a visitor never produces.
    const honeypot = honeypotRef.current?.value ?? ''
    const renderedAt = mountedAtRef.current
    if (honeypot !== '' || (renderedAt !== null && isContactSubmissionTooFast(String(renderedAt), Date.now()))) {
      onSent(fields.values.firstName.trim())
      return
    }

    const altchaPayload = readAltchaPayload(form)
    const firstInvalid = firstInvalidFieldOf(contactProblemsOf(fields.values))
    const altchaMissing = altchaPayload === ''

    if (firstInvalid !== null || altchaMissing) {
      fields.revealAll()
      setAltchaProblem(altchaMissing)
      if (firstInvalid === null) {
        altchaGroupRef.current?.focus()
      } else {
        fieldRefs.current.get(firstInvalid)?.focus()
      }
      return
    }

    setAltchaProblem(false)
    const firstName = fields.values.firstName.trim()
    const outcome = await submission.send({
      firstName,
      lastName: fields.values.lastName.trim(),
      email: fields.values.email.trim(),
      subject: fields.values.subject,
      message: fields.values.message.trim(),
      // Consent is a literal `true`: the instant is stamped by the server when it receives the
      // message, never taken from this payload.
      consent: true,
      [CONTACT_HONEYPOT_FIELD]: honeypot,
      renderedAt: renderedAt === null ? '' : String(renderedAt),
      altcha: altchaPayload,
    })

    if (outcome.ok) {
      onSent(firstName)
      return
    }

    // The route claims the payload before it stores the message, so every failure except the rate
    // limit — the only one answered before the verification — leaves the payload spent: the widget
    // must solve a new challenge before the visitor can send again.
    if (outcome.error !== 'rate-limited') setAltchaResetToken((token) => token + 1)
  }, [fields, onSent, submission])

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void submit()
  }

  const announcement = announcementOf({ sending, failed: submission.error !== null, altchaState })
  const altchaErrorMessage = altchaProblem ? contact.errors.altcha.required : null
  const failureMessage = submission.error === null ? null : FAILURE_BODIES[submission.error]
  const subjectError = problemOf('subject')
  const consentError = problemOf('consent')
  // Validity is read from the values, whatever the visitor has touched: the errors still appear on
  // the timing rules alone, while the button tells the whole form's state from the start.
  const complete = firstInvalidFieldOf(contactProblemsOf(fields.values)) === null && altchaState === 'verified'

  return (
    <div className={styles.form}>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <form
        id={formId}
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        aria-label={contact.form.ariaLabel}
        aria-busy={sending}
        className={styles['form-fields']}
      >
        <p id={`${formId}-required-note`} className={styles.note}>
          {contact.form.requiredNote}
        </p>

        <div className={styles.grid}>
          <ContactField
            id={`${formId}-firstName`}
            name="firstName"
            label={contact.form.firstName.label}
            placeholder={contact.form.firstName.placeholder}
            help={undefined}
            error={problemOf('firstName')}
            value={fields.values.firstName}
            autoComplete="given-name"
            errorId={`${formId}-firstName-error`}
            helpId={`${formId}-firstName-help`}
            onChange={(value) => fields.setText('firstName', value)}
            onBlur={() => fields.checkOnBlur('firstName')}
            register={registerField}
          />
          <ContactField
            id={`${formId}-lastName`}
            name="lastName"
            label={contact.form.lastName.label}
            placeholder={contact.form.lastName.placeholder}
            help={undefined}
            error={problemOf('lastName')}
            value={fields.values.lastName}
            autoComplete="family-name"
            errorId={`${formId}-lastName-error`}
            helpId={`${formId}-lastName-help`}
            onChange={(value) => fields.setText('lastName', value)}
            onBlur={() => fields.checkOnBlur('lastName')}
            register={registerField}
          />
        </div>

        <ContactField
          id={`${formId}-email`}
          name="email"
          label={contact.form.email.label}
          placeholder={contact.form.email.placeholder}
          help={contact.form.email.help}
          error={problemOf('email')}
          value={fields.values.email}
          autoComplete="email"
          errorId={`${formId}-email-error`}
          helpId={`${formId}-email-help`}
          onChange={(value) => fields.setText('email', value)}
          onBlur={() => fields.checkOnBlur('email')}
          register={registerField}
        />

        <div className={styles.field}>
          <label htmlFor={`${formId}-subject`} className={`${styles.label} ${styles.required}`}>
            {contact.form.subject.label}
          </label>
          <select
            id={`${formId}-subject`}
            ref={(element) => registerField('subject', element)}
            value={fields.values.subject}
            required
            aria-invalid={subjectError === null ? undefined : true}
            aria-describedby={subjectError === null ? undefined : `${formId}-subject-error`}
            className={`${styles.select} ${subjectError === null ? '' : styles['input-error']}`}
            onChange={(event) => fields.setSubject(isContactSubject(event.target.value) ? event.target.value : '')}
            onBlur={() => fields.checkOnBlur('subject')}
          >
            <option value="">{contact.form.subject.placeholder}</option>
            {SUBJECT_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          {subjectError === null ? null : (
            <span id={`${formId}-subject-error`} role="alert" className={styles.error}>
              {subjectError}
            </span>
          )}
        </div>

        {fields.values.subject === 'dataRequest' ? (
          <p className={styles['subject-help']}>
            <PrivacySentence template={contact.form.subject.dataRequest.help} />
          </p>
        ) : null}

        <ContactField
          id={`${formId}-message`}
          name="message"
          label={contact.form.message.label}
          placeholder={contact.form.message.placeholder}
          help={interpolate(contact.form.message.help, { min: String(CONTACT_MESSAGE_MIN_LENGTH) })}
          error={problemOf('message')}
          value={fields.values.message}
          autoComplete="off"
          multiline
          errorId={`${formId}-message-error`}
          helpId={`${formId}-message-help`}
          onChange={(value) => fields.setText('message', value)}
          onBlur={() => fields.checkOnBlur('message')}
          register={registerField}
        />

        <div className={styles.consent}>
          <p className={styles['consent-notice']}>
            <PrivacySentence template={contact.consent.notice} />
          </p>
          <div className={styles['consent-field']}>
            <input
              id={`${formId}-consent`}
              ref={(element) => registerField('consent', element)}
              type="checkbox"
              checked={fields.values.consent}
              required
              aria-invalid={consentError === null ? undefined : true}
              aria-describedby={consentError === null ? undefined : `${formId}-consent-error`}
              className={styles.checkbox}
              onChange={(event) => fields.setConsent(event.target.checked)}
            />
            <label htmlFor={`${formId}-consent`} className={`${styles['consent-label']} ${styles.required}`}>
              {contact.consent.checkbox.label}
            </label>
          </div>
          {consentError === null ? null : (
            <span id={`${formId}-consent-error`} role="alert" className={styles.error}>
              {consentError}
            </span>
          )}
        </div>

        <div
          ref={altchaGroupRef}
          role="group"
          tabIndex={-1}
          aria-labelledby={`${formId}-altcha-title`}
          // The group cannot be `required`: ARIA does not support `aria-required` on a group, and
          // the checkbox it holds belongs to the widget. The requirement travels on the description
          // instead, next to the help text, and on the message the group shows when it is missing.
          aria-describedby={`${formId}-required-note ${
            altchaErrorMessage === null ? `${formId}-altcha-help` : `${formId}-altcha-error`
          }`}
          className={styles.altcha}
        >
          <p id={`${formId}-altcha-title`} className={`${styles.label} ${styles.required}`}>
            {contact.form.altcha.title}
          </p>
          <div className={styles['altcha-mount']}>
            <ContactAltcha formId={formId} onStateChange={setAltchaState} resetToken={altchaResetToken} />
          </div>
          {altchaErrorMessage !== null ? (
            <span id={`${formId}-altcha-error`} role="alert" className={styles.error}>
              {altchaErrorMessage}
            </span>
          ) : (
            <span id={`${formId}-altcha-help`} className={styles.help}>
              {contact.form.altcha.help}
            </span>
          )}
        </div>

        <div className={styles.honeypot} aria-hidden="true">
          <label htmlFor={`${formId}-reference`}>{contact.form.honeypot.label}</label>
          <input
            ref={honeypotRef}
            id={`${formId}-reference`}
            name={CONTACT_HONEYPOT_FIELD}
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {failureMessage === null ? null : (
          <div className={styles.failure}>
            <p className={`${styles['failure-title']} font-display text-title-sm`}>{contact.error.generic.title}</p>
            <p className={styles['failure-body']}>{failureMessage}</p>
            <p className={styles['failure-kept']}>{contact.error.dataKept}</p>
            <Button size="lg" disabled={sending} onClick={() => void submit()}>
              {contact.error.retry}
            </Button>
          </div>
        )}

        <div className={styles.actions}>
          {/* Announced as disabled rather than natively disabled: the button keeps its focus and its
              place in the tab order, and activating it explains what is missing instead of doing
              nothing. `sending` is the only state that takes the click away for real. */}
          <Button
            type="submit"
            size="lg"
            disabled={sending}
            aria-disabled={sending || complete ? undefined : true}
            aria-describedby={sending || complete ? undefined : `${formId}-required-note`}
          >
            {sending ? contact.status.sending.label : contact.form.submit}
          </Button>
        </div>
      </form>
    </div>
  )
}
