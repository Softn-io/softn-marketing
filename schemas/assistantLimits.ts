/*
 * Constants, plain types and response guards of the assistant API, with no runtime dependency.
 *
 * This module is imported by the client island, so it must stay free of Zod: Zod v4 probes its JIT
 * support with `Function("")` at load time, which the production CSP (`script-src` without `eval`)
 * blocks. The Zod schemas live in `schemas/assistant.ts`, on the server only, and reuse these
 * constants so both sides share one source of truth.
 */

/** Longest question the assistant accepts, in characters. Exposed for the `{max}` copy. */
export const ASSISTANT_QUESTION_MAX_LENGTH = 500

/** Number of past turns kept in the conversation context sent to the model. */
export const ASSISTANT_HISTORY_MAX_MESSAGES = 10

/** Longest accepted text for one past turn, in characters. */
export const ASSISTANT_HISTORY_MESSAGE_MAX_LENGTH = 500

/** Error codes of the assistant Route Handler, mapped to locale copy by the UI. */
export const ASSISTANT_ERROR_CODES = ['invalid', 'rate-limited', 'unavailable'] as const

/** One error code of the assistant Route Handler. */
export type AssistantErrorCode = (typeof ASSISTANT_ERROR_CODES)[number]

/** One past turn of the conversation, as bounded by the client before sending. */
export type AssistantHistoryMessage = {
  /** Who wrote the turn. */
  role: 'user' | 'assistant'
  /** Turn text. */
  content: string
}

/** Body of a `POST /api/assistant` request. */
export type AssistantRequest = {
  /** Visitor question, already bounded by the client. */
  question: string
  /** Past turns, oldest first, at most {@link ASSISTANT_HISTORY_MAX_MESSAGES}. */
  history: AssistantHistoryMessage[]
}

/** Successful answer returned to the UI. */
export type AssistantSuccessResponse = {
  /** Answer text, never empty. */
  answer: string
}

/** Generic error returned to the UI: it carries no question, no answer and no upstream detail. */
export type AssistantErrorResponse = {
  /** Generic error code, mapped to locale copy. */
  error: AssistantErrorCode
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Checks that a parsed JSON body is the `{ answer: string }` success shape.
 *
 * The server is same-origin and its contract is tested; this guard only keeps unexpected bodies
 * (proxy error page, truncated response, future change) from reaching the conversation as a partial
 * answer. It is the client-side replacement for the former Zod parse.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value is a non-empty answer.
 */
export const isAssistantSuccessResponse = (value: unknown): value is AssistantSuccessResponse =>
  isRecord(value) && typeof value.answer === 'string' && value.answer.length > 0

/**
 * Checks that a parsed JSON body is one of the generic `{ error }` shapes.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value carries a known error code.
 */
export const isAssistantErrorResponse = (value: unknown): value is AssistantErrorResponse =>
  isRecord(value) &&
  typeof value.error === 'string' &&
  (ASSISTANT_ERROR_CODES as readonly string[]).includes(value.error)
