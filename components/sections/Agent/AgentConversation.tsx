'use client'

import { useEffect } from 'react'
import { ASSISTANT_INTENT_EVENT, ASSISTANT_INTENTS, type AssistantIntentDetail } from '@/lib/assistant/intent'
import { chatbot } from '@/locales/fr/chatbot'
import { AgentComposer } from './AgentComposer'
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
 * composer. It also listens for the site's `assistant-intent` event, so the hero and the offer sheet
 * can ask for the booking question without reaching into this component.
 */
export const AgentConversation = () => {
  const conversation = useAssistantConversation()
  const { ask, retry } = conversation
  const sending = conversation.status === ASSISTANT_CONVERSATION_STATUS.sending

  useEffect(() => {
    const handleIntent = (event: CustomEvent<AssistantIntentDetail>): void => {
      if (event.detail.intent === ASSISTANT_INTENTS.booking) ask(chatbot.suggestions.book)
    }

    window.addEventListener(ASSISTANT_INTENT_EVENT, handleIntent)
    return () => window.removeEventListener(ASSISTANT_INTENT_EVENT, handleIntent)
  }, [ask])

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
      </div>
      <AgentSuggestions onSelect={ask} disabled={sending} />
      <AgentComposer
        question={conversation.question}
        onQuestionChange={conversation.setQuestion}
        onSubmit={() => ask(conversation.question)}
        sending={sending}
        tooLong={conversation.tooLong}
      />
    </>
  )
}
