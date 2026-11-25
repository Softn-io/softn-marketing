import { expect, test, type Page } from '@playwright/test'
import { agent } from '../locales/fr/agent'
import { bookingManage } from '../locales/fr/bookingManage'
import { footer } from '../locales/fr/footer'
import { cookieBanner } from '../locales/fr/legal'
import { CONSENT_SCHEMA_VERSION, CONSENT_STORAGE_KEY } from '../lib/consent'
import { SECTION_IDS } from '../lib/anchors'
import { THEME_STORAGE_KEY } from '../lib/theme'
import { UMAMI_WEBSITE_ID } from '../lib/analytics/umami'
import {
  UMAMI_API_PREFIX,
  UMAMI_HOST_URL,
  UMAMI_ORIGIN,
  UMAMI_RECORDER_SRC,
  UMAMI_TRACKER_SRC,
} from '../lib/analytics/umamiRoutes'
import { stubUmami, type UmamiHit } from './support/umamiStub'

/**
 * Umami behind the consent gate (issue #24), verified end to end against the production build:
 *
 * - nothing ever requests the first-party proxy prefix `/m/*` nor the real Umami origin before any
 *   consent, after a refusal, on the excluded paths (`/rendez-vous/*`, `/preview`) even with
 *   consent granted, nor after a withdrawal — neither on the same page (the `before-send` hook and
 *   the recorder guard read the stored record on every send) nor after a page load;
 * - after the audience consent is granted, the tracker and the recorder are requested through the
 *   first-party proxy with the `data-website-id` and `data-host-url` attributes, and the narrowed
 *   proxy serves no Umami auth or admin route;
 * - the framing policy keeps `frame-ancestors 'self' https://umami.softn.io` on `/` only, `'none'`
 *   everywhere else, and no `X-Frame-Options` is ever sent;
 * - the `data-umami-block` wrappers (Agent conversation, contact screen, waitlist form) change no
 *   landmark, no role and no focus order.
 *
 * Every test intercepts `/m/**` and `umami.softn.io/**` at the browser level and fulfils with a
 * stub (`e2e/support/umamiStub.ts`): no run, local or CI, ever reaches the real Umami instance, so
 * no statistics are polluted and no network is required. Server-side probes in the "narrowed
 * proxy" describe only ever request paths no rewrite matches, so the proxy itself is not exercised
 * towards the real instance. Rate-limited routes (no Upstash store under `next start`) are never
 * used.
 */

declare global {
  interface Window {
    /** Test double installed by the stubbed tracker: sends through the real hook. */
    __umamiTestSend?: (url: string) => Promise<string>
  }
}

const ACCEPT = cookieBanner.accept
const DECLINE = cookieBanner.decline
const SAVED = cookieBanner.saved
const DIALOG_TITLE = cookieBanner.preferences.title
const SWITCH_LABEL = cookieBanner.preferences.audience.toggleAriaLabel
const SAVE_CHOICES = cookieBanner.preferences.save
const FOOTER_BUTTON = footer.cookieSettings

/**
 * Test double of the Umami tracker. It exposes the same internal the loader wraps
 * (`window.umami.getSession`) and a `__umamiTestSend(url)` helper that mimics one tracker send:
 * it runs the page's real `before-send` hook and posts to `/m/api/send` only when the hook keeps
 * the payload — `false` means the real tracker would have cancelled the send. Nothing runs on
 * load: each send is triggered explicitly by the test.
 */
const LIVE_TRACKER_BODY = [
  'window.umami = { getSession: function () { return { cache: "test-double" } } };',
  'window.__umamiTestSend = function (url) {',
  '  var hook = window.__umamiBeforeSend;',
  '  var payload = hook ? hook("pageview", { url: url }) : false;',
  '  if (payload === false) return Promise.resolve("cancelled");',
  '  return fetch("/m/api/send", {',
  '    method: "POST",',
  '    headers: { "content-type": "application/json" },',
  '    body: JSON.stringify(payload),',
  '  }).then(function () { return "sent" });',
  '};',
].join('\n')

const banner = (page: Page) => page.getByRole('region', { name: cookieBanner.ariaLabel })
const bannerAccept = (page: Page) => banner(page).getByRole('button', { name: ACCEPT })
const bannerDecline = (page: Page) => banner(page).getByRole('button', { name: DECLINE })
const dialog = (page: Page) => page.getByRole('dialog', { name: DIALOG_TITLE })
const dialogSwitch = (page: Page) => dialog(page).getByRole('switch', { name: SWITCH_LABEL })
const footerCookieButton = (page: Page) => page.getByRole('button', { name: FOOTER_BUTTON })
const savedStatus = (page: Page) => page.locator('body > p[role="status"]')

/** Pathnames of the intercepted hits, for assertions. */
const hitPaths = (hits: UmamiHit[]): string[] => hits.map((hit) => new URL(hit.url).pathname)

/** Injected Umami script tags in the head, if any. The auto-retry is the observation window. */
const injectedScripts = (page: Page) =>
  page.locator(`head script[src="${UMAMI_TRACKER_SRC}"], head script[src="${UMAMI_RECORDER_SRC}"]`)

/** Scripts pointing at the real Umami origin, if any. */
const directScripts = (page: Page) => page.locator(`head script[src*="${UMAMI_ORIGIN}"]`)

/**
 * Asserts the page stayed silent: no script tag, nothing pointing at the real origin, and not a
 * single intercepted request. `toHaveCount` retries for its whole timeout, so it doubles as the
 * window during which a premature load would have to show up — no fixed sleep needed. Call it
 * after a web-first signal proves the point of risk is behind (the consent layer mounted, the
 * footer rendered, the page heading is up).
 */
const expectSilent = async (page: Page, hits: UmamiHit[]): Promise<void> => {
  await expect(injectedScripts(page)).toHaveCount(0, { timeout: 2500 })
  await expect(directScripts(page)).toHaveCount(0)
  expect(hitPaths(hits)).toEqual([])
}

/** Seeds a valid consent record before any page script runs. */
const seedConsent = (page: Page, audience: boolean): void => {
  page.addInitScript(
    ({ key, version, audience: choice }) =>
      localStorage.setItem(key, JSON.stringify({ version, audience: choice, decidedAt: new Date().toISOString() })),
    { key: CONSENT_STORAGE_KEY, version: CONSENT_SCHEMA_VERSION, audience },
  )
}

/** Reads the audience value of the stored consent record, or null when absent or malformed. */
const storedAudience = (page: Page): Promise<boolean | null> =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    try {
      const parsed = JSON.parse(raw) as { audience?: unknown }
      return typeof parsed.audience === 'boolean' ? parsed.audience : null
    } catch {
      return null
    }
  }, CONSENT_STORAGE_KEY)

/** Withdraws the audience consent through the footer control, with the dialog's own signals. */
const withdrawThroughFooter = async (page: Page): Promise<void> => {
  await footerCookieButton(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialogSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await dialogSwitch(page).click()
  await expect(dialogSwitch(page)).toHaveAttribute('aria-checked', 'false')
  await dialog(page).getByRole('button', { name: SAVE_CHOICES }).click()
  await expect(savedStatus(page)).toHaveText(SAVED)
}

test.describe('Umami behind consent (issue #24)', () => {
  test('requests nothing before any consent and nothing after a refusal', async ({ page }) => {
    const hits = await stubUmami(page)

    await page.goto('/')
    // The banner visible is the web-first signal that the consent layer mounted: its effects —
    // including the loader registration — run in the same commit, so any premature injection is
    // already decided when this resolves.
    await expect(banner(page)).toBeVisible()
    await expectSilent(page, hits)

    await bannerDecline(page).click()
    await expect(savedStatus(page)).toHaveText(SAVED)
    await expectSilent(page, hits)

    // The refusal is stored, so a reload stays silent too.
    expect(await storedAudience(page)).toBe(false)
    await page.reload()
    await expect(footerCookieButton(page)).toBeVisible()
    await expectSilent(page, hits)
  })

  test('the seeded record is a valid grant on its own (positive control of the seed)', async ({ page }) => {
    const hits = await stubUmami(page)
    seedConsent(page, true)

    await page.goto('/')
    await expect(page.locator(`head script[src="${UMAMI_TRACKER_SRC}"]`)).toHaveCount(1)
    await expect.poll(() => hitPaths(hits), { timeout: 10_000 }).toEqual(expect.arrayContaining([UMAMI_TRACKER_SRC]))
  })

  test('loads the tracker and the recorder through the proxy after the audience consent', async ({ page }) => {
    const hits = await stubUmami(page)

    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    expect(hitPaths(hits)).toEqual([])

    await bannerAccept(page).click()

    await expect
      .poll(() => hitPaths(hits), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([UMAMI_TRACKER_SRC, UMAMI_RECORDER_SRC]))

    // Every analytics request stays on the site's own origin: no call to the real instance.
    for (const hit of hits) {
      expect(hit.direct, hit.url).toBe(false)
      expect(new URL(hit.url).pathname.startsWith('/m/'), hit.url).toBe(true)
    }

    const tracker = page.locator(`head script[src="${UMAMI_TRACKER_SRC}"]`)
    const recorder = page.locator(`head script[src="${UMAMI_RECORDER_SRC}"]`)
    await expect(tracker).toHaveCount(1)
    await expect(tracker).toHaveAttribute('data-website-id', UMAMI_WEBSITE_ID)
    await expect(tracker).toHaveAttribute('data-host-url', UMAMI_HOST_URL)
    await expect(recorder).toHaveCount(1)
    await expect(recorder).toHaveAttribute('data-website-id', UMAMI_WEBSITE_ID)
    await expect(recorder).toHaveAttribute('data-host-url', UMAMI_HOST_URL)

    // The consent layer and the loader write no storage key of their own (issue #24 claim): the
    // only localStorage entries stay the consent record and the theme choice. (The third-party
    // scripts themselves run stubbed here; their storage behavior is pinned by the source audit
    // and by the unit tests, not by this run.)
    const storageKeys = await page.evaluate(() => Object.keys(localStorage))
    expect(storageKeys.filter((key) => key !== CONSENT_STORAGE_KEY && key !== THEME_STORAGE_KEY)).toEqual([])
    expect(await page.context().cookies()).toEqual([])
  })

  test('never loads Umami on the booking manage page, even with consent granted', async ({ page }) => {
    const hits = await stubUmami(page)
    seedConsent(page, true)

    await page.goto('/rendez-vous/not-a-real-token')
    // The invalid-token state is the page's own web-first signal: it rendered server-side from the
    // token check alone, so the client layer is mounted and the gate has run.
    await expect(page.getByRole('heading', { level: 1, name: bookingManage.states.invalid.title })).toBeVisible()
    await expectSilent(page, hits)
  })

  test('never loads Umami on the preview page, even with consent granted', async ({ page }) => {
    const hits = await stubUmami(page)
    seedConsent(page, true)

    await page.goto('/preview')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectSilent(page, hits)
  })

  test('withdrawal stops the measurement at the latest on the next page load', async ({ page }) => {
    const hits = await stubUmami(page)

    await page.goto('/')
    await bannerAccept(page).click()
    await expect.poll(() => hitPaths(hits), { timeout: 10_000 }).toEqual(expect.arrayContaining([UMAMI_TRACKER_SRC]))
    expect(await storedAudience(page)).toBe(true)

    // Withdraw through the footer control: the scripts stay for the rest of this page's life
    // (the gate contract), so the check that matters is the reloaded page.
    await withdrawThroughFooter(page)
    expect(await storedAudience(page)).toBe(false)

    const hitsBeforeReload = hits.length
    await page.reload()
    await expect(footerCookieButton(page)).toBeVisible()

    // `cookies.choice.withdrawal` claims the measurement stops no later than the next page load:
    // this is exactly what the reload verifies.
    expect(hits.slice(hitsBeforeReload).map((hit) => hit.url)).toEqual([])
    await expect(injectedScripts(page)).toHaveCount(0, { timeout: 2500 })
    await expect(directScripts(page)).toHaveCount(0)
  })

  test('withdrawal also stops the very next send, across a client-side navigation', async ({ page }) => {
    const hits = await stubUmami(page, { trackerBody: LIVE_TRACKER_BODY })

    await page.goto('/')
    await bannerAccept(page).click()
    await expect.poll(() => hitPaths(hits), { timeout: 10_000 }).toEqual(expect.arrayContaining([UMAMI_TRACKER_SRC]))
    // The poll resolves on the request; the double's body runs a moment later. Wait for it
    // before driving it, so the control send is never read as "double missing".
    await page.waitForFunction(() => typeof window.__umamiTestSend === 'function', undefined, { timeout: 10_000 })

    // Positive control: while the consent stands, one send of the double goes through the proxy.
    const controlUrl = await page.evaluate(() => window.__umamiTestSend?.(window.location.href))
    expect(controlUrl).toBe('sent')
    expect(hitPaths(hits), 'the control send reached the first-party collect endpoint').toContain(
      `${UMAMI_API_PREFIX}/send`,
    )
    const hitsAfterControl = hits.length

    await withdrawThroughFooter(page)
    expect(await storedAudience(page)).toBe(false)

    // Client-side (soft) navigation: Next.js swaps the page without a document reload, so the
    // already-loaded tracker keeps running — exactly the case the withdrawal copy now covers.
    await page.evaluate(() => {
      Reflect.set(window, '__softNavMarker', 'same-document')
    })
    await page.getByRole('contentinfo').getByRole('link', { name: footer.legal.cookies }).click()
    await page.waitForURL('**/politique-de-cookies')
    expect(
      await page.evaluate(() => Reflect.get(window, '__softNavMarker')),
      'the marker survives only when no document reload happened',
    ).toBe('same-document')

    // A send for the new URL is cancelled by the hook alone: the legal page is not an excluded
    // path, so consent is the only reason left.
    const afterWithdrawal = await page.evaluate(() => window.__umamiTestSend?.(window.location.href))
    expect(afterWithdrawal).toBe('cancelled')
    expect(hitPaths(hits)).toHaveLength(hitsAfterControl)

    // The hook itself, called directly, refuses everything.
    const hookResult = await page.evaluate(() =>
      window.__umamiBeforeSend ? window.__umamiBeforeSend('pageview', { url: window.location.href }) : 'no-hook',
    )
    expect(hookResult).toBe(false)

    // And the recorder guard answers undefined once the consent is gone (best-effort stop).
    expect(await page.evaluate(() => window.umami?.getSession?.())).toBeUndefined()
  })

  test.describe('narrowed proxy (security-audit F2)', () => {
    test('no Umami auth or admin route is served under /m/api', async ({ page }) => {
      for (const path of [`${UMAMI_API_PREFIX}/auth/login`, `${UMAMI_API_PREFIX}/admin/users`]) {
        const response = await page.request.get(path)
        expect(response.status(), path).toBe(404)
        // The answer is the site's own 404 document, never JSON proxied from the real instance.
        expect(response.headers()['content-type'] ?? '', path).toContain('text/html')
      }
    })
  })

  test.describe('framing policy', () => {
    test('the home page allows only itself and the Umami dashboard as ancestors', async ({ page }) => {
      const response = await page.request.get('/')
      expect(response.status()).toBe(200)

      const csp = response.headers()['content-security-policy'] ?? ''
      expect(csp).toContain(`frame-ancestors 'self' ${UMAMI_ORIGIN}`)
      expect(response.headers()['x-frame-options']).toBeUndefined()
    })

    test('every other path keeps frame-ancestors none, and no X-Frame-Options anywhere', async ({ page }) => {
      for (const path of ['/contact', '/preview', '/rendez-vous/x', '/politique-de-cookies']) {
        const response = await page.request.get(path)
        const csp = response.headers()['content-security-policy'] ?? ''

        expect(csp, path).toContain("frame-ancestors 'none'")
        expect(csp, path).not.toContain(UMAMI_ORIGIN)
        expect(response.headers()['x-frame-options'], path).toBeUndefined()
      }
    })
  })

  test.describe('data-umami-block placement (issue #24, accessibility)', () => {
    test('the Agent wrapper is an inert div: no role, no tab stop, section structure unchanged', async ({ page }) => {
      seedConsent(page, false)
      await page.goto('/preview')

      const agentSection = page.locator(`section#${SECTION_IDS.agent}`)
      await expect(agentSection).toHaveCount(1)

      const wrapper = agentSection.locator('div[data-umami-block="chatbot"]')
      await expect(wrapper).toHaveCount(1)

      // The wrapper changes nothing structurally: it adds no landmark, no role and no tab stop.
      expect(await wrapper.evaluate((el) => el.tagName)).toBe('DIV')
      expect(await wrapper.evaluate((el) => el.hasAttribute('role'))).toBe(false)
      expect(await wrapper.evaluate((el) => el.hasAttribute('tabindex'))).toBe(false)

      // The section still exposes exactly one h2 heading, and the conversation island lives
      // inside the wrapper, inside the section's content flow.
      await expect(agentSection.locator('h2')).toHaveCount(1)
      await expect(agentSection.locator('h2#agent-title')).toHaveCount(1)
      await agentSection.scrollIntoViewIfNeeded()
      const composer = agentSection.getByLabel(agent.inputLabel)
      await expect(composer).toBeVisible()
      await expect(wrapper.getByLabel(agent.inputLabel)).toHaveCount(1)

      // Focus order is unchanged: every focusable element of the section stays inside the
      // wrapper (messages, chips, composer), and the wrapper itself is not one of them.
      const focusablesInside = await agentSection
        .locator('a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])')
        .count()
      const focusablesInWrapper = await wrapper
        .locator('a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])')
        .count()
      expect(focusablesInside).toBeGreaterThan(0)
      expect(focusablesInWrapper).toBe(focusablesInside)
    })

    test('the ContactScreen attribute adds no landmark and keeps the form reachable', async ({ page }) => {
      seedConsent(page, false)
      await page.goto('/contact')

      const screen = page.locator('div[data-umami-block="contact"]')
      await expect(screen).toHaveCount(1)
      expect(await screen.evaluate((el) => el.hasAttribute('role'))).toBe(false)
      expect(await screen.evaluate((el) => el.hasAttribute('tabindex'))).toBe(false)

      // The form and its controls stay exactly where they were: the attribute alone changed.
      await expect(screen.locator('form')).toHaveCount(1)
      await expect(screen.getByRole('button').first()).toBeVisible()

      // The screen stays inside main, so the page landmarks are untouched by the attribute.
      await expect(page.locator('main').locator('div[data-umami-block="contact"]')).toHaveCount(1)
    })

    test('the waitlist root blocks the one form of the coming-soon page without taking focus', async ({ page }) => {
      seedConsent(page, false)
      await page.goto('/')

      const block = page.locator('div[data-umami-block="waitlist"]')
      await expect(block).toHaveCount(1)
      expect(await block.evaluate((el) => el.tagName)).toBe('DIV')
      expect(await block.evaluate((el) => el.hasAttribute('role'))).toBe(false)
      expect(await block.evaluate((el) => el.hasAttribute('tabindex'))).toBe(false)

      // The form and its e-mail field stay exactly where they were, inside the block, inside main.
      await expect(block.locator('form')).toHaveCount(1)
      await expect(block.locator('input[type="email"]')).toBeVisible()
      await expect(block.getByRole('button').first()).toBeVisible()
      await expect(page.locator('main').locator('div[data-umami-block="waitlist"]')).toHaveCount(1)

      // Focus order is unchanged: every focusable element of the block belongs to the form.
      const focusablesInBlock = await block
        .locator('a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])')
        .count()
      const focusablesInForm = await block
        .locator('form')
        .locator('a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])')
        .count()
      expect(focusablesInBlock).toBeGreaterThan(0)
      expect(focusablesInForm).toBe(focusablesInBlock)
    })
  })
})
