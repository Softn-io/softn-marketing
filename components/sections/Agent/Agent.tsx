import { SECTION_IDS } from '@/lib/anchors'
import { agent } from '@/locales/fr/agent'
import { AgentConversation } from './AgentConversation'
import { withAssistantName } from './data/agentMessages'
import styles from './styles/Agent.module.css'

/** Id of the heading that names the section. */
const HEADING_ID = 'agent-title'

/**
 * Assistant section: pulsing status dot and eyebrow, the single `<h2>`, then the live conversation
 * island with its messages, waiting state, chips and composer.
 *
 * Every string comes from `locales/fr/agent.ts` and `locales/fr/chatbot.ts`. The section itself stays
 * a server component; only {@link AgentConversation} is a client island, and the decorative glow and
 * the animations are pure CSS.
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
      <AgentConversation />
    </div>
  </section>
)
