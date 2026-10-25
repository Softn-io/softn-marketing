import { expect, test } from '@playwright/test'

const EXPECTED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'referrer-policy',
  'permissions-policy',
  'x-content-type-options',
] as const

test.describe('security headers', () => {
  test('every security header is served on both pages, a static chunk and the favicon', async ({ page, request }) => {
    const chunks = new Set<string>()
    page.on('response', (response) => {
      if (/\/_next\/static\/.*\.js$/.test(response.url())) chunks.add(response.url())
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    expect(chunks.size).toBeGreaterThan(0)

    const [chunk] = [...chunks]
    // The coming-soon home page and the gated one-page preview: both routes answer with the
    // same security headers (the preview is served under ENABLE_PREVIEW_ROUTE in this suite).
    for (const url of ['/', '/preview', chunk ?? '', '/favicon.ico']) {
      const response = await request.get(url)
      expect(response.ok(), url).toBe(true)
      for (const name of EXPECTED_HEADERS) {
        expect(response.headers()[name], `${name} on ${url}`).toBeTruthy()
      }
      expect(response.headers()['strict-transport-security']).not.toContain('preload')
    }
  })

  test('X-Robots-Tag: noindex guards the preview route only, never the home page', async ({ request }) => {
    const home = await request.get('/')
    expect(home.ok()).toBe(true)
    // The coming-soon home page must stay indexable: no X-Robots-Tag anywhere in its answer.
    expect(home.headers()['x-robots-tag']).toBeUndefined()

    const preview = await request.get('/preview')
    expect(preview.ok()).toBe(true)
    // Header-level noindex, independent of the route's own <meta name="robots">.
    expect(preview.headers()['x-robots-tag']).toBe('noindex')
  })

  test('the policy blocks nothing the one-page preview needs and no third party is requested', async ({ page }) => {
    const violations: string[] = []
    const origins = new Set<string>()
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) violations.push(message.text())
    })
    page.on('request', (req) => origins.add(new URL(req.url()).origin))

    // The theme toggle (and its inline script) lives on the one-page preview: exercising it there
    // keeps proving the CSP lets the page's own scripts run. The coming-soon home page's
    // third-party budget is asserted in `e2e/comingSoon.spec.ts`.
    await page.goto('/preview', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /Passer au mode/ }).click()

    expect(violations).toEqual([])
    expect([...origins]).toEqual([new URL(page.url()).origin])
  })
})
