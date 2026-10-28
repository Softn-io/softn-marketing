import { chatbot } from '@/locales/fr/chatbot'
import { withAssistantName } from './data/agentMessages'
import styles from './styles/Agent.module.css'

/**
 * Waiting state shown while one answer is in flight: three animated dots, decorative and hidden from
 * assistive technology, plus the visible locale sentence so the wait is also readable as text.
 */
export const AgentTypingIndicator = () => (
  <div className={styles.typing}>
    <div role="img" aria-label={withAssistantName(chatbot.typing.ariaLabel)}>
      <span aria-hidden="true" className={styles.typingDot} />
      <span aria-hidden="true" className={`${styles.typingDot} ${styles['typingDot-delay-1']}`} />
      <span aria-hidden="true" className={`${styles.typingDot} ${styles['typingDot-delay-2']}`} />
    </div>
    <p className={`${styles.typingText} text-body-sm text-foreground-tertiary`}>
      {withAssistantName(chatbot.thinking.message)}
    </p>
  </div>
)
