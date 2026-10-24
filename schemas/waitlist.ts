import { z } from 'zod'

/** Form field names of the waitlist submission, shared by the client form and the Server Action. */
export const WAITLIST_FIELDS = {
  email: 'email',
  honeypot: 'reference',
  renderedAt: 'renderedAt',
} as const

/** Value stored in the Airtable `Source` field for every coming-soon waitlist record. */
export const WAITLIST_SOURCE = 'coming-soon'

/** Minimum delay between the form render and its submission, in milliseconds. */
export const WAITLIST_MIN_DELAY_MS = 2000

/** Longest e-mail the form accepts; RFC 5321 caps a full address at 254 characters. */
export const WAITLIST_EMAIL_MAX_LENGTH = 254

/**
 * Waitlist form input, validated on the server before any Airtable write.
 *
 * The e-mail is trimmed and lowercased first, so `  Mel@Example.FR ` and `mel@example.fr` store the
 * same address. The honeypot and render timestamp are optional so a no-JavaScript submission,
 * which cannot fill the timestamp, stays valid.
 */
export const WaitlistSubmissionSchema = z.object({
  email: z.string().trim().toLowerCase().max(WAITLIST_EMAIL_MAX_LENGTH).pipe(z.email()),
  honeypot: z.string().max(200).default(''),
  renderedAt: z.string().max(20).default(''),
})

export type WaitlistSubmission = z.infer<typeof WaitlistSubmissionSchema>

/**
 * Outcome of the waitlist Server Action. Never carries the submitted e-mail or an Airtable error
 * body: the client only needs to know which message to show.
 */
export type WaitlistResult = { ok: true } | { ok: false; error: 'invalid' | 'server' }

/** Signature of the waitlist Server Action, compatible with React's `useActionState`. */
export type WaitlistAction = (previous: WaitlistResult | null, formData: FormData) => Promise<WaitlistResult>
