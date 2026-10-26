import { AGENT_WELCOME_MESSAGES, agentSpeakerLabel, groupMessagesBySpeaker, withAssistantName } from './data/agentMessages'
import styles from './styles/Agent.module.css'

/**
 * Static conversation area of the shell: the assistant's welcome messages, grouped by speaker so the
 * speaker line renders once above its run of consecutive messages.
 *
 * Groups are an ordered list and each group holds an ordered list of its own messages, so the future
 * conversation can append messages in order and announce them as a log. A group is named by its
 * speaker label, which keeps every message attributable to its speaker for assistive technology. No
 * interaction and no live region yet: the content never changes in the shell.
 */
export const AgentMessages = () => (
  <ol className={styles.messages}>
    {groupMessagesBySpeaker(AGENT_WELCOME_MESSAGES).map((group, index) => {
      const speaker = agentSpeakerLabel(group.speaker)
      return (
        <li key={`${group.speaker}-${index}`} className={styles.messageGroup}>
          <p className={`${styles.speaker} text-caption uppercase`}>{speaker}</p>
          <ol className={styles.groupMessages} aria-label={speaker}>
            {group.templates.map((template) => (
              <li key={template} className={`${styles.messageText} text-body-md text-foreground`}>
                {withAssistantName(template)}
              </li>
            ))}
          </ol>
        </li>
      )
    })}
  </ol>
)
