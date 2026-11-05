/*
 * Machine-readable reason of a failed Google call.
 *
 * An error answer of Google carries, beside a human-readable `message` that can echo the request, a
 * machine-readable reason: the `reason` of the first entry of `error.errors` when the API sets one
 * (`forbiddenForNonOrganizer`, `rateLimitExceeded`, `quotaExceeded`, …), and `error.status` when it
 * does not. Only that token is ever kept here: the message and every other field are dropped, and a
 * token that is not a short word of letters is dropped too, so a logged detail never carries a body.
 * The letter-only rule is the same for both sources, so an underscored `error.status` such as
 * `PERMISSION_DENIED` is dropped rather than logged: the documented reasons this diagnostic exists
 * for are camelCase, and a stricter token can never smuggle a body line into a log.
 *
 * Everything in this module is defensive by design. A failed answer is a diagnostic, not a path the
 * booking depends on: an absent body, a body larger than a Google error envelope, a body that is not
 * JSON, or a reason whose shape is not the expected token all answer `undefined` rather than throw,
 * and no failure of a Google call ever grows a second failure because its own diagnostics broke.
 */

import { z } from 'zod'

/** Largest error body read: past it the answer is not a Google error envelope worth reading. */
const ERROR_BODY_MAX_BYTES = 2048

/** Longest reason token kept; every documented one is far shorter. */
const REASON_MAX_LENGTH = 40

/** A reason token is letters only, as the documented ones are (`forbiddenForNonOrganizer`). */
const REASON_PATTERN = /^[A-Za-z]+$/

/**
 * Body of a Google error answer, restricted to the fields the reason comes from.
 *
 * The error list is read as an unknown field and narrowed below, not as a typed shape: one malformed
 * entry must not cost the `error.status` fallback. Nothing else of the body is described, so nothing
 * else can travel out of here.
 */
const GoogleErrorBodySchema = z.object({
  error: z
    .object({
      errors: z.unknown().optional(),
      status: z.string().optional(),
    })
    .optional(),
})

/** `reason` of one entry of the error list, when that entry carries a string one. */
const entryReason = (entry: unknown): string | undefined => {
  if (typeof entry !== 'object' || entry === null || !('reason' in entry)) return undefined

  const reason = (entry as { readonly reason?: unknown }).reason
  return typeof reason === 'string' ? reason : undefined
}

/** Keeps one raw token when it has the shape of a reason, and drops everything else. */
const acceptedReason = (raw: string | undefined): string | undefined => {
  if (raw === undefined) return undefined

  const token = raw.trim()
  if (token === '' || token.length > REASON_MAX_LENGTH) return undefined

  return REASON_PATTERN.test(token) ? token : undefined
}

/**
 * Reason of one error body already read: the first entry's `reason`, or `error.status` when absent.
 *
 * @param body Raw body of a failed Google answer.
 * @returns The reason token, or `undefined` when the body carries none this module accepts.
 */
export const googleErrorReasonOfBody = (body: string): string | undefined => {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return undefined
  }

  const parsed = GoogleErrorBodySchema.safeParse(payload)
  if (!parsed.success) return undefined

  const error = parsed.data.error
  if (error === undefined) return undefined

  const first = Array.isArray(error.errors) ? error.errors[0] : undefined
  return acceptedReason(entryReason(first) ?? error.status)
}

/**
 * Reads the reason of a failed Google answer, bounded and never throwing.
 *
 * The body is streamed and capped at {@link ERROR_BODY_MAX_BYTES}: a longer answer is abandoned
 * unread, so a wrong or hostile body never grows the memory of a request. The answer of this
 * function is a diagnostic string only — never a body, never a code the caller branches on.
 *
 * @param response Failed response of a Google call, its body still unread.
 * @returns The reason token, or `undefined` when there is none to keep.
 */
export const readGoogleErrorReason = async (response: Response): Promise<string | undefined> => {
  if (response.body === null) return undefined

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let read = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      read += value.byteLength
      if (read > ERROR_BODY_MAX_BYTES) {
        await reader.cancel()
        return undefined
      }

      body += decoder.decode(value, { stream: true })
    }
  } catch {
    return undefined
  }

  return googleErrorReasonOfBody(`${body}${decoder.decode()}`)
}
