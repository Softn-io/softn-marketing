/**
 * QA coverage of the contact page and form (GitHub issue #32).
 *
 * The journey a visitor walks on `/contact`: the shell the server renders, the client island that
 * validates on touch (1000 ms debounce on typing and on blur), the anti-bot Altcha widget solved in
 * the browser, the submission to `POST /api/contact`, and the confirmation that replaces the
 * heading. What only a real browser proves is covered here, on a production build whose provider
 * keys are all blanked (see the webServer env of `playwright.config.ts`): on such a server the rate
 * limiter fails closed before its own checks (503), so no route status can be asserted through the
 * limiter — the endpoint and the challenge are intercepted at the browser instead, and no run of
 * this suite can reach Gmail, Baserow or Upstash.
 *
 * ## How the Altcha widget is driven
 *
 * The widget fetches its challenge from `/api/contact/challenge` and solves it in Web Workers. The
 * suite intercepts that route and serves challenges built in-process by the very plugin the
 * production route uses (`altcha-lib/frameworks/nextjs`, a dependency, no new one), with a fixed
 * test-only secret and a cheaper proof of work. The suite also intercepts the submission route, so
 * the same test can prove which payload left the browser and answer it — a real submission never
 * happens. The widget is a light-DOM custom element: its switch is a native checkbox input, its
 * state reads on the `.altcha` root's `data-state` attribute.
 *
 * ## The minimum fill time
 *
 * The form answers a submission made less than 3000 ms after it mounted with the success state and
 * no network call (the honeypot trap). Every submit in this suite waits that minimum out before
 * activating the button, so what is asserted is the submission path, not the trap.
 */

import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { create, deriveHmacKeySecret } from 'altcha-lib/frameworks/nextjs'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { contact } from '../locales/fr/contact'
import { minimalHeader } from '../locales/fr/minimalHeader'

/** localStorage key the inline theme script reads; same contract as `lib/theme`. */
const THEME_STORAGE_KEY = 'softn-theme'

/** Accessible copy of the consent label, from the validated locale. */
const CONSENT_LABEL = contact.consent.checkbox.label

/** Text of the privacy sentence the notice and the data-request help both carry. */
const PRIVACY_LINK_LABEL = contact.consent.privacyLink.label

/*
 * Test-only Altcha fixture. The value below is **not a real secret**: a fixed, public string that
 * only exists so the challenge served to the widget is signed and solvable offline. The submission
 * is intercepted, so no server ever verifies with it.
 */
const TEST_ALTCHA_SECRET = 'qa-32-altcha-fixture-000102030405060708090a0b0c'
const TEST_ALTCHA_COST = 1000
const TEST_ALTCHA_TTL_SECONDS = 600

/** The plugin the production challenge route is built from, with the test fixture. Built once. */
let pluginInstance: Promise<ReturnType<typeof create>> | null = null
const plugin = (): Promise<ReturnType<typeof create>> => {
  pluginInstance ??= (async () => {
    const hmacKeySignatureSecret = await deriveHmacKeySecret(TEST_ALTCHA_SECRET)
    return create({
      hmacSignatureSecret: TEST_ALTCHA_SECRET,
      hmacKeySignatureSecret,
      deriveKey,
      store: { get: async () => null, set: async () => {}, setIfAbsent: async () => true },
      fieldName: 'altcha',
      createChallengeParameters: () => ({
        algorithm: 'PBKDF2/SHA-256',
        cost: TEST_ALTCHA_COST,
        keyPrefix: '00',
        expiresAt: new Date(Date.now() + TEST_ALTCHA_TTL_SECONDS * 1000),
      }),
    })
  })()
  return pluginInstance
}

/** Serves a fresh, solvable challenge for every fetch the widget makes. */
const serveChallenge = async (page: Page): Promise<void> => {
  await page.route('**/api/contact/challenge', async (route) => {
    const instance = await plugin()
    const response = await instance.challengeHandler(new Request('http://localhost:3100/api/contact/challenge'))
    await route.fulfill({
      status: response.status,
      contentType: response.headers.get('content-type') ?? 'application/json',
      body: JSON.stringify(await response.json()),
    })
  })
}

/** Body of one intercepted submission, as JSON. */
type ContactPost = Record<string, unknown>

/**
 * Intercepts the submission route. The caller answers each captured request through `respond`;
 * every request is captured before answering, whatever the answer is.
 */
const interceptSubmission = async (
  page: Page,
  respond: (route: Route, posts: readonly ContactPost[]) => Promise<void>,
): Promise<ContactPost[]> => {
  const posts: ContactPost[] = []
  await page.route('**/api/contact', async (route) => {
    const body = route.request().postDataJSON() as ContactPost | null
    if (body !== null) posts.push(body)
    await respond(route, posts)
  })
  return posts
}

const submitButton = (page: Page) => page.getByRole('button', { name: contact.form.submit })
const honeypot = (page: Page) => page.getByLabel(contact.form.honeypot.label)
const widget = (page: Page) => page.locator('altcha-widget')
const widgetSwitch = (page: Page) => widget(page).locator('input[type="checkbox"]')
const widgetState = (page: Page) => widget(page).locator('.altcha')
const widgetPayload = (page: Page) => widget(page).locator('input[name="altcha"]')

/** Fills the form with one valid message (the visitor's own answers, from the validated copy). */
const fillValidForm = async (page: Page): Promise<void> => {
  await page.getByLabel(contact.form.firstName.label, { exact: true }).fill('Camille')
  await page.getByLabel(contact.form.lastName.label, { exact: true }).fill('Durand')
  await page.getByLabel(contact.form.email.label).fill('camille@example.fr')
  await page.getByLabel(contact.form.subject.label).selectOption('quote')
  await page
    .getByLabel(contact.form.message.label)
    .fill('Bonjour, je souhaite faire évoluer mon site. Pouvons-nous échanger ?')
  await page.getByLabel(CONSENT_LABEL).check()
}

/** Solves the anti-bot check the way a visitor does: the switch is toggled, the widget works. */
const solveAltcha = async (page: Page): Promise<void> => {
  await widgetSwitch(page).click()
  await expect(widgetState(page)).toHaveAttribute('data-state', 'verified', { timeout: 15_000 })
  await expect(widgetPayload(page)).not.toHaveValue('', { timeout: 15_000 })
}

/** Waits the minimum fill time out: earlier submits are answered without a network call. */
const outlastMinFill = async (page: Page): Promise<void> => {
  await page.waitForTimeout(3200)
}

/** Forces one theme the way the site's theme script consumes it, before navigation. */
const forceTheme = async (page: Page, scheme: 'dark' | 'light'): Promise<void> => {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, scheme] as const)
}

/** Loads /contact with one theme settled, and waits for the island's mount signal. */
const gotoContact = async (page: Page, scheme: 'dark' | 'light'): Promise<void> => {
  await forceTheme(page, scheme)
  await page.goto('/contact')
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
  await expect(page.getByLabel(contact.form.firstName.label, { exact: true })).toBeVisible()
  // The anti-bot chunk lands after hydration: every assertion of this suite walks it.
  await expect(widget(page)).toBeAttached()
}

test.describe('contact page shell and metadata', () => {
  test('carries its metadata, and the sitemap lists it', async ({ page }) => {
    await page.goto('/contact')
    await expect(page).toHaveTitle(contact.meta.title)

    const canonical = page.locator('link[rel="canonical"]')
    // The metadata API resolves the canonical against the site origin: it is absolute.
    await expect(canonical).toHaveAttribute(
      'href',
      new RegExp(`^https?://[^/]+${contact.link.href.replace('/', '\\/')}$`),
    )
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', contact.meta.description)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', contact.meta.robots)

    const response = await page.request.get('/sitemap.xml')
    expect(response.ok()).toBe(true)
    expect(await response.text()).toContain(contact.link.href)
  })

  test('keeps exactly one h1, with the header chrome the issue asks for', async ({ page }) => {
    await page.goto('/contact')
    const backLink = page.getByRole('link', { name: `← ${minimalHeader.backLink.label}` })
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', '/')
    await expect(page.getByRole('banner').getByRole('button')).toBeVisible() // the theme toggle
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveCount(1)
  })

  test('steps the h1 from display-md to display-lg at the small breakpoint', async ({ page }) => {
    // The module rule owns the step (an unlayered rule beats any utility); Mel's decision: 36px
    // below 40rem, 48px from it — not the mockup's fluid clamp.
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/contact')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '36px')

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '48px')
  })

  test('offers the skip link on the keyboard, and it lands on the form anchor', async ({ page }) => {
    await page.goto('/contact')
    // The skip link sits after the header links in the DOM, so it is reached with the keyboard
    // after them (not the very first stop): see the report for the tab-order note.
    await page
      .getByRole('banner')
      .getByRole('link', { name: /Retour au site/ })
      .focus()
    await page.keyboard.press('Tab') // the theme toggle
    await page.keyboard.press('Tab')
    const skipLink = page.getByRole('link', { name: contact.a11y.skipLink })
    await expect(skipLink).toBeFocused()
    // Visible on keyboard focus: the off-screen transform is dropped.
    await expect(skipLink).toHaveCSS('transform', 'none')
    await skipLink.click()
    await expect(page.locator('#contact-form')).toBeFocused()
  })
})

test.describe('contact form validation timing', () => {
  test('shows a problem 1000 ms after the last keystroke, and hides it while typing again', async ({ page }) => {
    await gotoContact(page, 'dark')
    const email = page.getByLabel(contact.form.email.label)

    await email.fill('pas-un-email')
    await expect(page.getByText(contact.errors.email.invalid)).toBeVisible({ timeout: 2500 })

    await email.fill('pas-un-email.fr')
    await expect(page.getByText(contact.errors.email.invalid)).toBeHidden()
  })

  test('shows a problem 1000 ms after a filled field is left, not at once', async ({ page }) => {
    await gotoContact(page, 'dark')
    const email = page.getByLabel(contact.form.email.label)

    await email.fill('pas-un-email')
    await email.blur()
    await expect(page.getByText(contact.errors.email.invalid)).toBeHidden({ timeout: 500 })
    await expect(page.getByText(contact.errors.email.invalid)).toBeVisible({ timeout: 2500 })
  })

  test('keeps an untouched field quiet on blur and after the delay', async ({ page }) => {
    await gotoContact(page, 'dark')
    const firstName = page.getByLabel(contact.form.firstName.label)

    await firstName.focus()
    await firstName.blur()
    await page.waitForTimeout(2200)
    await expect(page.getByText(contact.errors.firstName.required)).toBeHidden()
  })

  test('keeps the required message of a field that was emptied, after the delay, while it keeps focus', async ({
    page,
  }) => {
    await gotoContact(page, 'dark')
    const lastName = page.getByLabel(contact.form.lastName.label, { exact: true })

    await lastName.fill('Durand')
    await lastName.fill('')
    await expect(page.getByText(contact.errors.lastName.required)).toBeHidden({ timeout: 500 })
    await expect(page.getByText(contact.errors.lastName.required)).toBeVisible({ timeout: 2500 })
    await expect(lastName).toBeFocused()
  })

  test('validates the subject as soon as one is picked', async ({ page }) => {
    await gotoContact(page, 'dark')
    const subject = page.getByLabel(contact.form.subject.label)

    await subject.selectOption('')
    await expect(page.getByText(contact.errors.subject.required)).toBeVisible()
    await subject.selectOption('quote')
    await expect(page.getByText(contact.errors.subject.required)).toBeHidden()
  })
})

test.describe('contact form invalid submit', () => {
  test('reveals every problem, focuses the first field to fix, and sends nothing', async ({ page }) => {
    const posts = await interceptSubmission(page, async () => {
      throw new Error('an invalid form must never be sent')
    })
    await gotoContact(page, 'dark')
    await outlastMinFill(page)

    // The submit button is announced as disabled while the form is incomplete, but it keeps its
    // focus: it is activated from the keyboard, and the activation explains what is missing.
    const button = submitButton(page)
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toHaveAttribute('aria-describedby', /.+/)
    await button.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByText(contact.errors.firstName.required)).toBeVisible()
    await expect(page.getByText(contact.errors.lastName.required)).toBeVisible()
    await expect(page.getByText(contact.errors.email.required)).toBeVisible()
    await expect(page.getByText(contact.errors.subject.required)).toBeVisible()
    await expect(page.getByText(contact.errors.message.required)).toBeVisible()
    await expect(page.getByText(contact.errors.consent)).toBeVisible()
    await expect(page.getByText(contact.errors.altcha.required)).toBeVisible()
    await expect(page.getByLabel(contact.form.firstName.label)).toBeFocused()
    expect(posts).toHaveLength(0)
  })
})

test.describe('contact form submission', () => {
  test('sends one POST with the answers and the solved payload, and confirms with the focused heading', async ({
    page,
  }, testInfo) => {
    await serveChallenge(page)
    const posts = await interceptSubmission(page, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: true }) })
    })
    await gotoContact(page, 'dark')
    await fillValidForm(page)
    await solveAltcha(page)
    await outlastMinFill(page)

    const button = submitButton(page)
    await expect(button).not.toHaveAttribute('aria-disabled')
    await button.click()

    await expect(page.getByRole('heading', { level: 1, name: contact.success.title })).toBeVisible()
    await expect(page.getByText(/Merci Camille/)).toBeVisible()
    await expect(page.getByRole('button', { name: contact.form.submit })).toBeHidden() // the form is gone
    await expect(page.getByRole('link', { name: contact.success.backLink, exact: true })).toBeVisible()

    // The confirmation heading is the page's only h1 and it takes focus, so a keyboard visitor
    // lands on it; the heading state replaces the whole form.
    const focused = await page.evaluate(() => {
      const element = document.activeElement
      return { text: element?.textContent ?? '', tag: element?.tagName ?? '' }
    })
    expect(focused.tag).toBe('H1')
    expect(focused.text).toBe(contact.success.title)

    expect(posts).toHaveLength(1)
    const body = posts[0] ?? {}
    expect(body).toMatchObject({
      firstName: 'Camille',
      lastName: 'Durand',
      email: 'camille@example.fr',
      subject: 'quote',
      consent: true,
      reference: '',
    })
    expect(body.message).toContain('échanger')
    expect(String(body.altcha ?? '').length).toBeGreaterThan(0)
    expect(Number(body.renderedAt)).toBeGreaterThan(0)
    // Evidence of the captured body for the report.
    testInfo.attach('submission-body.json', { body: JSON.stringify(body, null, 2), contentType: 'application/json' })
  })

  test('resets the widget after a refused submission, and the retry carries a fresh payload', async ({ page }) => {
    await serveChallenge(page)
    const posts = await interceptSubmission(page, async (route, all) => {
      await route.fulfill(
        all.length < 2
          ? { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }
          : { status: 200, contentType: 'application/json', body: JSON.stringify({ sent: true }) },
      )
    })
    await gotoContact(page, 'dark')
    await fillValidForm(page)
    await solveAltcha(page)
    await outlastMinFill(page)
    await submitButton(page).click()

    // The route refused the submission (503): the answers stay on screen, the failure is worded,
    // and the payload it claimed is spent — the widget asks for a fresh check.
    await expect(page.getByText(contact.fallback.unavailable)).toBeVisible()
    await expect(widgetState(page)).toHaveAttribute('data-state', 'unverified')
    await expect(widgetPayload(page)).toHaveValue('')

    // The visitor solves the check again and sends again: a fresh payload travels, and this time
    // the message is accepted.
    await solveAltcha(page)
    await submitButton(page).click()
    await expect(page.getByRole('heading', { level: 1, name: contact.success.title })).toBeVisible()

    expect(posts).toHaveLength(2)
    const firstPayload = String(posts[0]?.altcha ?? '')
    const secondPayload = String(posts[1]?.altcha ?? '')
    expect(firstPayload.length).toBeGreaterThan(0)
    expect(secondPayload.length).toBeGreaterThan(0)
    expect(secondPayload).not.toBe(firstPayload)
    // The answers were kept on screen through the failure and the retry.
    expect(posts[1]).toMatchObject({ firstName: 'Camille', email: 'camille@example.fr' })
  })

  test('answers a filled honeypot with the success state and no network call at all', async ({ page }) => {
    let sent = false
    await page.route('**/api/contact', () => {
      sent = true
      throw new Error('a honeypot submission must never reach the endpoint')
    })
    await gotoContact(page, 'dark')
    // A spam bot completes everything: the anti-bot check solved, every answer filled.
    await serveChallenge(page)
    await fillValidForm(page)
    await solveAltcha(page)
    await honeypot(page).fill('https://spam.example')
    await outlastMinFill(page)
    await submitButton(page).click()

    await expect(page.getByRole('heading', { level: 1, name: contact.success.title })).toBeVisible()
    expect(sent).toBe(false)
  })
})

test.describe('contact page accessibility (WCAG 2.1 AA)', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`axe finds no violation on /contact in ${scheme}`, async ({ page }) => {
      await gotoContact(page, scheme)
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(
        results.violations,
        `${scheme}: ${results.violations.length} violation(s)\n${results.violations
          .map(
            (violation) => `- ${violation.id}: ${violation.help} at ${violation.nodes.map((n) => n.target).join(', ')}`,
          )
          .join('\n')}`,
      ).toHaveLength(0)
    })

    test(`every control is reachable and visibly focused from the keyboard in ${scheme}`, async ({ page }) => {
      await gotoContact(page, scheme)

      // Deterministic walk: focus each control with the keyboard one Tab at a time, from the first
      // name field, and assert a visible focus ring on each (a real outline, not a colour change).
      const journey: ReadonlyArray<{ name: string; locator: ReturnType<typeof page.getByLabel> }> = [
        { name: 'firstName', locator: page.getByLabel(contact.form.firstName.label) },
        { name: 'lastName', locator: page.getByLabel(contact.form.lastName.label, { exact: true }) },
        { name: 'email', locator: page.getByLabel(contact.form.email.label) },
        { name: 'subject', locator: page.getByLabel(contact.form.subject.label) },
        { name: 'message', locator: page.getByLabel(contact.form.message.label) },
        { name: 'privacyLink', locator: page.getByRole('link', { name: PRIVACY_LINK_LABEL }) },
        { name: 'consent', locator: page.getByLabel(CONSENT_LABEL) },
        { name: 'altcha', locator: widgetSwitch(page) },
      ]
      await page.getByLabel(contact.form.firstName.label).focus()
      for (const stop of journey) {
        await expect(stop.locator, `${stop.name} holds focus`).toBeFocused()
        const outline = await stop.locator.evaluate((element) => {
          const style = getComputedStyle(element)
          return { style: style.outlineStyle, width: style.outlineWidth }
        })
        // A visible ring: a drawn outline, or the browser's own default ring (`auto`).
        expect(['solid', 'auto'], `${stop.name} shows a visible focus outline (got ${outline.style})`).toContain(
          outline.style,
        )
        await page.keyboard.press('Tab')
      }
      await expect(submitButton(page), 'the submit button ends the walk').toBeFocused()
      const ring = await submitButton(page).evaluate((element) => getComputedStyle(element).outlineStyle)
      expect(ring).toBe('solid')
    })
  }

  test('respects prefers-reduced-motion on the animated controls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/contact')
    await expect(page.getByLabel(contact.form.firstName.label)).toBeVisible()

    for (const locator of [
      page.getByLabel(contact.form.firstName.label),
      page.getByLabel(contact.form.email.label),
      page.getByLabel(CONSENT_LABEL),
    ]) {
      const duration = await locator.evaluate((element) => getComputedStyle(element).transitionDuration)
      expect(duration, 'no transition runs under reduced motion').toBe('0s')
    }
  })
})

test.describe('contact page design fidelity (QA check 4a-1, blocking)', () => {
  /**
   * Every computed design value on the page's key elements must exist as a value of
   * `@softnio-labs/tokens`, in both themes. Same method as `e2e/designTokens.spec.ts`: the browser
   * is the oracle, each `--softn-*` custom property is applied to a probe element and its computed
   * serialization recorded, so formatting differences cannot cause false results. The help text and
   * the error text are mutually exclusive: `errorExpected` says which one of the two is on screen.
   */
  const audit = (state: { errorExpected: boolean }): { mismatches: string[]; tokenCount: number } => {
    const SENTINEL = 'rgb(1, 2, 3)'
    const num = (value: string): number => Number.parseFloat(value)
    const norm = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ')

    const names = new Set<string>()
    const rootStyle = getComputedStyle(document.documentElement)
    for (const property of Array.from(rootStyle)) if (property.startsWith('--softn-')) names.add(property)
    const walk = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          for (const property of Array.from(rule.style)) if (property.startsWith('--softn-')) names.add(property)
        } else if (rule instanceof CSSGroupingRule) {
          walk(rule.cssRules)
        }
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules)
      } catch {
        /* unreadable sheet: none should be */
      }
    }

    const colors = new Set<string>([norm('rgba(0, 0, 0, 0)')])
    const lengths = new Set<number>([0])
    const shadows = new Set<string>([norm('none')])
    const weights = new Set<string>()
    const ratios = new Set<number>()
    const letterRatios = new Set<number>([0])

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
      const color = norm(probeStyle.color)
      if (color !== SENTINEL) colors.add(color)

      probe.style.boxShadow = `var(${name})`
      const shadow = norm(probeStyle.boxShadow)
      if (shadow !== 'none') shadows.add(shadow)

      probe.style.fontSize = `var(${name})`
      const size = num(probeStyle.fontSize)
      if (size !== 100 && Number.isFinite(size)) lengths.add(Number(size.toFixed(2)))

      probe.style.borderRadius = `var(${name})`
      const radius = num(probeStyle.borderTopLeftRadius)
      if (Number.isFinite(radius)) lengths.add(Number(radius.toFixed(2)))

      probe.style.padding = `var(${name})`
      for (const part of probeStyle.padding.split(/\s+/)) {
        const value = num(part)
        if (Number.isFinite(value)) lengths.add(Number(value.toFixed(2)))
      }

      if (/font-weight/.test(name)) {
        probe.style.fontWeight = `var(${name})`
        const weight = probeStyle.fontWeight
        if (weight !== '' && !Number.isNaN(num(weight))) weights.add(weight)
      }
      if (/line-height/.test(name)) {
        probe.style.lineHeight = `var(${name})`
        const lineHeight = num(probeStyle.lineHeight)
        const fontSize = num(probeStyle.fontSize)
        if (Number.isFinite(lineHeight) && fontSize > 0) ratios.add(Number((lineHeight / fontSize).toFixed(3)))
      }
      if (/letter-spacing/.test(name)) {
        probe.style.letterSpacing = `var(${name})`
        const spacing = probeStyle.letterSpacing
        if (spacing !== 'normal') {
          const value = num(spacing)
          const fontSize = num(probeStyle.fontSize)
          if (Number.isFinite(value) && fontSize > 0) letterRatios.add(Number(Math.abs(value / fontSize).toFixed(4)))
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

    const lengthOk = (value: number): boolean => {
      for (const token of lengths) if (Math.abs(token - value) < 0.06) return true
      return false
    }
    const colorOk = (value: string): boolean => colors.has(norm(value))
    const shadowOk = (value: string): boolean => shadows.has(norm(value))

    const main = document.querySelector('main')
    const consentBlock = Array.from(document.querySelectorAll('main form > div')).find((element) =>
      element.querySelector('input[type="checkbox"]'),
    )
    const errorSpan = document.querySelector('main form span[role="alert"]')
    const helpSpan = Array.from(document.querySelectorAll('main form span')).find((element) =>
      element.textContent?.includes('Cette adresse sert uniquement'),
    )
    const elements: Record<string, Element | null> = {
      body: document.body,
      header: document.querySelector('header'),
      backLink: document.querySelector(`header a[aria-label] + a, header a`) ?? null,
      main,
      content: main?.querySelector(':scope > div') ?? null,
      eyebrow:
        Array.from(main?.querySelectorAll('p') ?? []).find((element) => element.textContent === 'Contact') ?? null,
      h1: main?.querySelector('h1') ?? null,
      intro: main?.querySelector('h1 + p') ?? null,
      introLink: main?.querySelector('h1 + p a') ?? null,
      note:
        Array.from(main?.querySelectorAll('p') ?? []).find((element) =>
          element.textContent?.startsWith('Tous les champs sont obligatoires'),
        ) ?? null,
      label: document.querySelector('main form label') ?? null,
      input: document.querySelector('main form input[type="text"]') ?? null,
      select: document.querySelector('main form select') ?? null,
      textarea: document.querySelector('main form textarea') ?? null,
      help: helpSpan ?? null,
      error: errorSpan ?? null,
      consentBlock: consentBlock ?? null,
      checkbox: document.querySelector('main form input[type="checkbox"]') ?? null,
      altchaGroup: main?.querySelector('[role="group"]') ?? null,
      altchaTitle: main?.querySelector('[role="group"] p') ?? null,
      altchaWidget: document.querySelector('altcha-widget') ?? null,
      altchaInner: document.querySelector('altcha-widget .altcha') ?? null,
      altchaSwitch: document.querySelector('altcha-widget .altcha-switch') ?? null,
      submitButton: main?.querySelector('button[type="submit"]') ?? null,
    }

    const mismatches: string[] = []
    const optional = new Set<string>([state.errorExpected ? 'help' : 'error'])
    for (const [name, element] of Object.entries(elements)) {
      if (element === null) {
        if (!optional.has(name)) mismatches.push(`${name}: element missing`)
        continue
      }
      const computed = getComputedStyle(element)
      for (const property of ['color', 'backgroundColor', 'borderTopColor'] as const) {
        const value = computed[property]
        if (value === '' || value === 'none') continue
        if (!colorOk(value)) mismatches.push(`${name}.${property}: ${value} matches no token`)
      }
      if (!shadowOk(computed.boxShadow)) mismatches.push(`${name}.boxShadow: ${computed.boxShadow} matches no token`)

      const family =
        computed.fontFamily
          .split(',')[0]
          ?.trim()
          .replace(/^['"]|['"]$/g, '')
          .toLowerCase() ?? ''
      if (!/jakarta|zalando|sans-serif|serif|system-ui|monospace/.test(family))
        mismatches.push(`${name}.fontFamily: unexpected family ${computed.fontFamily}`)

      for (const property of ['fontSize', 'borderTopLeftRadius'] as const) {
        const value = num(computed[property])
        if (Number.isFinite(value) && !lengthOk(value))
          mismatches.push(`${name}.${property}: ${computed[property]} not in token scale`)
      }
      for (const value of computed.padding.split(/\s+/)) {
        const padding = num(value)
        if (!Number.isFinite(padding) || lengthOk(padding)) continue
        mismatches.push(`${name}.padding: ${value} not in token scale`)
      }
      if (!weights.has(computed.fontWeight))
        mismatches.push(`${name}.fontWeight: ${computed.fontWeight} not a token weight`)
      if (computed.lineHeight !== 'normal') {
        const ratio = num(computed.lineHeight) / num(computed.fontSize)
        const ok = [...ratios].some((token) => Math.abs(token - ratio) < 0.02) || lengthOk(num(computed.lineHeight))
        if (!ok) mismatches.push(`${name}.lineHeight: ratio ${ratio.toFixed(3)} not a token line-height`)
      }
      if (computed.letterSpacing !== 'normal') {
        const ratio = Math.abs(num(computed.letterSpacing) / num(computed.fontSize))
        const ok = [...letterRatios].some((token) => Math.abs(token - ratio) < 0.002) || ratio < 0.0005
        if (!ok) mismatches.push(`${name}.letterSpacing: ${computed.letterSpacing} not a token letter-spacing`)
      }
    }
    wrapper.remove()

    return { mismatches, tokenCount: names.size }
  }

  for (const scheme of ['dark', 'light'] as const) {
    test(`every computed design value on /contact is a package token (${scheme})`, async ({ page }) => {
      await gotoContact(page, scheme)
      await page.evaluate(async () => {
        await document.fonts.ready
      })

      // Base state: every field's help is on screen, no error is.
      const base = await page.evaluate(audit, { errorExpected: false })

      // Error state: the invalid border and the error span paint; the help of that field is gone.
      await page.getByLabel(contact.form.email.label, { exact: true }).fill('pas-un-email')
      await expect(page.getByText(contact.errors.email.invalid)).toBeVisible({ timeout: 2500 })
      const errorState = await page.evaluate(audit, { errorExpected: true })

      expect(base.tokenCount, 'design token custom properties found').toBeGreaterThan(20)
      expect([...base.mismatches, ...errorState.mismatches], `token mismatches (${scheme})`).toEqual([])
    })
  }
})

test.describe('contact page consent (no third party before consent)', () => {
  test('fires no third-party request while the page and the form run', async ({ page }) => {
    await serveChallenge(page)
    const posts = await interceptSubmission(page, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: true }) })
    })
    const external: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.hostname !== 'localhost' && !url.hostname.startsWith('127.')) external.push(request.url())
    })

    await gotoContact(page, 'dark')
    await fillValidForm(page)
    await solveAltcha(page)
    await outlastMinFill(page)
    await submitButton(page).click()
    await expect(page.getByRole('heading', { level: 1, name: contact.success.title })).toBeVisible()
    expect(posts).toHaveLength(1)

    expect(external, `third-party requests: ${external.join(', ')}`).toEqual([])
  })
})

/*
 * QA check 4b (informative): the page against the reference bundle
 * `docs/design/project/Softn.io Contact.dc.html`, at the three breakpoints and both themes.
 * Screenshots of both are saved for the human reviewer; the computed differences of the mapped
 * elements are attached to the test and logged, never asserted against a pixel truth: the mockup is
 * an exploration, and Mel's decisions (two name fields, Altcha, consent block, no footer yet)
 * override it. The reference renders with its own bundle over `file://`; the unresolved mustache
 * placeholders of its controls are cosmetic and do not affect the mapped measurements.
 */
test.describe('contact page reference comparison (4b, informative)', () => {
  const BREAKPOINTS = [375, 768, 1280] as const
  const ARTIFACTS = path.resolve('.orchestration/reports/qa/qa-32-artifacts')

  /**
   * Reads one measurement of a reference element from the bundle's own computed styles, under the
   * same keys the site reader below uses: one key, one mapped element, one property. Property names
   * are given in camel case and read in kebab case, which is what `getPropertyValue` takes.
   */
  const readStyles = (): Record<string, string> => {
    const read = (selector: string, properties: readonly string[]): Record<string, string> => {
      const element = document.querySelector(selector)
      const values: Record<string, string> = {}
      if (element === null) return values
      const style = getComputedStyle(element)
      for (const property of properties) {
        const kebab = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
        values[`${selector}|${property}`] = style.getPropertyValue(kebab)
      }
      return values
    }
    return {
      ...read('main', ['paddingTop', 'paddingLeft']),
      ...read('main h1', ['fontSize', 'lineHeight', 'letterSpacing', 'fontWeight']),
      ...read('main h1 + p, main section p', ['fontSize', 'lineHeight']),
      ...read('main form input', ['height', 'minHeight', 'borderRadius', 'fontSize']),
      ...read('main form select', ['height', 'minHeight', 'borderRadius']),
      ...read('main form textarea', ['height', 'minHeight', 'borderRadius']),
      ...read('main form label', ['fontSize', 'fontWeight']),
      // The mockup paints its label text on an inner span; the site styles the label itself.
      ...read('main form label span', ['fontSize', 'fontWeight']),
    }
  }

  for (const scheme of ['dark', 'light'] as const) {
    for (const width of BREAKPOINTS) {
      test(`screenshots: site vs reference at ${width}px in ${scheme}`, async ({ page }, testInfo) => {
        fs.mkdirSync(ARTIFACTS, { recursive: true })

        // The site.
        await forceTheme(page, scheme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/contact')
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
        await expect(widget(page)).toBeAttached() // the anti-bot chunk must be in the picture
        await page.evaluate(async () => {
          await document.fonts.ready
        })
        await page.screenshot({ path: path.join(ARTIFACTS, `site-${scheme}-${width}.png`), fullPage: true })
        const siteValues = await page.evaluate(readStyles)

        // The reference bundle.
        await page.setViewportSize({ width, height: 900 })
        await page.goto(pathToFileURL('docs/design/project/Softn.io Contact.dc.html').href)
        await page.evaluate((wanted) => {
          const root = document.querySelector('[data-theme]')
          if (root !== null) root.setAttribute('data-theme', wanted)
        }, scheme)
        await page.screenshot({ path: path.join(ARTIFACTS, `reference-${scheme}-${width}.png`), fullPage: true })
        const reference = await page.evaluate(readStyles)
        /*
         * The mockup paints its label text on an inner span (12px/600); the site styles the label
         * element itself with the same token. The wrapper label of the mockup carries the inherited
         * body style, which no visitor sees: drop it, and compare the site's label with the
         * mockup's span.
         */
        for (const property of ['fontSize', 'fontWeight']) {
          const spanKey = `main form label span|${property}`
          const labelKey = `main form label|${property}`
          siteValues[spanKey] = siteValues[labelKey] ?? ''
          delete siteValues[labelKey]
          delete reference[labelKey]
        }
        // Sanity: the comparison is only meaningful if the two maps share keys.
        console.log(`[4b] keys: reference ${Object.keys(reference).length}, site ${Object.keys(siteValues).length}`)

        const diffs: string[] = []
        for (const key of Object.keys(reference)) {
          const before = reference[key] ?? ''
          const after = siteValues[key] ?? ''
          if (before === '' || after === '') continue
          const numberBefore = Number.parseFloat(before)
          const numberAfter = Number.parseFloat(after)
          const bothPixels = before.endsWith('px') && after.endsWith('px')
          if (bothPixels && Number.isFinite(numberBefore) && Number.isFinite(numberAfter)) {
            if (Math.abs(numberAfter - numberBefore) > 2) diffs.push(`${key}: reference ${before} vs site ${after}`)
          } else if (before.replace(/\s/g, '').toLowerCase() !== after.replace(/\s/g, '').toLowerCase()) {
            diffs.push(`${key}: reference ${before} vs site ${after}`)
          }
        }
        testInfo.attach('reference-diffs.txt', {
          body: diffs.join('\n') || '(no difference above 2 px)',
          contentType: 'text/plain',
        })
        // The report quotes these: print them, the list reporter hides attachments.
        console.log(`[4b] ${scheme} ${width}px — ${diffs.length} difference(s) above 2 px:`)
        for (const diff of diffs) console.log(`[4b]   ${diff}`)
      })
    }
  }
})
