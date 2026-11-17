import { checkRateLimit, trustedClientIp, type RateLimitFailure, type RateLimitPolicy } from '@/lib/rateLimit'
import { isSameOriginRequest } from '@/lib/http/guard'
import { readContactAltcha } from '@/lib/contact/altcha'
import { CONTACT_CHALLENGE_RATE_LIMIT_MAX_REQUESTS, CONTACT_RATE_LIMIT_WINDOW_MS } from '@/schemas/contactLimits'

/** The plugin signs with `node:crypto`, so this route runs on the Node.js runtime. */
export const runtime = 'nodejs'

/** Signing one challenge is a hash and a random draw: it stays far inside this budget. */
export const maxDuration = 10

/**
 * Rate limit of the challenge route, counted under its own key prefix so it never shares a counter
 * with the submissions. Generous: it only bounds how many challenges one client can pull.
 */
const CONTACT_CHALLENGE_RATE_LIMIT_POLICY: RateLimitPolicy = {
  keyPrefix: 'contact:challenge:',
  windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
  maxRequests: CONTACT_CHALLENGE_RATE_LIMIT_MAX_REQUESTS,
}

/** Diagnostic detail of a rate-limit store failure: the code, plus the store status when one answered. */
const rateLimitFailureDetail = (failure: RateLimitFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

/**
 * Serves one signed Altcha challenge to the anti-bot widget of the contact form.
 *
 * The plugin's handler owns the challenge: its cost, its prefix and its lifetime are the ones
 * `lib/contact/altcha.ts` signs, and the answer is never cached. Without a signing secret the route
 * fails closed with a generic error, which leaves the widget in its error state and the form
 * unusable rather than unprotected.
 *
 * @param request Incoming `GET` from the widget.
 * @returns The challenge as JSON, or `{ error }` with 403 or 503.
 */
export const GET = async (request: Request): Promise<Response> => {
  if (!isSameOriginRequest(request)) return json({ error: 'invalid' }, 403)

  const limit = await checkRateLimit(trustedClientIp(request), CONTACT_CHALLENGE_RATE_LIMIT_POLICY)
  if (!limit.ok) {
    console.error(`[contact] challenge unavailable: rate-limit ${rateLimitFailureDetail(limit)}`)
    return json({ error: 'unavailable' }, 503)
  }
  if (limit.data === 'limited') return json({ error: 'rate-limited' }, 429)

  const altcha = await readContactAltcha()
  if (altcha === null) {
    console.error('[contact] challenge unavailable: altcha key-unset')
    return json({ error: 'unavailable' }, 503)
  }

  return altcha.plugin.challengeHandler(request)
}
