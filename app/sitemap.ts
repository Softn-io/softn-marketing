import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'
import { contact } from '@/locales/fr/contact'

/**
 * Sitemap: the home page and the contact page are the indexable routes. The gated `/preview` page
 * stays out of it, and the legal pages do not exist yet.
 */
const sitemap = (): MetadataRoute.Sitemap => [
  {
    url: SITE_URL,
  },
  {
    url: `${SITE_URL}${contact.link.href}`,
  },
]

export default sitemap
