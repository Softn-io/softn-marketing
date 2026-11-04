/**
 * QA coverage of the booking management page and its API (GitHub issue #115).
 *
 * The signed link of the calendar invitation opens `/rendez-vous/<token>`, where a visitor can
 * reschedule or cancel an "échange Spark" without an account. What only a real browser proves is
 * covered here, on a production build whose provider keys are all blanked (see the webServer env of
 * `playwright.config.ts`): no run of this suite can reach Google or Baserow.
 *
 * - The states the link itself decides, each with **zero** Google call on the server: a token this
 *   deployment did not sign renders "Lien non valide" and never reaches the manage API, an expired
 *   one renders "L'appel a déjà commencé". The route's own 403 and `Cache-Control: no-store` for a
 *   forged token are unit-covered in `app/api/booking/manage/route.test.ts`, not here: on a
 *   production server without the Upstash store the rate limiter fails closed before the token
 *   check (503 — the intended behaviour, see `lib/assistant/rateLimit.ts`), so that answer cannot
 *   be exercised by a browser run and no suite depends on a live store.
 * - The fail-closed answer of the page: a validly signed token still only renders the unavailable
 *   state with its retry when the calendar cannot answer, never a management UI.
 * - The page hides itself from search engines (`noindex, nofollow` in its own metadata, and no
 *   `X-Robots-Tag` outside the preview route) and never leaks the token through a referrer
 *   (`Referrer-Policy: no-referrer` on this path alone).
 * - No third-party request fires from the page, and the CSP of the production build stays clean
 *   while the island's scripts run.
 * - The `?rdv=1` key opens the reservation flow of the assistant section exactly once on
 *   `/preview`: the key leaves the address bar so a reload stays closed, and `#assistant` alone
 *   never opens the flow.
 * - QA check 4a-1 (role contract): every computed design value on the page's key elements must
 *   exist as a value of `@softnio-labs/tokens`, in both themes, on the states a browser can reach
 *   without credentials (invalid, expired, unavailable — the chooser needs a live calendar read).
 *
 * A test-only secret (e2e/support/bookingLinkSecret.ts, never a real credential) is shared by
 * this suite and the webServer of `playwright.config.ts` when `BOOKING_LINK_SECRET` is not set
 * in the environment of the command; a value set there still wins. It is never written to any
 * `.env*` file.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { bookingManageToken, verifyBookingManageToken } from '../lib/booking/manageToken'
import { bookingManage } from '../locales/fr/bookingManage'
import { chatbot } from '../locales/fr/chatbot'
import { nav } from '../locales/fr/hero'
import { minimalHeader } from '../locales/fr/minimalHeader'
import { resolveBookingLinkSecret } from './support/bookingLinkSecret'

/** The secret the server was started with: the same resolution as the config's webServer env. */
const SECRET = resolveBookingLinkSecret()

/** Event id in the base32hex alphabet the verifier accepts (`^[0-9a-v]{5,1024}$`). */
const EVENT_ID = 'softnabc0123456789abcdefghijkl'

/** Origin the webServer listens on; the port is the config's own (`playwright.config.ts`). */
const selfOriginOf = (): string => test.info().project.use.baseURL ?? 'http://localhost:3100'

/** Instant in ten days: a valid link, and long past the reschedule notice for the event. */
const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString()

/** Signs a token the server accepts (its secret is this suite's, see the config). */
const tokenFor = (expiresAt: string = FUTURE): string => {
  const token = bookingManageToken({ secret: SECRET, eventId: EVENT_ID, expiresAt })
  if (token === null) throw new Error('the fixture must build a token')
  return token
}

test.describe('rendez-vous page: link states', () => {
  test('a token this deployment did not sign renders the invalid state, with the page metadata', async ({ page }) => {
    const response = await page.goto('/rendez-vous/not-a-signed-token')
    expect(response?.status(), 'an invalid link is still a page, not an error').toBe(200)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(bookingManage.states.invalid.title)
    await expect(page.getByRole('main')).toBeVisible()

    // Hidden from search engines by its own metadata, with no canonical URL.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
    expect(await page.title()).toBe(bookingManage.meta.title)
  })

  test('an expired token renders the started state, and the header never carries an X-Robots-Tag', async ({
    page,
    request,
  }) => {
    const token = tokenFor(new Date(Date.now() - 60_000).toISOString())

    // The expired link is told apart from a forged one: it names the call, not the link.
    await page.goto(`/rendez-vous/${token}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(bookingManage.states.started.title)
    await expect(page.getByRole('button', { name: bookingManage.reschedule.action })).toHaveCount(0)
    await expect(page.getByRole('button', { name: bookingManage.cancel.action })).toHaveCount(0)

    const response = await request.get(`/rendez-vous/${token}`)
    expect(response.ok()).toBe(true)
    // The header-level noindex stays on the preview route alone.
    expect(response.headers()['x-robots-tag']).toBeUndefined()
    expect(response.headers()['referrer-policy']).toBe('no-referrer')
  })

  test('a forged token renders the invalid state, and the page never reaches the manage API', async ({ page }) => {
    // A token signed by another deployment's secret: the very leak scenario the verifier exists for.
    const forged = bookingManageToken({ secret: 'f'.repeat(48), eventId: EVENT_ID, expiresAt: FUTURE })
    expect(forged).not.toBeNull()
    expect(verifyBookingManageToken({ secret: SECRET, token: forged as string }).ok).toBe(false)

    // The manage API sits behind the rate limiter, which fails closed on a production server
    // without its Upstash store (the 503 CI saw) — so the route's 403 for a forged token stays
    // unit-covered (app/api/booking/manage/route.test.ts). What the browser proves is the leak
    // scenario the page exists to prevent: a forged link renders the invalid state, and not one
    // request of the page reaches the manage API.
    const manageCalls: string[] = []
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/api/booking/manage') manageCalls.push(req.url())
    })

    const response = await page.goto(`/rendez-vous/${forged}`)
    expect(response?.status(), 'an invalid link is still a page, not an error').toBe(200)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(bookingManage.states.invalid.title)
    await expect(page.getByRole('button', { name: bookingManage.reschedule.action })).toHaveCount(0)
    await expect(page.getByRole('button', { name: bookingManage.cancel.action })).toHaveCount(0)
    expect(manageCalls, 'a forged link must call nothing on the manage API').toEqual([])
  })

  test('a valid token whose event cannot be read answers fail closed: the unavailable state, never a management UI', async ({
    page,
  }) => {
    const token = tokenFor()

    await page.goto(`/rendez-vous/${token}`)

    // No credentials, no management UI: the page names its state and offers the retry only.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(bookingManage.title)
    await expect(
      page.getByText(bookingManage.errors.unavailable.replace('{contactLink}', bookingManage.contact.linkLabel)),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: bookingManage.errors.retry })).toHaveAttribute(
      'href',
      `/rendez-vous/${token}`,
    )
    // The two actions of the overview are absent: an unreachable calendar refuses every action.
    await expect(page.getByRole('button', { name: bookingManage.reschedule.action })).toHaveCount(0)
    await expect(page.getByRole('button', { name: bookingManage.cancel.action })).toHaveCount(0)
  })
})

test.describe('rendez-vous page: isolation', () => {
  test('no third-party request, no CSP violation and no referrer leak from the page', async ({ page }) => {
    await page.addInitScript(`
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push(event.effectiveDirective + ' blocked ' + event.blockedURI);
      });
    `)

    const origins = new Set<string>()
    page.on('request', (req) => origins.add(new URL(req.url()).origin))

    const selfOrigin = new URL(selfOriginOf()).origin
    for (const path of [
      `/rendez-vous/not-a-signed-token`,
      `/rendez-vous/${tokenFor(new Date(Date.now() - 60_000).toISOString())}`,
      `/rendez-vous/${tokenFor()}`,
    ]) {
      await page.goto(path)
      await expect(page.getByRole('main')).toBeVisible()
    }

    expect([...origins], 'the page must request nothing outside its own origin').toEqual([selfOrigin])
    const violations = await page.evaluate(() => (window as { __cspViolations?: string[] }).__cspViolations ?? [])
    expect(violations, 'CSP violations on the manage page').toEqual([])

    // The document answers with no-referrer on this path, whatever the global policy is.
    const response = await page.goto(`/rendez-vous/not-a-signed-token`)
    expect(response?.headers()['referrer-policy']).toBe('no-referrer')
  })
})

test.describe('book-again link: the ?rdv=1 key', () => {
  test('the key opens the reservation flow once on /preview, then leaves the address bar', async ({ page }) => {
    await page.goto(`/preview?rdv=1#assistant`)

    const flow = page.getByRole('region', { name: chatbot.suggestions.book })
    await expect(flow).toBeVisible()

    // The key is spent: the URL keeps the hash and nothing else, so a reload cannot reopen the flow.
    expect(new URL(page.url()).search).toBe('')
    expect(new URL(page.url()).hash).toBe('#assistant')

    await page.reload()
    await expect(flow).toHaveCount(0)
    // The conversation is back: the composer is where the flow was.
    await expect(page.getByPlaceholder('Écrivez votre question…')).toBeVisible()
  })

  test('the #assistant hash alone never opens the flow', async ({ page }) => {
    await page.goto(`/preview#assistant`)

    await expect(page.locator('html')).toBeVisible()
    await expect(page.getByRole('region', { name: chatbot.suggestions.book })).toHaveCount(0)
    expect(new URL(page.url()).hash).toBe('#assistant')
  })
})

test.describe('rendez-vous page: accessibility (WCAG 2.1 AA)', () => {
  /** The machine-checkable WCAG 2.1 A and AA rule tags, same list as `e2e/accessibility.spec.ts`. */
  const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

  for (const theme of ['dark', 'light'] as const) {
    test(`axe finds no WCAG 2.1 A/AA violation on the reachable states (${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme })
      const page = await ctx.newPage()
      await page.emulateMedia({ colorScheme: theme })

      const found: string[] = []
      for (const path of ['/rendez-vous/not-a-signed-token', `/rendez-vous/${tokenFor()}`]) {
        await page.goto(path)
        await expect(page.getByRole('main')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze()
        for (const violation of results.violations) {
          found.push(
            `${path} (${theme}): ${violation.id} [${violation.impact ?? '?'}] ${violation.help} — ${violation.nodes
              .map((node) => `${node.target.join(' ')} ${(node.any?.[0]?.message ?? '').slice(0, 120)}`)
              .join(' | ')}`,
          )
        }
      }
      expect(found, `WCAG 2.1 A/AA violations across the reachable states (${theme})`).toEqual([])
      await ctx.close()
    })
  }

  test('the page exposes one h1, the header and footer landmarks, and a focusable heading', async ({ page }) => {
    await page.goto('/rendez-vous/not-a-signed-token')

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toHaveCount(1)

    // The heading carries tabindex=-1: the island moves the focus onto it when the view changes
    // (asserted in the jsdom suite); here the browser keeps the attribute reachable.
    await expect(page.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1')
  })

  test('the eyebrow tones of every view pass contrast at caption size (the moved tone probed)', async ({ browser }) => {
    // The axe runs above cover the states a browser reaches without credentials; the `moved` view
    // needs a live calendar read, so its brand tone is measured here on a probe that wears exactly
    // what a visitor wears: the page's real eyebrow, cloned from the reachable invalid state (the
    // same intro markup the moved view renders), with its tone class swapped for the very
    // `.eyebrow-brand` CSS Module class the moved view applies — the build hashes module class
    // names, so the class is read out of the page's own stylesheets, never guessed. The clone
    // keeps the eyebrow's own typography (`text-caption uppercase`: 11 px, below the large-text
    // threshold, so 4.5:1 applies) over the page background. Light is verified both ways it can be
    // set: the explicit `data-theme='light'` the toggle writes, and the system preference with no
    // `data-theme` attribute at all.
    type Measure = {
      brandClass: string | null
      probeColor: string
      tertiaryColor: string
      tertiaryToken: string
      glow: string
      accent: string
      background: string
      ratio: number
      redefinedTokenRules: string[]
    }

    const measureEyebrowContrast = async (mode: 'dark' | 'light-explicit' | 'light-system'): Promise<Measure> => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        colorScheme: mode === 'light-system' ? 'light' : 'dark',
      })
      const page = await ctx.newPage()
      await page.goto('/rendez-vous/not-a-signed-token')
      await expect(page.getByRole('main')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)

      // The theme is set the way each run claims, and that is asserted so the measurement cannot
      // silently drift to another path: the explicit run goes through the toggle's own attribute,
      // the two system runs have no `data-theme` at all.
      if (mode === 'light-explicit') {
        await page.getByRole('button', { name: nav.themeToggle.toLight }).click()
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      } else {
        await expect(page.locator('html')).not.toHaveAttribute('data-theme')
      }

      const measure: Measure = await page.evaluate((label) => {
        /**
         * Contrast ratio of two computed colours, by the WCAG 2.1 relative-luminance formula. The
         * canvas turns each computed value (the tokens are oklch) into sRGB and fails loudly when
         * a colour does not paint opaquely.
         */
        const contrastRatio = (foreground: string, background: string): number => {
          const luminance = (color: string): number => {
            const canvas = document.createElement('canvas')
            canvas.width = 1
            canvas.height = 1
            const canvasCtx = canvas.getContext('2d')
            if (canvasCtx === null) throw new Error('no 2d context for the contrast canvas')
            canvasCtx.fillStyle = color
            canvasCtx.fillRect(0, 0, 1, 1)
            const [r = 0, g = 0, b = 0, alpha = 0] = Array.from(canvasCtx.getImageData(0, 0, 1, 1).data)
            if (alpha !== 255) throw new Error(`the colour ${color} did not paint opaquely`)
            const channel = (v: number): number => {
              const c = v / 255
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
          }
          const l1 = luminance(foreground)
          const l2 = luminance(background)
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        }

        // Computed colour of a token, on an element the page stylesheets actually style.
        const refColor = (name: string): string => {
          const ref = document.createElement('span')
          ref.style.color = `var(${name})`
          document.body.appendChild(ref)
          const value = getComputedStyle(ref).color
          ref.remove()
          return value
        }

        // 1. The hashed `.eyebrow-brand` class, from the page's own stylesheets — and a guard:
        //    only the package's root-level theme blocks may declare the two brand tokens.
        let brandClass: string | null = null
        const redefinedTokenRules: string[] = []
        const walk = (rules: CSSRuleList): void => {
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule) {
              if (rule.style.color.includes('--softn-brand-')) {
                const name = /\.([-\w]*eyebrow-brand[-\w]*)/.exec(rule.selectorText)?.[1]
                if (name !== undefined) brandClass = name
              }
              for (const property of Array.from(rule.style)) {
                if (
                  (property === '--softn-brand-glow' || property === '--softn-brand-accent') &&
                  /[.#]/.test(rule.selectorText)
                ) {
                  redefinedTokenRules.push(
                    `${rule.selectorText} { ${property}: ${rule.style.getPropertyValue(property)} }`,
                  )
                }
              }
            } else if (rule instanceof CSSGroupingRule) walk(rule.cssRules)
          }
        }
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            walk(sheet.cssRules)
          } catch {
            /* unreadable sheet: none should be, but never crash the audit */
          }
        }

        // 2. The real eyebrow of the invalid state: the same intro markup the moved view renders.
        const real = document.querySelector('main p')
        if (!(real instanceof HTMLElement)) throw new Error('the page renders no eyebrow paragraph in main')
        const tertiaryClass = Array.from(real.classList).find((name) => name.includes('eyebrow-tertiary')) ?? ''

        // 3. The probes: clones of the real eyebrow, the tone class the only difference. The
        //    tertiary clone is the element the reachable states already show; the brand clone
        //    carries the moved view's own class.
        const cloneWithTone = (id: string, tone: string | null, droppedTone: string, text: string): HTMLElement => {
          const probe = real.cloneNode(true) as HTMLElement
          if (droppedTone !== '') probe.classList.remove(droppedTone)
          if (tone !== null) probe.classList.add(tone)
          probe.id = id
          probe.textContent = text
          real.parentElement?.appendChild(probe)
          return probe
        }
        const tertiaryProbe = cloneWithTone('eyebrow-probe-tertiary', null, '', real.textContent ?? '')
        const brandProbe = cloneWithTone('eyebrow-probe-brand', brandClass, tertiaryClass, label)

        // 4. What the visitor sees, in this theme.
        const probeColor = getComputedStyle(brandProbe).color
        const tertiaryColor = getComputedStyle(tertiaryProbe).color
        const background = getComputedStyle(document.body).backgroundColor
        return {
          brandClass,
          probeColor,
          tertiaryColor,
          tertiaryToken: refColor('--softn-color-tertiary'),
          glow: refColor('--softn-brand-glow'),
          accent: refColor('--softn-brand-accent'),
          background,
          ratio: contrastRatio(probeColor, background),
          redefinedTokenRules,
        }
      }, bookingManage.eyebrow.moved)

      // The class the built page ships for the moved tone, resolved from its own stylesheets.
      expect(
        measure.brandClass,
        'the hashed .eyebrow-brand class of the built CSS module must be found in the page stylesheets',
      ).not.toBeNull()
      // The two brand tokens keep their package definitions: nothing on the page redefines them.
      expect(measure.redefinedTokenRules, '--softn-* brand tokens must keep their package definitions').toEqual([])
      // The reachable views paint their own eyebrow with the tertiary token.
      expect(measure.tertiaryColor, 'the reachable eyebrow paints the tertiary token').toBe(measure.tertiaryToken)

      // The probe paints the theme's own brand token — glow in the dark theme, accent when light
      // is set, whichever way light is set — and never the other one.
      if (mode === 'dark') {
        expect(measure.probeColor, 'the moved eyebrow paints the brand glow in the dark theme').toBe(measure.glow)
        expect(measure.probeColor, 'the dark theme does not paint the light tone').not.toBe(measure.accent)
      } else {
        expect(measure.probeColor, `the moved eyebrow paints the brand accent when light is set (${mode})`).toBe(
          measure.accent,
        )
        expect(measure.probeColor, 'the light theme does not paint the dark tone').not.toBe(measure.glow)
      }

      // 4.5:1 at caption size, measured on the probe itself.
      expect(
        measure.ratio,
        `the moved eyebrow measures ${measure.ratio.toFixed(2)}:1 (${measure.probeColor} on ${measure.background}) — 4.5:1 applies at caption size`,
      ).toBeGreaterThanOrEqual(4.5)

      // And axe, scoped to each probe, agrees.
      for (const id of ['eyebrow-probe-tertiary', 'eyebrow-probe-brand']) {
        const results = await new AxeBuilder({ page })
          .withTags([...WCAG_AA_TAGS])
          .include(`#${id}`)
          .analyze()
        const contrast = results.violations.filter((violation) => violation.id === 'color-contrast')
        expect(
          contrast.map(
            (violation) =>
              `${id} (${mode}): ${(violation.nodes[0]?.any?.[0]?.message ?? violation.help).slice(0, 200)}`,
          ),
          `eyebrow tone probe #${id} (${mode}) must pass 4.5:1 at caption size`,
        ).toEqual([])
      }
      await ctx.close()
      return measure
    }

    await measureEyebrowContrast('dark')
    await measureEyebrowContrast('light-explicit')
    await measureEyebrowContrast('light-system')
  })
})

test.describe('rendez-vous page: keyboard', () => {
  test('Tab reaches every control in DOM order with a visible ring, Enter toggles the theme and follows the retry', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' })
    const page = await ctx.newPage()
    const token = tokenFor()
    await page.goto(`/rendez-vous/${token}`)
    await expect(page.getByRole('main')).toBeVisible()

    // The interactive controls of the unavailable state, in DOM order: the header's three, then
    // inside the main the contact link of the unavailable message, then the retry link (the page
    // carries a second contact link in its closing line, after the retry).
    const stops: readonly [Locator, Locator, Locator, Locator, Locator] = [
      page.getByRole('link', { name: nav.logo.ariaLabel }),
      page.getByRole('link', { name: `← ${minimalHeader.backLink.label}` }),
      page.getByRole('button', { name: nav.themeToggle.toLight }),
      page.getByRole('link', { name: bookingManage.contact.linkLabel }).first(),
      page.getByRole('link', { name: bookingManage.errors.retry }),
    ]

    // Every control of the page carries the site's own 2 px :focus-visible ring — the logo link of
    // the minimal header now styles one too (2 px, --softn-border-active), with no browser-default
    // allowance left.
    for (const [index, stop] of stops.entries()) {
      await page.keyboard.press('Tab')
      await expect(stop, 'the next Tab stop is the next control of the page').toBeFocused()

      const ring = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element)
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
      })
      expect(ring.outlineStyle, 'keyboard focus is ringed by the page styles').toBe('solid')
      expect(Number.parseFloat(ring.outlineWidth), 'the ring is at least 2 px').toBeGreaterThanOrEqual(2)

      // Enter on the theme toggle switches the theme without a pointer, and the focus stays put
      // (the toggle's own label changes with the theme, hence the name-agnostic locator).
      if (index === 2) {
        const before = await page.getAttribute('html', 'data-theme')
        await page.keyboard.press('Enter')
        await expect(page.locator('html')).toHaveAttribute('data-theme', before === 'light' ? 'dark' : 'light')
        await expect(page.getByRole('button', { name: /Passer au mode (clair|sombre)/ })).toBeFocused()
      }
    }

    // Enter on the retry link follows it: the same page, read again. The focus is on it: it is
    // the last Tab stop of the loop.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(`/rendez-vous/${token}`)

    await ctx.close()
  })
})

test.describe('rendez-vous page: design tokens (4a-1)', () => {
  /**
   * Same method as `e2e/designTokens.spec.ts`, scoped to the manage page: every `--softn-*` value
   * is resolved through the engine on a probe element, and the computed styles of the elements the
   * reachable states render are then checked against those allowed-value sets. The chooser controls
   * (day cards, time chips, reason chips, danger button) render only for a live event, which no
   * credential-free run can show; their stylesheet uses the same token names and is checked by the
   * probe collection below, and the views themselves stay covered by the jsdom suite.
   */
  type AuditResult = {
    tokenCount: number
    mismatches: string[]
    probedNames: number
    fluidAccepted: string[]
    loadedFontFamilies: string[]
  }

  const auditManagePage = (): AuditResult => {
    const SENTINEL = 'rgb(1, 2, 3)'
    const num = (v: string): number => Number.parseFloat(v)
    const norm = (v: string): string => v.toLowerCase().replace(/\s+/g, ' ')

    // 1. Every --softn-* name the page's stylesheets declare or reference.
    const names = new Set<string>()
    const rootStyle = getComputedStyle(document.documentElement)
    for (const p of Array.from(rootStyle)) if (p.startsWith('--softn-')) names.add(p)
    const walk = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          for (const p of Array.from(rule.style)) if (p.startsWith('--softn-')) names.add(p)
          for (const decl of Array.from(rule.style)) {
            const value = rule.style.getPropertyValue(decl)
            for (const match of value.matchAll(/var\((--softn-[a-z0-9-]+)/gi)) names.add(match[1] as string)
          }
        } else if (rule instanceof CSSGroupingRule) walk(rule.cssRules)
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules)
      } catch {
        /* unreadable sheet: none should be, but never crash the audit */
      }
    }

    // 2. Resolve each token through the engine into allowed-value sets.
    const colors = new Set<string>([norm('rgba(0, 0, 0, 0)')])
    const lengths = new Set<number>([0])
    const weights = new Set<string>()
    const ratios = new Set<number>()
    const spacingLetterRatios = new Set<number>([0])

    const wrapper = document.createElement('div')
    wrapper.style.color = SENTINEL
    document.body.appendChild(wrapper)
    const probe = document.createElement('span')
    probe.style.fontSize = '100px'
    wrapper.appendChild(probe)
    const probeStyle = getComputedStyle(probe)

    const resolve = (name: string, depth = 0): string => {
      const raw = rootStyle.getPropertyValue(name).trim()
      if (depth < 4) {
        const inner = /var\((--softn-[a-z0-9-]+)\)/i.exec(raw)
        if (inner?.[1]) return resolve(inner[1], depth + 1)
      }
      return raw
    }

    for (const name of names) {
      const raw = resolve(name)
      if (raw === '') continue

      probe.style.color = `var(${name})`
      const probedColor = norm(probeStyle.color)
      if (probedColor !== SENTINEL) colors.add(probedColor)

      probe.style.fontSize = `var(${name})`
      const fs = num(probeStyle.fontSize)
      if (fs !== 100 && Number.isFinite(fs)) lengths.add(Number(fs.toFixed(2)))

      probe.style.borderRadius = `var(${name})`
      const br = num(probeStyle.borderTopLeftRadius)
      if (Number.isFinite(br)) lengths.add(Number(br.toFixed(2)))

      probe.style.padding = `var(${name})`
      for (const p of probeStyle.padding.split(/\s+/)) {
        const v = num(p)
        if (Number.isFinite(v)) lengths.add(Number(v.toFixed(2)))
      }

      if (/font-weight/.test(name)) {
        probe.style.fontWeight = `var(${name})`
        const w = probeStyle.fontWeight
        if (w !== '' && !Number.isNaN(num(w))) weights.add(w)
      }
      if (/line-height|letter-spacing/.test(name)) probe.style.fontSize = '100px'
      if (/line-height/.test(name)) {
        probe.style.lineHeight = `var(${name})`
        const lh = num(probeStyle.lineHeight)
        const pf = num(probeStyle.fontSize)
        if (Number.isFinite(lh) && pf > 0) ratios.add(Number((lh / pf).toFixed(3)))
      }
      if (/letter-spacing/.test(name)) {
        probe.style.letterSpacing = `var(${name})`
        const ls = probeStyle.letterSpacing
        if (ls !== 'normal') {
          const v = num(ls)
          const pf = num(probeStyle.fontSize)
          if (Number.isFinite(v) && pf > 0) spacingLetterRatios.add(Number(Math.abs(v / pf).toFixed(4)))
        }
      }

      probe.style.color = SENTINEL
      probe.style.fontSize = '100px'
      probe.style.borderRadius = '0px'
      probe.style.padding = '0px'
      probe.style.fontWeight = '400'
      probe.style.lineHeight = 'normal'
      probe.style.letterSpacing = 'normal'
    }

    const lengthOk = (v: number): boolean => {
      for (const t of lengths) if (Math.abs(t - v) < 0.06) return true
      return false
    }

    // 3. Audit every element the reachable states render.
    const main = document.querySelector('main')
    const mainDiv = main?.querySelector(':scope > div') ?? null
    const intro = mainDiv?.querySelector(':scope > div') ?? null
    const elements: Record<string, Element | null> = {
      body: document.body,
      header: document.querySelector('header'),
      logo: document.querySelector("header a[href='/']"),
      backLink: document.querySelectorAll('header a')[1] ?? null,
      toggle: document.querySelector('header button'),
      main,
      intro,
      eyebrow: intro?.querySelector('p') ?? null,
      h1: document.querySelector('main h1'),
      lead: document.querySelector('main h1 + p'),
      retryLink: document.querySelector('main a'),
      contactLine: document.querySelector('main > div > p:last-of-type'),
      footer: document.querySelector('footer'),
      copyright: document.querySelector('footer p'),
      legalLink: document.querySelector('footer nav a'),
    }

    const mismatches: string[] = []
    // Accepted deviation (same class as Mel's 2026-10-20 decision on the hero, issue #73): the
    // page's section rhythm is a clamp interpolating between two token bounds — `main` pads with
    // clamp(--softn-space-10, 7vw, --softn-space-30) horizontally x
    // clamp(--softn-space-5, 5vw, --softn-space-12). At the 1280px audit viewport that computes
    // 89.6px (the 7vw branch) and 48px (the 5vw branch at its ceiling): between tokens, not a
    // token value, and the handoff carries the same clamp shape (40px→88px there). Reported, not
    // a defect.
    const acceptedFluidClamp: Record<string, number[]> = { main: [89.6, 48] }
    const fluidAccepted: string[] = []
    for (const [name, el] of Object.entries(elements)) {
      if (el === null) {
        mismatches.push(`${name}: element missing`)
        continue
      }
      const c = getComputedStyle(el)
      for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor'] as const) {
        const v = c[prop]
        if (v === '' || v === 'none') continue
        if (!colors.has(norm(v))) mismatches.push(`${name}.${prop}: ${v} matches no token`)
      }
      const fams = c.fontFamily
      for (const fam of fams.split(',')) {
        const clean = fam
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .toLowerCase()
        const known =
          clean === 'sans-serif' ||
          clean === 'serif' ||
          clean === 'system-ui' ||
          /plus.?jakarta|zalando|fallback/i.test(clean)
        if (!known) mismatches.push(`${name}.fontFamily: unexpected family ${fam.trim()}`)
      }
      for (const prop of ['fontSize', 'borderTopLeftRadius'] as const) {
        const v = num(c[prop])
        if (Number.isFinite(v) && !lengthOk(v)) mismatches.push(`${name}.${prop}: ${c[prop]} not in token scale`)
      }
      for (const v of c.padding.split(/\s+/)) {
        const p = num(v)
        if (!Number.isFinite(p) || lengthOk(p)) continue
        if ((acceptedFluidClamp[name] ?? []).includes(p)) {
          fluidAccepted.push(`${name}.padding: ${v} — milieu de clamp entre bornes tokenisées (accepté, #73)`)
          continue
        }
        mismatches.push(`${name}.padding: ${v} not in token scale`)
      }
      if (!weights.has(c.fontWeight)) mismatches.push(`${name}.fontWeight: ${c.fontWeight} not a token weight`)
      if (c.lineHeight !== 'normal') {
        const ratio = num(c.lineHeight) / num(c.fontSize)
        const ok = [...ratios].some((r) => Math.abs(r - ratio) < 0.02) || lengthOk(num(c.lineHeight))
        if (!ok) mismatches.push(`${name}.lineHeight: ratio ${ratio.toFixed(3)} not a token line-height`)
      }
      if (c.letterSpacing !== 'normal') {
        const ratio = Math.abs(num(c.letterSpacing) / num(c.fontSize))
        const ok = [...spacingLetterRatios].some((t) => Math.abs(t - ratio) < 0.002) || ratio < 0.0005
        if (!ok) mismatches.push(`${name}.letterSpacing: ${c.letterSpacing} not a token letter-spacing`)
      }
    }

    // 4. The faces the package declares are the faces actually loaded and painted here.
    const loaded = new Set<string>()
    document.fonts.forEach((face) => {
      if (face.status === 'loaded' || face.status === 'unloaded') loaded.add(face.family.toLowerCase())
    })

    wrapper.remove()
    return {
      tokenCount: colors.size + lengths.size + ratios.size,
      mismatches,
      probedNames: names.size,
      fluidAccepted,
      loadedFontFamilies: [...loaded],
    }
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`computed styles of the manage page match @softnio-labs/tokens values (${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme })
      const page: Page = await ctx.newPage()

      // The unavailable state carries every chrome element plus the retry control.
      await page.goto(`/rendez-vous/${tokenFor()}`)
      await expect(page.getByRole('main')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const unavailable = await page.evaluate(auditManagePage)
      expect(unavailable.probedNames, 'token custom properties found on the page').toBeGreaterThan(20)
      expect(unavailable.mismatches, `token mismatches on the unavailable state (${theme})`).toEqual([])

      // The package declares both families; both faces must be loaded and in use on this page too.
      const families = unavailable.loadedFontFamilies.join(' ')
      expect(families, 'loaded font faces on the manage page').toContain('jakarta')
      expect(families, 'loaded font faces on the manage page').toContain('zalando')

      // The invalid state renders the tertiary eyebrow tone (the danger tone is gone).
      await page.goto('/rendez-vous/not-a-signed-token')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(bookingManage.states.invalid.title)
      const invalid = await page.evaluate(auditManagePage)
      expect(invalid.mismatches, `token mismatches on the invalid state (${theme})`).toEqual([])

      await ctx.close()
    })
  }

  test('the reading column and the footer keep the design rhythm at 375, 768 and 1280 px', async ({ browser }) => {
    for (const width of [375, 768, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } })
      const page = await ctx.newPage()
      await page.goto('/rendez-vous/not-a-signed-token')
      await expect(page.getByRole('main')).toBeVisible()

      const layout = await page.evaluate(() => {
        const read = (el: Element | null): { maxWidth: string; paddingTop: string; paddingBottom: string } | null => {
          if (el === null) return null
          const c = getComputedStyle(el)
          return { maxWidth: c.maxWidth, paddingTop: c.paddingTop, paddingBottom: c.paddingBottom }
        }
        return {
          column: read(document.querySelector('main > div')),
          footerInner: read(document.querySelector('footer > div')),
          main: read(document.querySelector('main')),
          footer: read(document.querySelector('footer')),
        }
      })

      // The design's fixed reading measures: the 720px column and the 1080px footer row.
      expect(layout.column?.maxWidth, `column at ${width}px`).toBe('720px')
      expect(layout.footerInner?.maxWidth, `footer row at ${width}px`).toBe('1080px')

      // The vertical rhythm is the fluid clamp of the handoff: main 40→120, footer 24→40.
      const mainTop = Number.parseFloat(layout.main?.paddingTop ?? '')
      const mainBottom = Number.parseFloat(layout.main?.paddingBottom ?? '')
      const footerTop = Number.parseFloat(layout.footer?.paddingTop ?? '')
      expect(mainTop, `main padding-top at ${width}px`).toBeGreaterThanOrEqual(40)
      expect(mainTop, `main padding-top at ${width}px`).toBeLessThanOrEqual(120)
      expect(mainBottom, `main padding-bottom at ${width}px`).toBeGreaterThanOrEqual(40)
      expect(mainBottom, `main padding-bottom at ${width}px`).toBeLessThanOrEqual(120)
      expect(footerTop, `footer padding-top at ${width}px`).toBeGreaterThanOrEqual(24)
      expect(footerTop, `footer padding-top at ${width}px`).toBeLessThanOrEqual(40)

      await ctx.close()
    }
  })
})

test.describe('rendez-vous page: the shared slot chooser, stylesheet-level (issue #123)', () => {
  /**
   * The chooser view renders only for a live calendar read, which no credential-free browser run
   * can show (the webServer blanks every provider key, and `page.route` cannot intercept the
   * server's own Google fetch). What a browser can still prove — and what issue #123 asks for — is
   * that the manage route ships the shared `SlotChooser` stylesheet unchanged: this suite extracts
   * the module's hashed class names from the page's own stylesheets (the technique the eyebrow
   * contrast test above already uses), builds a probe DOM wearing exactly those classes plus the
   * same global utility classes the component applies, and compares the computed styles against
   * the values Mel validated (the declarations the shared
   * `components/booking/SlotChooser/SlotChooser.module.css` ships, the day row's 4 px top padding
   * included). This is a stylesheet-level check on the manage route, not the live component tree;
   * the live tree stays covered by the jsdom suite (`components/sections/BookingManage/tests/`).
   * Axe runs on the same probes, in both themes.
   */

  /** The machine-checkable WCAG 2.1 A and AA rule tags, same list as the axe describes above. */
  const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

  /** Local class names of the shared chooser's CSS module, with the parts of the probe markup. */
  const CHOOSER_LOCALS = [
    'chooser',
    'block',
    'label',
    'days',
    'day',
    'day-picked',
    'dayWeekday',
    'dayNumber',
    'dayMonth',
    'times',
    'time',
    'time-picked',
    'timezoneNote',
  ] as const

  type ChooserClasses = Record<(typeof CHOOSER_LOCALS)[number], string>

  /** Resolves the hashed module classes of the shared chooser from the page's own stylesheets. */
  const chooserClasses = async (page: Page): Promise<ChooserClasses> =>
    page.evaluate(
      (locals) => {
        const tokens = new Set<string>()
        const walk = (rules: CSSRuleList): void => {
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule) {
              for (const match of rule.selectorText.matchAll(/\.([\w-]+)/g)) tokens.add(match[1] as string)
            } else if (rule instanceof CSSGroupingRule) walk(rule.cssRules)
          }
        }
        // (the walk recurses through @media and friends, so rules shipped inside them count too)
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            walk(sheet.cssRules)
          } catch {
            /* unreadable sheet: none should be, but never crash the audit */
          }
        }

        // Next.js production CSS-module naming: the file name is minified to a short hash and the
        // local name survives, so a class reads `<hash>_<local>` (e.g. `ESjQBG_day-picked`). Group
        // the tokens by that first segment, then take the one group carrying the module's
        // distinctive locals — the prefix disambiguates `time` from `time-picked` and this module's
        // `label` from any other module's.
        const groups = new Map<string, Set<string>>()
        for (const token of tokens) {
          const prefix = /^[A-Za-z0-9]+(?=_)/.exec(token)?.[0]
          const local = prefix === undefined ? null : token.slice(prefix.length + 1)
          if (prefix === undefined || local === null || local === '') continue
          const group = groups.get(prefix) ?? new Set<string>()
          group.add(local)
          groups.set(prefix, group)
        }
        const candidates = [...groups.entries()].filter(
          ([, set]) => set.has('day-picked') && set.has('time-picked') && set.has('timezoneNote'),
        )
        if (candidates.length !== 1)
          throw new Error(`expected exactly one SlotChooser module on the page, found ${candidates.length}`)
        const [prefix, set] = candidates[0] as [string, Set<string>]

        const resolved = {} as Record<string, string>
        const missing: string[] = []
        for (const local of locals) {
          if (set.has(local)) resolved[local] = `${prefix}_${local}`
          else missing.push(local)
        }
        if (missing.length > 0)
          throw new Error(`the SlotChooser module classes are missing from the page: ${missing.join(', ')}`)
        return resolved
      },
      [...CHOOSER_LOCALS],
    )

  type ChooserReading = {
    chooserGap: number
    blockGap: number
    labelFontSize: number
    labelWeight: number
    labelIsSecondary: boolean
    daysColumnGap: number
    daysPaddingInline: number
    daysPaddingBlockStart: number
    daysPaddingBlockEnd: number
    daysMarginInline: number
    daysOverflowX: string
    daysScrollbarWidth: string
    dayWidth: number
    dayPaddingBlockStart: number
    dayPaddingBlockEnd: number
    dayBorderWidth: number
    dayRadius: number
    pickedDayBorderIsBrandVivid: boolean
    pickedDayBackgroundIsBrandBackground: boolean
    unpickedDayBorderIsDefault: boolean
    unpickedDayBackgroundIsTransparent: boolean
    dayColorIsColor: boolean
    weekdayColorIsTertiary: boolean
    monthColorIsTertiary: boolean
    dayNumberFontSize: number
    dayNumberWeight: number
    dayNumberLetterSpacingPx: number
    timesColumnGap: number
    timeHeight: number
    timeFontSize: number
    timeWeight: number
    timeRadius: number
    pickedTimeBorderIsBrandVivid: boolean
    pickedTimeBackgroundIsBrandBackground: boolean
    unpickedTimeBorderIsDefault: boolean
    unpickedTimeBackgroundIsTransparent: boolean
    timeColorIsColor: boolean
    noteMarginBlockStart: number
    noteFontSize: number
    noteColorIsTertiary: boolean
    focusRulePresent: boolean
    reducedMotionRulePresent: boolean
  }

  /** Builds the probe DOM inside `main` and reads its computed styles, all in the page. */
  const measureChooser = async (page: Page, classes: ChooserClasses): Promise<ChooserReading> =>
    page.evaluate((classes) => {
      const main = document.querySelector('main')
      if (main === null) throw new Error('the page renders no main landmark')

      const el = (tag: string, className: string, text?: string): HTMLElement => {
        const element = document.createElement(tag)
        element.className = className
        if (text !== undefined) element.textContent = text
        return element
      }
      const button = (className: string, pressed: string, name: string, text?: string): HTMLButtonElement => {
        const element = el('button', className, text) as HTMLButtonElement
        element.type = 'button'
        element.setAttribute('aria-pressed', pressed)
        if (name !== '') element.setAttribute('aria-label', name)
        return element
      }

      // The probe wears the component's own markup shape, global utility classes included.
      const chooser = el('div', classes['chooser'] ?? '')
      const dayBlock = el('div', classes['block'] ?? '')
      dayBlock.append(el('p', classes['label'] ?? '', 'Jour'))
      const days = el('div', classes['days'] ?? '')
      days.setAttribute('role', 'group')
      days.setAttribute('aria-label', 'Jours disponibles')
      // A day card carries no aria-label: the component names it by the text it shows, so the probe
      // wears the visible parts only (two different days, like the real row).
      const dayCard = (pressed: boolean, weekday: string, dayOfMonth: string, month: string): HTMLButtonElement => {
        const card = button(classes['day'] ?? '', pressed ? 'true' : 'false', '')
        card.append(
          el('span', `${classes['dayWeekday'] ?? ''} text-caption uppercase`, weekday),
          el('span', `${classes['dayNumber'] ?? ''} font-display`, dayOfMonth),
          el('span', `${classes['dayMonth'] ?? ''} text-caption`, month),
        )
        if (pressed) card.classList.add(classes['day-picked'] ?? '')
        return card
      }
      days.append(dayCard(true, 'mar', '3', 'nov'), dayCard(false, 'jeu', '5', 'nov'))
      dayBlock.append(days)

      const timeBlock = el('div', classes['block'] ?? '')
      timeBlock.append(el('p', classes['label'] ?? '', 'Heure · mardi 3 novembre'))
      const times = el('div', classes['times'] ?? '')
      times.setAttribute('role', 'group')
      times.setAttribute('aria-label', 'Heures disponibles le mardi 3 novembre')
      const timeChip = (pressed: boolean): HTMLButtonElement => {
        const chip = button(classes['time'] ?? '', pressed ? 'true' : 'false', '', '10:30')
        if (pressed) chip.classList.add(classes['time-picked'] ?? '')
        return chip
      }
      times.append(timeChip(false), timeChip(true))
      timeBlock.append(times)
      timeBlock.append(
        el(
          'p',
          `${classes['timezoneNote'] ?? ''} text-body-sm text-foreground-tertiary`,
          'Les horaires sont indiqués en heure de Paris.',
        ),
      )

      chooser.append(dayBlock, timeBlock)
      const probe = el('div', '')
      probe.id = 'slot-chooser-probe'
      probe.append(chooser)
      main.appendChild(probe)

      // Colours compare as rendered pixels, the way `e2e/designTokens.spec.ts` compares them.
      const pixel = (color: string): string => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        if (context === null) throw new Error('no canvas context')
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        return `${context.getImageData(0, 0, 1, 1).data}`
      }
      const tokenColor = (name: string): string => {
        const ref = document.createElement('span')
        ref.style.color = `var(${name})`
        document.body.appendChild(ref)
        const value = getComputedStyle(ref).color
        ref.remove()
        return pixel(value)
      }
      const color = (element: Element, property: string, token: string): boolean =>
        pixel(getComputedStyle(element).getPropertyValue(property)) === tokenColor(token)

      const style = (element: Element, property: string): string => getComputedStyle(element).getPropertyValue(property)
      const num = (element: Element, property: string): number => Number.parseFloat(style(element, property))
      const dayCards = days.querySelectorAll('button')
      const pickedDay = dayCards[0] as HTMLElement
      const unpickedDay = dayCards[1] as HTMLElement
      const timeChips = times.querySelectorAll('button')
      const pickedTime = timeChips[1] as HTMLElement
      const unpickedTime = timeChips[0] as HTMLElement
      const label = dayBlock.querySelector('p') as HTMLElement
      const note = timeBlock.querySelector('p:last-child') as HTMLElement
      const number = pickedDay.querySelector('span:nth-child(2)') as HTMLElement
      const weekday = pickedDay.querySelector('span:nth-child(1)') as HTMLElement
      const month = pickedDay.querySelector('span:nth-child(3)') as HTMLElement

      // The two rules the manage page used to carry and must keep: the keyboard focus ring and the
      // reduced-motion cut, both found in the shipped stylesheet by their class and declaration.
      let focusRulePresent = false
      let reducedMotionRulePresent = false
      const walkRules = (rules: CSSRuleList): void => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            const selector = rule.selectorText
            const text = rule.style.cssText
            if (
              (classes['day'] !== undefined && selector.includes(classes['day'] ?? '@none@')) ||
              (classes['time'] !== undefined && selector.includes(classes['time'] ?? '@none@'))
            ) {
              if (
                selector.includes(':focus-visible') &&
                text.includes('--softn-border-active') &&
                text.includes('2px')
              ) {
                focusRulePresent = true
              }
            }
          } else if (rule instanceof CSSMediaRule) {
            if (rule.conditionText.includes('prefers-reduced-motion')) {
              for (const inner of Array.from(rule.cssRules)) {
                if (inner instanceof CSSStyleRule && inner.style.getPropertyValue('transition') === 'none') {
                  const selectors = inner.selectorText
                  if (
                    selectors.includes(classes['day'] ?? '@none@') &&
                    selectors.includes(classes['time'] ?? '@none@')
                  ) {
                    reducedMotionRulePresent = true
                  }
                }
              }
            }
          } else if (rule instanceof CSSGroupingRule) walkRules(rule.cssRules)
        }
      }
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walkRules(sheet.cssRules)
        } catch {
          /* unreadable sheet: none should be, but never crash the audit */
        }
      }

      // The probe stays mounted: the axe run below analyses it in place (each test closes its own
      // context, so no probe leaks between tests).
      const reading: ChooserReading = {
        chooserGap: num(chooser, 'row-gap'),
        blockGap: num(dayBlock, 'row-gap'),
        labelFontSize: num(label, 'font-size'),
        labelWeight: num(label, 'font-weight'),
        labelIsSecondary: color(label, 'color', '--softn-color-secondary'),
        daysColumnGap: num(days, 'column-gap'),
        daysPaddingInline: num(days, 'padding-left'),
        daysPaddingBlockStart: num(days, 'padding-top'),
        daysPaddingBlockEnd: num(days, 'padding-bottom'),
        daysMarginInline: num(days, 'margin-left'),
        daysOverflowX: style(days, 'overflow-x'),
        daysScrollbarWidth: style(days, 'scrollbar-width'),
        dayWidth: pickedDay.getBoundingClientRect().width,
        dayPaddingBlockStart: num(pickedDay, 'padding-top'),
        dayPaddingBlockEnd: num(pickedDay, 'padding-bottom'),
        dayBorderWidth: num(pickedDay, 'border-top-width'),
        dayRadius: num(pickedDay, 'border-top-left-radius'),
        pickedDayBorderIsBrandVivid: color(pickedDay, 'border-top-color', '--softn-brand-vivid'),
        pickedDayBackgroundIsBrandBackground: color(pickedDay, 'background-color', '--softn-brand-background'),
        unpickedDayBorderIsDefault: color(unpickedDay, 'border-top-color', '--softn-border-default'),
        unpickedDayBackgroundIsTransparent: pixel(style(unpickedDay, 'background-color')) === pixel('rgba(0, 0, 0, 0)'),
        dayColorIsColor: color(pickedDay, 'color', '--softn-color'),
        weekdayColorIsTertiary: color(weekday, 'color', '--softn-color-tertiary'),
        monthColorIsTertiary: color(month, 'color', '--softn-color-tertiary'),
        dayNumberFontSize: num(number, 'font-size'),
        dayNumberWeight: num(number, 'font-weight'),
        dayNumberLetterSpacingPx: num(number, 'letter-spacing'),
        timesColumnGap: num(times, 'column-gap'),
        timeHeight: pickedTime.getBoundingClientRect().height,
        timeFontSize: num(pickedTime, 'font-size'),
        timeWeight: num(pickedTime, 'font-weight'),
        timeRadius: num(pickedTime, 'border-top-left-radius'),
        pickedTimeBorderIsBrandVivid: color(pickedTime, 'border-top-color', '--softn-brand-vivid'),
        pickedTimeBackgroundIsBrandBackground: color(pickedTime, 'background-color', '--softn-brand-background'),
        unpickedTimeBorderIsDefault: color(unpickedTime, 'border-top-color', '--softn-border-default'),
        unpickedTimeBackgroundIsTransparent:
          pixel(style(unpickedTime, 'background-color')) === pixel('rgba(0, 0, 0, 0)'),
        timeColorIsColor: color(pickedTime, 'color', '--softn-color'),
        noteMarginBlockStart: num(note, 'margin-top'),
        noteFontSize: num(note, 'font-size'),
        noteColorIsTertiary: color(note, 'color', '--softn-color-tertiary'),
        focusRulePresent,
        reducedMotionRulePresent,
      }
      return reading
    }, classes)

  /** The manage values Mel validated, pinned from the shared module as #123 ships it. */
  const expectValidatedStyles = async (page: Page, reading: ChooserReading): Promise<void> => {
    const width = page.viewportSize()?.width ?? 1280
    // .chooser gap: clamp(--softn-space-6, 4vw, --softn-space-8) = clamp(24px, 4vw, 32px).
    expect(reading.chooserGap, 'chooser gap keeps its clamp').toBeCloseTo(Math.min(Math.max(24, width * 0.04), 32), 1)
    expect(reading.blockGap, 'block gap is --softn-space-3 (12px)').toBe(12)
    expect(reading.labelFontSize, 'label font size is --softn-font-size-label (12px)').toBe(12)
    expect(reading.labelWeight, 'label weight is --softn-font-weight-label (600)').toBe(600)
    expect(reading.labelIsSecondary, 'label color is --softn-color-secondary').toBe(true)

    expect(reading.daysColumnGap, 'day row gap is --softn-space-2 (8px)').toBe(8)
    expect(reading.daysPaddingInline, 'day row inline padding is --softn-space-1 (4px)').toBe(4)
    expect(reading.daysPaddingBlockStart, 'day row block-start padding is --softn-space-1 (4px)').toBe(4)
    expect(reading.daysPaddingBlockEnd, 'day row block-end padding is --softn-space-2 (8px)').toBe(8)
    expect(reading.daysMarginInline, 'day row inline margin is -1 × --softn-space-1 (-4px)').toBe(-4)
    expect(reading.daysOverflowX, 'the day row scrolls sideways').toBe('auto')
    expect(reading.daysScrollbarWidth, 'the day row scrollbar is thin').toBe('thin')

    expect(reading.dayWidth, 'day card inline size keeps 4.25rem (68px)').toBe(68)
    expect(reading.dayPaddingBlockStart, 'day card padding-block-start is --softn-space-2 (8px)').toBe(8)
    expect(reading.dayPaddingBlockEnd, 'day card padding-block-end is --softn-space-3 (12px)').toBe(12)
    expect(reading.dayBorderWidth, 'day card border is 1px').toBe(1)
    expect(reading.dayRadius, 'day card radius is --softn-radius-lg (16px)').toBe(16)
    expect(reading.pickedDayBorderIsBrandVivid, 'picked day border is --softn-brand-vivid').toBe(true)
    expect(reading.pickedDayBackgroundIsBrandBackground, 'picked day background is --softn-brand-background').toBe(true)
    expect(reading.unpickedDayBorderIsDefault, 'unpicked day border is --softn-border-default').toBe(true)
    expect(reading.unpickedDayBackgroundIsTransparent, 'unpicked day background stays transparent').toBe(true)
    expect(reading.dayColorIsColor, 'day card color is --softn-color').toBe(true)
    expect(reading.weekdayColorIsTertiary, 'weekday color is --softn-color-tertiary').toBe(true)
    expect(reading.monthColorIsTertiary, 'month color is --softn-color-tertiary').toBe(true)
    expect(reading.dayNumberFontSize, 'day number font size is --softn-font-size-title-lg (24px)').toBe(24)
    expect(reading.dayNumberWeight, 'day number weight is --softn-font-weight-title-lg (800)').toBe(800)
    expect(reading.dayNumberLetterSpacingPx, 'day number letter-spacing keeps -0.02em at 24px (-0.48px)').toBeCloseTo(
      -0.48,
      2,
    )

    expect(reading.timesColumnGap, 'times gap is --softn-space-2 (8px)').toBe(8)
    expect(reading.timeHeight, 'time chip block size is --softn-size-lg (52px)').toBe(52)
    expect(reading.timeFontSize, 'time chip font size is --softn-font-size-body-md (16px)').toBe(16)
    expect(reading.timeWeight, 'time chip weight is --softn-font-weight-body-md (400)').toBe(400)
    expect(reading.timeRadius, 'time chip radius is --softn-radius-pill (100px)').toBe(100)
    expect(reading.pickedTimeBorderIsBrandVivid, 'picked time border is --softn-brand-vivid').toBe(true)
    expect(reading.pickedTimeBackgroundIsBrandBackground, 'picked time background is --softn-brand-background').toBe(
      true,
    )
    expect(reading.unpickedTimeBorderIsDefault, 'unpicked time border is --softn-border-default').toBe(true)
    expect(reading.unpickedTimeBackgroundIsTransparent, 'unpicked time background stays transparent').toBe(true)
    expect(reading.timeColorIsColor, 'time chip color is --softn-color').toBe(true)

    expect(reading.noteMarginBlockStart, 'timezone note keeps its zero margin').toBe(0)
    expect(reading.noteFontSize, 'timezone note font size is body-sm (14px)').toBe(14)
    expect(reading.noteColorIsTertiary, 'timezone note color is --softn-color-tertiary').toBe(true)

    expect(reading.focusRulePresent, 'the day/time :focus-visible ring rule ships (2px, --softn-border-active)').toBe(
      true,
    )
    expect(reading.reducedMotionRulePresent, 'the reduced-motion cut ships for the day and time controls').toBe(true)
  }

  for (const theme of ['dark', 'light'] as const) {
    for (const width of [375, 768, 1280] as const) {
      test(`the chooser stylesheet computes the manage styles Mel validated at ${width} px (${theme})`, async ({
        browser,
      }) => {
        const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme })
        const page: Page = await ctx.newPage()
        await page.emulateMedia({ colorScheme: theme })

        await page.goto(`/rendez-vous/${tokenFor()}`)
        await expect(page.getByRole('main')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)

        const classes = await chooserClasses(page)
        const reading = await measureChooser(page, classes)
        await expectValidatedStyles(page, reading)

        await ctx.close()
      })
    }

    // The row's stylesheet keeps the room a card's focus ring needs on every side (4 px above and
    // at either inline end, 8 px below): a keyboard-focused day card must keep that ring — 2 px
    // wide, drawn 2 px away — fully inside the row's box on all four sides.
    for (const width of [375, 1280] as const) {
      test(`a keyboard-focused day card keeps its focus ring inside the row at ${width} px (${theme})`, async ({
        browser,
      }) => {
        const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme })
        const page: Page = await ctx.newPage()
        await page.emulateMedia({ colorScheme: theme })

        await page.goto(`/rendez-vous/${tokenFor()}`)
        await expect(page.getByRole('main')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)

        const classes = await chooserClasses(page)
        await measureChooser(page, classes)
        const probe = page.locator('#slot-chooser-probe')
        // The day cards sit in the row's group: two day cards, then the times' group wears the
        // time chips, so the count is scoped to the days.
        const cards = probe.getByRole('group', { name: 'Jours disponibles' }).getByRole('button')
        expect(await cards.count(), 'the probe wears two day cards').toBe(2)

        // A plain script focus draws no :focus-visible ring; one Tab press puts the browser in
        // keyboard mode, so the scripted focus that follows draws the shipped ring.
        await page.keyboard.press('Tab')
        for (const card of await cards.all()) {
          await card.evaluate((element) => element.focus())
          await expect(card).toBeFocused()
          const room = await card.evaluate((element) => {
            const style = getComputedStyle(element)
            const box = element.getBoundingClientRect()
            const rowBox = (element.parentElement as HTMLElement).getBoundingClientRect()
            return {
              focusVisible: element.matches(':focus-visible'),
              outlineWidth: Number.parseFloat(style.outlineWidth),
              topRoom: box.top - rowBox.top,
              bottomRoom: rowBox.bottom - box.bottom,
              leftRoom: box.left - rowBox.left,
              rightRoom: rowBox.right - box.right,
            }
          })
          expect(room.focusVisible, 'the scripted focus draws the ring in keyboard mode').toBe(true)
          expect(room.outlineWidth, 'the ring is the shipped 2 px').toBe(2)
          expect(room.topRoom, 'the ring fits above the card inside the row').toBeGreaterThanOrEqual(3.99)
          expect(room.bottomRoom, 'the ring fits below the card inside the row').toBeGreaterThanOrEqual(3.99)
          expect(room.leftRoom, "the ring fits at the card's inline start inside the row").toBeGreaterThanOrEqual(3.99)
          expect(room.rightRoom, "the ring fits at the card's inline end inside the row").toBeGreaterThanOrEqual(3.99)
        }

        await ctx.close()
      })
    }

    test(`axe finds no WCAG 2.1 A/AA violation on the chooser probes (${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme })
      const page: Page = await ctx.newPage()
      await page.emulateMedia({ colorScheme: theme })

      await page.goto(`/rendez-vous/${tokenFor()}`)
      await expect(page.getByRole('main')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)

      const classes = await chooserClasses(page)
      await measureChooser(page, classes)
      const results = await new AxeBuilder({ page })
        .include('#slot-chooser-probe')
        .withTags([...WCAG_AA_TAGS])
        .analyze()
      expect(
        results.violations.map((violation) => `${violation.id} [${violation.impact ?? '?'}] ${violation.help}`),
        `WCAG 2.1 A/AA violations on the chooser probe (${theme})`,
      ).toEqual([])

      await ctx.close()
    })
  }
})
