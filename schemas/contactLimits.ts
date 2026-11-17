/*
 * Constants, plain types, client-side field checks and response guards of the contact API, with no
 * runtime dependency.
 *
 * This module is imported by the client island, so it must stay free of Zod: Zod v4 probes its JIT
 * support with `Function("")` at load time, which the production CSP (`script-src` without `eval`)
 * blocks. The Zod schemas live in `schemas/contact.ts`, on the server only, and reuse these
 * constants so both sides share one source of truth.
 */

/** Form field names of the contact form, shared by the client island and the Route Handler. */
export const CONTACT_FIELDS = {
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  subject: 'subject',
  message: 'message',
  consent: 'consent',
  honeypot: 'reference',
  renderedAt: 'renderedAt',
  /** Name the Altcha widget gives its hidden payload input, read as a form field on submit. */
  altcha: 'altcha',
} as const

/**
 * Name of the honeypot field. A field a visitor never sees: a client that fills it is not a visitor,
 * and the request is answered as if it had succeeded.
 */
export const CONTACT_HONEYPOT_FIELD = CONTACT_FIELDS.honeypot

/** Longest first or last name the form accepts, in characters. */
export const CONTACT_NAME_MAX_LENGTH = 100

/** Longest e-mail address the form accepts; RFC 5321 caps a full address at 254 characters. */
export const CONTACT_EMAIL_MAX_LENGTH = 254

/** Shortest message the form accepts, in characters; the copy shows it through `{min}`. */
export const CONTACT_MESSAGE_MIN_LENGTH = 10

/** Longest message the form accepts, in characters. */
export const CONTACT_MESSAGE_MAX_LENGTH = 5000

/** Longest Altcha payload the Route Handler reads, in characters. */
export const CONTACT_ALTCHA_MAX_LENGTH = 4000

/**
 * Lifetime of one Altcha challenge, in seconds.
 *
 * Long enough to fill the form, short enough that a solved payload cannot be kept and replayed
 * later. The challenge route signs it into the challenge, and the replay store gives a claim the
 * same lifetime, so a payload and its claim expire together.
 */
export const CONTACT_ALTCHA_TTL_SECONDS = 600

/** Subjects the form offers, in display order. The value is what travels to the Route Handler. */
export const CONTACT_SUBJECTS = ['project', 'quote', 'partnership', 'dataRequest', 'other'] as const

/** One subject of the contact form. */
export type ContactSubject = (typeof CONTACT_SUBJECTS)[number]

/**
 * Shortest delay between the form render and its submission, in milliseconds.
 *
 * A submission under it is answered like a success without reaching Baserow or the mail: a bot
 * learns nothing from the answer, and a visitor who autofills and sends immediately still lands
 * above it, because the delay is counted from the form's own mount.
 */
export const CONTACT_MIN_FILL_MS = 3000

/** Window of the contact rate limit, in milliseconds. */
export const CONTACT_RATE_LIMIT_WINDOW_MS = 600_000

/** Submissions accepted per client and per window. */
export const CONTACT_RATE_LIMIT_MAX_REQUESTS = 5

/**
 * Challenges served per client and per window, under their own counter namespace. Generous on
 * purpose: solving one costs the visitor a fraction of a second and the server one HMAC, and the
 * limit only exists so no client can pull challenges unbounded.
 */
export const CONTACT_CHALLENGE_RATE_LIMIT_MAX_REQUESTS = 60

/** Error codes of the contact Route Handler, mapped to locale copy by the UI. */
export const CONTACT_ERROR_CODES = ['invalid', 'rate-limited', 'unavailable'] as const

/** One error code of the contact Route Handler. */
export type ContactErrorCode = (typeof CONTACT_ERROR_CODES)[number]

/** Body of a `POST /api/contact` success answer. */
export type ContactSuccessResponse = {
  /** Always true: the message was stored, or the request was answered like a bot's. */
  sent: true
}

/** Generic error returned to the UI: it carries no submitted value and no upstream detail. */
export type ContactErrorResponse = {
  /** Generic error code, mapped to locale copy. */
  error: ContactErrorCode
}

/** Problem the form can report on one field, mapped to locale copy by the client. */
export type ContactFieldError = 'empty' | 'invalid' | 'tooShort'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Checks that a parsed JSON body is the `{ sent: true }` success answer.
 *
 * The server is same-origin and its contract is tested; this guard only keeps an unexpected body
 * (proxy error page, truncated response) from being read as a confirmation.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value confirms the message was accepted.
 */
export const isContactSuccessResponse = (value: unknown): value is ContactSuccessResponse =>
  isRecord(value) && value.sent === true

/**
 * Checks that a parsed JSON body is one of the generic `{ error }` shapes.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value carries a known error code.
 */
export const isContactErrorResponse = (value: unknown): value is ContactErrorResponse =>
  isRecord(value) && typeof value.error === 'string' && (CONTACT_ERROR_CODES as readonly string[]).includes(value.error)

/** Catches the typos worth reporting before a round trip; the server schema stays authoritative. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Checks the e-mail field before submitting, without Zod: the client bundle must not load it.
 *
 * Mirrors the server schema's first two failure modes only; the server re-validates everything it
 * stores. Surrounding whitespace is ignored, as the server trims before validating.
 *
 * @param value Raw field value.
 * @returns `empty` for a blank value, `invalid` for a malformed address, `null` when accepted.
 */
export const getContactEmailError = (value: string): ContactFieldError | null => {
  const trimmed = value.trim()
  if (trimmed === '') return 'empty'
  if (trimmed.length > CONTACT_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(trimmed)) return 'invalid'
  return null
}

/**
 * Checks the message field before submitting, without Zod.
 *
 * The length is measured on the trimmed value, like the server does, so a message made of blank
 * lines is refused rather than stored empty.
 *
 * @param value Raw field value.
 * @returns `empty` for a blank value, `tooShort` under the minimum, `null` when accepted.
 */
export const getContactMessageError = (value: string): ContactFieldError | null => {
  const trimmed = value.trim()
  if (trimmed === '') return 'empty'
  if (trimmed.length < CONTACT_MESSAGE_MIN_LENGTH) return 'tooShort'
  return null
}

/**
 * Checks a required single-line field before submitting, without Zod.
 *
 * @param value Raw field value.
 * @returns `empty` for a blank value, `null` when accepted.
 */
export const getContactRequiredError = (value: string): ContactFieldError | null =>
  value.trim() === '' ? 'empty' : null

/**
 * Whether a submission arrived sooner than the anti-spam delay allows.
 *
 * The timestamp is written by the client just before submission; a missing or malformed value (a
 * client that never mounted the form) never trips the check. A timestamp in the future is ignored
 * too, so a skewed client clock cannot block a real visitor. Both sides apply the rule: the client
 * answers the success state without a network call, and the Route Handler re-checks the value it
 * receives.
 *
 * @param renderedAt Timestamp the client wrote when the form mounted, as a string.
 * @param now Current time, in milliseconds.
 * @returns True when the submission is too fast to be a visitor's.
 */
export const isContactSubmissionTooFast = (renderedAt: string, now: number): boolean => {
  const timestamp = Number(renderedAt)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false

  const elapsed = now - timestamp
  return elapsed >= 0 && elapsed < CONTACT_MIN_FILL_MS
}
