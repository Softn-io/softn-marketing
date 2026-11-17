'use client'

/*
 * Submission state of the contact form.
 *
 * One POST to the contact Route Handler, with a hard timeout so a hung request never locks the form,
 * and one failure code per situation the copy knows how to word: the generic incident, the lost
 * connection, the rate limit, and the route failing closed. The body is built by the form at each
 * attempt, so a retry re-reads the anti-bot payload and picks up a fresh verification.
 */

import { useCallback, useState } from 'react'
import { isContactErrorResponse, isContactSuccessResponse, type ContactErrorCode } from '@/schemas/contactLimits'

/**
 * Upper bound on one submission, in milliseconds. The server's own budget is 30 s, so this only
 * fires when the request never reached it; the visitor then reads the connection message and can
 * retry.
 */
export const CONTACT_REQUEST_TIMEOUT_MS = 20_000

/** State of the submission. */
export type ContactSubmissionStatus = 'idle' | 'sending' | 'sent'

/**
 * Failure the form words from the copy.
 *
 * `unavailable` is the answer the route gives when it fails closed — the anti-bot secret, the replay
 * store or the lead table is missing or down — and the copy tells the visitor to come back later.
 */
export type ContactSubmissionError = 'generic' | 'network' | 'rate-limit' | 'unavailable'

/** Outcome of one attempt: what the form needs to decide what to show, and what to reset. */
export type ContactSubmissionOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: ContactErrorCode | 'network' }

/** What the form reads from {@link useContactSubmission}. */
export type ContactSubmission = {
  /** State of the submission. */
  readonly status: ContactSubmissionStatus
  /** Failure of the last attempt, already mapped to the copy the form shows. */
  readonly error: ContactSubmissionError | null
  /** Sends one message; never throws. */
  readonly send: (body: Readonly<Record<string, unknown>>) => Promise<ContactSubmissionOutcome>
}

/**
 * Holds the submission state of the contact form.
 *
 * The body is built by the form at each attempt rather than kept here: a retry re-reads the
 * anti-bot payload, so a fresh verification is picked up and the visitor retypes nothing.
 *
 * @returns The state, the failure to show and the sender.
 */
export const useContactSubmission = (): ContactSubmission => {
  const [status, setStatus] = useState<ContactSubmissionStatus>('idle')
  const [error, setError] = useState<ContactSubmissionError | null>(null)

  const send = useCallback(async (body: Readonly<Record<string, unknown>>): Promise<ContactSubmissionOutcome> => {
    setStatus('sending')
    setError(null)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CONTACT_REQUEST_TIMEOUT_MS),
      })
      const payload: unknown = await response.json().catch(() => null)

      if (response.ok && isContactSuccessResponse(payload)) {
        setStatus('sent')
        return { ok: true }
      }

      const code = isContactErrorResponse(payload) ? payload.error : null
      setStatus('idle')
      setError(code === 'rate-limited' ? 'rate-limit' : code === 'unavailable' ? 'unavailable' : 'generic')
      return { ok: false, error: code ?? 'unavailable' }
    } catch {
      // A timeout and a lost connection are the same thing to the visitor: nothing was sent.
      setStatus('idle')
      setError('network')
      return { ok: false, error: 'network' }
    }
  }, [])

  return { status, error, send }
}
