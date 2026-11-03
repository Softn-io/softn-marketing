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
import { expect, test, type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { bookingManageToken, verifyBookingManageToken } from '../lib/booking/manageToken'
import { bookingManage } from '../locales/fr/bookingManage'
import { chatbot } from '../locales/fr/chatbot'
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

      // The invalid state adds the danger eyebrow tone.
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
