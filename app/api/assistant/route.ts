import { buildAssistantSystemPrompt } from '@/lib/assistant/systemPrompt'
import { requestChatCompletion } from '@/lib/assistant/mistral'
import { getOkfBundle } from '@/lib/assistant/okf'
import { resolveAssistantAnswer } from '@/lib/assistant/answer'
import { AssistantRequestSchema, type AssistantErrorCode } from '@/schemas/assistant'

/** Route Handlers that read the bundle from disk must run on the Node.js runtime. */
export const runtime = 'nodejs'

/**
 * Maximum execution time of this Route Handler, in seconds (Next.js route segment config).
 * `MISTRAL_TOTAL_BUDGET_MS` bounds the model call below this limit, so a retried request always
 * reaches the route's generic 503 instead of being killed by the platform.
 */
export const maxDuration = 30

/** Sliding window of the best-effort rate limit, in milliseconds. */
const RATE_LIMIT_WINDOW_MS = 60_000

/** Questions accepted per IP and per window. */
const RATE_LIMIT_MAX_REQUESTS = 10

/*
 * Best-effort, in-memory rate limit. It only protects the instance that serves the request: a
 * second serverless instance has its own map, and a restart forgets every counter. A durable
 * limiter (shared store, WAF rule) is out of scope; this one makes casual bursts fail fast without
 * adding a dependency or storing an IP anywhere but in this process memory.
 */
const rateLimits = new Map<string, { count: number; resetAt: number }>()

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

const errorResponse = (error: AssistantErrorCode, status: number): Response => json({ error }, status)

/** Raw client IP, as set by the hosting proxy; never logged. */
const clientIp = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first !== undefined && first !== '') return first
  const realIp = request.headers.get('x-real-ip')?.trim()
  return realIp === undefined || realIp === '' ? 'unknown' : realIp
}

const isSameOrigin = (request: Request): boolean => {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')

  if (origin !== null && origin !== expectedOrigin) return false
  if (fetchSite !== null && fetchSite !== 'same-origin') return false
  // No browser context at all (curl, server-side call): only the site's own page may ask.
  return origin !== null || fetchSite !== null
}

const isRateLimited = (ip: string): boolean => {
  const now = Date.now()
  for (const [key, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(key)
  }

  const entry = rateLimits.get(ip)
  if (entry === undefined || entry.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  entry.count += 1
  return entry.count > RATE_LIMIT_MAX_REQUESTS
}

/**
 * Answers one visitor question from the validated OKF bundle.
 *
 * Request order: same-origin check, JSON content type, per-IP rate limit, Zod validation, bundle
 * load, then the Mistral call. Every failure returns a generic code (never the question, the
 * answer or an upstream body) and nothing is logged. The bundle and the API key are checked
 * before any network call: a missing key or a non-conformant bundle answers the generic error,
 * never an ungrounded answer.
 *
 * @param request Incoming `POST` with `{ question, history }` as JSON.
 * @returns `{ answer }` on success, or `{ error }` with 400, 403, 415, 429 or 503.
 */
export const POST = async (request: Request): Promise<Response> => {
  if (!isSameOrigin(request)) return errorResponse('invalid', 403)

  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return errorResponse('invalid', 415)

  if (isRateLimited(clientIp(request))) return errorResponse('rate-limited', 429)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse('invalid', 400)
  }

  const parsed = AssistantRequestSchema.safeParse(payload)
  if (!parsed.success) return errorResponse('invalid', 400)

  const bundle = getOkfBundle()
  if (!bundle.ok) return errorResponse('unavailable', 503)

  const completion = await requestChatCompletion({
    systemPrompt: buildAssistantSystemPrompt(bundle.data.grounding),
    messages: [...parsed.data.history, { role: 'user', content: parsed.data.question }],
  })
  if (!completion.ok) return errorResponse('unavailable', 503)

  return json({ answer: resolveAssistantAnswer(completion.data) }, 200)
}
