/*
 * Scheduled reminder route of the booking.
 *
 * The GitHub Actions workflow (`.github/workflows/reminders.yml`, content recorded in
 * `.orchestration/reports/chatbot-dev/files-116.md`) calls this route every half hour, off the
 * hour, with the shared `CRON_SECRET` as a bearer token. The route authenticates, runs one reminder
 * pass over the calls of the next 24 hours and answers non-personal counts only.
 *
 * Nothing here is a visitor's request: the same-origin guard of the booking routes does not apply
 * (the caller is a runner, not a browser), the secret is what protects the route, and it is compared
 * in constant time. A preview deployment answers `unavailable` without running anything, a
 * deployment without the secret answers `unavailable` rather than running open, and a caller without
 * the right secret learns nothing but `invalid`. A window that cannot be read also answers
 * `unavailable`, so the scheduled run fails visibly instead of reporting a green zero.
 */

import { timingSafeEqual } from 'node:crypto'
import { bookingManageLinkOrigin } from '@/lib/booking/event'
import { runBookingReminders } from '@/lib/booking/reminders'
import { readEnv } from '@/lib/env'
import { readSubjectToken } from '@/lib/google/auth'

/** The job talks to Google and may send a handful of emails; this is its budget, not a visitor's. */
export const maxDuration = 30

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

/** The two generic answers of this route: a refusal, and a deployment that cannot serve it. */
const errorResponse = (error: 'invalid' | 'unavailable', status: number): Response => json({ error }, status)

/**
 * Writes the single diagnostic line of a failed reminder pass.
 *
 * The details hold a stage and a code only: never a name, an address, an event id or a slot.
 */
const logFailure = (detail: string): void => {
  console.error(`[booking] reminders: ${detail}`)
}

/** Reads the reminder secret of this deployment, or `undefined` when it has none. */
const readReminderSecret = (): string | undefined => {
  try {
    return readEnv().CRON_SECRET
  } catch {
    return undefined
  }
}

/** Reads the deployment marker Vercel sets, or `undefined` when the environment is unreadable. */
const readVercelEnv = (): string | undefined => {
  try {
    return readEnv().VERCEL_ENV
  } catch {
    return undefined
  }
}

/**
 * True when the request carries the deployment's reminder secret as a bearer token.
 *
 * The comparison is made in constant time, on buffers of the same length, so a wrong token cannot
 * be probed byte by byte. A missing header, another scheme or a differently sized value is refused
 * without ever reaching the comparison.
 */
const isAuthorized = (request: Request, secret: string): boolean => {
  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''

  const expected = Buffer.from(secret, 'utf8')
  const received = Buffer.from(provided, 'utf8')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/**
 * Runs one reminder pass, for the scheduler alone.
 *
 * Only `POST` is accepted, a preview deployment refuses to run at all, and the caller must carry the
 * deployment's secret: an unauthenticated caller gets `invalid` (401), a deployment that cannot
 * serve the job (preview, or no secret) gets `unavailable` (503), both with a generic body. The pass
 * then lists the calls of the next 24 hours and sends the reminders the previous runs left, each
 * failure being one non-personal code in the log and never a stopped pass. When the window itself
 * cannot be read there is no pass: the route answers `unavailable` so a scheduled run fails visibly
 * instead of reporting a green zero.
 *
 * @param request Incoming `POST` carrying `Authorization: Bearer <CRON_SECRET>`.
 * @returns `{ sent, failed, skipped }` with 200, or `{ error }` with 401, 405 or 503.
 */
export const POST = async (request: Request): Promise<Response> => {
  // The framework answers 405 for a method this module does not export; the guard keeps that true
  // for a caller that reaches the handler directly.
  if (request.method !== 'POST') return errorResponse('invalid', 405)

  // A preview deployment never reminds: its manage links would point at an address that disappears
  // with the deployment, and a run there could race production into a duplicate send. The scheduled
  // run belongs to production; development and a local run are allowed.
  if (readVercelEnv() === 'preview') {
    logFailure('refused: preview deployment')
    return errorResponse('unavailable', 503)
  }

  const secret = readReminderSecret()
  if (secret === undefined) {
    logFailure('unavailable: secret-unset')
    return errorResponse('unavailable', 503)
  }
  if (!isAuthorized(request, secret)) {
    logFailure('refused: unauthorized')
    return errorResponse('invalid', 401)
  }

  const result = await runBookingReminders({
    now: new Date(),
    // The reminder's manage link is built on the origin of this request: production pins it to the
    // canonical site, a deployment of another origin links to itself.
    origin: bookingManageLinkOrigin(request),
    subjectToken: readSubjectToken(request),
  })
  if (!result.ok) {
    logFailure(result.detail)
    return errorResponse('unavailable', 503)
  }

  for (const detail of result.details) logFailure(detail)

  return json({ sent: result.sent, failed: result.failed, skipped: result.skipped }, 200)
}
