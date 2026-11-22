import { SITE_ROUTES } from '@/lib/routes'
import { footer } from '@/locales/fr/footer'

/** One entry of the footer navigation: the label a visitor reads and the route it opens. */
export type FooterLink = {
  readonly label: string
  readonly href: string
}

/**
 * Footer navigation entries, in the order the copy lists them: the contact page, then the three
 * legal pages.
 *
 * Shared by the site footer and the coming-soon footer, so both read the same labels and the same
 * routes. The cookie-settings control is a button rendered next to these links, not a route: it
 * opens the consent preferences dialog.
 */
export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: footer.legal.contact, href: SITE_ROUTES.contact },
  { label: footer.legal.mentions, href: SITE_ROUTES.legalNotice },
  { label: footer.legal.privacy, href: SITE_ROUTES.privacyPolicy },
  { label: footer.legal.cookies, href: SITE_ROUTES.cookiePolicy },
]
