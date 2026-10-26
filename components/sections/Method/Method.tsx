import { SECTION_IDS } from '@/lib/anchors'
import { method } from '@/locales/fr/method'
import { MethodDiagram } from './MethodDiagram'
import { MethodTimeline } from './MethodTimeline'
import { MethodTimelineParallax } from './MethodTimelineParallax'
import styles from './styles/Method.module.css'

/** Id of the heading that names the section, also used by the diagram's surrounding copy. */
const HEADING_ID = 'method-title'

/**
 * Method section: eyebrow, a single `<h2>` whose second part carries the highlight, the intro, the
 * scroll-driven review-loop diagram and the five-step timeline that follows it.
 *
 * Every string comes from `locales/fr/method.ts`; the section itself is a server component and only
 * the diagram is a client island. The timeline pins and stacks one block per step as the reader
 * scrolls it.
 */
export const Method = () => (
  <section id={SECTION_IDS.method} aria-labelledby={HEADING_ID}>
    <div className={`${styles.content} mx-auto max-w-6xl`}>
      <p className="text-caption text-foreground-tertiary uppercase">{method.eyebrow}</p>
      <h2 id={HEADING_ID} className={`${styles.title} font-display text-display-md text-foreground sm:text-display-lg`}>
        {method.title.part1} <span className="text-brand-foreground">{method.title.part2}</span>
      </h2>
      <p className={`${styles.intro} text-body-md text-foreground-secondary`}>{method.intro}</p>
    </div>
    <MethodDiagram />
    <MethodTimeline />
    <MethodTimelineParallax />
  </section>
)
