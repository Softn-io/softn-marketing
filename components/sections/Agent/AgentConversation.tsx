'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { BOOKING_OPEN_QUERY_KEY } from '@/lib/anchors'
import { ASSISTANT_INTENT_EVENT, ASSISTANT_INTENTS, type AssistantIntentDetail } from '@/lib/assistant/intent'
import { chatbot } from '@/locales/fr/chatbot'
import { AGENT_QUESTION_INPUT_ID, AgentComposer } from './AgentComposer'
import { AgentMessages } from './AgentMessages'
import { AgentMessageText } from './AgentMessageText'
import { AgentSuggestions } from './AgentSuggestions'
import { AgentTypingIndicator } from './AgentTypingIndicator'
import {
  ASSISTANT_CONVERSATION_STATUS,
  useAssistantConversation,
  type AssistantConversationError,
} from './hooks/useAssistantConversation'
import styles from './styles/Agent.module.css'

/**
 * Reservation flow, loaded on its own when a visitor opens it.
 *
 * The flow is the heaviest client island of the section and most visitors never open it, so it is
 * split out of the initial bundle: no booking code is fetched until the booking chip, the hero's
 * call to action or the offer sheet asks for it. It renders only on the client, where its state
 * lives.
 */
const BookingFlow = dynamic(() => import('./BookingFlow').then((module) => module.BookingFlow), {
  ssr: false,
  loading: () => (
    <p className={`${styles.bookingLoading} text-body-sm text-foreground-tertiary`}>{chatbot.loading.message}</p>
  ),
})

/** Notice the conversation shows after a flow the visitor ended or refused. */
type ConversationNotice = 'cancelled' | 'declined'

/**
 * Error copy the visitor reads, picked by the failure the hook exposes.
 *
 * Every string is locale copy: the browser never invents wording for a failure, and the
 * unavailable answer keeps the contact-page link of `chatbot.error.llm`.
 */
const errorTemplate = (error: NonNullable<AssistantConversationError>): string => {
  if (error === 'network') return chatbot.error.network
  if (error === 'rate-limited') return chatbot.error.rateLimit
  return chatbot.error.llm
}

/**
 * Live conversation island of the assistant section.
 *
 * Owns the conversation state through {@link useAssistantConversation} and renders the messages,
 * the waiting state, the recoverable error with its retry, the suggested-question chips and the
 * composer. The booking chip and the site's `assistant-intent` event open the lazy-loaded
 * reservation flow instead of asking the model: a booking never goes through the assistant, and the
 * composer is set aside while the flow is open so the page never shows two fields at once.
 */
export const AgentConversation = () => {
  const conversation = useAssistantConversation()
  const { ask, retry } = conversation
  const sending = conversation.status === ASSISTANT_CONVERSATION_STATUS.sending

  const [bookingOpen, setBookingOpen] = useState(false)
  const [notice, setNotice] = useState<ConversationNotice | null>(null)
  const restoreFocusRef = useRef(false)

  const openBooking = useCallback((): void => {
    setNotice(null)
    setBookingOpen(true)
  }, [])

  const closeBooking = useCallback((nextNotice: ConversationNotice | null): void => {
    restoreFocusRef.current = true
    setBookingOpen(false)
    setNotice(nextNotice)
  }, [])

  const handleQuestion = useCallback(
    (question: string): void => {
      setNotice(null)
      ask(question)
    },
    [ask],
  )

  useEffect(() => {
    const handleIntent = (event: CustomEvent<AssistantIntentDetail>): void => {
      if (event.detail.intent === ASSISTANT_INTENTS.booking) openBooking()
    }

    window.addEventListener(ASSISTANT_INTENT_EVENT, handleIntent)
    return () => window.removeEventListener(ASSISTANT_INTENT_EVENT, handleIntent)
  }, [openBooking])

  // A book-again link carries the booking query key: the flow opens once, then the key leaves the
  // address bar so a reload or a shared URL does not reopen it. The hash is kept, so the page still
  // scrolls to the section like every other call to action. Opening is deferred to a microtask: the
  // effect itself only touches the URL, and the state update never runs inside it.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(BOOKING_OPEN_QUERY_KEY)) return

    url.searchParams.delete(BOOKING_OPEN_QUERY_KEY)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    queueMicrotask(openBooking)
  }, [openBooking])

  // Closing the flow gives focus back to the composer: the conversation is where the visitor was.
  useEffect(() => {
    if (bookingOpen || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    document.getElementById(AGENT_QUESTION_INPUT_ID)?.focus()
  }, [bookingOpen])

  return (
    <>
      <div className={styles.conversation}>
        <AgentMessages messages={conversation.messages} />
        {sending ? <AgentTypingIndicator /> : null}
        {conversation.error !== null ? (
          <div className={styles.error} role="alert">
            <p className={styles.errorText}>
              <AgentMessageText
                template={errorTemplate(conversation.error)}
                contactLinkLabel={chatbot.contactPageLinkLabel}
              />
            </p>
            <button type="button" className={styles.retry} onClick={retry}>
              {chatbot.error.llmRetry}
            </button>
          </div>
        ) : null}
        {notice === null ? null : (
          <p className={`${styles.notice} text-body-md text-foreground-secondary`} role="status">
            <AgentMessageText
              template={notice === 'cancelled' ? chatbot.booking.cancelled : chatbot.consent.declined}
              contactLinkLabel={chatbot.contactPageLinkLabel}
            />
          </p>
        )}
      </div>
      {bookingOpen ? (
        <BookingFlow
          onCancel={() => closeBooking('cancelled')}
          onDecline={() => closeBooking('declined')}
          onRestart={() => closeBooking(null)}
        />
      ) : (
        <>
          <AgentSuggestions onSelect={handleQuestion} onBook={openBooking} disabled={sending} />
          <AgentComposer
            question={conversation.question}
            onQuestionChange={conversation.setQuestion}
            onSubmit={() => handleQuestion(conversation.question)}
            sending={sending}
            tooLong={conversation.tooLong}
          />
        </>
      )}
    </>
  )
}
