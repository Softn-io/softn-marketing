import Link from 'next/link'
import { Logo } from '@components/ui/Logo'
import { interpolate } from '@/lib/interpolate'
import { footer } from '@/locales/fr/footer'
import { nav } from '@/locales/fr/hero'
import { FooterNav } from './FooterNav'
import styles from './styles/Footer.module.css'

/** Copyright line: the year is a parameter of the copy, computed at render time. */
const copyright = interpolate(footer.copyright, { year: String(new Date().getFullYear()) })

/**
 * Site footer: the wordmark back to the home page, the copyright and the navigation to the contact
 * page and the three legal pages.
 *
 * Server component. Every string comes from `locales/fr/`, the routes from `lib/routes.ts`, so no
 * path and no wording is written twice; the navigation itself is `FooterNav`, shared with the
 * coming-soon footer. The copy's cookie-settings link is absent until the consent banner it opens
 * exists.
 *
 * @returns The footer landmark of the pages that carry the site chrome.
 */
export const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link href="/" aria-label={nav.logo.ariaLabel} className={styles.wordmark}>
            <Logo />
          </Link>
          <p className={`${styles.copyright} text-body-sm`}>{copyright}</p>
        </div>
        <FooterNav className={styles.nav} />
      </div>
    </footer>
  )
}
