import { expect, test, type APIResponse, type Page } from '@playwright/test'
import { cspHashSourceOf } from '../lib/securityHeaders'
import { themeInitScript } from '../lib/theme'

const EXPECTED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'referrer-policy',
  'permissions-policy',
  'x-content-type-options',
] as const

/** Routes that carry the static policy of `next.config.ts` alone. */
const STATIC_PATHS = ['/', '/robots.txt', '/sitemap.xml', '/page-inexistante', '/rendez-vous/a/b', '/PREVIEW'] as const

/** Routes where `proxy.ts` serves the per-request nonce policy instead of the static one. */
const NONCE_PATHS = ['/preview', '/rendez-vous/not-a-signed-token'] as const

/** The `'sha256-…'` source that lets the shared inline theme script run under the nonce policy. */
const THEME_SCRIPT_HASH = cspHashSourceOf(themeInitScript)

/** The `script-src` of the static policy: no nonce, no hash, inline scripts allowed. */
const STATIC_SCRIPT_SRC = "script-src 'self' 'unsafe-inline'"

const directiveOf = (policy: string, name: string): string | undefined => {
  return policy.split('; ').find((directive) => directive.startsWith(`${name} `) || directive === name)
}

const scriptSrcOf = (policy: string): string => directiveOf(policy, 'script-src') ?? ''

const nonceOf = (policy: string): string => {
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1]
  if (nonce === undefined) throw new Error(`no nonce in the policy: ${policy}`)
  return nonce
}

/** Every CSP header value of a response, in the order it was sent. */
const contentSecurityPoliciesOf = (response: APIResponse): string[] =>
  response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === 'content-security-policy')
    .map(({ value }) => value)

/** The per-request nonce policy among the CSP headers of a response. */
const noncePolicyOf = (response: APIResponse): string => {
  const policy = contentSecurityPoliciesOf(response).find((value) => scriptSrcOf(value).includes("'nonce-"))
  if (policy === undefined) throw new Error('the response carries no nonce policy')
  return policy
}

/** Records `securitypolicyviolation` events from before any page script runs. */
const collectViolations = async (page: Page): Promise<void> => {
  await page.addInitScript(`
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(
        event.effectiveDirective + ' blocked ' + event.blockedURI +
          ' at ' + (event.sourceFile || '(inline)') + ':' + String(event.lineNumber),
      );
    });
  `)
}

const violationsOf = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as { __cspViolations?: string[] }).__cspViolations ?? [])

/** Theme in effect before any click: the explicit `data-theme`, else the system preference. */
const effectiveThemeOf = async (page: Page): Promise<string> => {
  const explicit = await page.locator('html').getAttribute('data-theme')
  if (explicit !== null) return explicit
  return page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
}

/** Clicks the theme toggle and asserts the explicit choice moved to the other theme. */
const switchThemeAndAssert = async (page: Page): Promise<void> => {
  const before = await effectiveThemeOf(page)
  await page.getByRole('button', { name: /Passer au mode/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', before === 'dark' ? 'light' : 'dark')
}

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

  test('the coming-soon home page loads with zero securitypolicyviolation and no console error', async ({ page }) => {
    /*
     * Zod v4 probes its JIT support with `Function("")` at module init, which the production CSP
     * (`script-src` without `unsafe-eval`) refuses on the home page. The listener is
     * installed by `addInitScript`, which runs before any page script, so a violation fired during
     * module init is captured instead of being missed by a listener attached after the load. The
     * webServer of `playwright.config.ts` always serves a production build, where the CSP is
     * strict: a dev server would add `'unsafe-eval'` and could never reproduce the defect.
     */
    await collectViolations(page)

    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(String(error)))

    await page.goto('/', { waitUntil: 'networkidle' })

    const violations = await violationsOf(page)
    expect(violations, 'CSP violations fired on the home page').toEqual([])
    expect(consoleErrors, 'console errors on the home page').toEqual([])
  })
})

test.describe('script-src-attr none and the per-request nonce policy', () => {
  test('routes outside the proxy scope carry the static policy alone, script-src-attr none included', async ({
    request,
  }) => {
    for (const path of STATIC_PATHS) {
      const response = await request.get(path)
      const policies = contentSecurityPoliciesOf(response)
      expect(policies.length, path).toBe(1)
      expect(scriptSrcOf(policies[0] ?? ''), path).toBe(STATIC_SCRIPT_SRC)
      expect(directiveOf(policies[0] ?? '', 'script-src-attr'), path).toBe("script-src-attr 'none'")
    }
  })

  for (const path of NONCE_PATHS) {
    test(`${path} answers the per-request nonce policy, replacing the static one`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.ok(), path).toBe(true)
      const policies = contentSecurityPoliciesOf(response)
      // On the self-hosted server the static header and the nonce header are applied in insertion
      // order and Node's case-insensitive `setHeader` keeps the later nonce policy, so exactly one
      // header goes out; where a platform sends both, browsers enforce the intersection and the
      // nonce policy still decides.
      expect(policies.length, path).toBe(1)

      const noncePolicy = noncePolicyOf(response)
      const scriptSrc = scriptSrcOf(noncePolicy)
      expect(scriptSrc, path).not.toBe(STATIC_SCRIPT_SRC)
      expect(nonceOf(noncePolicy), path).toBeTruthy()
      expect(scriptSrc, path).toContain("'strict-dynamic'")
      expect(scriptSrc, path).toContain(THEME_SCRIPT_HASH)
      expect(scriptSrc, path).not.toContain("'unsafe-inline'")
      expect(scriptSrc, path).not.toContain("'unsafe-eval'")
      expect(directiveOf(noncePolicy, 'script-src-attr'), path).toBe("script-src-attr 'none'")

      // Every other security header keeps the value it has on the static routes.
      expect(response.headers()['strict-transport-security'], path).toBe('max-age=63072000; includeSubDomains')
      expect(response.headers()['permissions-policy'], path).toContain('camera=()')
      expect(response.headers()['x-content-type-options'], path).toBe('nosniff')
      expect(response.headers()['referrer-policy'], path).toBe(
        path.startsWith('/rendez-vous') ? 'no-referrer' : 'strict-origin-when-cross-origin',
      )
      expect(response.headers()['x-robots-tag'], path).toBe(path === '/preview' ? 'noindex' : undefined)
    })
  }

  test('the nonce is fresh on every request', async ({ request }) => {
    const first = nonceOf(noncePolicyOf(await request.get('/preview')))
    const second = nonceOf(noncePolicyOf(await request.get('/preview')))

    expect(first).not.toBe(second)
  })

  test('a prefetch request to a nonce route is left to the static policy', async ({ request }) => {
    const response = await request.get('/preview', { headers: { 'next-router-prefetch': '1' } })
    const policies = contentSecurityPoliciesOf(response)

    expect(policies.length).toBe(1)
    expect(scriptSrcOf(policies[0] ?? '')).toBe(STATIC_SCRIPT_SRC)
  })

  test('the trailing-slash forms answer a header-less 308 before any policy applies', async ({ request }) => {
    for (const path of ['/preview/', '/rendez-vous/abc/'] as const) {
      const response = await request.get(path, { maxRedirects: 0 })

      expect(response.status(), path).toBe(308)
      expect(response.headers()['location'], path).toBe(path.slice(0, -1))
      // The header rules run first, the redirect response drops their headers, and the proxy never
      // runs; a body-less redirect has nothing to protect, and its target path is covered above.
      expect(contentSecurityPoliciesOf(response), path).toEqual([])
    }
  })

  test('robots.txt, sitemap.xml and the not-found page load with zero securitypolicyviolation', async ({ page }) => {
    await collectViolations(page)
    const cspMessages: string[] = []
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) cspMessages.push(message.text())
    })

    for (const path of ['/robots.txt', '/sitemap.xml', '/page-inexistante']) {
      await page.goto(path)
      expect(await violationsOf(page), `${path}: CSP violations`).toEqual([])
    }
    expect(cspMessages, 'CSP console messages').toEqual([])
  })

  test('the preview hydrates with zero securitypolicyviolation under the nonce policy', async ({ page }) => {
    await collectViolations(page)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(String(error)))

    await page.goto('/preview', { waitUntil: 'networkidle' })
    // Hydration: the theme toggle is a client island, and its click must switch the theme.
    await switchThemeAndAssert(page)

    expect(await violationsOf(page), 'CSP violations on the preview under the nonce policy').toEqual([])
    expect(consoleErrors, 'console errors on the preview under the nonce policy').toEqual([])
  })

  test('the manage page hydrates with zero securitypolicyviolation under the nonce policy', async ({ page }) => {
    await collectViolations(page)
    const cspMessages: string[] = []
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) cspMessages.push(message.text())
    })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))

    // No `networkidle`: the page's link prefetches keep the network busy, and their 404s on the
    // coming-soon routes are unrelated console noise.
    await page.goto('/rendez-vous/not-a-signed-token')
    // Hydration: the theme toggle is a client island, and its click must switch the theme.
    await switchThemeAndAssert(page)

    expect(await violationsOf(page), 'CSP violations on the manage page under the nonce policy').toEqual([])
    expect(cspMessages, 'CSP console messages on the manage page under the nonce policy').toEqual([])
    expect(pageErrors, 'page errors on the manage page under the nonce policy').toEqual([])
  })

  test('the theme still applies before first paint on every route: stored choice and system preference', async ({
    browser,
  }) => {
    for (const path of ['/', ...NONCE_PATHS]) {
      // Explicit choice: the stored value is read by the theme script in the head.
      const stored = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } })
      const storedPage = await stored.newPage()
      await storedPage.addInitScript((key) => localStorage.setItem(key, 'light'), 'softn-theme')
      await storedPage.addInitScript(() => {
        new MutationObserver(() => {
          const w = window as unknown as { __firstTheme?: string | null }
          if (w.__firstTheme === undefined && document.body) {
            w.__firstTheme = document.documentElement.getAttribute('data-theme')
          }
        }).observe(document, { childList: true, subtree: true })
      })
      await storedPage.goto(path)
      const first = await storedPage.evaluate(
        () => (window as unknown as { __firstTheme?: string | null }).__firstTheme,
      )
      expect(first, `${path}: stored choice applied before <body> exists`).toBe('light')
      await expect(storedPage.locator('html')).toHaveAttribute('data-theme', 'light')
      await stored.close()

      // System preference: no stored choice, no `data-theme`, the CSS follows the media query.
      const system = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 800 } })
      const systemPage = await system.newPage()
      await systemPage.goto(path)
      await expect(systemPage.locator('html')).not.toHaveAttribute('data-theme')
      const scheme = await systemPage.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
      expect(scheme, `${path}: system preference drives the theme`).toBe('light')
      await system.close()
    }
  })
})
