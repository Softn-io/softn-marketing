import { SECTION_IDS } from '@/lib/anchors'
import { faq } from '@/locales/fr/faq'
import { FaqAccordion } from './FaqAccordion'
import { FaqJsonLd } from './FaqJsonLd'
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
 *
 * The section also renders its own {@link FaqJsonLd}: the structured data is part of the section,
 * so it follows the FAQ to whichever page shows it and stays off the ones that do not.
 */
export const FAQ = () => (
  <section id={SECTION_IDS.faq} aria-labelledby={HEADING_ID}>
    <FaqJsonLd items={faq.items} />
    <div className={`${styles.content} mx-auto max-w-4xl`}>
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
