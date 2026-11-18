import type { MetadataRoute } from 'next'
import { SITE_ROUTES } from '@/lib/routes'
import { SITE_URL } from '@/lib/site'

/**
 * Sitemap: the home page, the contact page and the three legal pages are the site's indexable
 * routes. The gated `/preview` page stays out of it, and so does the booking-management route, which
 * is reached from a signed link and answers `noindex`.
 */
const sitemap = (): MetadataRoute.Sitemap => [
  {
    url: SITE_URL,
  },
  {
    url: `${SITE_URL}${SITE_ROUTES.contact}`,
  },
  {
    url: `${SITE_URL}${SITE_ROUTES.legalNotice}`,
  },
  {
    url: `${SITE_URL}${SITE_ROUTES.privacyPolicy}`,
  },
  {
    url: `${SITE_URL}${SITE_ROUTES.cookiePolicy}`,
  },
]

export default sitemap
