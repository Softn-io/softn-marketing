import { describe, expect, it } from 'vitest'
import { SITE_ROUTES } from '@/lib/routes'
import { SITE_URL } from '@/lib/site'
import sitemap from './sitemap'

describe('sitemap', () => {
  it('lists the home page, the contact page and the three legal pages, on the canonical production origin', () => {
    const routes = sitemap()

    expect(routes.map((entry) => entry.url)).toEqual([
      SITE_URL,
      `${SITE_URL}${SITE_ROUTES.contact}`,
      `${SITE_URL}${SITE_ROUTES.legalNotice}`,
      `${SITE_URL}${SITE_ROUTES.privacyPolicy}`,
      `${SITE_URL}${SITE_ROUTES.cookiePolicy}`,
    ])
  })

  it('keeps the gated preview page out of the list of indexable routes', () => {
    const routes = sitemap()

    expect(routes.some((entry) => entry.url.includes('/preview'))).toBe(false)
  })
})
