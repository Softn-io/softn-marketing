import { createHash } from 'node:crypto'
import { z } from 'zod'
import { readEnv } from '@/lib/env'

/**
 * EU regional chat completions endpoint of the Mistral AI API, so inference runs in Mistral's
 * data centres in the EU and EFTA countries (https://docs.mistral.ai/api/endpoint/chat).
 */
export const MISTRAL_CHAT_COMPLETIONS_URL = 'https://api.eu.mistral.ai/v1/chat/completions'

/**
 * API model id of Mistral Small 4, version v26.03
 * (https://docs.mistral.ai/models/mistral-small-4-0-26-03): the pinned id, not the
 * `mistral-small-latest` alias, so a model swap on Mistral's side cannot change the answers.
 */
export const MISTRAL_MODEL = 'mistral-small-2603'

/** Namespaces the assistant's cached prefix inside the Mistral account sharing the API key. */
const PROMPT_CACHE_KEY_PREFIX = 'softn-assistant-'

/** Hex characters of the prompt digest kept in the key: enough to tell prompt versions apart. */
const PROMPT_CACHE_KEY_HASH_LENGTH = 16

/**
 * Builds the `prompt_cache_key` of a system prompt.
 *
 * Every request sends the same long prefix: the answer rules followed by the whole OKF bundle.
 * The key is a digest of that prefix, so it stays identical for every visitor and every serverless
 * instance while the bundle is unchanged, and changes as soon as the rules or the bundle change.
 * It is derived from the prompt only, never from the visitor, the question or the history.
 *
 * @param systemPrompt System prompt sent as the first message of every request.
 * @returns Stable cache key, prefixed for the assistant.
 */
export const buildPromptCacheKey = (systemPrompt: string): string =>
  `${PROMPT_CACHE_KEY_PREFIX}${createHash('sha256')
    .update(systemPrompt)
    .digest('hex')
    .slice(0, PROMPT_CACHE_KEY_HASH_LENGTH)}`

/** One turn sent to the model. */
export type MistralChatMessage = {
  /** Who wrote the turn. */
  role: 'user' | 'assistant'
  /** Turn text. */
  content: string
}

/** Arguments of {@link requestChatCompletion}. */
export type MistralRequest = {
  /** System prompt, rules included. */
  systemPrompt: string
  /** Conversation turns in order, oldest first. */
  messages: readonly MistralChatMessage[]
  /** Request timeout in milliseconds. Defaults to {@link MISTRAL_TIMEOUT_MS}; tests shorten it. */
  timeoutMs?: number
  /** Delay before the single retry, in milliseconds. Defaults to {@link MISTRAL_RETRY_DELAY_MS}. */
  retryDelayMs?: number
  /**
   * Overall budget for all attempts and the retry delay, in milliseconds. Defaults to
   * {@link MISTRAL_TOTAL_BUDGET_MS}; tests shorten it.
   */
  totalBudgetMs?: number
}

/** Non-personal failure codes, mapped by the Route Handler to one generic answer. */
export type MistralError = 'not-configured' | 'timeout' | 'rate-limited' | 'upstream' | 'invalid-response'

/**
 * Failure of one chat completion: the code, plus the HTTP status of the last attempt when the
 * failure came from an HTTP response. Nothing else of the response is kept.
 */
export type MistralFailure = {
  readonly ok: false
  readonly error: MistralError
  /** Status of the last HTTP response, absent when the failure never reached one. */
  readonly status?: number
}

/** Outcome of a chat completion: the answer text, or a failure. */
export type MistralResult = { readonly ok: true; readonly data: string } | MistralFailure

/** Upper bound on one completion attempt: the route must answer before the visitor gives up. */
const MISTRAL_TIMEOUT_MS = 15_000

/**
 * Overall time budget of one completion, all attempts and the retry delay included, in
 * milliseconds. Below the Route Handler's `maxDuration` (30 s) so the platform never kills the
 * invocation before the route can answer its generic 503.
 */
export const MISTRAL_TOTAL_BUDGET_MS = 20_000

/** One retry keeps a transient failure invisible while bounding the total wait. */
const MISTRAL_RETRY_DELAY_MS = 400

/** Low temperature: the assistant restates the bundle, it does not improvise. */
const MISTRAL_TEMPERATURE = 0.2

/** Answers are short by instruction; the cap is a backstop, not the style control. */
const MISTRAL_MAX_TOKENS = 600

const ChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
})

/** One attempt: the answer, or a failure plus whether retrying can help and the HTTP status if any. */
type Attempt =
  | { readonly ok: true; readonly content: string }
  | { readonly ok: false; readonly error: MistralError; readonly retry: boolean; readonly status?: number }

/** Copies the failure code and, when the attempt got an HTTP response, its status. */
const toFailure = (attempt: Extract<Attempt, { ok: false }>): MistralFailure =>
  attempt.status === undefined
    ? { ok: false, error: attempt.error }
    : { ok: false, error: attempt.error, status: attempt.status }

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

/** Time left before the overall deadline, floored at zero. */
const remainingBudget = (deadline: number): number => Math.max(0, deadline - Date.now())

const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')

/**
 * Sends one chat completion request and validates the response shape.
 *
 * The API key is read from the validated server environment (`lib/env.ts`) on every call, so a
 * server started with a new key does not need a restart, and a missing key never reaches the
 * network. The Mistral response body is never logged nor returned raw: it can echo the question.
 */
const sendChatCompletion = async (apiKey: string, request: MistralRequest, timeoutMs: number): Promise<Attempt> => {
  try {
    const response = await fetch(MISTRAL_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [{ role: 'system', content: request.systemPrompt }, ...request.messages],
        temperature: MISTRAL_TEMPERATURE,
        max_tokens: MISTRAL_MAX_TOKENS,
        prompt_cache_key: buildPromptCacheKey(request.systemPrompt),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (response.status === 429) return { ok: false, error: 'rate-limited', retry: true, status: response.status }
    if (response.status >= 500) return { ok: false, error: 'upstream', retry: true, status: response.status }
    if (!response.ok) return { ok: false, error: 'upstream', retry: false, status: response.status }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return { ok: false, error: 'invalid-response', retry: false }
    }

    const parsed = ChatCompletionResponseSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'invalid-response', retry: false }

    const content = parsed.data.choices[0]?.message.content.trim() ?? ''
    if (content === '') return { ok: false, error: 'invalid-response', retry: false }

    return { ok: true, content }
  } catch (error) {
    if (isTimeoutError(error)) return { ok: false, error: 'timeout', retry: false }
    return { ok: false, error: 'upstream', retry: true }
  }
}

/**
 * Asks Mistral Small 4 for one grounded answer.
 *
 * One retry is attempted on a network error, a 5xx or a 429, after a short backoff. Timeouts,
 * invalid responses and other 4xx are final: retrying them would only delay the generic error.
 * Every attempt and the backoff share one overall deadline, so the worst case stays below the
 * route's `maxDuration` instead of being cut off by the platform. Never throws: every failure is a
 * {@link MistralResult} error code.
 *
 * @param request System prompt and bounded conversation turns.
 * @returns The answer text, or a failure carrying the last attempt's HTTP status when it got one.
 */
export const requestChatCompletion = async (request: MistralRequest): Promise<MistralResult> => {
  let environment: ReturnType<typeof readEnv>
  try {
    environment = readEnv()
  } catch {
    return { ok: false, error: 'not-configured' }
  }

  const apiKey = environment.MISTRAL_API_KEY
  if (apiKey === undefined) return { ok: false, error: 'not-configured' }

  const timeoutMs = request.timeoutMs ?? MISTRAL_TIMEOUT_MS
  const retryDelayMs = request.retryDelayMs ?? MISTRAL_RETRY_DELAY_MS
  const totalBudgetMs = request.totalBudgetMs ?? MISTRAL_TOTAL_BUDGET_MS
  const deadline = Date.now() + totalBudgetMs

  const firstTimeout = Math.min(timeoutMs, remainingBudget(deadline))
  if (firstTimeout <= 0) return { ok: false, error: 'timeout' }

  const first = await sendChatCompletion(apiKey, request, firstTimeout)
  if (first.ok) return { ok: true, data: first.content }
  if (!first.retry) return toFailure(first)

  const beforeRetry = remainingBudget(deadline)
  if (beforeRetry <= 0) return { ok: false, error: 'timeout' }

  const delayMs = Math.min(retryDelayMs, beforeRetry)
  if (delayMs > 0) await delay(delayMs)

  const secondTimeout = Math.min(timeoutMs, remainingBudget(deadline))
  if (secondTimeout <= 0) return { ok: false, error: 'timeout' }

  const second = await sendChatCompletion(apiKey, request, secondTimeout)
  return second.ok ? { ok: true, data: second.content } : toFailure(second)
}
