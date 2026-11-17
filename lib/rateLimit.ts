import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { readEnv } from '@/lib/env'

/** Fixed window of the assistant's own rate limit, in milliseconds. */
export const ASSISTANT_RATE_LIMIT_WINDOW_MS = 60_000

/** Questions the assistant accepts per client and per window. */
export const ASSISTANT_RATE_LIMIT_MAX_REQUESTS = 10

/** Upper bound on one store call: a slow store must not eat the route's time budget. */
const STORE_TIMEOUT_MS = 1500

/** Namespace of the assistant counter keys inside the shared Redis database. */
const ASSISTANT_STORE_KEY_PREFIX = 'assistant:rl:'

/** Limits of one rate-limited surface: the counter namespace, the window and the accepted count. */
export type RateLimitPolicy = {
  /** Namespace of the counter keys, so two surfaces never share a counter. */
  readonly keyPrefix: string
  /** Length of the fixed window, in milliseconds. */
  readonly windowMs: number
  /** Requests accepted per client and per window. */
  readonly maxRequests: number
}

/**
 * Policy of the assistant route, the values its window and its cap have always had. Every caller
 * passes a policy explicitly, so no surface can silently count in another one's bucket.
 */
export const ASSISTANT_RATE_LIMIT_POLICY: RateLimitPolicy = {
  keyPrefix: ASSISTANT_STORE_KEY_PREFIX,
  windowMs: ASSISTANT_RATE_LIMIT_WINDOW_MS,
  maxRequests: ASSISTANT_RATE_LIMIT_MAX_REQUESTS,
}

/** Bucket used when no platform header carries a client IP. */
const UNKNOWN_CLIENT = 'unknown'

/** Verdict of the limiter for one client. */
export type RateLimitVerdict = 'allowed' | 'limited'

/**
 * Non-personal failure codes of the shared store, mapped by the Route Handler to one generic
 * answer. They never carry an IP, a key or an upstream body.
 */
export type RateLimitFailureCode =
  'store-unavailable' | 'store-timeout' | 'store-invalid-response' | 'store-unconfigured'

/** Failure of the shared store: the code, plus the HTTP status when a response answered. */
export type RateLimitFailure = {
  readonly ok: false
  readonly error: RateLimitFailureCode
  /** Status of the store's HTTP response, absent when the failure never reached one. */
  readonly status?: number
}

/** Outcome of the limiter: the verdict, or a failure. Never thrown. */
export type RateLimitResult = { readonly ok: true; readonly data: RateLimitVerdict } | RateLimitFailure

/** One command answer of a pipeline: the Redis result, or the error Redis rejected it with. */
const StoreCommandResponseSchema = z.union([z.object({ result: z.number().int() }), z.object({ error: z.string() })])

/**
 * Answer of a two-command pipeline: `INCR` then `EXPIRE`. Validated at this boundary because the
 * store is a third party and a shape change must fail closed, not flow into the limiter.
 */
const StorePipelineResponseSchema = z.tuple([StoreCommandResponseSchema, StoreCommandResponseSchema])

/** First value of a comma-separated header, trimmed, or `undefined` when absent or empty. */
const firstHeaderValue = (value: string | null): string | undefined => {
  const first = value?.split(',')[0]?.trim()
  return first === undefined || first === '' ? undefined : first
}

/**
 * Client IP as set by the hosting platform, or the shared `unknown` bucket.
 *
 * Vercel overwrites `x-forwarded-for` and does not forward the external value, which prevents IP
 * spoofing (`https://vercel.com/docs/headers/request-headers`). `x-vercel-forwarded-for` carries
 * the same value but survives a proxy placed in front of Vercel, and `x-real-ip` carries it too, so
 * these two are read in that order. A client-supplied `x-forwarded-for` is never read: a forged
 * value would otherwise buy a fresh counter. Without either header every caller shares the
 * `unknown` bucket, which limits itself instead of allowing unlimited traffic.
 *
 * @param request Incoming request.
 * @returns Platform-provided client IP, never logged nor stored as is.
 */
export const trustedClientIp = (request: Request): string =>
  firstHeaderValue(request.headers.get('x-vercel-forwarded-for')) ??
  firstHeaderValue(request.headers.get('x-real-ip')) ??
  UNKNOWN_CLIENT

const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')

/**
 * Best-effort in-memory window, used outside production when the shared store is not configured.
 *
 * It only protects the instance that serves the request: a second serverless instance keeps its
 * own map and a restart forgets every counter. The IP stays in process memory and disappears with
 * the entry, at the end of the window. The key carries the policy prefix, so two surfaces counted
 * by the same process never share an entry.
 */
const memoryLimits = new Map<string, { count: number; resetAt: number }>()

const isMemoryLimited = (clientIp: string, policy: RateLimitPolicy): boolean => {
  const now = Date.now()
  for (const [key, entry] of memoryLimits) {
    if (entry.resetAt <= now) memoryLimits.delete(key)
  }

  const key = `${policy.keyPrefix}${clientIp}`
  const entry = memoryLimits.get(key)
  if (entry === undefined || entry.resetAt <= now) {
    memoryLimits.set(key, { count: 1, resetAt: now + policy.windowMs })
    return false
  }

  entry.count += 1
  return entry.count > policy.maxRequests
}

/**
 * Counts one request in the shared store.
 *
 * The key is an HMAC of the client IP keyed with the store token, so the stored value is
 * pseudonymised and a plain hash of an IPv4 address cannot be brute-forced back, under the prefix
 * of the policy. One pipeline request runs `INCR` then `EXPIRE <key> <window> NX`: `NX` sets the
 * lifetime on the first hit only, so the counter expires with the window and nothing outlives it.
 * Any error fails closed: the caller answers the generic error instead of letting an unverified
 * request through.
 *
 * @param url Validated https base URL of the store.
 * @param token Store token, also used as the HMAC key.
 * @param clientIp Trusted client IP, never sent nor logged.
 * @param policy Namespace, window and accepted count of the surface being counted.
 * @returns The verdict, or a failure code with the HTTP status when a response answered.
 */
const countInSharedWindow = async (
  url: string,
  token: string,
  clientIp: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> => {
  const key = `${policy.keyPrefix}${createHmac('sha256', token).update(clientIp).digest('hex')}`
  // `EXPIRE` counts in whole seconds; a window under one second still keeps its key for one.
  const windowSeconds = Math.max(1, Math.ceil(policy.windowMs / 1000))

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, windowSeconds, 'NX'],
      ]),
      cache: 'no-store',
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    })

    if (!response.ok) return { ok: false, error: 'store-unavailable', status: response.status }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return { ok: false, error: 'store-invalid-response' }
    }

    const parsed = StorePipelineResponseSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'store-invalid-response' }

    const [increment, expiry] = parsed.data
    if ('error' in increment) return { ok: false, error: 'store-unavailable' }
    // Without the lifetime the counter would never expire: refuse rather than keep a key forever.
    if ('error' in expiry) return { ok: false, error: 'store-unavailable' }

    return { ok: true, data: increment.result > policy.maxRequests ? 'limited' : 'allowed' }
  } catch (error) {
    if (isTimeoutError(error)) return { ok: false, error: 'store-timeout' }
    return { ok: false, error: 'store-unavailable' }
  }
}

/**
 * Decides whether one client may send another request to a rate-limited surface.
 *
 * The environment is read at request time. With both Upstash variables set, the shared window in
 * Redis is authoritative. Without them, a production deployment fails closed (`store-unconfigured`)
 * because a per-instance window would let a burst through; development and test fall back to the
 * in-memory window so the route stays usable without a store. A single missing variable counts as
 * unconfigured. Never throws for these recoverable failures.
 *
 * @param clientIp Trusted client IP from {@link trustedClientIp}.
 * @param policy Namespace, window and accepted count of the surface being counted. Required: the
 *   caller states whose bucket it counts in.
 * @returns The verdict, or the failure that must answer the caller with the generic 503.
 */
export const checkRateLimit = async (clientIp: string, policy: RateLimitPolicy): Promise<RateLimitResult> => {
  let environment: ReturnType<typeof readEnv>
  try {
    environment = readEnv()
  } catch {
    return { ok: false, error: 'store-unconfigured' }
  }

  const url = environment.UPSTASH_REDIS_REST_URL
  const token = environment.UPSTASH_REDIS_REST_TOKEN
  if (url !== undefined && token !== undefined) return countInSharedWindow(url, token, clientIp, policy)

  if (environment.NODE_ENV === 'production') return { ok: false, error: 'store-unconfigured' }

  return { ok: true, data: isMemoryLimited(clientIp, policy) ? 'limited' : 'allowed' }
}
