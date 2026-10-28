/*
 * Server-only Zod schemas of the assistant API. Client code imports `assistantLimits` instead:
 * importing this module would ship Zod to the browser, whose JIT probe calls `Function("")` and
 * trips the production CSP.
 */
import { z } from 'zod'
import {
  ASSISTANT_HISTORY_MAX_MESSAGES,
  ASSISTANT_HISTORY_MESSAGE_MAX_LENGTH,
  ASSISTANT_QUESTION_MAX_LENGTH,
  ASSISTANT_ERROR_CODES,
} from './assistantLimits'

export * from './assistantLimits'

/** One past turn of the conversation, as bounded by the client before sending. */
export const AssistantHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(ASSISTANT_HISTORY_MESSAGE_MAX_LENGTH),
})

/**
 * Body of a `POST /api/assistant` request.
 *
 * The question is trimmed before length validation, so trailing spaces never make a valid
 * question fail. The history is bounded: the client only sends the last
 * {@link ASSISTANT_HISTORY_MAX_MESSAGES} turns, and the server rejects a longer one instead of
 * silently truncating it.
 */
export const AssistantRequestSchema = z.object({
  question: z.string().trim().min(1).max(ASSISTANT_QUESTION_MAX_LENGTH),
  history: z.array(AssistantHistoryMessageSchema).max(ASSISTANT_HISTORY_MAX_MESSAGES).default([]),
})

/** Successful answer returned to the UI. */
export const AssistantSuccessResponseSchema = z.object({
  answer: z.string().min(1),
})

/** Generic error returned to the UI: it carries no question, no answer and no upstream detail. */
export const AssistantErrorResponseSchema = z.object({
  error: z.enum(ASSISTANT_ERROR_CODES),
})
