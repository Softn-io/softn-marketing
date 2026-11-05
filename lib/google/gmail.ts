/*
 * Gmail client of the booking, on plain `fetch`: it sends the service emails of a booking as the
 * impersonated Workspace owner, under the delegated `gmail.send` scope alone.
 *
 * Google no longer notifies the guests of a booking (`sendUpdates=none` on the calendar), so the
 * confirmation, the update and the cancellation are this module's callers' to send, each with its
 * calendar file. `users.messages.send` takes the base64url-encoded RFC 5322 message under `raw` and
 * answers the id of the message that now sits in the owner's mailbox; the special user id `me` is
 * the authenticated user, which is the impersonated owner.
 *
 * No SDK and no new dependency: the credential chain of the calendar is reused, with the Gmail
 * scope added for this call only. A response body is only ever handed to a Zod schema, or, on a
 * failure, read for the machine-readable reason of Google's error envelope — never a message, never
 * a field that could echo the request.
 *
 * Docs read for this call: `https://developers.google.com/workspace/gmail/api/guides/sending`
 * (endpoint, `raw` field, base64url encoding, `me` user id).
 */

import { z } from 'zod'
import { readGoogleErrorReason } from './errorReason'
import {
  getAccessToken,
  GOOGLE_GMAIL_SEND_SCOPES,
  GOOGLE_REQUEST_TIMEOUT_MS,
  isGoogleTimeoutError,
  type GoogleFailure,
  type GoogleFailureCode,
} from './auth'

/** Gmail API v1 base URL. */
const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com/gmail/v1'

/** User id the call sends as: the authenticated user of the access token, the impersonated owner. */
const SEND_AS_USER = 'me'

/** Answer of a send: the id of the message that now sits in the sender's mailbox. */
const SendMessageResponseSchema = z.object({
  id: z.string().min(1),
})

/** Failure of a Gmail call: the shared Google codes, an upstream status, its reason, never a body. */
export type GmailFailure = Omit<GoogleFailure, 'error'> & { readonly error: GoogleFailureCode }

/** Outcome of a Gmail call: its data, or a failure that carries no upstream detail. */
export type GmailResult<T> = { readonly ok: true; readonly data: T } | GmailFailure

/** Failure code of an error status: a refused credential is not the same as a broken call. */
const failureForStatus = (status: number): GoogleFailureCode =>
  status === 401 || status === 403 ? 'unauthorized' : 'request-failed'

/** Arguments of {@link sendGmailMessage}. */
export type SendGmailMessageInput = {
  /** Message as RFC 5322 MIME text, CRLF line endings included. */
  message: string
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
}

/**
 * Sends one message as the impersonated owner, from the mailbox of `me`.
 *
 * The credential chain is walked with {@link GOOGLE_GMAIL_SEND_SCOPES}, so the token used here can
 * send mail and nothing else; the calendar calls keep their own scopes and their own cached token.
 * The message travels base64url-encoded, as the API documents, and the call has its own timeout, so
 * a slow Gmail never holds a booking request open.
 *
 * @param input The MIME message and the subject token of the request.
 * @returns The id of the sent message, or a non-personal failure code.
 */
export const sendGmailMessage = async ({
  message,
  subjectToken,
}: SendGmailMessageInput): Promise<GmailResult<{ messageId: string }>> => {
  const token = await getAccessToken({ subjectToken, scopes: GOOGLE_GMAIL_SEND_SCOPES })
  // A chain failure already names its step and its status: it passes through untouched.
  if (!token.ok) return token

  let response: Response
  try {
    response = await fetch(`${GMAIL_API_BASE_URL}/users/${SEND_AS_USER}/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: Buffer.from(message, 'utf8').toString('base64url') }),
      cache: 'no-store',
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, error: isGoogleTimeoutError(error) ? 'timeout' : 'request-failed' }
  }

  if (!response.ok) {
    const reason = await readGoogleErrorReason(response)
    return {
      ok: false,
      error: failureForStatus(response.status),
      status: response.status,
      ...(reason === undefined ? {} : { reason }),
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, error: 'invalid-response' }
  }

  const parsed = SendMessageResponseSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }

  return { ok: true, data: { messageId: parsed.data.id } }
}
