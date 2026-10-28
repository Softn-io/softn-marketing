import { z } from 'zod'
import { readEnv } from '@/lib/env'
import type { Result } from './result'

/** Chat completions endpoint of the Mistral AI API (https://docs.mistral.ai/api/endpoint/chat). */
export const MISTRAL_CHAT_COMPLETIONS_URL = 'https://api.mistral.ai/v1/chat/completions'

/**
 * API model id of Mistral Small 4, version v26.03
 * (https://docs.mistral.ai/models/mistral-small-4-0-26-03): the pinned id, not the
 * `mistral-small-latest` alias, so a model swap on Mistral's side cannot change the answers.
 */
export const MISTRAL_MODEL = 'mistral-small-2603'

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

/** Outcome of a chat completion: the answer text, or a failure code. */
export type MistralResult = Result<string, MistralError>

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

/** One attempt: the answer, or a failure plus whether retrying can help. */
type Attempt =
  | { readonly ok: true; readonly content: string }
  | { readonly ok: false; readonly error: MistralError; readonly retry: boolean }

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
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (response.status === 429) return { ok: false, error: 'rate-limited', retry: true }
    if (response.status >= 500) return { ok: false, error: 'upstream', retry: true }
    if (!response.ok) return { ok: false, error: 'upstream', retry: false }

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
 * @returns The answer text, or a failure code.
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
  if (!first.retry) return { ok: false, error: first.error }

  const beforeRetry = remainingBudget(deadline)
  if (beforeRetry <= 0) return { ok: false, error: 'timeout' }

  const delayMs = Math.min(retryDelayMs, beforeRetry)
  if (delayMs > 0) await delay(delayMs)

  const secondTimeout = Math.min(timeoutMs, remainingBudget(deadline))
  if (secondTimeout <= 0) return { ok: false, error: 'timeout' }

  const second = await sendChatCompletion(apiKey, request, secondTimeout)
  return second.ok ? { ok: true, data: second.content } : { ok: false, error: second.error }
}
