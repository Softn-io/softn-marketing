import { chatbot } from '@/locales/fr/chatbot'
import { AgentMessageText } from './AgentMessageText'
import { agentSpeakerLabel, groupMessagesBySpeaker, withAssistantName, type AgentMessage } from './data/agentMessages'
import styles from './styles/Agent.module.css'

/** Props of {@link AgentMessages}. */
export type AgentMessagesProps = {
  /** Messages in render order, welcome messages first. */
  messages: readonly AgentMessage[]
}

/**
 * Conversation area: every message grouped by speaker, so a speaker line renders once above its run
 * of consecutive messages.
 *
 * The list is a polite live region: an answer that arrives is announced without interrupting the
 * visitor, and every message stays attributable to its speaker. The list name comes from the locale.
 */
export const AgentMessages = ({ messages }: AgentMessagesProps) => (
  <ol
    className={styles.messages}
    aria-label={withAssistantName(chatbot.panel.ariaLabel)}
    aria-live="polite"
    aria-relevant="additions text"
  >
    {groupMessagesBySpeaker(messages).map((group, groupIndex) => {
      const speaker = agentSpeakerLabel(group.speaker)
      return (
        <li key={`${group.speaker}-${groupIndex}`} className={styles.messageGroup}>
          <p className={`${styles.speaker} text-caption uppercase`}>{speaker}</p>
          <ol className={styles.groupMessages} aria-label={speaker}>
            {group.templates.map((template, messageIndex) => (
              <li key={messageIndex} className={`${styles.messageText} text-body-md text-foreground`}>
                <AgentMessageText template={template} contactLinkLabel={chatbot.contactPageLinkLabel} />
              </li>
            ))}
          </ol>
        </li>
      )
    })}
  </ol>
)
