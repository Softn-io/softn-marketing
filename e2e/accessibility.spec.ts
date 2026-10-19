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
 * - Home page `/`, analysed as a whole, in dark and in light theme (default desktop viewport).
 * - Header, scoped with `AxeBuilder#include`, in dark and in light theme, at a mobile viewport:
 *   - drawer closed: the `header` landmark itself;
 *   - drawer open: the drawer dialog. While the drawer is open the `header` element is `aria-hidden`
 *     and inert and the dialog carries the header's content (logo, theme toggle, nav links, CTA),
 *     so the dialog is what an assistive technology sees and what is analysed.
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
 * ## Exclusions
 *
 * None. No `disableRules()` call and no `.exclude()` anywhere in this file; every axe violation in
 * the WCAG 2.1 A/AA tags fails the test and must be fixed in application code, not silenced here.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** localStorage key the inline theme script reads; same contract as `lib/theme`. */
const THEME_STORAGE_KEY = 'softn-theme'

/** The machine-checkable WCAG 2.1 A and AA rule tags. */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

const SCHEMES = ['dark', 'light'] as const
type Scheme = (typeof SCHEMES)[number]

/** Below the `lg` breakpoint the header navigation lives in the burger drawer (see `header.spec.ts`). */
const MOBILE_VIEWPORT = { width: 375, height: 800 }

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

/**
 * Runs the configured analysis and fails with a readable, mapped list of violations
 * (id, impact, help, node targets) instead of the raw result object.
 */
const expectNoViolations = async (builder: AxeBuilder, scope: string): Promise<void> => {
  const results = await builder.analyze()
  expect(
    results.violations,
    `${scope}: ${String(results.violations.length)} WCAG 2.1 A/AA violation(s)\n${results.violations
      .map(formatViolation)
      .join('\n')}`,
  ).toHaveLength(0)
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

test.describe('accessibility: home page (WCAG 2.1 AA)', () => {
  for (const scheme of SCHEMES) {
    test(`whole page in ${scheme} theme`, async ({ page }) => {
      await gotoHomeWithTheme(page, scheme)
      await expect(page.getByRole('banner')).toBeVisible()
      await expect(page.getByRole('main')).toBeVisible()
      await awaitFonts(page)
      await expectNoViolations(new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]), `home (${scheme})`)
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
