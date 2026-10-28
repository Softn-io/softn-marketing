import { ArrowRight } from 'lucide-react'
import { interpolate } from '@/lib/interpolate'
import { ASSISTANT_QUESTION_MAX_LENGTH } from '@/schemas/assistantLimits'
import { agent } from '@/locales/fr/agent'
import { chatbot } from '@/locales/fr/chatbot'
import { withAssistantName } from './data/agentMessages'
import styles from './styles/Agent.module.css'

/** Id shared by the question input and its label. */
const INPUT_ID = 'agent-question'

/** Id of the scope note that describes what the assistant answers. */
const SCOPE_NOTE_ID = 'agent-scope-note'

/** Id of the privacy note shown under the composer. */
const PRIVACY_NOTE_ID = 'agent-privacy-note'

/** Id of the error shown when the question is too long. */
const TOO_LONG_ID = 'agent-question-too-long'

/** Props of {@link AgentComposer}. */
export type AgentComposerProps = {
  /** Current composer value. */
  question: string
  /** Updates the composer value. */
  onQuestionChange: (value: string) => void
  /** Sends the current question. */
  onSubmit: () => void
  /** True while an answer is in flight: the field and the button are disabled. */
  sending: boolean
  /** True when the question exceeds {@link ASSISTANT_QUESTION_MAX_LENGTH}. */
  tooLong: boolean
}

/**
 * Question composer: a labelled text field, a submit button, the too-long error, the privacy note and
 * the scope note.
 *
 * A real form gives Enter and the button the same submit path. The button stays disabled while the
 * field is empty, too long or a request is in flight, so a double submit cannot happen. The scope and
 * privacy notes describe the field (`aria-describedby`); the too-long error joins them and marks the
 * field invalid.
 */
export const AgentComposer = ({ question, onQuestionChange, onSubmit, sending, tooLong }: AgentComposerProps) => {
  const empty = question.trim() === ''
  const describedBy = [SCOPE_NOTE_ID, PRIVACY_NOTE_ID, tooLong ? TOO_LONG_ID : null].filter(Boolean).join(' ')

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      noValidate
    >
      <div className={`${styles.composer} ${tooLong ? styles['composer-invalid'] : ''}`}>
        <label className="sr-only" htmlFor={INPUT_ID}>
          {agent.inputLabel}
        </label>
        <input
          id={INPUT_ID}
          className={styles.input}
          type="text"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder={agent.inputPlaceholder}
          autoComplete="off"
          aria-invalid={tooLong || undefined}
          aria-describedby={describedBy}
        />
        <button
          type="submit"
          className={styles.send}
          aria-label={agent.sendLabel}
          disabled={empty || tooLong || sending}
        >
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
      {tooLong ? (
        <p id={TOO_LONG_ID} className={`${styles.fieldError} text-body-sm`} role="alert">
          {interpolate(chatbot.input.tooLong, { max: String(ASSISTANT_QUESTION_MAX_LENGTH) })}
        </p>
      ) : null}
      <p id={SCOPE_NOTE_ID} className={`${styles.scopeNote} text-body-sm text-foreground-tertiary`}>
        {withAssistantName(agent.scopeNote)}
      </p>
      <p id={PRIVACY_NOTE_ID} className={`${styles.privacyNote} text-body-sm text-foreground-tertiary`}>
        {chatbot.input.privacyNote}
      </p>
    </form>
  )
}
