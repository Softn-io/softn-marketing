import { chatbot } from '@/locales/fr/chatbot'
import { withAssistantName } from './data/agentMessages'
import styles from './styles/Agent.module.css'

/**
 * Visible demo state of the shell: the three animated dots shown while the assistant is writing.
 * The dots are decorative; the group carries the locale's accessible label for the whole indicator.
 */
export const AgentTypingIndicator = () => (
  <div className={styles.typing} role="img" aria-label={withAssistantName(chatbot.typing.ariaLabel)}>
    <span aria-hidden="true" className={styles.typingDot} />
    <span aria-hidden="true" className={`${styles.typingDot} ${styles['typingDot-delay-1']}`} />
    <span aria-hidden="true" className={`${styles.typingDot} ${styles['typingDot-delay-2']}`} />
  </div>
)
