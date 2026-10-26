import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * robots.txt: every route is crawlable except the gated `/preview` page. The disallow is intended
 * there (development-only page, no incoming links); its `noindex` metadata stays as a safety net.
 */
const robots = (): MetadataRoute.Robots => ({
  rules: {
    userAgent: '*',
    allow: '/',
    disallow: '/preview',
  },
  sitemap: `${SITE_URL}/sitemap.xml`,
})

export default robots
