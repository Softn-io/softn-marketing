import Link from 'next/link'
import { PointerGlow } from '@components/ui/PointerGlow'
import { ThemeToggle } from '@components/ui/ThemeToggle'
import { joinWaitlist } from '@/actions/joinWaitlist'
import { SECTION_IDS } from '@/lib/anchors'
import { interpolate } from '@/lib/interpolate'
import { comingSoon } from '@/locales/fr/comingSoon'
import { nav } from '@/locales/fr/hero'
import { WaitlistForm } from './WaitlistForm'
import styles from './styles/ComingSoon.module.css'

const copyright = interpolate(comingSoon.footer.copyright, { year: String(new Date().getFullYear()) })

/**
 * Coming-soon home page: header with the wordmark and the theme toggle, the left-aligned launch
 * copy and giant decorative wordmark, the waitlist form and the copyright footer, over the hero's
 * shared pointer glow and brand orbs.
 *
 * Server component: only the theme toggle and the form are client islands. Every string comes from
 * `locales/fr/comingSoon.ts` and `locales/fr/hero.ts`; the footer's Contact and legal links are
 * omitted because their routes do not exist yet.
 */
export const ComingSoon = () => {
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles['orb-vivid']} />
        <div className={styles['orb-rich']} />
        <div className={styles['orb-warm']} />
        <PointerGlow />
        <div className={styles['backdrop-fade']} />
      </div>
      <header className={styles.header}>
        <Link
          href="/"
          aria-label={nav.logo.ariaLabel}
          className={`${styles.wordmark} font-display text-title-md text-foreground`}
        >
          {nav.logo.name}
          <span className="text-brand-vivid">{nav.logo.suffix}</span>
        </Link>
        <ThemeToggle />
      </header>
      <main id={SECTION_IDS.main} className={styles.main}>
        <div className={styles.content}>
          <p className={`${styles.eyebrow} ${styles.reveal} text-caption text-brand-foreground uppercase`}>
            <span aria-hidden="true" className={styles.dot} />
            {comingSoon.eyebrow}
          </p>
          <div
            aria-hidden="true"
            className={`${styles['wordmark-large']} ${styles.reveal} ${styles['reveal-delay-1']} font-display text-foreground`}
          >
            {nav.logo.name}
            <span className="text-brand-vivid">{nav.logo.suffix}</span>
          </div>
          <h1
            className={`${styles.title} ${styles.reveal} ${styles['reveal-delay-2']} font-display text-display-sm text-foreground sm:text-display-md`}
          >
            {comingSoon.title}
          </h1>
          <div className={`${styles.body} ${styles.reveal} ${styles['reveal-delay-3']}`}>
            <p className="text-body-sm text-foreground-secondary sm:text-body-md lg:text-body-lg">{comingSoon.body}</p>
            <p className="text-body-sm text-foreground-secondary sm:text-body-md lg:text-body-lg">
              {comingSoon.bodyInvite}
            </p>
          </div>
          <div className={`${styles['form-area']} ${styles.reveal} ${styles['reveal-delay-4']}`}>
            <WaitlistForm action={joinWaitlist} />
          </div>
        </div>
      </main>
      <footer className={styles.footer}>
        <p className="text-body-sm">{copyright}</p>
      </footer>
    </div>
  )
}
