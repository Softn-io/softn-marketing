import { BookingCta } from '@components/ui/BookingCta'
import { SECTION_IDS } from '@/lib/anchors'
import { appel } from '@/locales/fr/hero'
import styles from './styles/FinalCta.module.css'

/** Id of the section's heading, which names the region through aria-labelledby. */
const HEADING_ID = 'final-cta-title'

/**
 * Final call-to-action section: the single `<h2>`, the paragraph that sums up the exchange and one
 * large call to action, over a decorative glow that breathes in the bottom-left corner.
 *
 * The three strings come from `locales/fr/hero.ts` (`appel`). The section itself is a server
 * component; only the call to action is client code, through the shared
 * {@link BookingCta}, and the glow is pure CSS.
 */
export const FinalCta = () => (
  <section id={SECTION_IDS.finalCta} aria-labelledby={HEADING_ID} className={styles.section}>
    <div aria-hidden="true" className={styles.glow} />
    <div className={`${styles.content} mx-auto max-w-6xl`}>
      <h2 id={HEADING_ID} className={`${styles.title} font-display text-display-md text-foreground sm:text-display-lg`}>
        <span className="md:block">{appel.title.line1}</span> <span className="md:block">{appel.title.line2}</span>
      </h2>
      <p className={`${styles.body} text-body-md text-foreground-secondary`}>{appel.body}</p>
      <div className={styles.actions}>
        <BookingCta size="lg">{appel.cta}</BookingCta>
      </div>
    </div>
  </section>
)
