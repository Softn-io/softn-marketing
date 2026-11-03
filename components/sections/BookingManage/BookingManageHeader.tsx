import Link from 'next/link'
import { ThemeToggle } from '@components/ui/ThemeToggle'
import { contact } from '@/locales/fr/contact'
import { nav } from '@/locales/fr/hero'
import styles from './styles/BookingManage.module.css'

/**
 * Header of the manage page: the logo, a way back to the site and the site's own theme toggle.
 *
 * A reduced version of the site header on purpose: the page is reached from an e-mail, serves one
 * task, and carries no navigation of the one-page sections.
 */
export const BookingManageHeader = () => {
  return (
    <header className={styles.header}>
      <Link href="/" aria-label={nav.logo.ariaLabel} className={`${styles.logo} font-display text-title-md`}>
        {nav.logo.name}
        <span className={styles.logoSuffix}>{nav.logo.suffix}</span>
      </Link>
      <div className={styles.headerActions}>
        {/* No aria-label: the visible text is the accessible name (WCAG 2.5.3, label in name). */}
        <Link href="/" className={`${styles.backLink} text-body-sm`}>
          ← {contact.header.backLink.label}
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}
