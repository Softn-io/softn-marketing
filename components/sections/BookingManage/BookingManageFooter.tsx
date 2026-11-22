import Link from 'next/link'
import { CookieSettingsButton } from '@components/layout/Footer/CookieSettingsButton'
import { interpolate } from '@/lib/interpolate'
import { SITE_ROUTES } from '@/lib/routes'
import { footer } from '@/locales/fr/footer'
import styles from './styles/BookingManage.module.css'

/**
 * Footer of the manage page. It carries the same quiet links as the site footer, including the
 * cookie-settings control, so a visitor can withdraw consent from the emailed page too. The routes
 * and copy come from the shared modules; the control opens the lazy consent dialog without adding
 * Base UI to this page's initial bundle.
 */
export const BookingManageFooter = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={`${styles.copyright} text-body-sm`}>
          {interpolate(footer.copyright, { year: String(new Date().getFullYear()) })}
        </p>
        <nav aria-label={footer.nav.ariaLabel} className={styles.legalNav}>
          <Link href={SITE_ROUTES.contact} className={`${styles.legalLink} text-body-sm`}>
            {footer.legal.contact}
          </Link>
          <Link href={SITE_ROUTES.legalNotice} className={`${styles.legalLink} text-body-sm`}>
            {footer.legal.mentions}
          </Link>
          <CookieSettingsButton />
        </nav>
      </div>
    </footer>
  )
}
