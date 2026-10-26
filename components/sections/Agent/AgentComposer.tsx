import { ArrowRight } from 'lucide-react'
import { agent } from '@/locales/fr/agent'
import { withAssistantName } from './data/agentMessages'
import styles from './styles/Agent.module.css'

/** Id shared by the question input and its label. */
const INPUT_ID = 'agent-question'

/** Id of the scope note that describes what the assistant answers. */
const SCOPE_NOTE_ID = 'agent-scope-note'

/**
 * Question composer of the shell: a labelled text input, a send button, and the scope note below it.
 *
 * The shell has no conversation logic yet, so the composer is not a form and the button is a plain
 * `type="button"`: pressing Enter or clicking never reloads or submits the page. Both controls are
 * focusable and named from the locale. The scope note tells the visitor which questions the
 * assistant answers, so it is the input's description (`aria-describedby`) rather than a label
 * repeated above the field.
 */
export const AgentComposer = () => (
  <>
    <div className={styles.composer}>
      <label className="sr-only" htmlFor={INPUT_ID}>
        {agent.inputLabel}
      </label>
      <input
        id={INPUT_ID}
        className={styles.input}
        type="text"
        placeholder={agent.inputPlaceholder}
        autoComplete="off"
        aria-describedby={SCOPE_NOTE_ID}
      />
      <button type="button" className={styles.send} aria-label={agent.sendLabel}>
        <ArrowRight aria-hidden="true" />
      </button>
    </div>
    <p id={SCOPE_NOTE_ID} className={`${styles.scopeNote} text-body-sm text-foreground-tertiary`}>
      {withAssistantName(agent.scopeNote)}
    </p>
  </>
)
