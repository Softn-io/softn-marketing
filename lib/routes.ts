import { contact } from '@/locales/fr/contact'

/**
 * Routes of the site's standalone pages, read by the footer, the coming-soon screen and the sitemap.
 *
 * The legal-notice and cookie-policy paths are written here only. The privacy path is still written
 * in the assistant and contact copy (`locales/fr/chatbot.ts` and `locales/fr/contact.ts`, their
 * `consent` links), which a follow-up aligns on this map: those `href` fields are OKF sources, so
 * they change with a review stamp. The contact path is read from `contact.link.href`, the field the
 * contact page, the assistant messages and the contact e-mails already consume.
 */
export const SITE_ROUTES = {
  contact: contact.link.href,
  legalNotice: '/mentions-legales',
  privacyPolicy: '/politique-de-confidentialite',
  cookiePolicy: '/politique-de-cookies',
} as const
