/*
 * Constants, plain types and the client-side e-mail check of the waitlist, with no runtime
 * dependency.
 *
 * This module is imported by the client island, so it must stay free of Zod: Zod v4 probes its JIT
 * support with `Function("")` at load time, which the production CSP (`script-src` without `eval`)
 * blocks. The Zod schema lives in `schemas/waitlist.ts`, on the server only, and reuses these
 * constants so both sides share one source of truth.
 */

/** Form field names of the waitlist submission, shared by the client form and the Server Action. */
export const WAITLIST_FIELDS = {
  email: 'email',
  honeypot: 'reference',
  renderedAt: 'renderedAt',
} as const

/** Value stored in the Baserow `Source` field for every coming-soon waitlist record. */
export const WAITLIST_SOURCE = 'coming-soon'

/** Minimum delay between the form render and its submission, in milliseconds. */
export const WAITLIST_MIN_DELAY_MS = 2000

/** Longest e-mail address the waitlist accepts; RFC 5321 caps a full address at 254 characters. */
export const WAITLIST_EMAIL_MAX_LENGTH = 254

/**
 * Outcome of the waitlist Server Action. Never carries the submitted e-mail or a Baserow error
 * body: the client only needs to know which message to show.
 */
export type WaitlistResult = { ok: true } | { ok: false; error: 'invalid' | 'server' }

/** Signature of the waitlist Server Action, compatible with React's `useActionState`. */
export type WaitlistAction = (previous: WaitlistResult | null, formData: FormData) => Promise<WaitlistResult>

/** Problem the form can report on the e-mail field, mapped to locale copy by the client. */
export type WaitlistEmailError = 'empty' | 'invalid'

/** Catches the typos worth reporting before a round trip; the server schema stays authoritative. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Checks the e-mail field before submitting, without Zod: the client bundle must not load it.
 *
 * Mirrors the server schema's first two failure modes only; the server re-validates everything it
 * stores. Surrounding whitespace is ignored, as the server trims before validating.
 *
 * @param value Raw field value.
 * @returns `empty` for a blank value, `invalid` for a malformed address, `null` when accepted.
 */
export const getWaitlistEmailError = (value: string): WaitlistEmailError | null => {
  const trimmed = value.trim()
  if (trimmed === '') return 'empty'
  if (!EMAIL_PATTERN.test(trimmed)) return 'invalid'
  return null
}
