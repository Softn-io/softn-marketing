import { SECTION_IDS } from '@/lib/anchors'
import { agent } from '@/locales/fr/agent'
import { AgentComposer } from './AgentComposer'
import { AgentMessages } from './AgentMessages'
import { AgentSuggestions } from './AgentSuggestions'
import { AgentTypingIndicator } from './AgentTypingIndicator'
import { withAssistantName } from './data/agentMessages'
import styles from './styles/Agent.module.css'

/** Id of the heading that names the section. */
const HEADING_ID = 'agent-title'

/**
 * Agent section shell: pulsing status dot and eyebrow, the single `<h2>`, the static welcome
 * messages with the typing indicator, the suggested-question chips and the question composer with
 * its scope note.
 *
 * Every string comes from `locales/fr/agent.ts` and `locales/fr/chatbot.ts`. The section is a server
 * component: it holds no conversation logic (the chatbot behaviour comes later), the chips and the
 * composer only render, and the decorative glow and the animations are pure CSS.
 */
export const Agent = () => (
  <section id={SECTION_IDS.agent} aria-labelledby={HEADING_ID} className={styles.section}>
    <div aria-hidden="true" className={styles.glow} />
    <div className={`${styles.content} mx-auto max-w-4xl`}>
      <p className="flex items-center gap-3 text-caption text-foreground-tertiary uppercase">
        <span aria-hidden="true" className={styles.statusDot} />
        {withAssistantName(agent.eyebrow)}
      </p>
      <h2 id={HEADING_ID} className={`${styles.title} font-display text-display-md text-foreground sm:text-display-lg`}>
        {withAssistantName(agent.title)}
      </h2>
      <div className={styles.conversation}>
        <AgentMessages />
        <AgentTypingIndicator />
      </div>
      <AgentSuggestions />
      <AgentComposer />
    </div>
  </section>
)
