/**
 * Routes of the site's standalone pages, read by the footer, the coming-soon screen, the sitemap,
 * the contact page, and the messages and e-mails that link to the contact page or the privacy
 * policy.
 *
 * Every path is a literal written here and nowhere else; the locale files carry labels only.
 */
export const SITE_ROUTES = {
  contact: '/contact',
  legalNotice: '/mentions-legales',
  privacyPolicy: '/politique-de-confidentialite',
  cookiePolicy: '/politique-de-cookies',
} as const
