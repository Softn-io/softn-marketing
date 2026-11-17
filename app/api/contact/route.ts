import { checkRateLimit, trustedClientIp, type RateLimitFailure, type RateLimitPolicy } from '@/lib/rateLimit'
import { createBaserowRow, type BaserowFailure, type BaserowResult } from '@/lib/baserow'
import { hasJsonContentType, isSameOriginRequest } from '@/lib/http/guard'
import { readContactAltcha, verifyContactAltchaPayload, type ContactAltcha } from '@/lib/contact/altcha'
import { sendContactAutoReplyEmail, sendContactNotificationEmail, type ContactEmailOutcome } from '@/lib/contact/emails'
import { contactDayKeyOfInstant } from '@/lib/contact/labels'
import { contactLeadFields, CONTACT_LEAD_REQUIRED_FIELD_CHECKS, type ContactLead } from '@/lib/contact/lead'
import { CONTACT_REPLAY_STORE_UNAVAILABLE } from '@/lib/contact/replayStore'
import { readEnv } from '@/lib/env'
import { readSubjectToken } from '@/lib/google/auth'
import {
  ContactRequestSchema,
  CONTACT_FIELDS,
  CONTACT_RATE_LIMIT_MAX_REQUESTS,
  CONTACT_RATE_LIMIT_WINDOW_MS,
  isContactSubmissionTooFast,
  type ContactErrorCode,
  type ContactRequest,
} from '@/schemas/contact'

/** The plugin verifies with `node:crypto`, so this route runs on the Node.js runtime. */
export const runtime = 'nodejs'

/** The anti-bot check, the lead write and the two emails stay well inside this budget. */
export const maxDuration = 30

/**
 * Upper bound on one submission, in bytes. The message is capped at 5000 characters and the Altcha
 * payload at 4000, so a larger body is refused before anything parses it.
 */
const CONTACT_MAX_BODY_BYTES = 16_384
/**
 * Rate limit of the contact form: a handful of messages per client and per ten minutes.
 *
 * Counted under its own key prefix, so the assistant's window and this one never share a counter.
 */
const CONTACT_RATE_LIMIT_POLICY: RateLimitPolicy = {
  keyPrefix: 'contact:rl:',
  windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
  maxRequests: CONTACT_RATE_LIMIT_MAX_REQUESTS,
}

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

const errorResponse = (error: ContactErrorCode, status: number): Response => json({ error }, status)

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Reads one text field from a body that is not validated yet.
 *
 * Used for the two anti-bot signals alone, which must be read before the schema decides anything: a
 * body that is not an object, or a field that is not a string, answers an empty value.
 */
const textFieldOf = (body: unknown, name: string): string => {
  if (!isRecord(body)) return ''
  const value = body[name]
  return typeof value === 'string' ? value : ''
}

/** Diagnostic detail of a rate-limit store failure: the code, plus the store status when one answered. */
const rateLimitFailureDetail = (failure: RateLimitFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

/** Diagnostic detail of a Baserow failure: the code, plus the upstream status when one answered. */
const baserowFailureDetail = (failure: BaserowFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

/**
 * Writes the single diagnostic line of a failed submission.
 *
 * The detail holds the stage and the code only: never a name, an address, a subject, a message or an
 * upstream body. The Altcha error messages it can carry are the library's own fixed sentences.
 */
const logFailure = (detail: string): void => {
  console.error(`[contact] ${detail}`)
}

/** The lead of one validated request: the five fields the row and the emails read. */
const leadOfRequest = ({ firstName, lastName, email, subject, message }: ContactRequest): ContactLead => ({
  firstName,
  lastName,
  email,
  subject,
  message,
})

/**
 * Stores the message in the Baserow leads table.
 *
 * A missing table id is reported as `not-configured` without a network call, so a preview or a test
 * without the variable keeps working. The create verifies every column this form writes, so a
 * renamed or missing one comes back as `schema-mismatch` with the id of the row that was created,
 * instead of a lead stored without its subject.
 */
const createContactLeadRow = async ({
  lead,
  consentOn,
}: {
  lead: ContactLead
  consentOn: string
}): Promise<BaserowResult> => {
  let tableId: string | undefined
  try {
    tableId = readEnv().BASEROW_LEADS_TABLE_ID
  } catch {
    tableId = undefined
  }
  if (tableId === undefined) return { ok: false, error: 'not-configured' }

  return createBaserowRow({
    tableId,
    fields: contactLeadFields({ lead, consentOn }),
    verifyFields: CONTACT_LEAD_REQUIRED_FIELD_CHECKS,
  })
}

/**
 * Sends the notification and the automatic reply, in parallel, and logs the failures.
 *
 * The two sends are independent: one failing never stops the other, and neither changes what the
 * visitor was told. Each failure is logged as a code, never with the address or the message.
 */
const sendContactEmails = async ({
  lead,
  receivedAt,
  subjectToken,
}: {
  lead: ContactLead
  receivedAt: Date
  subjectToken: string | undefined
}): Promise<void> => {
  const emails: ReadonlyArray<readonly [string, Promise<ContactEmailOutcome>]> = [
    ['notification', sendContactNotificationEmail({ lead, receivedAt, sentAt: receivedAt, subjectToken })],
    ['auto-reply', sendContactAutoReplyEmail({ lead, sentAt: receivedAt, subjectToken })],
  ]
  const results = await Promise.allSettled(emails.map(([, email]) => email))

  results.forEach((result, index) => {
    const name = emails[index]?.[0] ?? 'email'
    if (result.status === 'rejected') {
      logFailure(`email not sent: ${name} compose failed`)
      return
    }
    if (!result.value.ok) logFailure(`email not sent: ${name} ${result.value.detail}`)
  })
}

/**
 * Receives one message.
 *
 * Order: the two anti-bot signals, the Altcha verdict, the schema, then the message itself. The rate
 * limit ran once, in `POST`, before this handler was reached. A filled honeypot or a form submitted under the minimum fill time is answered with the
 * success state and stops there: a bot learns nothing from the answer, and no work is done on its
 * behalf. A payload the plugin refused — expired, tampered, wrong, or already used — answers the
 * generic error, which is the same answer every invalid submission gets.
 *
 * The Baserow row is written before anything is sent, and it is the source of truth: a write that
 * failed answers the generic error, so the visitor retries instead of losing the message. A create
 * that lost one of its verified columns is a `schema-mismatch` — Baserow did create the row, so the
 * message is not lost, and the notification email that follows carries it in full; the code is
 * logged for Mel. The two emails then go out in parallel, and their failures are logged without
 * personal data and without failing the request.
 *
 * @param request Incoming request, for its headers and its subject token.
 * @param body Parsed body of the request.
 * @returns `{ sent: true }` on success, or `{ error }` with 400, 429 or 503.
 */
const handleContactMessage = async (altcha: ContactAltcha, request: Request, body: unknown): Promise<Response> => {
  if (
    textFieldOf(body, CONTACT_FIELDS.honeypot) !== '' ||
    isContactSubmissionTooFast(textFieldOf(body, CONTACT_FIELDS.renderedAt), Date.now())
  ) {
    return json({ sent: true }, 200)
  }

  const verification = await verifyContactAltchaPayload(altcha, textFieldOf(body, CONTACT_FIELDS.altcha))
  // The plugin keeps the message a failing store threw: an unavailable store is not a refused
  // payload, and it answers the unavailable copy so the visitor can come back later.
  if (verification.error === CONTACT_REPLAY_STORE_UNAVAILABLE) {
    logFailure('unavailable: replay store')
    return errorResponse('unavailable', 503)
  }
  if (verification.error !== null) {
    logFailure(`invalid: altcha ${verification.error}`)
    return errorResponse('invalid', 400)
  }

  const parsed = ContactRequestSchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid', 400)

  // The consent instant is stamped here, on receipt: a value sent by the client would attest a claim
  // the server never witnessed.
  const receivedAt = new Date()
  const consentOn = contactDayKeyOfInstant(receivedAt)
  if (consentOn === '') {
    logFailure('unavailable: consent instant unreadable')
    return errorResponse('unavailable', 503)
  }

  const lead = leadOfRequest(parsed.data)
  const stored = await createContactLeadRow({ lead, consentOn })
  if (!stored.ok) {
    logFailure(`lead not stored: baserow ${baserowFailureDetail(stored)}`)
    if (stored.error !== 'schema-mismatch') return errorResponse('unavailable', 503)
    // The row exists but a verified column came back empty: the message is kept and the notification
    // that follows carries it in full, so the visitor is told the message was sent.
  }

  await sendContactEmails({ lead, receivedAt, subjectToken: readSubjectToken(request) })

  return json({ sent: true }, 200)
}

/**
 * Receives one message from the contact form.
 *
 * Request order: same-origin check, JSON content type, rate limit, signing secret, then the body.
 * The rate limit comes first so every request is counted, oversized bodies included, and it runs
 * before anything is read. The body is then bounded on the bytes actually received — a declared
 * `Content-Length` is a hint a client can omit or lie about — and only then parsed. The Altcha
 * payload travels in the body, so the plugin verifies it inside the handler, which keeps the rest of
 * the order in one place: the plugin's `withMiddleware` cannot be used, because in altcha-lib 2.8.0
 * it answers its own Response instead of calling the handler it wraps.
 *
 * @param request Incoming `POST` with the contact message as JSON.
 * @returns `{ sent: true }` on success, or `{ error }` with 400, 403, 415, 429 or 503.
 */
export const POST = async (request: Request): Promise<Response> => {
  if (!isSameOriginRequest(request)) return errorResponse('invalid', 403)
  if (!hasJsonContentType(request)) return errorResponse('invalid', 415)

  const limit = await checkRateLimit(trustedClientIp(request), CONTACT_RATE_LIMIT_POLICY)
  if (!limit.ok) {
    logFailure(`unavailable: rate-limit ${rateLimitFailureDetail(limit)}`)
    return errorResponse('unavailable', 503)
  }
  if (limit.data === 'limited') return errorResponse('rate-limited', 429)

  // Cheap refusal first when the client declared a length; the bound below is what decides.
  const declaredLength = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > CONTACT_MAX_BODY_BYTES) {
    return errorResponse('invalid', 400)
  }

  const altcha = await readContactAltcha()
  if (altcha === null) {
    logFailure('unavailable: altcha key-unset')
    return errorResponse('unavailable', 503)
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return errorResponse('invalid', 400)
  }
  if (Buffer.byteLength(raw, 'utf8') > CONTACT_MAX_BODY_BYTES) return errorResponse('invalid', 400)

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return errorResponse('invalid', 400)
  }

  return handleContactMessage(altcha, request, body)
}
