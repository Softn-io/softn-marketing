import Link from 'next/link'
import { interpolate } from '@/lib/interpolate'
import { bookingManage } from '@/locales/fr/bookingManage'
import { footer } from '@/locales/fr/footer'
import styles from './styles/BookingManage.module.css'

/** Legal pages of the site; their routes land with the legal work, and the links are the footer's. */
const LEGAL_MENTIONS_HREF = '/mentions-legales'

/**
 * Footer of the manage page: the site's copyright and its two quiet links.
 *
 * The wording comes from `locales/fr/footer.ts`, so the page reads like the rest of the site; only
 * contact and legal notices are offered, and no analytics or third party is loaded here.
 */
export const BookingManageFooter = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={`${styles.copyright} text-body-sm`}>
          {interpolate(footer.copyright, { year: String(new Date().getFullYear()) })}
        </p>
        <nav aria-label={footer.nav.ariaLabel} className={styles.legalNav}>
          <Link href={bookingManage.contact.href} className={`${styles.legalLink} text-body-sm`}>
            {footer.legal.contact}
          </Link>
          <Link href={LEGAL_MENTIONS_HREF} className={`${styles.legalLink} text-body-sm`}>
            {footer.legal.mentions}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
