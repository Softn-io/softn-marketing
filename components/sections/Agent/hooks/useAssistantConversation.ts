'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ASSISTANT_HISTORY_MAX_MESSAGES,
  ASSISTANT_QUESTION_MAX_LENGTH,
  isAssistantSuccessResponse,
  type AssistantHistoryMessage,
} from '@/schemas/assistantLimits'
import { AGENT_SPEAKERS, AGENT_WELCOME_MESSAGES, type AgentMessage } from '../data/agentMessages'

/** Conversation state of the assistant: waiting, a request in flight, or a recoverable failure. */
export const ASSISTANT_CONVERSATION_STATUS = {
  idle: 'idle',
  sending: 'sending',
  error: 'error',
} as const

/** Conversation state of the assistant. */
export type AssistantConversationStatus =
  (typeof ASSISTANT_CONVERSATION_STATUS)[keyof typeof ASSISTANT_CONVERSATION_STATUS]

/** Failure the visitor can see, mapped to locale copy by the conversation island. */
export type AssistantConversationError = 'unavailable' | 'rate-limited' | 'network' | null

/** One request that can be retried unchanged. */
type PendingRequest = {
  readonly question: string
  readonly history: readonly AssistantHistoryMessage[]
}

/** Values and actions the agent conversation UI needs. */
export type AssistantConversation = {
  /** Rendered messages, welcome messages first. */
  messages: readonly AgentMessage[]
  /** Current conversation state. */
  status: AssistantConversationStatus
  /** Failure to show, or `null`. */
  error: AssistantConversationError
  /** Current composer value. */
  question: string
  /** True when the composer value exceeds {@link ASSISTANT_QUESTION_MAX_LENGTH}. */
  tooLong: boolean
  /** Updates the composer value. */
  setQuestion: (value: string) => void
  /** Sends a question; chips and the composer both use it. */
  ask: (question: string) => void
  /** Re-sends the last failed question without adding it to the conversation again. */
  retry: () => void
}

const EMPTY_QUESTION = ''

/**
 * Owns the assistant conversation: messages, request state, bounded history and retry.
 *
 * The hook never throws and never logs. A failed request keeps the visitor's question in the
 * conversation and exposes an error code, so the UI can show locale copy and offer a retry. The
 * history sent to the server is the last {@link ASSISTANT_HISTORY_MAX_MESSAGES} turns, with the
 * welcome messages excluded: they are site copy, not conversation turns.
 *
 * @returns The conversation state and its actions.
 */
export const useAssistantConversation = (): AssistantConversation => {
  const [messages, setMessages] = useState<readonly AgentMessage[]>(AGENT_WELCOME_MESSAGES)
  const [status, setStatus] = useState<AssistantConversationStatus>(ASSISTANT_CONVERSATION_STATUS.idle)
  const [error, setError] = useState<AssistantConversationError>(null)
  const [question, setQuestion] = useState(EMPTY_QUESTION)

  const pendingRef = useRef<PendingRequest | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sendingRef = useRef(false)

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const runRequest = useCallback(async (pending: PendingRequest): Promise<void> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    pendingRef.current = pending
    sendingRef.current = true
    setStatus(ASSISTANT_CONVERSATION_STATUS.sending)
    setError(null)

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
        signal: controller.signal,
      })

      if (!response.ok) {
        setError(response.status === 429 ? 'rate-limited' : 'unavailable')
        setStatus(ASSISTANT_CONVERSATION_STATUS.error)
        return
      }

      const payload: unknown = await response.json().catch(() => null)
      if (!isAssistantSuccessResponse(payload)) {
        setError('unavailable')
        setStatus(ASSISTANT_CONVERSATION_STATUS.error)
        return
      }

      setMessages((current) => [...current, { speaker: AGENT_SPEAKERS.assistant, template: payload.answer }])
      setStatus(ASSISTANT_CONVERSATION_STATUS.idle)
    } catch {
      if (controller.signal.aborted) return
      setError('network')
      setStatus(ASSISTANT_CONVERSATION_STATUS.error)
    } finally {
      if (abortRef.current === controller) sendingRef.current = false
    }
  }, [])

  const ask = useCallback(
    (rawQuestion: string): void => {
      const trimmed = rawQuestion.trim()
      if (trimmed === '' || trimmed.length > ASSISTANT_QUESTION_MAX_LENGTH || sendingRef.current) return

      const history = messages
        .slice(AGENT_WELCOME_MESSAGES.length)
        .map<AssistantHistoryMessage>((message) => ({
          role: message.speaker === AGENT_SPEAKERS.visitor ? 'user' : 'assistant',
          content: message.template,
        }))
        .slice(-ASSISTANT_HISTORY_MAX_MESSAGES)

      // A window that starts mid-turn would give the model an answer without its question.
      const firstQuestion = history.findIndex((message) => message.role === 'user')
      const alignedHistory = firstQuestion === -1 ? [] : history.slice(firstQuestion)

      setMessages((current) => [...current, { speaker: AGENT_SPEAKERS.visitor, template: trimmed }])
      setQuestion(EMPTY_QUESTION)
      void runRequest({ question: trimmed, history: alignedHistory })
    },
    [messages, runRequest],
  )

  const retry = useCallback((): void => {
    const pending = pendingRef.current
    if (pending === null || sendingRef.current) return
    void runRequest(pending)
  }, [runRequest])

  return {
    messages,
    status,
    error,
    question,
    tooLong: question.trim().length > ASSISTANT_QUESTION_MAX_LENGTH,
    setQuestion,
    ask,
    retry,
  }
}
