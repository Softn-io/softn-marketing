import { buildAssistantSystemPrompt } from '@/lib/assistant/systemPrompt'
import { requestChatCompletion, type MistralFailure } from '@/lib/assistant/mistral'
import { getOkfBundle } from '@/lib/assistant/okf'
import { resolveAssistantAnswer } from '@/lib/assistant/answer'
import { checkRateLimit, trustedClientIp, type RateLimitFailure } from '@/lib/assistant/rateLimit'
import { AssistantRequestSchema, type AssistantErrorCode } from '@/schemas/assistant'

/** Route Handlers that read the bundle from disk must run on the Node.js runtime. */
export const runtime = 'nodejs'

/**
 * Maximum execution time of this Route Handler, in seconds (Next.js route segment config).
 * `MISTRAL_TOTAL_BUDGET_MS` bounds the model call below this limit, so a retried request always
 * reaches the route's generic 503 instead of being killed by the platform.
 */
export const maxDuration = 30

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

const errorResponse = (error: AssistantErrorCode, status: number): Response => json({ error }, status)

/** Diagnostic detail of a model failure: the code, plus the upstream status when a response answered. */
const mistralFailureDetail = (failure: MistralFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

/** Diagnostic detail of a rate-limit store failure: the code, plus the store status when one answered. */
const rateLimitFailureDetail = (failure: RateLimitFailure): string =>
  failure.status === undefined ? failure.error : `${failure.error} status=${failure.status}`

/**
 * Writes the single diagnostic line of a 503.
 *
 * The detail holds the failure stage and code only (bundle code and file, rate-limit store code and
 * status, or model code and upstream status): never the question, the history, the prompt, the
 * upstream body, the key or the caller's IP.
 */
const logUnavailable = (detail: string): void => {
  console.error(`[assistant] unavailable: ${detail}`)
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

/**
 * Answers one visitor question from the validated OKF bundle.
 *
 * Request order: same-origin check, JSON content type, shared rate limit, Zod validation, bundle
 * load, then the Mistral call. The rate limit counts on a keyed hash of the trusted client IP in a
 * shared store, so every serverless instance sees the same counter; when that store is configured
 * but fails, or is missing in production, the route fails closed instead of letting an unverified
 * request through. Every failure returns a generic code (never the question, the answer or an
 * upstream body); a 503 also writes one diagnostic line with its stage and code. The bundle and the
 * API key are checked before any network call: a missing key or a non-conformant bundle answers the
 * generic error, never an ungrounded answer.
 *
 * @param request Incoming `POST` with `{ question, history }` as JSON.
 * @returns `{ answer }` on success, or `{ error }` with 400, 403, 415, 429 or 503.
 */
export const POST = async (request: Request): Promise<Response> => {
  if (!isSameOrigin(request)) return errorResponse('invalid', 403)

  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return errorResponse('invalid', 415)

  const limit = await checkRateLimit(trustedClientIp(request))
  if (!limit.ok) {
    logUnavailable(`rate-limit ${rateLimitFailureDetail(limit)}`)
    return errorResponse('unavailable', 503)
  }
  if (limit.data === 'limited') return errorResponse('rate-limited', 429)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse('invalid', 400)
  }

  const parsed = AssistantRequestSchema.safeParse(payload)
  if (!parsed.success) return errorResponse('invalid', 400)

  const bundle = getOkfBundle()
  if (!bundle.ok) {
    logUnavailable(`bundle ${bundle.error.code} ${bundle.error.file}`)
    return errorResponse('unavailable', 503)
  }

  const completion = await requestChatCompletion({
    systemPrompt: buildAssistantSystemPrompt(bundle.data.grounding),
    messages: [...parsed.data.history, { role: 'user', content: parsed.data.question }],
  })
  if (!completion.ok) {
    logUnavailable(`mistral ${mistralFailureDetail(completion)}`)
    return errorResponse('unavailable', 503)
  }

  return json({ answer: resolveAssistantAnswer(completion.data) }, 200)
}
