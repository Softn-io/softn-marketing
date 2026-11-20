import Link from 'next/link'
import { Button } from '@components/ui/Button'
import { requestPreferencesPanel } from '@/lib/consent/preferencesPanelRequest'
import { SITE_ROUTES } from '@/lib/routes'
import { cookieBanner } from '@/locales/fr/legal'
import styles from './styles/CookieConsent.module.css'

/** Props of {@link CookieBanner}. */
type CookieBannerProps = {
  /** Store the audience acceptance and close the banner. */
  onAccept: () => void
  /** Store the audience refusal and close the banner. */
  onDecline: () => void
}

/**
 * Consent banner: a floating card anchored to the bottom-left corner. A named region, not a modal:
 * the page stays behind it. The accept and decline buttons share the same variant, size and position
 * level; "Personnaliser" is an outline button that records a preferences request, like the footer
 * control. It imports no Base UI: the lazy consent layer loads the dialog only when the request is
 * pending and opens it through the public handle, and Base UI returns focus to the recorded opener.
 *
 * @param props The two choices the banner offers.
 * @returns The consent region.
 */
export const CookieBanner = ({ onAccept, onDecline }: CookieBannerProps) => {
  return (
    <section aria-label={cookieBanner.ariaLabel} className={styles.banner}>
      <div className={styles.bannerInner}>
        <div className={styles.bannerCopy}>
          <h2 className={`${styles.bannerTitle} text-title-md`}>{cookieBanner.title}</h2>
          <p className={`${styles.bannerBody} text-body-sm`}>{cookieBanner.body}</p>
          <Link href={SITE_ROUTES.cookiePolicy} className={`${styles.link} text-label`}>
            {cookieBanner.learnMore}
          </Link>
        </div>
        <div className={styles.bannerActions}>
          <Button size="sm" onClick={onAccept}>
            {cookieBanner.accept}
          </Button>
          <Button size="sm" onClick={onDecline}>
            {cookieBanner.decline}
          </Button>
          <Button intent="outline" size="sm" onClick={(event) => requestPreferencesPanel(event.currentTarget)}>
            {cookieBanner.customize}
          </Button>
        </div>
      </div>
    </section>
  )
}
