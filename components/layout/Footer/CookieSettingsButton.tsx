'use client'

import { requestPreferencesPanel } from '@/lib/consent/preferencesPanelRequest'
import { footer } from '@/locales/fr/footer'
import styles from './styles/Footer.module.css'

/**
 * Footer control that opens the consent preferences dialog. It is a plain button, deliberately not a
 * Base UI trigger: it renders on every page, so importing Base UI here would drag the dialog core
 * into the initial bundle. The click records a request that the lazily loaded consent layer consumes
 * and opens the dialog. Kept as a small client island so the footer stays a Server Component.
 *
 * @returns The cookie-settings control.
 */
export const CookieSettingsButton = () => (
  <button
    type="button"
    className={`${styles.cookieSettings} text-body-sm`}
    onClick={(event) => requestPreferencesPanel(event.currentTarget)}
  >
    {footer.cookieSettings}
  </button>
)
