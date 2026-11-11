import { SECTION_IDS } from '@/lib/anchors'
import { faq } from '@/locales/fr/faq'
import { FaqAccordion } from './FaqAccordion'
import styles from './styles/FAQ.module.css'

/** Id of the section's heading, which names the region through aria-labelledby. */
const HEADING_ID = 'faq-title'

/**
 * FAQ section: the single `<h2>` that names it and the validated questions as an accordion,
 * the first one open as the design shows it.
 *
 * Both strings come from `locales/fr/faq.ts`, read here and handed to {@link FaqAccordion} as plain
 * props, so the island ships no locale and the copy is in the server HTML. The section itself is a
 * server component; only the accordion is client code.
 */
export const FAQ = () => (
  <section id={SECTION_IDS.faq} aria-labelledby={HEADING_ID}>
    <div className={`${styles.content} mx-auto max-w-3xl`}>
      <h2
        id={HEADING_ID}
        className={`${styles.title} font-display text-display-sm font-bold text-foreground sm:text-display-md`}
      >
        {faq.title}
      </h2>
      <FaqAccordion items={faq.items} />
    </div>
  </section>
)
