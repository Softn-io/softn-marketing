/**
 * E2E coverage for the redesigned coming-soon home page `/` (GitHub issue #91).
 *
 * The home page is the single-screen launch page (`components/sections/ComingSoon/`): header with
 * the wordmark and the theme toggle, left-aligned launch copy under the giant decorative
 * the `aria-hidden` « softn.io » wordmark, the Baserow-backed e-mail waitlist form, and the
 * copyright footer, over the shared `PointerGlow` backdrop. The full one-page site stays
 * behind the gated `/preview` route, covered by the retargeted `header`/`hero`/`offers`/`theme`/
 * `accessibility`/`designTokens` specs and `e2e/preview.spec.ts`.
 *
 * Checks, end to end (issue #91):
 * - the copy structure: the wordmark *link* and the theme toggle in the header, the eyebrow, the
 *   giant decorative wordmark between them and the h1 (`aria-hidden`, never a heading, no
 *   overflow at 360 px), the page's single h1, both body lines — all imported from `locales/fr/`,
 *   never hardcoded here (QA rule); and the left alignment the design draws;
 * - no third-party request before consent and no clipped content at 360x640 (the page grows and
 *   scrolls when the viewport is too short: nothing reachable may be cut off, and no horizontal
 *   scroll may appear);
 * - the form's label wiring (`aria-describedby`, `aria-invalid`) and its empty / invalid e-mail
 *   errors, shown without a network call;
 * - the anti-spam paths: a filled honeypot and a submission under two seconds both answer with the
 *   success state *without* a Server Action call;
 * - the Server Action paths: a mocked success response interpolates the submitted e-mail in the
 *   success message, and a missing Baserow environment surfaces the generic server error — the
 *   real Baserow API is never called (its origin is routed to a hard failure in every test, so an
 *   accidental live call aborts loudly instead of writing a record);
 * - the keyboard-only journey (Tab reaches every control, Enter submits, the focus ring stays
 *   visible) and `prefers-reduced-motion` (no infinite animation runs);
 * - the indexed metadata: title, description, `index,follow` robots and the canonical URL;
 * - axe WCAG 2.1 A/AA clean in both themes (color-contrast nodes cross-measured on rendered sRGB
 *   pixels: axe 4.14 misparses the `lab()` computed colors `@softnio-labs/tokens` produces — see
 *   the axe describe);
 * - the QA 4a-1 token audit, scoped to the coming-soon elements: every computed color, font family,
 *   size, weight, line height, letter spacing, padding, radius and shadow must exist as a value of
 *   `@softnio-labs/tokens`, in both themes — the same probe method as `e2e/designTokens.spec.ts`.
 *
 * ## How the Server Action is mocked
 *
 * `useActionState` posts the form to the page's own URL with a `Next-Action` header; the response
 * is an RSC stream (`text/x-component`) whose `1:` row holds the serialized `WaitlistResult`.
 * `mockWaitlistAction` fetches the real response and replaces that row with the wanted result, so
 * the React client resolves `useActionState` through the genuine decoding path. The server-side
 * run is harmless without a Baserow environment, and the Baserow origin is hard-aborted in
 * every test: no test can write a live record.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { SITE_URL } from '../lib/site'
import { comingSoon } from '../locales/fr/comingSoon'
import { nav } from '../locales/fr/hero'
import { metadataContent } from '../locales/fr/metadata'
import { WAITLIST_MIN_DELAY_MS } from '../schemas/waitlist'

/** localStorage key the inline theme script reads; same contract as `lib/theme`. */
const THEME_STORAGE_KEY = 'softn-theme'

/** The machine-checkable WCAG 2.1 A and AA rule tags (same list as `e2e/accessibility.spec.ts`). */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

const SCHEMES = ['dark', 'light'] as const
type Scheme = (typeof SCHEMES)[number]

const WORDMARK = `${nav.logo.name}${nav.logo.suffix}`

const { form } = comingSoon

/** An address no bot-list owns; never sent anywhere: every server call is mocked or blocked. */
const EMAIL = 'mel@example.fr'

/**
 * Fulfils every waitlist Server Action POST with the given `WaitlistResult`.
 *
 * The real POST is fetched (`route.fetch()`), so the RSC stream's shape (`text/x-component`, the
 * `0:` flight root with its build id) is genuine, and only the `1:` row — the serialized
 * `WaitlistResult` — is replaced. The React client then decodes the patched stream through its
 * real production path. The server-side run stays harmless: the test server has no Baserow
 * environment (`playwright.config.ts` blanks every provider key), and the Baserow origin is
 * hard-aborted in every test (see `guardBaserow`).
 */
const mockWaitlistAction = (page: Page, result: unknown): void => {
  void page.route('**/*', (route) => {
    void (async () => {
      const request = route.request()
      if (request.method() !== 'POST' || (await request.headerValue('next-action')) === null) {
        await route.fallback()
        return
      }
      const response = await route.fetch()
      const body = await response.text()
      const patched = body.replace(/^1:\{.*$/m, `1:${JSON.stringify(result)}`)
      await route.fulfill({ response, body: patched })
    })()
  })
}

/**
 * Every host a waitlist write could reach: Baserow Cloud plus the configured `BASEROW_API_URL`
 * origin, so a self-hosted instance is blocked too. `process.env.BASEROW_API_URL` here is the
 * test-runner process, not the server under test: the server's own URL is blanked in
 * `playwright.config.ts`, so its helper never issues a request at all.
 */
const BASEROW_HOSTS = ['api.baserow.io']
if (process.env.BASEROW_API_URL) {
  try {
    BASEROW_HOSTS.push(new URL(process.env.BASEROW_API_URL).hostname)
  } catch {
    /* not a parseable URL: nothing extra to block */
  }
}

/** Whether a request URL targets a waitlist provider host. */
const isBaserowRequest = (url: string): boolean => {
  try {
    return BASEROW_HOSTS.includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * Blocks the real Baserow API (Cloud or the configured `BASEROW_API_URL`) for the whole file and
 * records every non-localhost request, so a live call aborts loudly instead of writing a record,
 * and the consent check has its list. Browser-side requests only: the Server Action's
 * server-side calls are not interceptable by `page.route`, which is why `playwright.config.ts`
 * blanks every provider key on the test server.
 */
const guardBaserow = (page: Page): string[] => {
  const external: string[] = []
  page.on('request', (request) => {
    const { hostname } = new URL(request.url())
    if (hostname !== 'localhost' && !hostname.startsWith('127.')) external.push(request.url())
  })
  for (const host of BASEROW_HOSTS) void page.route(`**://${host}/**`, (route) => route.abort())
  return external
}

/** Forces one theme the way the site's theme script consumes it, before navigation. */
const forceTheme = async (page: Page, scheme: Scheme): Promise<void> => {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, scheme] as const)
}

/** Loads `/` and waits until the theme has actually been applied (settled attribute). */
const gotoWithTheme = async (page: Page, scheme: Scheme): Promise<void> => {
  await forceTheme(page, scheme)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
}

/** Text metrics feed several checks; reading runs only once font loading has settled. */
const awaitFonts = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

/** The e-mail field, labelled from the locale (never a hardcoded string). */
const emailField = (page: Page): Locator => page.getByLabel(form.label, { exact: true })

/**
 * The *visible* element carrying the given announcement. The `role="status"` live region renders
 * the same text first in the DOM, so `getByText` matches two nodes: the visible paragraph (error
 * or success) is the last one.
 */
const visibleAnnouncement = (page: Page, text: string): Locator => page.getByText(text).last()

/**
 * The *visible* success paragraph (PR #92 follow-up): the only `<p>` carrying a `<strong>`,
 * because the submitted address renders bold inside the interpolated sentence. The `aria-live`
 * status region is a separate `role="status"` node, never this one.
 */
const successParagraph = (page: Page): Locator => page.locator('p:has(strong)')

/**
 * Asserts the bold success state (issue #91, PR #92 follow-up): the visible paragraph holds
 * exactly one `<strong>` whose text is the submitted address, the paragraph's full text is the
 * interpolated locale sentence, and the live region announces the same sentence as plain text —
 * the bold styling never reaches the announcement.
 */
const expectBoldSuccess = async (page: Page, address: string): Promise<void> => {
  const sentence = form.success.replace('{email}', address)
  const paragraph = successParagraph(page)
  const bold = paragraph.locator('strong')
  await expect(bold).toHaveCount(1)
  await expect(bold).toHaveText(address)
  await expect(paragraph).toHaveText(sentence)
  await expect(page.getByRole('status')).toHaveText(sentence)
}

test.describe('coming-soon: structure and copy', () => {
  test('header wordmark link, theme toggle, single h1 and both body lines render from the locales', async ({
    page,
  }) => {
    // The theme is forced (not left to the machine's system preference) so the toggle's label is
    // deterministic: in dark theme it offers the light one.
    await gotoWithTheme(page, 'dark')
    await expect(page.getByRole('banner')).toBeVisible()

    // The wordmark is a link to `/` again (issue #91): the coming-soon page has a header.
    const wordmark = page.getByRole('link', { name: nav.logo.ariaLabel })
    await expect(wordmark).toBeVisible()
    await expect(wordmark).toHaveAttribute('href', '/')
    await expect(wordmark).toHaveText(WORDMARK)
    await expect(wordmark.locator('span')).toHaveText(nav.logo.suffix)

    // The header's other control is the shared theme toggle, labelled from `nav.themeToggle`.
    await expect(page.getByRole('button', { name: nav.themeToggle.toLight })).toBeVisible()

    await expect(page.getByText(comingSoon.eyebrow)).toBeVisible()

    // The giant decorative « softn.io » wordmark (design: `Softn.io Coming Soon.dc.html`) sits
    // between the eyebrow and the h1: presentational only. It is hidden from assistive technology
    // and never a heading, so the copy structure keeps exactly one h1 below.
    const giant = page.locator('main div[aria-hidden="true"]').filter({ hasText: WORDMARK })
    await expect(giant).toBeVisible()
    await expect(giant).toHaveAttribute('aria-hidden', 'true')
    await expect(page.getByRole('heading', { name: WORDMARK })).toHaveCount(0)
    const order = await page.evaluate((wordmark: string) => {
      const content = document.querySelector('main > div')
      const children = content === null ? [] : Array.from(content.children)
      return {
        eyebrow: children.findIndex((child) => child.tagName === 'P'),
        giant: children.findIndex(
          (child) => child.getAttribute('aria-hidden') === 'true' && (child.textContent ?? '').includes(wordmark),
        ),
        h1: children.findIndex((child) => child.tagName === 'H1'),
      }
    }, WORDMARK)
    expect(order.eyebrow, 'the eyebrow precedes the decorative wordmark').toBeGreaterThanOrEqual(0)
    expect(order.giant, 'the decorative wordmark directly follows the eyebrow').toBe(order.eyebrow + 1)
    expect(order.h1, 'the h1 directly follows the decorative wordmark').toBe(order.giant + 1)

    const headings = page.getByRole('heading', { level: 1 })
    await expect(headings).toHaveCount(1)
    await expect(headings).toHaveText(comingSoon.title)

    // Heading hierarchy: the page's only heading is the h1 — nothing can skip a level.
    await expect(page.getByRole('heading')).toHaveCount(1)

    await expect(page.getByText(comingSoon.body)).toBeVisible()
    await expect(page.getByText(comingSoon.bodyInvite)).toBeVisible()

    // The copyright footer, computed from the locale template with the live year.
    const year = String(new Date().getFullYear())
    await expect(page.getByText(comingSoon.footer.copyright.replace('{year}', year))).toBeVisible()

    // The footer's Contact and legal links stay hidden until their routes exist (approved, #91).
    await expect(page.getByRole('link')).toHaveCount(1)
  })

  test('the launch content column is left-aligned as in the design', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoWithTheme(page, 'dark')
    await awaitFonts(page)

    // `Softn.io Coming Soon.dc.html` draws the launch copy left-aligned (its content column sets
    // `align-items: flex-start; text-align: left`), the giant wordmark flush above the h1.
    const alignment = await page.evaluate(() => {
      const content = document.querySelector('main > div')
      const left = (selector: string): number | null => {
        const el = document.querySelector(selector)
        return el === null ? null : el.getBoundingClientRect().left
      }
      return {
        textAlign: content === null ? '' : getComputedStyle(content).textAlign,
        alignItems: content === null ? '' : getComputedStyle(content).alignItems,
        lefts: [
          left('main > div > p'),
          left('main > div > div[aria-hidden="true"]'),
          left('main h1'),
          left('main h1 + div p'),
          left('main form'),
        ],
      }
    })
    expect(alignment.textAlign, 'the content column is left-aligned').toBe('left')
    expect(alignment.alignItems, 'the content column stacks its blocks at the start').toBe('flex-start')

    // Every block of the column is flush at the same left edge: nothing is centred.
    const present = alignment.lefts.filter((value): value is number => value !== null)
    expect(present, 'every launch block resolves').toHaveLength(alignment.lefts.length)
    const leftEdge = Math.min(...present.map((value) => Math.round(value)))
    for (const value of present) {
      expect(Math.round(value), `block left edge ${String(value)} is flush with the column`).toBe(leftEdge)
    }
  })
})

test.describe('coming-soon: viewport', () => {
  /*
   * The page keeps a minimum viewport height but scrolls when the content grows (issue #91): a
   * short screen must never clip. Only horizontal scroll is a defect; vertical scroll is the
   * escape valve. 360x640 (the smallest reference phone) is asserted explicitly, plus the other
   * reference viewports.
   *
   * "Clipped" means painted outside the scrollable document box while being reachable content: an
   * element hidden from assistive technology (the decorative orbs, the honeypot trap) or inside an
   * `overflow: hidden` ancestor (the backdrop, the honeypot wrapper) is intentionally clipped
   * decoration or an invisible trap, not lost content.
   */
  const VIEWPORTS = [
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ] as const

  for (const { width, height } of VIEWPORTS) {
    test(`no horizontal scroll and no clipped content at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await expect(page.getByRole('banner')).toBeVisible()
      await awaitFonts(page)
      const metrics = await page.evaluate(() => {
        const root = document.documentElement
        const tolerance = 1
        const isDecorative = (element: Element): boolean => element.closest('[aria-hidden="true"]') !== null
        const clippedByAncestor = (element: Element): boolean => {
          for (let node = element.parentElement; node !== null && node !== document.body; node = node.parentElement) {
            const { overflowX, overflowY } = getComputedStyle(node)
            if (overflowX === 'hidden' || overflowX === 'clip' || overflowY === 'hidden' || overflowY === 'clip') {
              return true
            }
          }
          return false
        }
        const clipped = [...document.body.querySelectorAll<HTMLElement>('*')]
          .filter((element) => {
            const box = element.getBoundingClientRect()
            return box.width > 0 && box.height > 0
          })
          .filter((element) => !isDecorative(element) && !clippedByAncestor(element))
          .filter((element) => {
            const box = element.getBoundingClientRect()
            return box.right > root.clientWidth + tolerance || box.bottom > root.scrollHeight + tolerance
          })
          .map((element) => {
            const box = element.getBoundingClientRect()
            return `${element.tagName} at ${String(Math.round(box.right))},${String(Math.round(box.bottom))}`
          })
        return {
          scrollWidth: Math.max(root.scrollWidth, document.body.scrollWidth),
          scrollHeight: Math.max(root.scrollHeight, document.body.scrollHeight),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          clipped,
        }
      })
      expect(
        metrics.scrollWidth,
        `document scrollWidth ${String(metrics.scrollWidth)} vs viewport ${String(metrics.viewportWidth)}`,
      ).toBeLessThanOrEqual(metrics.viewportWidth)
      expect(metrics.clipped, 'reachable elements painted outside the document box').toEqual([])
      test.info().annotations.push({
        type: 'measure',
        description: `${width}x${height}: ${String(metrics.scrollWidth)}x${String(metrics.scrollHeight)} in ${String(metrics.viewportWidth)}x${String(metrics.viewportHeight)}, clipped: ${metrics.clipped.join(' | ') || 'none'}`,
      })
    })
  }
})

test.describe('coming-soon: indexed metadata', () => {
  test('title, description, robots and canonical come from the locale and the site URL', async ({ page }) => {
    await page.goto('/')
    const { comingSoon: copy } = metadataContent

    expect(await page.title()).toBe(copy.title)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', copy.description)
    // The only page a crawler may index until the full site launches. Next.js serializes the
    // robots directives as "index, follow".
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')

    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveCount(1)
    const href = await canonical.getAttribute('href')
    expect(href).not.toBeNull()
    const url = new URL(href ?? '')
    expect(`${url.origin}${url.pathname}`).toBe(`${SITE_URL}/`)

    // The social card resolves against the same base.
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', copy.openGraph.title)
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', copy.openGraph.description)
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', copy.openGraph.locale)
    // Next.js resolves the relative `url: '/'` against `metadataBase` and serializes the Open
    // Graph URL without the trailing slash (`https://softn.io`), while the canonical keeps it.
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', SITE_URL)
  })
})

test.describe('coming-soon: waitlist form', () => {
  test.beforeEach(async ({ page }) => {
    guardBaserow(page)
    // The clock is installed *before* navigation so the form's `startedAt` ref (written on
    // hydration) and the anti-spam delay are both deterministic: `runFor` simulates the seconds a
    // visitor would spend, no real sleeps.
    await page.clock.install({ time: new Date('2026-10-24T12:00:00Z') })
    await page.goto('/')
    await expect(emailField(page)).toBeVisible()
  })

  test('the labelled e-mail field is wired to its reassurance and error descriptions', async ({ page }) => {
    const input = emailField(page)
    await expect(input).toHaveAttribute('name', 'email')
    await expect(input).toHaveAttribute('type', 'email')
    await expect(input).toHaveAttribute('autocomplete', 'email')
    await expect(input).toHaveAttribute('placeholder', form.placeholder)

    // No error yet: the field points at the reassurance copy.
    const describedBy = await input.getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText(form.reassurance)
    await expect(page.getByText(form.reassurance)).toBeVisible()
    await expect(input).not.toHaveAttribute('aria-invalid', 'true')

    // The honeypot field exists, named `reference`, and stays out of the tab order.
    const honeypot = page.locator('form input[name="reference"]')
    await expect(honeypot).toHaveCount(1)
    await expect(honeypot).toHaveAttribute('tabindex', '-1')
  })

  test('an empty submission shows the empty error without a network call', async ({ page }) => {
    const posts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url())
    })

    await page.getByRole('button', { name: form.submit }).click()

    await expect(visibleAnnouncement(page, form.errorEmpty)).toBeVisible()
    const input = emailField(page)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await input.getAttribute('aria-describedby')
    await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText(form.errorEmpty)

    // RSC prefetches of the wordmark link are same-origin GETs; the form must not POST at all.
    expect(posts, 'no form POST may leave the browser on a client-side rejection').toEqual([])
    // The form is still there: no success state, submit button still visible.
    await expect(page.getByRole('button', { name: form.submit })).toBeVisible()
  })

  test('an invalid e-mail shows the invalid error on submit and on blur, without a network call', async ({ page }) => {
    const posts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url())
    })

    await emailField(page).fill('not-an-email')
    await page.getByRole('button', { name: form.submit }).click()

    await expect(visibleAnnouncement(page, form.errorInvalid)).toBeVisible()
    const input = emailField(page)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await input.getAttribute('aria-describedby')
    await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText(form.errorInvalid)
    expect(posts).toEqual([])

    // Typing clears the error; blurring a still-invalid value brings it back.
    await input.fill('still-not-an-email')
    await expect(page.getByText(form.errorInvalid)).toBeHidden()
    await input.blur()
    await expect(visibleAnnouncement(page, form.errorInvalid)).toBeVisible()
    expect(posts).toEqual([])
  })

  test('a filled honeypot answers with the success state without a Server Action call', async ({ page }) => {
    const posts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url())
    })

    await emailField(page).fill(EMAIL)
    // The hidden field is filled programmatically: a visitor cannot reach it (tabindex -1).
    await page.locator('form input[name="reference"]').evaluate((node) => {
      if (node instanceof HTMLInputElement) node.value = 'https://spam.example'
    })
    await page.clock.runFor(WAITLIST_MIN_DELAY_MS + 1000)

    await page.getByRole('button', { name: form.submit }).click()

    await expectBoldSuccess(page, EMAIL)
    await expect(page.getByRole('button', { name: form.submit })).toHaveCount(0)
    expect(posts, 'no Server Action POST may leave the browser for a trapped bot').toEqual([])
  })

  test('a submission under two seconds answers with the success state without a Server Action call', async ({
    page,
  }) => {
    const posts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST') {
        // Diagnostics for a leak observed on this test in mixed parallel batches (see the QA
        // report): the body and the Next-Action header tell a Server Action POST from a native
        // pre-hydration submit, and the response shows what the server answered.
        console.log('LEAKED POST headers:', JSON.stringify(request.headers()))
        console.log('LEAKED POST body:', request.postData())
        posts.push(request.url())
      }
    })
    page.on('response', async (response) => {
      if (response.request().method() === 'POST') {
        try {
          console.log('LEAKED POST response status:', response.status())
          console.log('LEAKED POST response body:', (await response.text()).slice(0, 2000))
        } catch {
          console.log('LEAKED POST response: not readable')
        }
      }
    })

    // The fake clock flows in real time after `install`, so under parallel load the gap between
    // hydration (which stamps `startedAt`) and the click is uncontrolled real time, and it can
    // cross the two-second window on its own: the trap then misses and the form really submits.
    // The clock is therefore frozen *before* the form is touched: the +500 ms jump lands the
    // freeze safely in the future (the clock keeps ticking across the evaluate roundtrip, and a
    // bare `now` reads as fast-forwarding to the past), and with the 1000 ms `runFor` the
    // submission ends up 1.0–1.5 s old — always under the two-second delay, a bot's giveaway,
    // whatever the machine load.
    const fakeNow = await page.evaluate(() => Date.now())
    await page.clock.pauseAt(new Date(fakeNow + 500))
    await emailField(page).fill(EMAIL)
    await page.clock.runFor(1000)

    await page.getByRole('button', { name: form.submit }).click()

    await expectBoldSuccess(page, EMAIL)
    await expect(page.getByRole('button', { name: form.submit })).toHaveCount(0)
    expect(posts, 'no Server Action POST may leave the browser for a too-fast bot').toEqual([])
  })

  test('a mocked Server Action success interpolates the submitted e-mail in the success message', async ({ page }) => {
    mockWaitlistAction(page, { ok: true })

    await emailField(page).fill(EMAIL)
    await page.clock.runFor(WAITLIST_MIN_DELAY_MS + 1000)

    await page.getByRole('button', { name: form.submit }).click()

    // The bold success state: the submitted address is the paragraph's only `<strong>`, the
    // paragraph keeps the full interpolated locale sentence, and the live region announces that
    // sentence as plain text.
    await expectBoldSuccess(page, EMAIL)
    await expect(page.getByRole('button', { name: form.submit })).toHaveCount(0)
  })

  test('a markup-like submitted address renders as bold text, never as HTML', async ({ page }) => {
    mockWaitlistAction(page, { ok: true })

    // The address carries real markup characters; the client-side pattern still accepts it.
    const address = '<b>x</b>@example.fr'
    await emailField(page).fill(address)
    await page.clock.runFor(WAITLIST_MIN_DELAY_MS + 1000)

    await page.getByRole('button', { name: form.submit }).click()

    // React renders the address as one text node inside the `<strong>`: nothing in it may become
    // an element, on this page or inside the bold itself.
    await expectBoldSuccess(page, address)
    await expect(page.locator('b'), 'the markup-like address never creates an element').toHaveCount(0)
    await expect(successParagraph(page).locator('strong *'), 'the bold holds plain text only').toHaveCount(0)
  })

  test('the bold address uses a package weight token and adds no other raw value', async ({ page }) => {
    mockWaitlistAction(page, { ok: true })

    await emailField(page).fill(EMAIL)
    await page.clock.runFor(WAITLIST_MIN_DELAY_MS + 1000)

    await page.getByRole('button', { name: form.submit }).click()

    await expect(successParagraph(page)).toBeVisible()

    /*
     * QA 4a-1, scoped to the new `<strong>` only (narrowed pass): its font-weight must resolve to
     * a value the `@softnio-labs/tokens` package declares, and the element may add no other design
     * value of its own — every other typography property must stay inherited from its parent, so
     * the bold introduces no new raw value. The specific token is Mel's call (it already moved
     * from title-md to title-sm during this pass), so the audit pins membership and inheritance,
     * never the token name.
     */
    type BoldAudit = {
      fontWeight: string
      weightTokens: Record<string, string>
      colorInherited: boolean
      fontSizeInherited: boolean
      lineHeightInherited: boolean
      fontFamilyInherited: boolean
      letterSpacingInherited: boolean
    }
    const audit = await page.evaluate((): BoldAudit => {
      const strong = document.querySelector('p strong')
      if (strong === null) throw new Error('no <strong> in the success paragraph')
      const parent = strong.parentElement
      if (parent === null) throw new Error('the <strong> has no parent')

      // Resolve every --softn-font-weight-* token the page declares through a probe span.
      const probe = document.createElement('span')
      probe.style.fontSize = '100px'
      document.body.appendChild(probe)
      const probeStyle = getComputedStyle(probe)
      const weightTokens: Record<string, string> = {}
      for (const name of Array.from(getComputedStyle(document.documentElement))) {
        if (!name.startsWith('--softn-font-weight-')) continue
        probe.style.fontWeight = `var(${name})`
        weightTokens[name] = probeStyle.fontWeight
      }
      probe.remove()

      const style = getComputedStyle(strong)
      const parentStyle = getComputedStyle(parent)
      const inherited = (key: 'color' | 'fontSize' | 'lineHeight' | 'fontFamily' | 'letterSpacing'): boolean =>
        style[key] === parentStyle[key]
      return {
        fontWeight: style.fontWeight,
        weightTokens,
        colorInherited: inherited('color'),
        fontSizeInherited: inherited('fontSize'),
        lineHeightInherited: inherited('lineHeight'),
        fontFamilyInherited: inherited('fontFamily'),
        letterSpacingInherited: inherited('letterSpacing'),
      }
    })

    expect(Object.keys(audit.weightTokens).length, 'package font-weight tokens resolved').toBeGreaterThan(0)
    expect(
      Object.values(audit.weightTokens),
      `the bold font-weight ${audit.fontWeight} must be a package token value`,
    ).toContain(audit.fontWeight)
    const matchingTokens = Object.entries(audit.weightTokens)
      .filter(([, value]) => value === audit.fontWeight)
      .map(([name]) => name)
    test.info().annotations.push({
      type: 'measure',
      description: `the bold font-weight ${audit.fontWeight} resolves package token(s): ${matchingTokens.join(', ')}`,
    })
    expect(audit.colorInherited, 'the bold adds no new color').toBe(true)
    expect(audit.fontSizeInherited, 'the bold adds no new font-size').toBe(true)
    expect(audit.lineHeightInherited, 'the bold adds no new line-height').toBe(true)
    expect(audit.fontFamilyInherited, 'the bold adds no new font-family').toBe(true)
    expect(audit.letterSpacingInherited, 'the bold adds no new letter-spacing').toBe(true)
  })

  test('a mocked Baserow failure surfaces the generic server error and keeps the form', async ({ page }) => {
    mockWaitlistAction(page, { ok: false, error: 'server' })

    await emailField(page).fill(EMAIL)
    await page.clock.runFor(WAITLIST_MIN_DELAY_MS + 1000)

    await page.getByRole('button', { name: form.submit }).click()

    await expect(visibleAnnouncement(page, form.errorServer)).toBeVisible()
    // The form survives a server error: the visitor can retry.
    await expect(page.getByRole('button', { name: form.submit })).toBeVisible()
    await expect(emailField(page)).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await emailField(page).getAttribute('aria-describedby')
    await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText(form.errorServer)
  })
})

test.describe('coming-soon: the real Server Action without a Baserow environment', () => {
  /*
   * The honest end-to-end path: the real Server Action runs (no `mockWaitlistAction` here), finds
   * no `BASEROW_WAITLIST_TABLE_ID` on the test server (`playwright.config.ts` blanks every
   * provider key) and answers the generic `server` error — the same message the mock above
   * replays. The Baserow origin stays hard-aborted, so this test cannot write a live record even
   * if the environment changed under it.
   */
  test('the missing Baserow environment surfaces the generic server error, with no Baserow call', async ({ page }) => {
    const external = guardBaserow(page)
    await page.clock.install({ time: new Date('2026-10-24T12:00:00Z') })
    await page.goto('/')
    await expect(emailField(page)).toBeVisible()

    await emailField(page).fill(EMAIL)
    await page.clock.runFor(WAITLIST_MIN_DELAY_MS + 1000)
    await page.getByRole('button', { name: form.submit }).click()

    await expect(visibleAnnouncement(page, form.errorServer)).toBeVisible()
    await expect(page.getByRole('button', { name: form.submit })).toBeVisible()
    expect(external, 'third-party requests').toEqual([])
    expect(external.filter(isBaserowRequest), 'the browser never requests the Baserow host').toEqual([])
  })
})

test.describe('coming-soon: keyboard-only journey', () => {
  test('every control is reachable with Tab alone, Enter submits and the focus ring stays visible', async ({
    page,
  }) => {
    guardBaserow(page)
    mockWaitlistAction(page, { ok: true })
    await page.clock.install({ time: new Date('2026-10-24T12:00:00Z') })
    await page.goto('/')
    await expect(page.getByRole('banner')).toBeVisible()

    // Keyboard order: wordmark link, theme toggle, e-mail field, submit button. The honeypot
    // input is removed from the tab order; the footer holds no control.
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveText(WORDMARK)
    await page.keyboard.press('Tab')
    const toggle = page.locator(':focus')
    await expect(toggle).toBeVisible()
    const focusedLabel = await toggle.getAttribute('aria-label')
    expect(
      focusedLabel === nav.themeToggle.toLight || focusedLabel === nav.themeToggle.toDark,
      `the second Tab stop is the theme toggle (got ${String(focusedLabel)})`,
    ).toBe(true)

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveAttribute('name', 'email')

    // The visible focus ring is an outline, not a colour change alone (WCAG 2.4.7).
    const focusStyles = await page.evaluate(() => {
      const element = document.activeElement
      if (element === null) return null
      const style = getComputedStyle(element)
      return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle }
    })
    expect(focusStyles?.outlineStyle, 'the focused field shows a visible outline').not.toBe('none')

    // Type an address and submit with Enter alone.
    await page.keyboard.type(EMAIL)
    await page.clock.runFor(WAITLIST_MIN_DELAY_MS + 1000)
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveText(form.submit)
    await page.keyboard.press('Enter')

    await expect(visibleAnnouncement(page, form.success.replace('{email}', EMAIL))).toBeVisible()
    await expect(page.getByRole('button', { name: form.submit })).toHaveCount(0)
  })
})

test.describe('coming-soon: reduced motion', () => {
  test('no infinite animation runs when motion is reduced', async ({ page }) => {
    guardBaserow(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.getByRole('banner')).toBeVisible()
    await awaitFonts(page)
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => (animation.effect?.getComputedTiming().iterations ?? 1) === Infinity)
        .map((animation) => {
          if (animation instanceof CSSTransition) return String(animation.transitionProperty)
          if (animation instanceof CSSAnimation) return String(animation.animationName)
          return String(animation.id)
        }),
    )
    expect(running, 'infinite animations under reduced motion').toEqual([])
    // The pointer glow must not follow the pointer either (its listener is never installed).
    await page.mouse.move(400, 200)
    await expect(page.getByRole('banner')).toBeVisible()
  })
})

test.describe('coming-soon: axe (WCAG 2.1 AA)', () => {
  for (const scheme of SCHEMES) {
    test(`clean in the ${scheme} theme, with the text really measured`, async ({ page }) => {
      await gotoWithTheme(page, scheme)
      await expect(page.getByRole('banner')).toBeVisible()
      await awaitFonts(page)
      const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze()

      /*
       * axe 4.14 cannot parse wide-gamut computed colors: `@softnio-labs/tokens` declares its
       * palette as `oklch()` with a `lab()` fallback under `@supports (color:lab(…))`, and Chrome
       * serializes the computed `color`/`background-color` of the elements that use them back as
       * `lab(…)` strings (measured: `color: lab(100 0 0)`, `background-color:
       * lab(24.6681 42.0692 -57.9772)`). axe then reports invented sRGB pairs — for the submit
       * Button it claimed `#3e3c4c` on `#1a0f37` (1.67:1, dark) and `#faf8ff` on `#b897ee`
       * (2.29:1, light), none of which Chrome renders (canvas conversion of the same computed
       * values: `#ffffff` on `#4c1d95`, 10.96:1 dark; `#ffffff` on `#6d28d9`, 7.10:1 light).
       *
       * So `color-contrast` violations are not silenced with `disableRules` (a real regression
       * must still fail): every reported node is re-measured on its own computed colors, converted
       * through a canvas to the sRGB bytes Chrome actually paints, and the real ratio must clear
       * 4.5:1. Any other rule stays a plain violation.
       */
      const contrastViolations = results.violations.filter((violation) => violation.id === 'color-contrast')
      const otherViolations = results.violations.filter((violation) => violation.id !== 'color-contrast')
      expect(
        otherViolations,
        `coming-soon (${scheme}): ${String(otherViolations.length)} non-color-contrast WCAG 2.1 A/AA violation(s)\n${otherViolations
          .map(
            (violation) =>
              `- ${violation.id}: ${violation.help} at ${violation.nodes.map((node) => node.target.join(' >>> ')).join(' | ')}`,
          )
          .join('\n')}`,
      ).toHaveLength(0)

      type RenderedRatio = { target: string; fg: string; bg: string; ratio: number }
      const measureRendered = (targets: ReadonlyArray<ReadonlyArray<string | readonly string[]>>): RenderedRatio[] => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d')
        if (ctx === null) throw new Error('no 2d context')
        /** Paint one pixel in the given color and read the bytes back: sRGB whatever the notation. */
        const toSrgb = (value: string): [number, number, number] | null => {
          if (value === 'transparent') return null
          ctx.fillStyle = '#010203'
          ctx.fillStyle = value
          if (String(ctx.fillStyle) === '#010203' && value !== '#010203') throw new Error(`unparsable: ${value}`)
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillRect(0, 0, 1, 1)
          const pixel = ctx.getImageData(0, 0, 1, 1).data
          if ((pixel[3] ?? 0) === 0) return null
          return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0]
        }
        const luminance = (rgb: [number, number, number]): number => {
          const lin = rgb.map((channel) => {
            const s = channel / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0)
        }
        const ratio = (a: [number, number, number], b: [number, number, number]): number => {
          const la = luminance(a)
          const lb = luminance(b)
          return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
        }
        const resolve = (parts: ReadonlyArray<string | readonly string[]>): Element | null => {
          let root: ParentNode = document
          let last: Element | null = null
          for (const part of parts) {
            const selector = typeof part === 'string' ? part : part.join('')
            const found: Element | null = root.querySelector(selector)
            if (found === null) return null
            last = found
            root = found.shadowRoot ?? found
          }
          return last
        }
        return targets.map((parts) => {
          const element = resolve(parts)
          if (element === null) return { target: JSON.stringify(parts), fg: '', bg: '', ratio: -1 }
          const style = getComputedStyle(element)
          const fg = toSrgb(style.color)
          let bg = toSrgb(style.backgroundColor)
          let ancestor = element.parentElement
          while (bg === null && ancestor !== null) {
            bg = toSrgb(getComputedStyle(ancestor).backgroundColor)
            ancestor = ancestor.parentElement
          }
          if (fg === null || bg === null) return { target: JSON.stringify(parts), fg: '', bg: '', ratio: -1 }
          return {
            target: JSON.stringify(parts),
            fg: `rgb(${fg.map((c) => String(Math.round(c))).join(', ')})`,
            bg: `rgb(${bg.map((c) => String(Math.round(c))).join(', ')})`,
            ratio: ratio(fg, bg),
          }
        })
      }
      const ratios = await page.evaluate(
        measureRendered,
        contrastViolations.flatMap((violation) => violation.nodes.map((node) => node.target)),
      )
      expect(ratios.length, 'every reported color-contrast node is re-measured').toBe(
        contrastViolations.flatMap((violation) => violation.nodes).length,
      )
      for (const measured of ratios) {
        expect(
          measured.ratio,
          `axe color-contrast on ${measured.target}: rendered ${measured.fg} on ${measured.bg} must keep 4.5:1 (axe 4.14 misparses lab() computed colors — see the comment above)`,
        ).toBeGreaterThanOrEqual(4.5)
      }
      test.info().annotations.push({
        type: 'measure',
        description: `axe color-contrast re-measured on rendered sRGB pixels: ${
          ratios.map((measured) => `${measured.fg} on ${measured.bg} = ${measured.ratio.toFixed(2)}:1`).join(' | ') ||
          'none reported'
        }`,
      })

      /*
       * Non-vacuity, and an honest account of what axe can and cannot do here.
       *
       * Every text color on the page resolves through the `lab()` fallback of
       * `@softnio-labs/tokens`, and axe 4.14 cannot parse `lab()` computed colors: it pushes ALL
       * of the copy to `incomplete` ("could not determine…") — measured: 10 incomplete nodes,
       * one pass (the clipped honeypot input), and a bogus violation on the submit Button
       * (re-measured above). So the audit is only meaningful if (a) axe really *looked* at the
       * section's copy — asserted on the `incomplete` set, the set it lands in — and (b) the
       * contrast axe cannot resolve is measured somewhere else: below, on the rendered sRGB
       * pixels, against the solid page background AND a worst-case composite of the decorative
       * orbs (each orb color at its computed opacity over the page background, plus the amber
       * aura stop of the pointer glow), in the same theme.
       */
      const incompleteContrast = results.incomplete.find((rule) => rule.id === 'color-contrast')
      expect(incompleteContrast, 'axe reported no color-contrast incomplete nodes at all').toBeTruthy()
      const lookedAt = await page.evaluate(
        (targets) =>
          targets.map((parts) => {
            let root: ParentNode = document
            let last: Element | null = null
            for (const part of parts) {
              const selector = typeof part === 'string' ? part : part.join('')
              const found: Element | null = root.querySelector(selector)
              if (found === null) return ''
              last = found
              root = found.shadowRoot ?? found
            }
            return last?.textContent ?? ''
          }),
        (incompleteContrast?.nodes ?? []).map((node) => node.target),
      )
      for (const needle of [comingSoon.eyebrow, comingSoon.title.slice(0, 24), comingSoon.bodyInvite.slice(0, 24)]) {
        expect(
          lookedAt.some((text) => text.includes(needle)),
          `axe looked at the copy that contains "${needle}" (it lands in the incomplete set)`,
        ).toBe(true)
      }

      // (b) The contrast axe cannot resolve, measured on the rendered pixels.
      type TextContrast = {
        element: string
        fg: string
        solid: string
        worst: string
        ratioSolid: number
        ratioWorst: number
      }
      const measureTextContrast = (keys: string[]): TextContrast[] => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d')
        if (ctx === null) throw new Error('no 2d context')
        const toSrgb = (value: string): [number, number, number] | null => {
          if (value === 'transparent') return null
          ctx.fillStyle = '#010203'
          ctx.fillStyle = value
          if (String(ctx.fillStyle) === '#010203' && value !== '#010203') return null
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillRect(0, 0, 1, 1)
          const pixel = ctx.getImageData(0, 0, 1, 1).data
          if ((pixel[3] ?? 0) === 0) return null
          return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0]
        }
        const luminance = (rgb: [number, number, number]): number => {
          const lin = rgb.map((channel) => {
            const s = channel / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0)
        }
        const ratio = (a: [number, number, number], b: [number, number, number]): number => {
          const la = luminance(a)
          const lb = luminance(b)
          return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
        }
        const blend = (
          base: [number, number, number],
          over: [number, number, number],
          alpha: number,
        ): [number, number, number] => [
          base[0] * (1 - alpha) + over[0] * alpha,
          base[1] * (1 - alpha) + over[1] * alpha,
          base[2] * (1 - alpha) + over[2] * alpha,
        ]
        const rgbString = (rgb: [number, number, number]): string =>
          `rgb(${rgb.map((c) => String(Math.round(c))).join(', ')})`
        return keys.map((selector) => {
          const element = document.querySelector(selector)
          if (element === null) throw new Error(`missing ${selector}`)
          const fg = toSrgb(getComputedStyle(element).color)
          if (fg === null) throw new Error(`no color on ${selector}`)
          const mainEl = element.closest('main')
          // First opaque background up the tree, and whether it is the page surface (the text
          // paints directly over the decorative orbs) or a component's own background (the input
          // field: the orbs never show through it).
          let ancestor: HTMLElement | null = element instanceof HTMLElement ? element : element.parentElement
          let solid: [number, number, number] | null = null
          let pageLevel = true
          while (ancestor !== null && solid === null) {
            const bg = toSrgb(getComputedStyle(ancestor).backgroundColor)
            if (bg !== null) {
              solid = bg
              pageLevel = !(mainEl !== null && (mainEl === ancestor || mainEl.contains(ancestor)))
            }
            ancestor = ancestor.parentElement
          }
          if (solid === null) {
            solid = toSrgb(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255]
          }
          // Worst-case decorative composites behind page-level text: each orb at its computed
          // opacity over the page surface, plus the pointer glow's amber aura stop (12% alpha).
          const composites: [number, number, number][] = [solid]
          if (pageLevel) {
            for (const orb of Array.from(document.querySelectorAll<HTMLElement>('[class*="orb-"]'))) {
              const color = toSrgb(getComputedStyle(orb).backgroundColor)
              const alpha = Number.parseFloat(getComputedStyle(orb).opacity)
              if (color !== null && Number.isFinite(alpha)) composites.push(blend(solid, color, alpha))
            }
            const aura = toSrgb('#fbb847')
            if (aura !== null) composites.push(blend(solid, aura, 0.12))
          }
          const worst = composites.reduce((current, candidate) =>
            ratio(fg, candidate) < ratio(fg, current) ? candidate : current,
          )
          return {
            element: selector,
            fg: rgbString(fg),
            solid: rgbString(solid),
            worst: rgbString(worst),
            ratioSolid: ratio(fg, solid),
            ratioWorst: ratio(fg, worst),
          }
        })
      }
      const textContrasts = await page.evaluate(measureTextContrast, [
        'main p:first-of-type',
        'main h1',
        'main h1 + div p:first-of-type',
        'main h1 + div p:nth-of-type(2)',
        `input[name="email"]`,
        'footer p',
      ])
      for (const measured of textContrasts) {
        expect(
          measured.ratioSolid,
          `${scheme}: ${measured.element} renders ${measured.fg} on ${measured.solid} (solid ancestor)`,
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          measured.ratioWorst,
          `${scheme}: ${measured.element} renders ${measured.fg} on the worst decorative composite ${measured.worst} (orbs + aura)`,
        ).toBeGreaterThanOrEqual(4.5)
      }
      test.info().annotations.push({
        type: 'measure',
        description: `${scheme}: rendered text contrast ${textContrasts
          .map(
            (measured) =>
              `${measured.element}: ${measured.ratioSolid.toFixed(2)}:1 solid, ${measured.ratioWorst.toFixed(2)}:1 worst composite`,
          )
          .join(' | ')}`,
      })
    })
  }
})

test.describe('coming-soon: axe on the success state (WCAG 2.1 AA)', () => {
  /*
   * Success state only (narrowed pass, PR #92 follow-up): after a mocked successful signup the
   * form is gone and the bold address paragraph is on screen, so this audit covers exactly the
   * new markup — the `<strong>` inside the visible paragraph and the plain-text live region — in
   * both themes. Reported color-contrast nodes are re-measured on rendered sRGB pixels for the
   * same reason as the form-state audit above: axe 4.14 misparses the `lab()` computed colors
   * `@softnio-labs/tokens` produces, so a violation is only trusted once the real painted pixels
   * confirm it. The bold address is then measured directly: making the address bold must not
   * break its contrast (16 px bold is not "large text": 4.5:1 stays the bar).
   */
  type RenderedRatio = { target: string; fg: string; bg: string; ratio: number }
  const measureRendered = (targets: ReadonlyArray<ReadonlyArray<string | readonly string[]>>): RenderedRatio[] => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('no 2d context')
    /** Paint one pixel in the given color and read the bytes back: sRGB whatever the notation. */
    const toSrgb = (value: string): [number, number, number] | null => {
      if (value === 'transparent') return null
      ctx.fillStyle = '#010203'
      ctx.fillStyle = value
      if (String(ctx.fillStyle) === '#010203' && value !== '#010203') throw new Error(`unparsable: ${value}`)
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillRect(0, 0, 1, 1)
      const pixel = ctx.getImageData(0, 0, 1, 1).data
      if ((pixel[3] ?? 0) === 0) return null
      return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0]
    }
    const luminance = (rgb: [number, number, number]): number => {
      const lin = rgb.map((channel) => {
        const s = channel / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0)
    }
    const ratio = (a: [number, number, number], b: [number, number, number]): number => {
      const la = luminance(a)
      const lb = luminance(b)
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
    }
    const resolve = (parts: ReadonlyArray<string | readonly string[]>): Element | null => {
      let root: ParentNode = document
      let last: Element | null = null
      for (const part of parts) {
        const selector = typeof part === 'string' ? part : part.join('')
        const found: Element | null = root.querySelector(selector)
        if (found === null) return null
        last = found
        root = found.shadowRoot ?? found
      }
      return last
    }
    return targets.map((parts) => {
      const element = resolve(parts)
      if (element === null) return { target: JSON.stringify(parts), fg: '', bg: '', ratio: -1 }
      const style = getComputedStyle(element)
      const fg = toSrgb(style.color)
      let bg = toSrgb(style.backgroundColor)
      let ancestor = element.parentElement
      while (bg === null && ancestor !== null) {
        bg = toSrgb(getComputedStyle(ancestor).backgroundColor)
        ancestor = ancestor.parentElement
      }
      if (fg === null || bg === null) return { target: JSON.stringify(parts), fg: '', bg: '', ratio: -1 }
      return {
        target: JSON.stringify(parts),
        fg: `rgb(${fg.map((c) => String(Math.round(c))).join(', ')})`,
        bg: `rgb(${bg.map((c) => String(Math.round(c))).join(', ')})`,
        ratio: ratio(fg, bg),
      }
    })
  }

  for (const scheme of SCHEMES) {
    test(`clean in the ${scheme} theme after a successful signup, bold address included`, async ({ page }) => {
      guardBaserow(page)
      await page.clock.install({ time: new Date('2026-10-24T12:00:00Z') })
      await gotoWithTheme(page, scheme)
      mockWaitlistAction(page, { ok: true })
      await expect(emailField(page)).toBeVisible()

      await emailField(page).fill(EMAIL)
      await page.clock.runFor(WAITLIST_MIN_DELAY_MS + 1000)
      await page.getByRole('button', { name: form.submit }).click()

      // The audit targets the success state: the bold paragraph, not the form.
      await expectBoldSuccess(page, EMAIL)
      await awaitFonts(page)

      const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze()

      const contrastViolations = results.violations.filter((violation) => violation.id === 'color-contrast')
      const otherViolations = results.violations.filter((violation) => violation.id !== 'color-contrast')
      expect(
        otherViolations,
        `coming-soon success (${scheme}): ${String(otherViolations.length)} non-color-contrast WCAG 2.1 A/AA violation(s)\n${otherViolations
          .map(
            (violation) =>
              `- ${violation.id}: ${violation.help} at ${violation.nodes.map((node) => node.target.join(' >>> ')).join(' | ')}`,
          )
          .join('\n')}`,
      ).toHaveLength(0)

      const violationTargets = contrastViolations.flatMap((violation) => violation.nodes.map((node) => node.target))
      const boldTarget: ReadonlyArray<string | readonly string[]> = ['p:has(strong)', 'strong']
      const ratios = await page.evaluate(measureRendered, [...violationTargets, boldTarget])
      for (const measured of ratios) {
        expect(
          measured.ratio,
          `rendered contrast on ${measured.target}: ${measured.fg} on ${measured.bg} must keep 4.5:1 (axe 4.14 misparses lab() computed colors — see the form-state audit)`,
        ).toBeGreaterThanOrEqual(4.5)
      }
      test.info().annotations.push({
        type: 'measure',
        description: `success state (${scheme}): rendered contrast ${
          ratios
            .map((measured) => `${measured.fg} on ${measured.bg} = ${measured.ratio.toFixed(2)}:1 (${measured.target})`)
            .join(' | ') || 'none measured'
        }`,
      })

      // Non-vacuity: the copy the audit cannot resolve (the lab() colors) must include the new
      // success sentence — axe really looked at the state under test.
      const incompleteContrast = results.incomplete.find((rule) => rule.id === 'color-contrast')
      expect(incompleteContrast, 'axe reported no color-contrast incomplete nodes at all').toBeTruthy()
      const lookedAt = await page.evaluate(
        (targets) =>
          targets.map((parts) => {
            let root: ParentNode = document
            let last: Element | null = null
            for (const part of parts) {
              const selector = typeof part === 'string' ? part : part.join('')
              const found: Element | null = root.querySelector(selector)
              if (found === null) return ''
              last = found
              root = found.shadowRoot ?? found
            }
            return last?.textContent ?? ''
          }),
        (incompleteContrast?.nodes ?? []).map((node) => node.target),
      )
      const needle = form.success.slice(0, 12)
      expect(
        lookedAt.some((text) => text.includes(needle)),
        `axe looked at the success copy that contains "${needle}" (it lands in the incomplete set)`,
      ).toBe(true)
    })
  }
})

test.describe('coming-soon: consent and privacy', () => {
  test('no third-party request before consent, and never the Baserow host', async ({ page }) => {
    const external = guardBaserow(page)
    await page.goto('/')
    await expect(page.getByRole('banner')).toBeVisible()
    await awaitFonts(page)
    expect(external, 'third-party requests').toEqual([])
    expect(external.filter(isBaserowRequest), 'the browser never requests the Baserow host').toEqual([])
  })
})

test.describe('coming-soon: computed styles match @softnio-labs/tokens values (QA 4a-1)', () => {
  /*
   * Same method as `e2e/designTokens.spec.ts`: the browser is the oracle. Each `--softn-*` custom
   * property is resolved through a probe element, and every computed design value on the page's
   * key elements must appear in the resulting value sets — in both themes. The audit runs at
   * 1280x800 (both themes) and at 360x640 (dark).
   *
   * The page's fluid rhythm (`margin`/`padding` declared as `clamp(token, vh, token)` in the
   * module stylesheet) produces computed values no token equals by design — e.g. the title's
   * `clamp(--softn-space-4, 3.4vh, --softn-space-8)` mid-range. Those intervals are collected from
   * the stylesheets and accepted when the value sits inside the min/max the stylesheet itself
   * declares: the bounds are tokens, the mockup's fluid term is the design's own
   * (`clamp(18px, 3.4vh, 34px)` in `Softn.io Coming Soon.dc.html`). A value outside its declared
   * bounds, or a non-fluid value matching no token, stays a mismatch.
   *
   * The orb gradients are audited too: every colour stop in the computed `background-image` of the
   * decorative backdrop must resolve to a token colour.
   *
   * One approved raw value exists (Mel, interim): the decorative `aria-hidden` wordmark sizes
   * itself with `clamp(56px, 14vw, 168px)` — no package step covers 56–168 px yet (`display-xl`
   * tops out at 86 px). The audit pins that exact formula (bounds and the 14vw term) on the
   * wordmark, and accepts a raw fluid font size on `aria-hidden` elements only; reachable content
   * keeps the strict token scale.
   */
  type AuditParams = { theme: 'dark' | 'light' }
  type AuditResult = {
    theme: string
    tokenCount: number
    fluidIntervals: [number, number][]
    fontSizeFluidIntervals: [number, number][]
    wordmarkLargeFontSize: number
    mismatches: string[]
    gradientColorMismatches: string[]
    loadedFontFamilies: string[]
    bodyTokenFamily: string
    displayTokenFamily: string
    wordmarkFamily: string
    h1Family: string
    bodyCopyFamily: string
    footerFamily: string
  }

  const auditInPage = ({ theme }: AuditParams): AuditResult => {
    const SENTINEL = 'rgb(1, 2, 3)'
    document.documentElement.setAttribute('data-theme', theme)
    void document.documentElement.offsetHeight

    const num = (v: string): number => Number.parseFloat(v)
    const norm = (v: string): string => v.toLowerCase().replace(/\s+/g, ' ')

    // 1. Collect every --softn-* name declared anywhere in the stylesheets, plus those on :root.
    const names = new Set<string>()
    const rootStyle = getComputedStyle(document.documentElement)
    for (const p of Array.from(rootStyle)) if (p.startsWith('--softn-')) names.add(p)
    const walk = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          for (const p of Array.from(rule.style)) if (p.startsWith('--softn-')) names.add(p)
        } else if (rule instanceof CSSGroupingRule) {
          walk(rule.cssRules)
        }
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
    const shadows = new Set<string>([norm('none')])
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

    /** Resolves one clamp() part (a token, a vh term, a ch…) to pixels through the probe. */
    const resolveLength = (part: string): number => {
      probe.style.marginTop = part
      const value = num(probeStyle.marginTop)
      probe.style.marginTop = '0px'
      return value
    }

    // 3. Collect the fluid `clamp(min, preferred, max)` intervals the page stylesheets declare on
    // margin/padding, bounds resolved to px (vh terms against the current viewport).
    //
    // The declarations are read from `rule.cssText`, not from `getPropertyValue(longhand)`: the
    // module stylesheets declare the rhythm through shorthands (`padding-block:`, `padding-inline:`)
    // and CSSOM leaves those longhands empty (`getPropertyValue('padding-block-start') === ''` when
    // the shorthand value contains `var()`), while `cssText` keeps the whole declaration. The
    // `clamp(` argument list is then extracted with a balanced-paren scan: a `[^)]+` regex would
    // stop at the first `)` *inside* `var(--softn-space-…)`.
    const fluidIntervals: [number, number][] = []
    const extractClampArgs = (text: string, start: number): string | null => {
      let depth = 1
      let index = start
      while (index < text.length) {
        const char = text[index]
        if (char === '(') depth += 1
        else if (char === ')') {
          depth -= 1
          if (depth === 0) return text.slice(start, index)
        }
        index += 1
      }
      return null
    }
    const collectFluid = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          const text = rule.cssText
          const pattern = /(?<![a-zA-Z-])(?:margin|padding)[a-zA-Z-]*\s*:\s*clamp\(/g
          for (const match of text.matchAll(pattern)) {
            const args = extractClampArgs(text, (match.index ?? 0) + match[0].length)
            if (args === null) continue
            const parts = args.split(',').map((part) => part.trim())
            if (parts.length !== 3) continue
            const lo = resolveLength(parts[0] ?? '')
            const hi = resolveLength(parts[2] ?? '')
            if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) fluidIntervals.push([lo, hi])
          }
        } else if (rule instanceof CSSGroupingRule) {
          collectFluid(rule.cssRules)
        }
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        collectFluid(sheet.cssRules)
      } catch {
        /* unreadable sheet: never crash the audit */
      }
    }

    /*
     * The raw `font-size: clamp(...)` declarations the stylesheets carry. Today exactly one exists:
     * the decorative wordmark's `clamp(56px, 14vw, 168px)`, an interim raw value Mel approved
     * because no package step covers 56–168 px (`display-xl` tops out at 86 px). Decorative-only
     * allowance: a raw fluid size on reachable content still fails the audit below, and the
     * intervals are returned so the report lists the raw pair instead of hiding it.
     */
    const fontSizeFluidIntervals: [number, number][] = []
    const collectFontSizeFluid = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          const text = rule.cssText
          const pattern = /(?<![a-zA-Z-])font-size\s*:\s*clamp\(/g
          for (const match of text.matchAll(pattern)) {
            const args = extractClampArgs(text, (match.index ?? 0) + match[0].length)
            if (args === null) continue
            const parts = args.split(',').map((part) => part.trim())
            if (parts.length !== 3) continue
            const lo = resolveLength(parts[0] ?? '')
            const hi = resolveLength(parts[2] ?? '')
            if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) fontSizeFluidIntervals.push([lo, hi])
          }
        } else if (rule instanceof CSSGroupingRule) {
          collectFontSizeFluid(rule.cssRules)
        }
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        collectFontSizeFluid(sheet.cssRules)
      } catch {
        /* unreadable sheet: never crash the audit */
      }
    }

    for (const name of names) {
      const raw = resolve(name)
      if (raw === '') continue

      probe.style.color = `var(${name})`
      const probedColor = norm(probeStyle.color)
      if (probedColor !== SENTINEL) colors.add(probedColor)

      probe.style.boxShadow = `var(${name})`
      const probedShadow = norm(probeStyle.boxShadow)
      if (probedShadow !== 'none') shadows.add(probedShadow)

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
      if (/line-height/.test(name)) {
        probe.style.fontSize = '100px'
        probe.style.lineHeight = `var(${name})`
        const lh = num(probeStyle.lineHeight)
        const pf = num(probeStyle.fontSize)
        if (Number.isFinite(lh) && pf > 0) ratios.add(Number((lh / pf).toFixed(3)))
      }
      if (/letter-spacing/.test(name)) {
        probe.style.fontSize = '100px'
        probe.style.letterSpacing = `var(${name})`
        const ls = probeStyle.letterSpacing
        if (ls !== 'normal') {
          const v = num(ls)
          const pf = num(probeStyle.fontSize)
          if (Number.isFinite(v) && pf > 0) spacingLetterRatios.add(Number(Math.abs(v / pf).toFixed(4)))
        }
      }

      probe.style.color = SENTINEL
      probe.style.boxShadow = 'none'
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
    const fluidOk = (v: number): boolean => {
      for (const [min, max] of fluidIntervals) if (v >= min - 0.06 && v <= max + 0.06) return true
      return false
    }
    const fontSizeFluidOk = (v: number): boolean => {
      for (const [min, max] of fontSizeFluidIntervals) if (v >= min - 0.06 && v <= max + 0.06) return true
      return false
    }
    const colorOk = (v: string): boolean => colors.has(norm(v))
    const shadowOk = (v: string): boolean => shadows.has(norm(v))

    // 4. Audit the coming-soon elements: the page shell, the header, the decorative wordmark, the
    // copy blocks, the form field, the button and the footer.
    const elements: Record<string, Element | null> = {
      body: document.body,
      header: document.querySelector('body > div > header'),
      wordmark: document.querySelector('body > div > header a'),
      toggle: document.querySelector('body > div > header button'),
      main: document.querySelector('main'),
      eyebrow: document.querySelector('main p'),
      wordmarkLarge: document.querySelector('main > div > div[aria-hidden="true"]'),
      h1: document.querySelector('main h1'),
      bodyCopy: document.querySelector('main h1 + div p'),
      field: document.querySelector('main input[type="email"]'),
      button: document.querySelector('main button[type="submit"]'),
      footer: document.querySelector('body > div > footer'),
    }

    const mismatches: string[] = []
    for (const [name, el] of Object.entries(elements)) {
      if (el === null) {
        mismatches.push(`${name}: element missing`)
        continue
      }
      const c = getComputedStyle(el)
      for (const prop of ['color', 'backgroundColor', 'borderTopColor'] as const) {
        const v = c[prop]
        if (v === '' || v === 'none') continue
        if (!colorOk(v)) mismatches.push(`${name}.${prop}: ${v} matches no token`)
      }
      if (!shadowOk(c.boxShadow)) mismatches.push(`${name}.boxShadow: ${c.boxShadow} matches no token`)
      for (const fam of c.fontFamily.split(',')) {
        const clean = fam
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .toLowerCase()
        const known =
          clean === 'sans-serif' ||
          clean === 'serif' ||
          clean === 'system-ui' ||
          clean.startsWith('-apple-system') ||
          /plus.?jakarta|zalando|fallback/i.test(clean)
        if (!known) mismatches.push(`${name}.fontFamily: unexpected family ${fam.trim()}`)
      }
      const decorative = el.getAttribute('aria-hidden') === 'true'
      for (const prop of ['fontSize', 'borderTopLeftRadius'] as const) {
        const v = num(c[prop])
        if (!Number.isFinite(v) || lengthOk(v)) continue
        // Decorative-only allowance (see collectFontSizeFluid): today just the giant wordmark's
        // raw `clamp(56px, 14vw, 168px)`. A raw size on reachable content still fails.
        if (decorative && fontSizeFluidOk(v)) continue
        mismatches.push(`${name}.${prop}: ${c[prop]} not in token scale`)
      }
      // Fluid clamps are accepted inside their declared bounds; every other padding value must
      // resolve to a token step.
      for (const v of c.padding.split(/\s+/)) {
        const p = num(v)
        if (Number.isFinite(p) && !lengthOk(p) && !fluidOk(p)) {
          mismatches.push(`${name}.padding: ${v} not in token scale or declared clamp bounds`)
        }
      }
      // Spacing utilities land on margins too (`mt-4`-style rhythm is fluid here): same rule.
      for (const v of c.margin.split(/\s+/)) {
        const m = num(v)
        if (Number.isFinite(m) && !lengthOk(m) && !fluidOk(m)) {
          mismatches.push(`${name}.margin: ${v} not in token scale or declared clamp bounds`)
        }
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

    // 5. The orb gradients: every colour stop must be a token colour (transparent excluded).
    const gradientColorMismatches: string[] = []
    for (const backdropEl of Array.from(document.querySelectorAll<HTMLElement>('main [aria-hidden="true"]'))) {
      const image = getComputedStyle(backdropEl).backgroundImage
      if (image === 'none') continue
      const stops = image.toLowerCase().match(/(?:oklch|oklab|lab|lch|rgb|rgba|hsl|hsla|color)\([^)]*\)/g) ?? []
      for (const stop of stops) {
        if (!colorOk(stop)) gradientColorMismatches.push(`orb gradient stop ${stop} matches no token`)
      }
    }

    wrapper.remove()

    const loaded = new Set<string>()
    document.fonts.forEach((face) => {
      if (face.status === 'loaded' || face.status === 'unloaded') loaded.add(face.family.toLowerCase())
    })

    const firstFamily = (stack: string): string =>
      (stack.split(',')[0] ?? '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase()

    return {
      theme,
      tokenCount: names.size,
      fluidIntervals,
      fontSizeFluidIntervals,
      wordmarkLargeFontSize:
        elements.wordmarkLarge == null ? -1 : num(getComputedStyle(elements.wordmarkLarge).fontSize),
      mismatches,
      gradientColorMismatches,
      loadedFontFamilies: [...loaded],
      bodyTokenFamily: rootStyle.getPropertyValue('--softn-font-body'),
      displayTokenFamily: rootStyle.getPropertyValue('--softn-font-display'),
      wordmarkFamily: elements.wordmark == null ? '' : firstFamily(getComputedStyle(elements.wordmark).fontFamily),
      h1Family: elements.h1 == null ? '' : firstFamily(getComputedStyle(elements.h1).fontFamily),
      bodyCopyFamily: elements.bodyCopy == null ? '' : firstFamily(getComputedStyle(elements.bodyCopy).fontFamily),
      footerFamily: elements.footer == null ? '' : firstFamily(getComputedStyle(elements.footer).fontFamily),
    }
  }

  for (const { viewport, themes } of [
    { viewport: { width: 1280, height: 800 }, themes: ['dark', 'light'] as const },
    { viewport: { width: 360, height: 640 }, themes: ['dark'] as const },
  ]) {
    for (const scheme of themes) {
      test(`every computed value is a token value at ${viewport.width}x${viewport.height} (${scheme})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport)
        await gotoWithTheme(page, scheme)
        await awaitFonts(page)
        const result = await page.evaluate(auditInPage, { theme: scheme } satisfies AuditParams)

        // Sanity: the audit is meaningless if it collected no tokens or no fluid intervals.
        expect(result.tokenCount, 'design token custom properties found on the page').toBeGreaterThan(20)
        expect(result.fluidIntervals.length, 'fluid clamp() declarations found on the page').toBeGreaterThan(0)
        expect(result.mismatches, `token mismatches (${scheme} @ ${viewport.width})`).toEqual([])
        expect(result.gradientColorMismatches, `orb gradient colours (${scheme} @ ${viewport.width})`).toEqual([])

        // The decorative wordmark's size is the one approved raw value: the exact design clamp
        // `clamp(56px, 14vw, 168px)` (Mel, interim — no package step covers 56–168 px). Pin the
        // formula, then list every raw font-size clamp the audit is aware of.
        const expectedWordmarkSize = Math.min(168, Math.max(56, viewport.width * 0.14))
        expect(
          result.wordmarkLargeFontSize,
          `decorative wordmark font-size is clamp(56px, 14vw, 168px) at ${viewport.width}px`,
        ).toBeCloseTo(expectedWordmarkSize, 1)
        expect(result.fontSizeFluidIntervals.length, 'raw font-size clamps collected').toBeLessThanOrEqual(1)
        test.info().annotations.push({
          type: 'measure',
          description: `raw decorative font-size clamps (${scheme} @ ${viewport.width}): ${
            result.fontSizeFluidIntervals.map(([lo, hi]) => `${String(lo)}–${String(hi)}px`).join(' | ') || 'none'
          }`,
        })

        // The package declares both families; faces must exist for each and be used on the page.
        const families = result.loadedFontFamilies.join(' ')
        expect(families).toContain('jakarta')
        expect(families).toContain('zalando')

        // Face pinning: wordmark and h1 render the display face, the body copy the body face.
        const bodyFace =
          result.bodyTokenFamily
            .split(',')[0]
            ?.trim()
            .replace(/^['"]|['"]$/g, '')
            .toLowerCase() ?? ''
        const displayFace =
          result.displayTokenFamily
            .split(',')[0]
            ?.trim()
            .replace(/^['"]|['"]$/g, '')
            .toLowerCase() ?? ''
        expect(displayFace).toMatch(/zalando/i)
        expect(bodyFace).toMatch(/plus.?jakarta/i)
        expect(result.wordmarkFamily, 'the wordmark renders the display face').toBe(displayFace)
        expect(result.h1Family, 'the h1 renders the display face').toBe(displayFace)
        expect(result.bodyCopyFamily, 'the body copy renders the body face').toBe(bodyFace)
        expect(result.footerFamily, 'the footer renders the body face').toBe(bodyFace)
      })
    }
  }
})
