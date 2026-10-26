import { describe, expect, it } from 'vitest'
import { SITE_URL } from '@/lib/site'
import sitemap from './sitemap'

describe('sitemap', () => {
  it('lists only the canonical production URL', () => {
    const routes = sitemap()

    expect(routes).toHaveLength(1)
    expect(routes[0]?.url).toBe(SITE_URL)
  })

  it('keeps the gated preview page out of the list of indexable routes', () => {
    const routes = sitemap()

    expect(routes.some((entry) => entry.url.includes('/preview'))).toBe(false)
  })
})
