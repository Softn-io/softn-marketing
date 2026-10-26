import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * Sitemap: the home page is the only indexable route. The gated `/preview` page stays out of it,
 * and the legal pages do not exist yet.
 */
const sitemap = (): MetadataRoute.Sitemap => [
  {
    url: SITE_URL,
  },
]

export default sitemap
