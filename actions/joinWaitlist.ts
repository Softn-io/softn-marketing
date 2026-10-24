'use server'

import { createAirtableRecord } from '@/lib/airtable'
import { readEnv } from '@/lib/env'
import {
  WAITLIST_FIELDS,
  WAITLIST_MIN_DELAY_MS,
  WAITLIST_SOURCE,
  WaitlistSubmissionSchema,
  type WaitlistResult,
} from '@/schemas/waitlist'

/** Reads a text field from untrusted form data: a missing or file value becomes an empty string. */
const readField = (formData: FormData, name: string): string => {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * Whether the form was submitted sooner than the anti-spam delay allows.
 *
 * The timestamp is written by the client just before submission; a missing or malformed value
 * (a no-JavaScript submission) never trips the check. A timestamp in the future is ignored too, so
 * a skewed client clock cannot block a legitimate visitor.
 */
const isSubmittedTooFast = (renderedAt: string): boolean => {
  const timestamp = Number(renderedAt)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false
  const elapsed = Date.now() - timestamp
  return elapsed >= 0 && elapsed < WAITLIST_MIN_DELAY_MS
}

/**
 * Joins the coming-soon e-mail waitlist.
 *
 * Validates the submission with the shared Zod schema, re-checks the honeypot and the render delay
 * server-side, then writes one record through the Airtable helper. A tripped honeypot or a too-fast
 * submission answers with the success state without a network call, so a bot cannot tell the trap
 * from a real signup.
 *
 * Returns a {@link WaitlistResult} and never throws to the client. The submitted e-mail and the
 * Airtable error body never leave this function: only a generic `invalid` or `server` code does.
 */
export const joinWaitlist = async (_previous: WaitlistResult | null, formData: FormData): Promise<WaitlistResult> => {
  try {
    const parsed = WaitlistSubmissionSchema.safeParse({
      email: readField(formData, WAITLIST_FIELDS.email),
      honeypot: readField(formData, WAITLIST_FIELDS.honeypot),
      renderedAt: readField(formData, WAITLIST_FIELDS.renderedAt),
    })

    if (!parsed.success) return { ok: false, error: 'invalid' }

    const { email, honeypot, renderedAt } = parsed.data
    if (honeypot !== '' || isSubmittedTooFast(renderedAt)) return { ok: true }

    const tableId = readEnv().AIRTABLE_WAITLIST_TABLE_ID
    if (tableId === undefined) return { ok: false, error: 'server' }

    const result = await createAirtableRecord({
      tableId,
      fields: { Email: email, Source: WAITLIST_SOURCE },
    })

    return result.ok ? { ok: true } : { ok: false, error: 'server' }
  } catch {
    return { ok: false, error: 'server' }
  }
}
