/**
 * E2E coverage for the SEO surface of issue #25 (SEO & metadata, per docs/seo-brief.md §4–6).
 *
 * Cheap and stable on purpose: static answers only. robots.txt and sitemap.xml are read with the
 * API-less `request` fixture, the home page just checks its JSON-LD, its single h1 and canonical.
 */
import { expect, test } from '@playwright/test'
import { metadataContent } from '../locales/fr/metadata'

const SITE_URL = 'https://softn.io'

test.describe('robots.txt', () => {
  test('allows the site, disallows /preview and points at the sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt')
    expect(response.ok()).toBe(true)
    const body = await response.text()

    expect(body).toContain('User-Agent: *')
    expect(body).toContain('Allow: /')
    expect(body).toContain('Disallow: /preview')
    expect(body).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
  })
})

test.describe('sitemap.xml', () => {
  test('lists only the production home URL, never /preview', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.ok()).toBe(true)
    const body = await response.text()

    expect(body).toContain(`<loc>${SITE_URL}</loc>`)
    expect(body).not.toContain('/preview')
  })
})

test.describe('home page structured data', () => {
  test('serves exactly one valid application/ld+json block with the approved brand-only fields', async ({ page }) => {
    await page.goto('/')

    const scripts = page.locator('script[type="application/ld+json"]')
    await expect(scripts).toHaveCount(1)

    const data = JSON.parse((await scripts.first().textContent()) ?? '')
    const { professionalService } = metadataContent.structuredData
    expect(Object.keys(data).sort()).toEqual([
      '@context',
      '@type',
      'areaServed',
      'description',
      'name',
      'serviceType',
      'url',
    ])
    expect(data['@type']).toBe('ProfessionalService')
    expect(data.name).toBe(professionalService.name)
    expect(data.url).toBe(SITE_URL)
    expect(data.description).toBe(professionalService.description)
    expect(data.areaServed).toBe(professionalService.areaServed)
    expect(data.serviceType).toEqual(professionalService.serviceType)
  })
})

test.describe('home page indexing', () => {
  test('has a single h1 and a canonical that resolves to the production home URL', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('h1')).toHaveCount(1)
    // Next.js resolves the relative '/' canonical via metadataBase and normalizes the root path
    // without a trailing slash (trailingSlash defaults to false): `https://softn.io` and
    // `https://softn.io/` are the same URL.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', SITE_URL)
  })
})
