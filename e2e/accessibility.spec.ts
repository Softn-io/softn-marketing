/**
 * Automated WCAG 2.1 AA checks with axe-core (@axe-core/playwright).
 *
 * ## What is checked
 *
 * Every test runs axe restricted to the rule tags `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa`
 * and asserts zero violations. These four tags are the machine-checkable part of the WCAG 2.1 A and
 * AA conformance levels, which is the accessibility target the project rules set for the site
 * (`.claude/rules/nextjs.md` § Accessibility — WCAG 2.1 AA: contrast, semantics, landmarks, labels).
 * Rules outside those tags (best-practice, WCAG 2.1 AAA, WCAG 2.2) are reported by axe but not here;
 * manual checks (keyboard end-to-end, screen-reader behaviour) stay out of axe's scope entirely.
 *
 * ## Page states covered
 *
 * - Home page `/`, analysed as a whole, in dark and in light theme (default desktop viewport), once
 *   the finite entrance animations (the hero reveal) have settled, and again under
 *   `prefers-reduced-motion: reduce` where no animation runs at all.
 * - Header, scoped with `AxeBuilder#include`, in dark and in light theme, at a mobile viewport:
 *   - drawer closed: the `header` landmark itself;
 *   - drawer open: the drawer dialog. While the drawer is open the `header` element is `aria-hidden`
 *     and inert and the dialog carries the header's content (logo, theme toggle, nav links, CTA),
 *     so the dialog is what an assistive technology sees and what is analysed.
 * - Header again, at a desktop viewport, in dark and in light theme, **with the scroll-revealed
 *   booking call to action showing** (`ScrollRevealCta`): at the top of the page that CTA is hidden
 *   and out of the accessibility tree, so the analyses above never measure its contrast. Tall filler
 *   sections are injected before hydration (the home page holds only the hero until their own issues
 *   land, which is not enough scroll distance to push `#hero-cta` out of the viewport), the hero CTA
 *   is scrolled above the viewport, and the settled `header` landmark is analysed.
 *
 * The no-JavaScript rendering of the header CTA is *not* analysed here: axe-core is injected by
 * running script in the page, which a `javaScriptEnabled: false` context refuses. That state's
 * accessibility-tree claim is covered through the renderer's own tree over CDP
 * (`e2e/header.spec.ts`, "the shown CTA is in the accessibility tree").
 *
 * ## How themes are forced
 *
 * Same approach as `e2e/theme.spec.ts` / `e2e/header.spec.ts`: `prefers-color-scheme` emulation plus a
 * `softn-theme` choice written to `localStorage` before load, so the inline theme script sets
 * `data-theme` on `<html>` to the wanted value before first paint. The `data-theme` attribute is then
 * awaited, which doubles as the "theme has settled" signal before axe runs.
 *
 * ## How to add a section
 *
 * Add a `test.describe` that loops over `SCHEMES`, calls `forceTheme`, navigates, awaits a settled
 * state (an attribute or a visible element — no `waitForTimeout`), then calls `expectNoViolations`
 * with `new AxeBuilder({ page })` optionally `.include(...)`-scoped to the section landmark.
 * Keep the tag list in `WCAG_AA_TAGS` as the only source of rules; if a new page or state needs an
 * exclusion, document it in the section below and get it reviewed first.
 *
 * Animated pages must be audited *settled*: axe composites a text painted mid-fade (`opacity: 0.2`
 * during the hero reveal) against the section background and reports a transient `color-contrast`
 * violation that no user ever reads (reproduced in the PR #75 review: 1.41:1 on `#hero-cta` mid
 * sequence, 10.95:1 dark / 7.10:1 light once settled, no violation under reduced motion). Waiting
 * for the finite animations to finish is axe's own guidance for animated pages and is why
 * `awaitRevealSettled` runs before the home-page analyses.
 *
 * ## Exclusions
 *
 * None. No `disableRules()` call and no `.exclude()` anywhere in this file; every axe violation in
 * the WCAG 2.1 A/AA tags fails the test and must be fixed in application code, not silenced here.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { HERO_CTA_ID } from '../lib/anchors'
import { hero, nav } from '../locales/fr/hero'

/** localStorage key the inline theme script reads; same contract as `lib/theme`. */
const THEME_STORAGE_KEY = 'softn-theme'

/** The machine-checkable WCAG 2.1 A and AA rule tags. */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

const SCHEMES = ['dark', 'light'] as const
type Scheme = (typeof SCHEMES)[number]

/** Below the `lg` breakpoint the header navigation lives in the burger drawer (see `header.spec.ts`). */
const MOBILE_VIEWPORT = { width: 375, height: 800 }

/** `lg` and above: the header carries its own booking call to action (`ScrollRevealCta`). */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

/** Accessible name of the header booking CTA at desktop width (from the locale, never hardcoded). */
const CTA_LONG = nav.cta

const burger = (page: Page) => page.locator('header button[aria-expanded]')
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Menu de navigation' })

type AnalysisResults = Awaited<ReturnType<AxeBuilder['analyze']>>
type AxeViolation = AnalysisResults['violations'][number]

/** Turns a node `target` (frame path, shadow parts included) into one readable selector string. */
const formatTarget = (target: AxeViolation['nodes'][number]['target']): string =>
  target.map((part) => (typeof part === 'string' ? part : part.join(' >>> '))).join(' > ')

/** One violation rendered as `id [impact] help` plus one line per offending node target. */
const formatViolation = (violation: AxeViolation): string =>
  [
    `- ${violation.id} [${violation.impact ?? 'unknown'}]: ${violation.help} (${violation.helpUrl})`,
    ...violation.nodes.map((node) => `    at ${formatTarget(node.target)}`),
  ].join('\n')

/** Fails with a readable, mapped list of violations (id, impact, help, node targets) for a result set. */
const assertNoViolations = (results: AnalysisResults, scope: string): void => {
  expect(
    results.violations,
    `${scope}: ${String(results.violations.length)} WCAG 2.1 A/AA violation(s)\n${results.violations
      .map(formatViolation)
      .join('\n')}`,
  ).toHaveLength(0)
}

/**
 * Runs the configured analysis and fails with a readable, mapped list of violations
 * (id, impact, help, node targets) instead of the raw result object.
 */
const expectNoViolations = async (builder: AxeBuilder, scope: string): Promise<void> => {
  assertNoViolations(await builder.analyze(), scope)
}

/** Forces one theme the way the site's theme script consumes it, before navigation. */
const forceTheme = async (page: Page, scheme: Scheme): Promise<void> => {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, scheme] as const)
}

/** Loads `/` and waits until the theme has actually been applied (settled attribute). */
const gotoHomeWithTheme = async (page: Page, scheme: Scheme): Promise<void> => {
  await forceTheme(page, scheme)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
}

/** Text metrics feed several axe checks; analysis runs only once font loading has settled. */
const awaitFonts = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

/**
 * Waits until the entrance has settled: every *finite* CSS animation on the page (the hero reveal
 * sequence) has finished. Infinite decorative loops (`hero-drift`) are excluded, their `finished`
 * promise never resolves. Axe then measures the steady-state contrast, not a mid-fade frame.
 */
const awaitRevealSettled = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const running = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().iterations ?? 1))
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)))
  })
}

test.describe('accessibility: home page (WCAG 2.1 AA)', () => {
  for (const scheme of SCHEMES) {
    test(`whole page in ${scheme} theme, after the entrance has settled`, async ({ page }) => {
      await gotoHomeWithTheme(page, scheme)
      await expect(page.getByRole('banner')).toBeVisible()
      await expect(page.getByRole('main')).toBeVisible()
      await awaitFonts(page)
      await awaitRevealSettled(page)
      const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze()
      assertNoViolations(results, `home (${scheme}, settled)`)
      /*
       * Non-vacuity, and an honest account of what axe does *not* look at. The hero paints its text
       * over the two radial glows, so axe cannot resolve a background colour for those nodes: they
       * come back in `incomplete` ("Element's background color could not be determined due to a
       * background gradient"), never as violations. The audit is therefore only meaningful if (a) the
       * nodes axe *can* measure really are measured, and (b) the gradient-backed hero text is measured
       * somewhere else — it is, in `e2e/hero.spec.ts` ("hero text keeps AA contrast over the painted
       * glow"), which samples the real pixels behind each line. Asserted here so a change that moves
       * the hero text out of one list and into the other fails.
       */
      const contrast = results.passes.find((rule) => rule.id === 'color-contrast')
      expect(contrast, 'axe reported no color-contrast passes at all').toBeTruthy()
      const passNodes = (contrast?.nodes ?? []).map((node) => node.html ?? '')
      expect(
        passNodes.some((html) => html.includes(hero.cta.primary)),
        'axe did not measure the hero primary CTA',
      ).toBe(true)
      const gradientNodes = (results.incomplete.find((item) => item.id === 'color-contrast')?.nodes ?? []).filter(
        (node) => (node.html ?? '').includes('Hero-module'),
      )
      test.info().annotations.push({
        type: 'axe-incomplete-color-contrast',
        description: `${scheme}: ${String(gradientNodes.length)} hero node(s) unmeasurable by axe (background gradient) — covered by the painted-pixel test`,
      })
      expect(gradientNodes.length, 'the hero text nodes axe cannot measure').toBeGreaterThanOrEqual(6)
      /*
       * Membership of the set is proven on the real elements, never on axe's `html` snippet: axe
       * truncates that snippet far before a long paragraph's own text (the subtitle's opening tag
       * alone eats the budget), so a text needle like `hero.subtitle.slice(0, 24)` cannot match it
       * and a class-name match would not prove the copy. Each reported node also carries its
       * `target` selector — resolved here against the live page (last part wins, through shadow
       * roots if there were any), and the needles are matched on the resolved element's
       * `textContent`. Stronger than a snippet check: every reported node has to resolve to a real
       * element, and the needles have to be its real text.
       */
      const gradientTexts = await page.evaluate(
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
        gradientNodes.map((node) => node.target),
      )
      expect(
        gradientTexts.filter((text) => text !== '').length,
        'every hero node axe reports as unmeasurable resolves to a real element',
      ).toBe(gradientNodes.length)
      for (const needle of [hero.title.line1, hero.subtitle.slice(0, 24), hero.cta.secondary]) {
        expect(
          gradientTexts.some((text) => text.includes(needle)),
          `the unmeasurable set should still hold "${needle}"`,
        ).toBe(true)
      }
    })

    // The reduced-motion rendering is the state those users always get: full opacity from the first
    // paint, no fade to composite. Audited on top of the settled animated state above.
    test(`whole page in ${scheme} theme, reduced motion`, async ({ page }) => {
      await forceTheme(page, scheme)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      await expect(page.getByRole('main')).toBeVisible()
      await awaitFonts(page)
      await expectNoViolations(new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]), `home (${scheme}, reduced motion)`)
    })
  }
})

test.describe('accessibility: header (WCAG 2.1 AA)', () => {
  test.use({ viewport: MOBILE_VIEWPORT })

  for (const scheme of SCHEMES) {
    test(`header landmark, drawer closed (${scheme} theme)`, async ({ page }) => {
      await gotoHomeWithTheme(page, scheme)
      await expect(burger(page)).toBeVisible()
      await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
      await awaitFonts(page)
      await expectNoViolations(
        new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).include('header'),
        `header landmark, drawer closed (${scheme})`,
      )
    })

    test(`header landmark, drawer open (${scheme} theme)`, async ({ page }) => {
      await gotoHomeWithTheme(page, scheme)
      await burger(page).click()
      // Settled drawer: visible, enter transition finished (no starting style, opacity 1).
      await expect(drawer(page)).toBeVisible()
      await expect(drawer(page)).not.toHaveAttribute('data-starting-style', /.*/)
      await expect.poll(() => drawer(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
      await awaitFonts(page)
      await expectNoViolations(
        new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).include("[role='dialog']"),
        `header drawer open (${scheme})`,
      )
    })
  }
})

test.describe('accessibility: header with the revealed booking CTA (WCAG 2.1 AA)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  /** Tall filler sections before hydration: the home page holds only the hero, which does not give
   *  enough scroll distance to push the hero CTA above the viewport (same recipe as `header.spec.ts`). */
  const injectSections = async (page: Page): Promise<void> => {
    await page.addInitScript(() => {
      const ids = ['services', 'methode', 'assistant', 'coulisses', 'faq']
      document.addEventListener('DOMContentLoaded', () => {
        const wrapper = document.createElement('div')
        const spacer = document.createElement('div')
        spacer.style.height = '1000px'
        wrapper.append(spacer)
        for (const id of ids) {
          const section = document.createElement('section')
          section.id = id
          section.style.height = '900px'
          wrapper.append(section)
        }
        document.body.append(wrapper)
      })
    })
  }

  for (const scheme of SCHEMES) {
    test(`revealed header CTA in ${scheme} theme`, async ({ page }) => {
      await injectSections(page)
      await gotoHomeWithTheme(page, scheme)
      // Hidden at the top, revealed once the hero CTA has scrolled above the viewport.
      await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'hidden')
      await page.evaluate((id) => {
        const el = document.getElementById(id)
        if (el === null) throw new Error('hero CTA missing')
        window.scrollTo(0, window.scrollY + el.getBoundingClientRect().bottom + 40)
      }, HERO_CTA_ID)
      await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'visible')
      const cta = page.getByRole('link', { name: CTA_LONG })
      await expect(cta).toBeVisible()
      await awaitFonts(page)
      // Settled: the entrance and the CTA's own fade are over, so axe measures painted contrast,
      // not a mid-transition composite of the button. The fade runs on the wrapper, so that is the
      // element whose computed opacity has to reach 1.
      await awaitRevealSettled(page)
      await expect
        .poll(() => page.locator('header [data-state]').evaluate((el) => getComputedStyle(el).opacity))
        .toBe('1')
      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_AA_TAGS])
        .include('header')
        .analyze()
      assertNoViolations(results, `header with the revealed booking CTA (${scheme})`)
      // Non-vacuity: the CTA's label has to be one of the nodes axe actually measured for
      // `color-contrast` (axe checks the text element, which here is the label `<span>` inside the
      // link), so "0 violations" cannot mean "axe never looked at the button".
      const contrast = results.passes.find((rule) => rule.id === 'color-contrast')
      expect(contrast, 'axe reported no color-contrast passes at all').toBeTruthy()
      const contrastNodes = contrast?.nodes ?? []
      expect(
        contrastNodes.some((node) => (node.html ?? '').includes(CTA_LONG)),
        `no measured color-contrast node carries the CTA label — audited nodes: ${contrastNodes
          .map((node) => node.html ?? '')
          .join(' | ')}`,
      ).toBe(true)
    })
  }
})
