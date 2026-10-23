import { comingSoon } from '@/locales/fr/comingSoon'
import { nav } from '@/locales/fr/hero'
import styles from './ComingSoon.module.css'

/**
 * Single-screen coming-soon section of the home page: the site wordmark, the eyebrow, the page's
 * single `<h1>` and the body copy, over a static decorative glow.
 *
 * Server component: it holds no state and runs no effect, and the glow is painted by the CSS
 * Module, so the page is complete and centred without JavaScript. The wordmark is plain text, not
 * a link, because this section is already the home page.
 */
export const ComingSoon = () => {
  return (
    <section className={styles.section}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.card}>
        <p className="font-display text-title-md text-foreground">
          {nav.logo.name}
          <span className="text-brand-vivid">{nav.logo.suffix}</span>
        </p>
        <p className="mt-6 text-caption text-brand-foreground uppercase">{comingSoon.eyebrow}</p>
        <h1 className="mt-4 font-display text-display-sm text-balance text-foreground sm:text-display-md lg:text-display-lg">
          {comingSoon.title}
        </h1>
        <p className={`${styles.body} mt-4 text-body-sm text-foreground-secondary sm:text-body-md`}>
          {comingSoon.body}
        </p>
      </div>
    </section>
  )
}
