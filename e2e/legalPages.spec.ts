/**
 * E2E coverage for the three legal pages (issue #22): `/mentions-legales`, `/politique-de-confidentialite`
 * and `/politique-de-cookies`.
 *
 * Checks, end to end:
 * - reachable from the footer: every legal link of the footer navigation opens its page;
 * - the metadata of each page: title from `locales/fr/metadata.ts`, the `index, nofollow` robots
 *   directive shared by the three routes (`lib/legal/meta.ts`) and their own canonical URL;
 * - the document structure: one `h1`, one `h2` per section in copy order, the last-updated line with
 *   the single `{date}` parameter, the optional intro, and the landmarks (`banner`, `main`,
 *   `contentinfo`) of the minimal chrome plus the shared site footer;
 * - the keyboard order on a legal page: wordmark, back link, toggle, the one in-sentence contact
 *   link, then the footer's wordmark and its four links, each showing the focus ring;
 * - axe WCAG 2.1 A/AA clean on every page, in both themes;
 * - the QA 4a-1 token audit, scoped to the new components: every computed color, font size, weight,
 *   line height, letter spacing, radius, shadow, gap and padding of the footer, the legal page and
 *   the minimal header must exist as a value of `@softnio-labs/tokens`, in both themes — the same
 *   probe method as `e2e/designTokens.spec.ts`. Reading measures (`max-inline-size` in `ch`) are
 *   exempt: they are set by the copy's width in characters, not by the token scale. Font families
 *   are checked against the two families the package declares instead of a value set;
 * - the footer also closes `/contact` and the gated `/preview` page, with the same four links;
 * - the sitemap lists the three legal routes.
 *
 * No third party is reachable from these pages: any non-localhost request fails the consent test.
 * The server runs with every provider key blanked (`playwright.config.ts`), so rate-limited routes
 * answer 503 when called server-side; this spec never calls one.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FOOTER_LINKS } from '../lib/footerLinks'
import { SITE_ROUTES } from '../lib/routes'
import { SITE_URL } from '../lib/site'
import { chatbot } from '../locales/fr/chatbot'
import { footer } from '../locales/fr/footer'
import { nav } from '../locales/fr/hero'
import { minimalHeader } from '../locales/fr/minimalHeader'
import { legal } from '../locales/fr/legal'
import { metadataContent } from '../locales/fr/metadata'
// The rendered contents (one h1, the sections in order), not the raw locale maps.
import { cookiesContent, mentionsContent, privacyContent } from '../components/sections/LegalPage/data/legalSections'

/** localStorage key the inline theme script reads; same contract as `lib/theme`. */
const THEME_STORAGE_KEY = 'softn-theme'

/** The machine-checkable WCAG 2.1 A and AA rule tags (same list as `e2e/accessibility.spec.ts`). */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

const SCHEMES = ['dark', 'light'] as const
type Scheme = (typeof SCHEMES)[number]

/** The publication date every legal page shows: the `{date}` parameter of `locales/fr/legal.ts`. */
const UPDATED_AT = '30/11/2026'

/** The three routes, with the metadata and the rendered content that describes them. */
const PAGES = [
  { route: SITE_ROUTES.legalNotice, meta: metadataContent.legal.mentions, content: mentionsContent },
  { route: SITE_ROUTES.privacyPolicy, meta: metadataContent.legal.privacy, content: privacyContent },
  { route: SITE_ROUTES.cookiePolicy, meta: metadataContent.legal.cookies, content: cookiesContent },
] as const

/** Forces one theme the way the site's theme script consumes it, before navigation. */
const forceTheme = async (page: Page, scheme: Scheme): Promise<void> => {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, scheme] as const)
}

/** Loads one legal page and waits until the theme has actually been applied (settled attribute). */
const gotoWithTheme = async (page: Page, scheme: Scheme, route: string): Promise<void> => {
  await forceTheme(page, scheme)
  await page.goto(route)
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
}

/** Text metrics feed several checks; reading runs only once font loading has settled. */
const awaitFonts = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

test.describe('legal pages: reachable from the footer', () => {
  for (const link of FOOTER_LINKS) {
    if (link.href === SITE_ROUTES.contact) continue // /contact is covered by contactForm.spec.ts.
    test(`the ${link.label} link of the coming-soon footer opens ${link.href}`, async ({ page }) => {
      await page.goto('/')
      const footerNav = page.getByRole('navigation', { name: footer.nav.ariaLabel })
      await expect(footerNav).toBeVisible()
      await footerNav.getByRole('link', { name: link.label }).click()
      await expect(page).toHaveURL(new RegExp(`${link.href}/?$`))
      const content = PAGES.find((entry) => entry.route === link.href)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(content?.content.title ?? '')
      // The legal pages close with the same footer, so the visitor can go on.
      await expect(page.getByRole('contentinfo')).toBeVisible()
    })
  }
})

test.describe('legal pages: metadata and document structure', () => {
  for (const entry of PAGES) {
    test(`${entry.route}: title, robots index nofollow, canonical, one h1, one h2 per section`, async ({ page }) => {
      await page.goto(entry.route)

      await expect(page).toHaveTitle(entry.meta.title)
      // The policy the three routes share (lib/legal/meta.ts): indexable, links carry no signal.
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, nofollow')
      // Each page owns its canonical URL, written once in lib/routes.ts.
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}${entry.route}`)

      // Landmarks: the minimal chrome, the page itself, the shared footer.
      await expect(page.getByRole('banner')).toBeVisible()
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.getByRole('contentinfo')).toBeVisible()

      // Document structure: one h1, one h2 per section, in copy order, never another level.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.content.title)
      await expect(page.getByRole('heading')).toHaveCount(1 + entry.content.sections.length)
      const headings = await page.getByRole('heading').all()
      headings.forEach((heading, index) => {
        const wanted = index === 0 ? entry.content.title : (entry.content.sections[index - 1]?.title ?? '')
        expect(heading, `heading ${String(index)} carries the copy's own title`).toHaveText(wanted)
      })

      // The last-updated line, filled once for the three pages from one ISO date.
      await expect(page.getByText(`Dernière mise à jour : ${UPDATED_AT}`)).toBeVisible()
    })
  }

  test('the privacy page renders its intro, the legal notice none', async ({ page }) => {
    await page.goto(SITE_ROUTES.privacyPolicy)
    await expect(page.getByText(legal.privacy.intro)).toBeVisible()

    await page.goto(SITE_ROUTES.legalNotice)
    await expect(page.getByText(legal.privacy.intro)).toHaveCount(0)
  })

  test('the {contactPageLink} placeholder renders as a real link to the contact page, in the sentence', async ({
    page,
  }) => {
    await page.goto(SITE_ROUTES.privacyPolicy)
    const main = page.getByRole('main')
    const link = main.getByRole('link', { name: chatbot.contactPageLinkLabel })
    await expect(link.first()).toBeVisible()
    await expect(link.first()).toHaveAttribute('href', SITE_ROUTES.contact)
    // Underlined, so the link does not rely on colour alone (WCAG 1.4.1).
    await expect(link.first()).toHaveCSS('text-decoration-line', 'underline')
  })

  test("the {dataRequestSubject} value keeps the contact form's own wording", async ({ page }) => {
    await page.goto(SITE_ROUTES.privacyPolicy)
    await expect(page.getByRole('main')).toContainText('Demande relative à mes données personnelles')
  })
})

test.describe('legal pages: keyboard', () => {
  test('the tab order is wordmark, back link, toggle, the in-sentence link, then the footer links', async ({
    page,
  }) => {
    await gotoWithTheme(page, 'dark', SITE_ROUTES.privacyPolicy)

    await page.keyboard.press('Tab')
    await expect(page.getByRole('banner').getByRole('link', { name: nav.logo.ariaLabel })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveText(`← ${minimalHeader.backLink.label}`)
    await page.keyboard.press('Tab')
    const toggleLabel = await page.locator(':focus').getAttribute('aria-label')
    expect(
      toggleLabel === nav.themeToggle.toLight || toggleLabel === nav.themeToggle.toDark,
      `the third Tab stop is the theme toggle (got ${String(toggleLabel)})`,
    ).toBe(true)

    // The in-sentence contact links of the reading column, in document order, then the footer.
    const mainLinkCount = await page.getByRole('main').getByRole('link').count()
    expect(mainLinkCount, 'the privacy policy carries one link per {contactPageLink}').toBe(2)
    for (let stop = 0; stop < mainLinkCount; stop += 1) {
      await page.keyboard.press('Tab')
      const inMain = await page.evaluate(() => document.activeElement?.closest('main') !== null)
      expect(inMain, `Tab stop ${String(4 + stop)} sits inside the reading column`).toBe(true)
    }
    await page.keyboard.press('Tab')
    await expect(page.getByRole('contentinfo').getByRole('link', { name: nav.logo.ariaLabel })).toBeFocused()

    // The footer links follow, in the copy order, each ringed when focused.
    for (const link of FOOTER_LINKS) {
      await page.keyboard.press('Tab')
      const focused = page.locator(':focus')
      await expect(focused).toHaveText(link.label)
      const ring = await focused.evaluate((el) => {
        const style = getComputedStyle(el)
        return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }
      })
      expect(ring.style, 'the focused footer link shows a visible outline').toBe('solid')
      expect(ring.width, 'the ring is 2 px wide').toBe(2)
    }
  })
})

test.describe('legal pages: axe (WCAG 2.1 AA)', () => {
  for (const entry of PAGES) {
    for (const scheme of SCHEMES) {
      test(`${entry.route} is clean in the ${scheme} theme`, async ({ page }) => {
        await gotoWithTheme(page, scheme, entry.route)
        await awaitFonts(page)
        const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze()

        const violations = results.violations
        expect(
          violations,
          `${entry.route} (${scheme}): ${String(violations.length)} WCAG 2.1 A/AA violation(s)\n${violations
            .map((violation) => `- ${violation.id}: ${violation.help}`)
            .join('\n')}`,
        ).toHaveLength(0)

        // Non-vacuity: axe must have measured the page's own text for contrast, so "0 violations"
        // cannot mean "axe never looked at the reading column".
        const contrast = results.passes.find((rule) => rule.id === 'color-contrast')
        expect(contrast, 'axe reported no color-contrast passes at all').toBeTruthy()
        expect(
          (contrast?.nodes ?? []).some((node) => (node.html ?? '').includes(entry.content.title)),
          'axe did not measure the legal page title',
        ).toBe(true)
      })
    }
  }
})

/*
 * QA check 4a-1, scoped to the new components (same probe method as e2e/designTokens.spec.ts):
 * every --softn-* name is resolved through the engine into the value it actually computes, and
 * each key element's computed properties must come back inside those resolved sets. Font families
 * are checked against the two families the package declares, not against a value set.
 */
type TokenAudit = {
  tokenCount: number
  mismatches: string[]
  fluidValues: string[]
  faces: { element: string; family: string }[]
}

const auditTokenValues = (): TokenAudit => {
  const SENTINEL = 'rgb(1, 2, 3)'
  const num = (value: string): number => Number.parseFloat(value)
  const norm = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ')
  const firstFamily = (stack: string): string =>
    (stack.split(',')[0] ?? '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .toLowerCase()

  const describeElement = (element: Element): string => {
    const name =
      element.tagName.toLowerCase() +
      (typeof element.className === 'string' && element.className !== ''
        ? `.${element.className.split(' ')[0] ?? ''}`
        : '')
    return `${name} "${(element.textContent ?? '').slice(0, 24)}"`
  }

  // 1. Collect every --softn-* name declared anywhere in the stylesheets, plus those on :root.
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
      /* unreadable sheet: none should be, but never crash the audit */
    }
  }

  // 2. Resolve each token through the engine into allowed-value sets.
  const colors = new Set<string>([norm('rgba(0, 0, 0, 0)')])
  const lengths = new Set<number>([0])
  const shadows = new Set<string>([norm('none')])
  const weights = new Set<string>()
  const ratios = new Set<number>()

  const wrapper = document.createElement('div')
  wrapper.style.color = SENTINEL
  document.body.appendChild(wrapper)
  const probe = document.createElement('span')
  probe.style.fontSize = '100px' // px readings below become direct ratios
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

    probe.style.boxShadow = `var(${name})`
    const probedShadow = norm(probeStyle.boxShadow)
    if (probedShadow !== 'none') shadows.add(probedShadow)

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
      const line = num(probeStyle.lineHeight)
      const size2 = num(probeStyle.fontSize)
      if (Number.isFinite(line) && size2 > 0) ratios.add(Number((line / size2).toFixed(3)))
    }
    if (/letter-spacing/.test(name)) {
      probe.style.letterSpacing = `var(${name})`
      const spacing = probeStyle.letterSpacing
      if (spacing !== 'normal') {
        const value = num(spacing)
        const size2 = num(probeStyle.fontSize)
        if (Number.isFinite(value) && size2 > 0) ratios.add(Number(Math.abs(value / size2).toFixed(4)))
      }
    }

    // Reset the probe so a stale valid value cannot mask the next invalid var.
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

  // The fluid lengths the new components accept, each with the bounds of its own clamp (space
  // tokens in px): outside these the value must be a token. Same recipe as the hero's accepted
  // clamps in e2e/designTokens.spec.ts (issue #73).
  const FLUID_BOUNDS: [number, number][] = [
    [32, 48], // footer block padding, clamp(space-8, 5vw, space-12)
    [20, 48], // footer inline padding, clamp(space-5, 5vw, space-12)
    [40, 80], // main block padding, clamp(space-10, 6vw, space-20)
    [32, 48], // content column gap, clamp(space-8, 4vw, space-12)
  ]
  const fluidOk = (value: number): boolean =>
    FLUID_BOUNDS.some(([min, max]) => value >= min - 0.06 && value <= max + 0.06)

  // 3. Audit the key elements: the chrome and the footer, and the reading column.
  const mismatches: string[] = []
  const fluidValues: string[] = []
  const faces: { element: string; family: string }[] = []

  const probeElement = (element: Element): void => {
    const name = describeElement(element)
    const style = getComputedStyle(element)
    const paint = (property: string, value: string, ok: boolean): void => {
      if (!ok) mismatches.push(`${name}: ${property} = ${value}`)
    }
    const recordFluid = (property: string, value: number): void => {
      if (!lengthOk(value) && fluidOk(value)) fluidValues.push(`${name}: ${property} = ${String(value)}px`)
    }

    if (style.color !== SENTINEL) paint('color', style.color, colors.has(norm(style.color)))
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      paint('background-color', style.backgroundColor, colors.has(norm(style.backgroundColor)))
    }
    const size = num(style.fontSize)
    paint('font-size', style.fontSize, lengthOk(size))
    paint('font-weight', style.fontWeight, weights.has(style.fontWeight))
    const line = num(style.lineHeight)
    if (Number.isFinite(line) && size > 0) {
      paint('line-height', style.lineHeight, ratios.has(Number((line / size).toFixed(3))))
    }
    const spacing = style.letterSpacing
    if (spacing !== 'normal' && size > 0) {
      paint('letter-spacing', spacing, ratios.has(Number(Math.abs(num(spacing) / size).toFixed(4))))
    }
    paint('border-radius', style.borderTopLeftRadius, lengthOk(num(style.borderTopLeftRadius)))
    paint('box-shadow', style.boxShadow, shadows.has(norm(style.boxShadow)))
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const value = num(style.getPropertyValue(`padding-${side}`))
      if (value !== 0) {
        recordFluid(`padding-${side}`, value)
        paint(`padding-${side}`, `${String(value)}px`, lengthOk(value) || fluidOk(value))
      }
    }
    if (style.display.includes('flex')) {
      const row = num(style.rowGap)
      const column = num(style.columnGap)
      if (Number.isFinite(row) && row !== 0) {
        recordFluid('row-gap', row)
        paint('row-gap', `${String(row)}px`, lengthOk(row) || fluidOk(row))
      }
      if (Number.isFinite(column) && column !== 0) {
        recordFluid('column-gap', column)
        paint('column-gap', `${String(column)}px`, lengthOk(column) || fluidOk(column))
      }
    }
    faces.push({ element: name, family: firstFamily(style.fontFamily) })
  }

  const wordmarks = Array.from(document.querySelectorAll('header a[href="/"], footer a[href="/"]'))
  const textElements = [
    ...wordmarks,
    ...Array.from(document.querySelectorAll('footer p')),
    ...Array.from(document.querySelectorAll('footer nav a')),
    document.querySelector('main h1'),
    document.querySelector('main header p'),
    ...Array.from(document.querySelectorAll('main section h2')),
    ...Array.from(document.querySelectorAll('main section p')),
    document.querySelector('main section p a'),
    document.body,
  ].filter((element): element is Element => element !== null)
  const containers = [
    document.querySelector('footer'),
    document.querySelector('footer > div'),
    document.querySelector('footer nav ul'),
    document.querySelector('main'),
    document.querySelector('main > div'),
  ].filter((element): element is Element => element !== null)

  textElements.forEach(probeElement)
  containers.forEach(probeElement)
  wrapper.remove()

  return {
    tokenCount: names.size,
    mismatches,
    fluidValues,
    faces,
  }
}

test.describe('legal pages: QA 4a-1 token audit (footer + legal page)', () => {
  for (const scheme of SCHEMES) {
    test(`every computed value on the footer and the legal page is a package token (${scheme})`, async ({ page }) => {
      // The three routes share the renderer, the chrome and the footer: the styles this audit
      // covers are identical, so the privacy policy stands in for all three.
      await gotoWithTheme(page, scheme, SITE_ROUTES.privacyPolicy)
      await awaitFonts(page)
      const audit = await page.evaluate(auditTokenValues)

      expect(audit.tokenCount, 'the audit resolved no --softn-* token at all').toBeGreaterThan(50)
      expect(
        audit.mismatches,
        `${scheme}: computed values that match no package token\n${audit.mismatches.join('\n')}`,
      ).toEqual([])

      // Faces: every audited text element paints the display or the body family, and the two
      // families the package declares are the faces actually loaded (next/font binds them).
      const packageBodyFamily = 'plus'
      const packageDisplayFamily = 'zalando'
      for (const face of audit.faces) {
        expect(face.family, `${face.element} paints ${face.family}`).toMatch(
          new RegExp(`${packageBodyFamily}|${packageDisplayFamily}`, 'i'),
        )
      }
      const loadedFaces = await page.evaluate(() =>
        Array.from(document.fonts)
          .filter((face) => face.status === 'loaded' || face.status === 'unloaded')
          .map((face) => face.family.toLowerCase())
          .join(' '),
      )
      expect(loadedFaces, 'a loaded face backs the body family').toContain('jakarta')
      expect(loadedFaces, 'a loaded face backs the display family').toContain('zalando')
    })
  }
})

test.describe('the shared footer closes the other chrome pages', () => {
  test('/contact closes with the footer: wordmark home, four links', async ({ page }) => {
    await page.goto(SITE_ROUTES.contact)
    const contentinfo = page.getByRole('contentinfo')
    await expect(contentinfo).toBeVisible()
    await expect(contentinfo.getByRole('link', { name: nav.logo.ariaLabel })).toHaveAttribute('href', '/')
    const footerNav = contentinfo.getByRole('navigation', { name: footer.nav.ariaLabel })
    for (const link of FOOTER_LINKS) {
      await expect(footerNav.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href)
    }
  })

  test('/preview closes with the footer too', async ({ page }) => {
    await page.goto('/preview')
    const contentinfo = page.getByRole('contentinfo')
    await expect(contentinfo).toBeVisible()
    const footerNav = contentinfo.getByRole('navigation', { name: footer.nav.ariaLabel })
    await expect(footerNav.getByRole('link')).toHaveCount(FOOTER_LINKS.length)
  })
})

test.describe('legal pages in the sitemap', () => {
  test('sitemap.xml lists the three legal routes', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.ok()).toBe(true)
    const body = await response.text()
    for (const route of [SITE_ROUTES.legalNotice, SITE_ROUTES.privacyPolicy, SITE_ROUTES.cookiePolicy]) {
      expect(body).toContain(`<loc>${SITE_URL}${route}</loc>`)
    }
  })
})
