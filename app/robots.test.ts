import { describe, expect, it } from 'vitest'
import { SITE_URL } from '@/lib/site'
import robots from './robots'

describe('robots', () => {
  it('allows every crawler on the site and blocks the gated preview route', () => {
    const rules = robots().rules

    expect(rules).toEqual({ userAgent: '*', allow: '/', disallow: '/preview' })
  })

  it('points crawlers at the sitemap of the production site', () => {
    const { sitemap } = robots()

    expect(sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })
})
