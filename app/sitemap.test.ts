import { describe, expect, it } from 'vitest'
import { SITE_URL } from '@/lib/site'
import { contact } from '@/locales/fr/contact'
import sitemap from './sitemap'

describe('sitemap', () => {
  it('lists the home page and the contact page, on the canonical production origin', () => {
    const routes = sitemap()

    expect(routes.map((entry) => entry.url)).toEqual([SITE_URL, `${SITE_URL}${contact.link.href}`])
  })

  it('keeps the gated preview page out of the list of indexable routes', () => {
    const routes = sitemap()

    expect(routes.some((entry) => entry.url.includes('/preview'))).toBe(false)
  })
})
