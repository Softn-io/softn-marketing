import { chatbot } from '@/locales/fr/chatbot'
import styles from './styles/Agent.module.css'

/** One suggested question: its identity, its locale label, and whether it leads to the booking flow. */
type AgentSuggestion = {
  /** Technical identity of the chip, stable when the locale wording changes. */
  id: string
  /** Locale label rendered in the chip. */
  label: string
  /** True for the booking chip, the one suggestion that opens the booking flow. */
  booking: boolean
}

/** Suggested questions, in the locale's order. */
const SUGGESTIONS: readonly AgentSuggestion[] = [
  { id: 'process', label: chatbot.suggestions.process, booking: false },
  { id: 'review', label: chatbot.suggestions.review, booking: false },
  { id: 'automation', label: chatbot.suggestions.automation, booking: false },
  { id: 'efficiency', label: chatbot.suggestions.efficiency, booking: false },
  { id: 'not-technical', label: chatbot.suggestions.notTechnical, booking: false },
  { id: 'services', label: chatbot.suggestions.services, booking: false },
  { id: 'book', label: chatbot.suggestions.book, booking: true },
]

/**
 * Suggested-question chips of the shell, named as one group by the locale. Each chip is a real
 * button, reachable with the keyboard and named by its locale label, but it starts no conversation
 * yet: the shell only renders them.
 *
 * The booking chip is picked by its own flag, never by its position in the list, and carries its
 * identity as a data attribute so its style and its tests do not depend on the order of the
 * suggestions.
 */
export const AgentSuggestions = () => (
  <ul className={styles.chips} aria-label={chatbot.suggestionsLabel}>
    {SUGGESTIONS.map((suggestion) => (
      <li key={suggestion.id}>
        <button
          type="button"
          className={suggestion.booking ? `${styles.chip} ${styles['chip-booking']}` : styles.chip}
          data-suggestion={suggestion.id}
        >
          {suggestion.label}
        </button>
      </li>
    ))}
  </ul>
)
