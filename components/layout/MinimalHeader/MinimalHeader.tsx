import Link from 'next/link'
import { Logo } from '@components/ui/Logo'
import { ThemeToggle } from '@components/ui/ThemeToggle'
import { nav } from '@/locales/fr/hero'
import { minimalHeader } from '@/locales/fr/minimalHeader'
import styles from './MinimalHeader.module.css'

/**
 * Page chrome of the standalone pages (booking management, contact): the logo, a way back to the
 * site and the site's own theme toggle.
 *
 * A reduced version of the site header on purpose: these pages are reached from an e-mail or a
 * direct link, serve one task, and carry no navigation of the one-page sections.
 *
 * @returns The header landmark of the page.
 */
export const MinimalHeader = () => {
  return (
    <header className={styles.header}>
      <Link href="/" aria-label={nav.logo.ariaLabel} className={styles.logo}>
        <Logo />
      </Link>
      <div className={styles.headerActions}>
        {/* No aria-label: the visible text is the accessible name (WCAG 2.5.3, label in name). */}
        <Link href="/" className={`${styles.backLink} text-body-sm`}>
          ← {minimalHeader.backLink.label}
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}
