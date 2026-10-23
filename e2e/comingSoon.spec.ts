/**
 * E2E coverage for the coming-soon home page `/` (GitHub issue #86).
 *
 * The home page is now a single-viewport, no-scroll section (`components/sections/ComingSoon/`),
 * with the full one-page site moved behind the gated `/preview` route (covered by the retargeted
 * `header`/`hero`/`offers`/`theme`/`accessibility`/`designTokens` specs and `e2e/preview.spec.ts`).
 *
 * Checks, end to end:
 * - the copy structure: the logo wordmark (plain text, not a link), the eyebrow, the page's single
 *   h1 and the body, all imported from `locales/fr/` — never hardcoded here (QA rule);
 * - no vertical or horizontal scroll at 320x568, 390x844, 768x1024 and 1440x900;
 * - the indexed metadata: title, description, `index,follow` robots and the canonical URL;
 * - axe WCAG 2.1 A/AA clean in both themes (the section is static: nothing to settle but fonts);
 * - no request to a third-party origin;
 * - the QA 4a-1 token audit, scoped to the coming-soon elements: every computed color, font family,
 *   size, weight, line height, letter spacing, padding, radius and shadow must exist as a value of
 *   `@softnio-labs/tokens`, in both themes — the same probe method as `e2e/designTokens.spec.ts`.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { SITE_URL } from '../lib/site'
import { comingSoon } from '../locales/fr/comingSoon'
import { nav } from '../locales/fr/hero'
import { metadataContent } from '../locales/fr/metadata'

/** localStorage key the inline theme script reads; same contract as `lib/theme`. */
const THEME_STORAGE_KEY = 'softn-theme'

/** The machine-checkable WCAG 2.1 A and AA rule tags (same list as `e2e/accessibility.spec.ts`). */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

const SCHEMES = ['dark', 'light'] as const
type Scheme = (typeof SCHEMES)[number]

const WORDMARK = `${nav.logo.name}${nav.logo.suffix}`

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

/** The coming-soon section: the one `main` section of the home page. */
const section = (page: Page) => page.locator('main section')

test.describe('coming-soon: structure and copy', () => {
  test('wordmark, eyebrow, single h1 and body render from the locales, with nothing interactive', async ({ page }) => {
    await page.goto('/')
    await expect(section(page)).toBeVisible()

    // The wordmark is plain text, not a link: this section is already the home page.
    // `exact: true` keeps the locator off the h1, which also mentions "Softn.io".
    const wordmark = section(page).getByText(WORDMARK, { exact: true })
    await expect(wordmark).toBeVisible()
    await expect(wordmark).toHaveText(WORDMARK)
    await expect(wordmark.locator('span')).toHaveText(nav.logo.suffix)

    await expect(section(page).getByText(comingSoon.eyebrow)).toBeVisible()

    const headings = page.getByRole('heading', { level: 1 })
    await expect(headings).toHaveCount(1)
    await expect(headings).toHaveText(comingSoon.title)

    await expect(section(page).getByText(comingSoon.body)).toBeVisible()

    // Single-screen launch page: no header, no navigation, no call to action — nothing to operate.
    await expect(page.getByRole('banner')).toHaveCount(0)
    await expect(page.getByRole('navigation')).toHaveCount(0)
    await expect(page.getByRole('link')).toHaveCount(0)
    await expect(page.getByRole('button')).toHaveCount(0)
    await expect(page.locator('form')).toHaveCount(0)
  })
})

test.describe('coming-soon: no scroll at any viewport', () => {
  /*
   * The page is a single screen: `main` is `h-dvh overflow-hidden`, so the document must never
   * scroll — vertically or horizontally — at any of the reference viewports, from the smallest
   * phone (320x568) to desktop (1440x900). The document box is read, not just `main`: a child that
   * escapes its box would still grow `documentElement.scrollHeight` under `overflow: hidden`.
   */
  const VIEWPORTS = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ] as const

  for (const { width, height } of VIEWPORTS) {
    test(`no vertical or horizontal scroll at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await expect(section(page)).toBeVisible()
      await awaitFonts(page)
      const metrics = await page.evaluate(() => {
        const root = document.documentElement
        return {
          scrollHeight: Math.max(root.scrollHeight, document.body.scrollHeight),
          scrollWidth: Math.max(root.scrollWidth, document.body.scrollWidth),
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
        }
      })
      expect(
        metrics.scrollWidth,
        `document scrollWidth ${String(metrics.scrollWidth)} vs viewport ${String(metrics.viewportWidth)}`,
      ).toBeLessThanOrEqual(metrics.viewportWidth)
      expect(
        metrics.scrollHeight,
        `document scrollHeight ${String(metrics.scrollHeight)} vs viewport ${String(metrics.viewportHeight)}`,
      ).toBeLessThanOrEqual(metrics.viewportHeight)
      test.info().annotations.push({
        type: 'measure',
        description: `${width}x${height}: ${String(metrics.scrollWidth)}x${String(metrics.scrollHeight)} in ${String(metrics.viewportWidth)}x${String(metrics.viewportHeight)}`,
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

test.describe('coming-soon: axe (WCAG 2.1 AA)', () => {
  for (const scheme of SCHEMES) {
    test(`clean in the ${scheme} theme, with the text really measured`, async ({ page }) => {
      await gotoWithTheme(page, scheme)
      await expect(section(page)).toBeVisible()
      await awaitFonts(page)
      const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze()
      expect(
        results.violations,
        `coming-soon (${scheme}): ${String(results.violations.length)} WCAG 2.1 A/AA violation(s)\n${results.violations
          .map(
            (violation) =>
              `- ${violation.id}: ${violation.help} at ${violation.nodes.map((node) => node.target.join(' >>> ')).join(' | ')}`,
          )
          .join('\n')}`,
      ).toHaveLength(0)

      // Non-vacuity: the audit is only meaningful if axe really measured the section's text.
      // The text sits on the card's solid surface (no gradient behind it), so every line is
      // measurable — the pass set is resolved against the live page, not the truncated snippet.
      const contrast = results.passes.find((rule) => rule.id === 'color-contrast')
      expect(contrast, 'axe reported no color-contrast passes at all').toBeTruthy()
      const texts = await page.evaluate(
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
            return last === null ? '' : (last.textContent ?? '')
          }),
        (contrast?.nodes ?? []).map((node) => node.target),
      )
      expect(texts.filter((text) => text !== '').length, 'measured nodes resolve to real elements').toBe(
        (contrast?.nodes ?? []).length,
      )
      for (const needle of [comingSoon.eyebrow, comingSoon.title.slice(0, 24), comingSoon.body.slice(0, 24)]) {
        expect(
          texts.some((text) => text.includes(needle)),
          `axe measured the copy that contains "${needle}"`,
        ).toBe(true)
      }
    })
  }
})

test.describe('coming-soon: privacy', () => {
  test('the page issues no third-party network request', async ({ page }) => {
    const external: string[] = []
    page.on('request', (request) => {
      const host = new URL(request.url()).hostname
      if (host !== 'localhost' && !host.startsWith('127.')) external.push(request.url())
    })
    await page.goto('/')
    await expect(section(page)).toBeVisible()
    expect(external, 'third-party requests').toEqual([])
  })
})

test.describe('coming-soon: computed styles match @softnio-labs/tokens values (QA 4a-1)', () => {
  /*
   * Same method as `e2e/designTokens.spec.ts`: the browser is the oracle. Each `--softn-*` custom
   * property is resolved through a probe element, and every computed design value on the section's
   * key elements must appear in the resulting value sets — in both themes. The audit runs at
   * 1280x800 (both themes) and at 320x568 (dark): at those widths the two `clamp()` paddings sit on
   * their token bounds (space-12/space-10 desktop, space-5/space-6 mobile), so no mid-clamp value
   * can pass as a token.
   *
   * The glow gradients are audited too: every colour stop in the computed `background-image` of
   * the decorative backdrop must resolve to a token colour.
   */
  type AuditParams = { theme: 'dark' | 'light' }
  type AuditResult = {
    theme: string
    tokenCount: number
    mismatches: string[]
    gradientColorMismatches: string[]
    loadedFontFamilies: string[]
    bodyTokenFamily: string
    displayTokenFamily: string
    wordmarkFamily: string
    h1Family: string
    bodyCopyFamily: string
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
      if (/line-height|letter-spacing/.test(name)) {
        probe.style.fontSize = '100px'
      }
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
    const colorOk = (v: string): boolean => colors.has(norm(v))
    const shadowOk = (v: string): boolean => shadows.has(norm(v))

    // 3. Audit the coming-soon elements: the page shell, the section, the card, its text blocks
    // and the decorative backdrop.
    const card = document.querySelector('main section > div:not([aria-hidden="true"])')
    const paragraphs = card === null ? [] : Array.from(card.querySelectorAll(':scope > p'))
    const elements: Record<string, Element | null> = {
      body: document.body,
      main: document.querySelector('main'),
      section: document.querySelector('main section'),
      backdrop: document.querySelector('main section > div[aria-hidden="true"]'),
      card,
      wordmark: paragraphs[0] ?? null,
      eyebrow: paragraphs[1] ?? null,
      h1: document.querySelector('main h1'),
      bodyCopy: paragraphs[2] ?? null,
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
      for (const prop of ['fontSize', 'borderTopLeftRadius'] as const) {
        const v = num(c[prop])
        if (Number.isFinite(v) && !lengthOk(v)) mismatches.push(`${name}.${prop}: ${c[prop]} not in token scale`)
      }
      for (const v of c.padding.split(/\s+/)) {
        const p = num(v)
        if (Number.isFinite(p) && !lengthOk(p)) mismatches.push(`${name}.padding: ${v} not in token scale`)
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

    // 4. The glow gradients: every colour stop must be a token colour (transparent excluded).
    const gradientColorMismatches: string[] = []
    const backdropEl = elements.backdrop ?? null
    if (backdropEl !== null) {
      const image = getComputedStyle(backdropEl).backgroundImage
      const stops = image.toLowerCase().match(/(?:oklch|oklab|lab|lch|rgb|rgba|hsl|hsla|color)\([^)]*\)/g) ?? []
      for (const stop of stops) {
        if (!colorOk(stop)) gradientColorMismatches.push(`backdrop gradient stop ${stop} matches no token`)
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
      mismatches,
      gradientColorMismatches,
      loadedFontFamilies: [...loaded],
      bodyTokenFamily: rootStyle.getPropertyValue('--softn-font-body'),
      displayTokenFamily: rootStyle.getPropertyValue('--softn-font-display'),
      wordmarkFamily: elements.wordmark == null ? '' : firstFamily(getComputedStyle(elements.wordmark).fontFamily),
      h1Family: elements.h1 == null ? '' : firstFamily(getComputedStyle(elements.h1).fontFamily),
      bodyCopyFamily: elements.bodyCopy == null ? '' : firstFamily(getComputedStyle(elements.bodyCopy).fontFamily),
    }
  }

  for (const { viewport, themes } of [
    { viewport: { width: 1280, height: 800 }, themes: ['dark', 'light'] as const },
    { viewport: { width: 320, height: 568 }, themes: ['dark'] as const },
  ]) {
    for (const scheme of themes) {
      test(`every computed value is a token value at ${viewport.width}x${viewport.height} (${scheme})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport)
        await gotoWithTheme(page, scheme)
        await awaitFonts(page)
        const result = await page.evaluate(auditInPage, { theme: scheme } satisfies AuditParams)

        // Sanity: the audit is meaningless if it collected no tokens.
        expect(result.tokenCount, 'design token custom properties found on the page').toBeGreaterThan(20)
        expect(result.mismatches, `token mismatches (${scheme} @ ${viewport.width})`).toEqual([])
        expect(result.gradientColorMismatches, `glow gradient colours (${scheme} @ ${viewport.width})`).toEqual([])

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
      })
    }
  }
})
