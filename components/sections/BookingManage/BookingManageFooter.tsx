import Link from 'next/link'
import { interpolate } from '@/lib/interpolate'
import { SITE_ROUTES } from '@/lib/routes'
import { footer } from '@/locales/fr/footer'
import styles from './styles/BookingManage.module.css'

/**
 * Footer of the manage page: the site's copyright and its two quiet links.
 *
 * The wording comes from `locales/fr/footer.ts` and the routes from `lib/routes.ts`, so the page
 * reads like the rest of the site; only contact and legal notices are offered, and no analytics or
 * third party is loaded here.
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
        </nav>
      </div>
    </footer>
  )
}
