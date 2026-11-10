import { expect, test, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { thisSite } from '../locales/fr/thisSite'

/**
 * E2E coverage of the "Ce site" section beyond the hover behaviour (`e2e/thisSiteHover.spec.ts`)
 * and the jsdom unit tests (`components/sections/ThisSite/tests/`): the browser-only states the
 * island's own tests cannot see.
 *
 * - Selection by click and by tap, and the keyboard path (Tab into the list, arrow keys with
 *   `activateOnFocus`), with the interaction hint that follows the input the visitor uses — the
 *   wording swap is CSS (`:has(.list :focus-visible)`), invisible to jsdom.
 * - Exactly one detail visible at a time on the real page, the total block under the list, the
 *   detail blocks the copy turns on and off (technical note, measured time).
 * - Both themes (`data-theme` forced before first paint, like `e2e/theme.spec.ts`).
 * - `prefers-reduced-motion: reduce`: the caret's blink and the steps' transitions stop, selection
 *   still works.
 * - The layout contract: the two columns only at the stylesheet's `md` breakpoint, no horizontal
 *   overflow at phone widths.
 */

/** localStorage key the inline theme script reads; same contract as `lib/theme`. */
const THEME_STORAGE_KEY = 'softn-theme'

/** The stylesheet's two-column breakpoint: the package `md`, 48rem = 768px. */
const TWO_COLUMNS = 768

const section = (page: Page) => page.locator(`#${SECTION_IDS.thisSite}`)
const tabs = (page: Page) => section(page).getByRole('tab')
const visiblePanels = (page: Page) => section(page).getByRole('tabpanel')

/** Forces one theme before navigation, then waits until the theme script has applied it. */
const gotoWithTheme = async (page: Page, scheme: 'dark' | 'light'): Promise<void> => {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, scheme] as const)
  await page.goto('/preview')
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
  await expect(visiblePanels(page)).toHaveCount(1)
}

/** The section's step at `position`, failing loudly if the copy loses one (like the unit tests). */
const step = (position: number) => {
  const value = thisSite.steps[position]
  if (value === undefined) throw new Error(`the copy lost step ${String(position)}`)
  return value
}

test.describe('the "Ce site" section, token fidelity (role contract 4a-1)', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`every computed value on the section's key elements is a package token (${scheme})`, async ({ page }) => {
      await gotoWithTheme(page, scheme)

      const result = await section(page).evaluate((sectionEl) => {
        const norm = (v: string): string => v.toLowerCase().replace(/\s+/g, ' ')
        const num = (v: string): number => Number.parseFloat(v)

        // 1. Every --softn-* name declared anywhere, resolved into allowed-value sets — the same
        // probe method `e2e/designTokens.spec.ts` uses for the page's other sections.
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

        const SENTINEL = 'rgb(1, 2, 3)'
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

        const colors = new Set<string>([norm('rgba(0, 0, 0, 0)')])
        const lengths = new Set<number>([0])
        const weights = new Set<string>()
        const ratios = new Set<number>()
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
          if (/line-height/.test(name)) {
            probe.style.fontSize = '100px'
            probe.style.lineHeight = `var(${name})`
            const lh = num(probeStyle.lineHeight)
            const pf = num(probeStyle.fontSize)
            if (Number.isFinite(lh) && pf > 0) ratios.add(Number((lh / pf).toFixed(3)))
          }
          probe.style.color = SENTINEL
          probe.style.fontSize = '100px'
          probe.style.borderRadius = '0px'
          probe.style.padding = '0px'
          probe.style.fontWeight = '400'
          probe.style.lineHeight = 'normal'
        }

        const lengthOk = (v: number): boolean => {
          for (const t of lengths) if (Math.abs(t - v) < 0.06) return true
          return false
        }
        const colorOk = (v: string): boolean => colors.has(norm(v))

        // 2. The section's key elements: the section, its content box, the h2 and its intro, one
        // tab of each state (active and inactive), the detail's own blocks (heading, body, prompt
        // label, prompt, technical note, tags), the total's label, its two measures and its note.
        // The total is the section's last child block, outside the detail panels: its dl is the one
        // not inside a tabpanel.
        const activeTab = sectionEl.querySelector('[role="tab"][aria-selected="true"]')
        const activePanel = sectionEl.querySelector('[role="tabpanel"]:not([hidden])')
        const totalDl = Array.from(sectionEl.querySelectorAll('dl')).find(
          (dl) => dl.closest('[role="tabpanel"]') === null,
        )
        const totalBlock = totalDl?.closest('div') ?? null
        const elements: Record<string, Element | null> = {
          section: sectionEl,
          content: sectionEl.querySelector(':scope > div'),
          title: sectionEl.querySelector('h2'),
          intro: sectionEl.querySelector('h2 + p'),
          tabActive: activeTab,
          tabActiveNumber: activeTab?.querySelector('span[aria-hidden="true"]') ?? null,
          tabActiveTitle: activeTab?.querySelector('span + span') ?? null,
          tabInactive: sectionEl.querySelector('[role="tab"][aria-selected="false"]'),
          tabInactiveNumber: sectionEl.querySelector('[role="tab"][aria-selected="false"] span[aria-hidden="true"]'),
          tabInactiveTitle: sectionEl.querySelector('[role="tab"][aria-selected="false"] span + span'),
          detailHeading: activePanel?.querySelector('h3') ?? null,
          detailBody: activePanel?.querySelector('h3 + p') ?? null,
          promptLabel: activePanel?.querySelector('h3 + p + div > p') ?? null,
          prompt: activePanel?.querySelector('h3 + p + div > p + p') ?? null,
          techLabel: activePanel?.querySelector('h3 + p + div + div > p') ?? null,
          tech: activePanel?.querySelector('h3 + p + div + div > p + p') ?? null,
          tag: activePanel?.querySelector('ul > li') ?? null,
          totalLabel: totalBlock?.querySelector('p') ?? null,
          totalDt: totalDl?.querySelector('dt') ?? null,
          totalDd: totalDl?.querySelector('dd') ?? null,
          totalScopeNote: totalBlock?.querySelector('dl')?.nextElementSibling ?? null,
          totalDurationNote: totalBlock?.querySelector('dl')?.nextElementSibling?.nextElementSibling ?? null,
        }

        const mismatches: string[] = []
        for (const [name, el] of Object.entries(elements)) {
          if (el === null) continue
          const c = getComputedStyle(el)
          for (const prop of ['color', 'backgroundColor', 'borderTopColor'] as const) {
            const v = c[prop]
            if (v === '' || v === 'none') continue
            if (!colorOk(v)) mismatches.push(`${name}.${prop}: ${v} matches no token`)
          }
          for (const prop of ['fontSize', 'borderTopLeftRadius'] as const) {
            const v = num(c[prop])
            if (Number.isFinite(v) && !lengthOk(v)) mismatches.push(`${name}.${prop}: ${c[prop]} not in token scale`)
          }
          for (const v of c.padding.split(/\s+/)) {
            const p = num(v)
            if (!Number.isFinite(p) || lengthOk(p)) continue
            mismatches.push(`${name}.padding: ${v} not in token scale`)
          }
          if (!weights.has(c.fontWeight)) mismatches.push(`${name}.fontWeight: ${c.fontWeight} not a token weight`)
          if (c.lineHeight !== 'normal') {
            const ratio = num(c.lineHeight) / num(c.fontSize)
            const ok = [...ratios].some((r) => Math.abs(r - ratio) < 0.02) || lengthOk(num(c.lineHeight))
            if (!ok) mismatches.push(`${name}.lineHeight: ratio ${ratio.toFixed(3)} not a token line-height`)
          }
        }

        // Non-vacuity: the section must have painted its own text for the audit to be meaningful.
        const audited = Object.entries(elements).filter(([, el]) => el !== null).length
        wrapper.remove()
        return { mismatches, audited }
      })

      expect(result.audited, 'the section must present its key elements for the audit').toBeGreaterThanOrEqual(14)
      expect(result.mismatches, `token mismatches (${scheme})`).toEqual([])
    })
  }
})

test.describe('the "Ce site" section, selected by click and by keyboard', () => {
  test('a click selects one step and exposes exactly one detail', async ({ page }) => {
    await gotoWithTheme(page, 'dark')

    await tabs(page).nth(2).click()
    await expect(tabs(page).nth(2)).toHaveAttribute('aria-selected', 'true')
    await expect(visiblePanels(page)).toHaveCount(1)
    await expect(visiblePanels(page).getByRole('heading', { level: 3, name: step(2).heading })).toBeVisible()

    // Every detail stays in the document, hidden until its step is selected. The attribute
    // selector counts them all: Base UI marks the inactive ones `hidden` and `inert`, which the
    // role query (even with `hidden: true`) filters out of the accessibility tree.
    const allPanels = section(page).locator('[role="tabpanel"]')
    await expect(allPanels).toHaveCount(thisSite.steps.length)

    await tabs(page).nth(5).click()
    await expect(tabs(page).nth(5)).toHaveAttribute('aria-selected', 'true')
    await expect(visiblePanels(page)).toHaveCount(1)
  })

  test('Tab reaches the list, the arrow keys walk the steps, and the hint names the keys', async ({ page }) => {
    await gotoWithTheme(page, 'dark')

    // The mouse wording shows while nothing is focused inside the section.
    const intro = section(page).locator('xpath=..').getByText(thisSite.intro)
    await expect(intro).toBeVisible()

    await tabs(page).first().focus()
    // `activateOnFocus` reveals the step focus lands on, so the first arrow already selects the
    // second step — the tab list is a real tab list, not a list of toggles.
    await page.keyboard.press('ArrowDown')
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(visiblePanels(page).getByRole('heading', { level: 3, name: step(1).heading })).toBeVisible()

    await page.keyboard.press('ArrowDown')
    await expect(tabs(page).nth(2)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowUp')
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')

    // The keyboard wording replaces the mouse one while the focus ring sits inside the list. The
    // replaced wording stays in the DOM (`display: none`), so the assertion is visibility, not count.
    await expect(page.getByText(thisSite.introKeyboard)).toBeVisible()
    await expect(page.getByText(thisSite.intro)).toBeHidden()

    // The focused step shows the site's focus ring.
    const focused = tabs(page).nth(1)
    await expect(focused).toHaveCSS('outline-style', 'solid')
    await expect(focused).toHaveCSS('outline-width', '2px')
  })

  test('the details the copy turns on and off follow the selection', async ({ page }) => {
    await gotoWithTheme(page, 'dark')

    // Step 01 carries no measured time: its detail shows no description list at all.
    await tabs(page).first().click()
    const firstPanel = visiblePanels(page)
    await expect(firstPanel.locator('dl')).toHaveCount(0)
    await expect(firstPanel.getByText(thisSite.durationMelLabel)).toHaveCount(0)

    // Step 03 carries one: the two labelled measures.
    await tabs(page).nth(2).click()
    const thirdPanel = visiblePanels(page)
    const measured = thirdPanel.locator('dl')
    await expect(measured).toHaveCount(1)
    await expect(measured.getByText(thisSite.durationMelLabel)).toBeVisible()
    await expect(measured.getByText(thisSite.durationAgentsLabel)).toBeVisible()

    // Step 04 carries no technical note: its block is absent from the DOM, not merely empty.
    await tabs(page).nth(3).click()
    const fourthPanel = visiblePanels(page)
    await expect(fourthPanel.getByText(thisSite.techLabel)).toHaveCount(0)

    // Step 03 carries one.
    await tabs(page).nth(2).click()
    await expect(visiblePanels(page).getByText(thisSite.techLabel)).toBeVisible()

    // The total block sits under the list, with its two measures and their origin note.
    const total = section(page).getByText(thisSite.totalLabel)
    await expect(total).toBeVisible()
    await expect(section(page).getByText(thisSite.total.mel)).toBeVisible()
    await expect(section(page).getByText(thisSite.total.agents)).toBeVisible()
    await expect(section(page).getByText(thisSite.durationNote)).toBeVisible()
  })

  test.describe('tap', () => {
    test.use({ hasTouch: true, viewport: { width: 375, height: 800 } })

    test('a tap selects on a touch viewport, and the touch wording shows', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, 'dark'] as const)
      await page.goto('/preview')
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

      // The coarse pointer swaps the intro's wording before any interaction.
      await expect(page.getByText(thisSite.introTouch)).toBeVisible()
      await expect(page.getByText(thisSite.intro)).toBeHidden()

      await tabs(page).nth(1).tap()
      await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')
      await expect(visiblePanels(page).getByRole('heading', { level: 3, name: step(1).heading })).toBeVisible()
    })
  })
})

test.describe('the "Ce site" section, in both themes and under reduced motion', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`click selection works in the ${scheme} theme`, async ({ page }) => {
      await gotoWithTheme(page, scheme)

      await tabs(page).nth(4).click()
      await expect(tabs(page).nth(4)).toHaveAttribute('aria-selected', 'true')
      await expect(visiblePanels(page).getByRole('heading', { level: 3, name: step(4).heading })).toBeVisible()
      // The selected step's accent colour is applied (the number takes the brand foreground). The
      // token is read through a probe element so both sides are computed colours — a raw
      // `getPropertyValue` keeps the written `%` form, which the computed `color` never carries.
      const accent = await page.evaluate(() => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--softn-brand-foreground)'
        document.body.appendChild(probe)
        const resolved = getComputedStyle(probe).color
        probe.remove()
        return resolved
      })
      const number = tabs(page).nth(4).locator('span').first()
      await expect(number).toHaveCSS('color', accent)
    })
  }

  test('reduced motion stops the caret blink and the steps’ transitions, selection still works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(visiblePanels(page)).toHaveCount(1)

    const caret = section(page).locator('span[class*="caret"]').first()
    await expect(caret).toHaveCSS('animation-name', 'none')
    const step = tabs(page).first()
    await expect(step).toHaveCSS('transition-duration', '0s')

    await tabs(page).nth(3).click()
    await expect(tabs(page).nth(3)).toHaveAttribute('aria-selected', 'true')
    await expect(visiblePanels(page)).toHaveCount(1)
  })
})

test.describe('the "Ce site" section, layout across widths', () => {
  const WIDTHS = [320, 375, 767, 768, 1280] as const

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await expect(visiblePanels(page)).toHaveCount(1)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'the page must not scroll sideways').toBeLessThanOrEqual(0)
    })
  }

  test('the two columns only from the stylesheet breakpoint, stacked below it', async ({ page }) => {
    await page.setViewportSize({ width: TWO_COLUMNS, height: 800 })
    await page.goto('/preview')
    await expect(visiblePanels(page)).toHaveCount(1)

    const layout = await page.evaluate((sectionId) => {
      const section = document.getElementById(sectionId)
      if (section === null) throw new Error('section missing')
      const list = section.querySelector('[role="tablist"]')
      const detail = [...section.querySelectorAll('[role="tabpanel"]')].find(
        (panel) => getComputedStyle(panel).visibility === 'visible',
      )
      if (list === null || detail === undefined) throw new Error('list or detail missing')
      const listBox = list.getBoundingClientRect()
      const detailBox = detail.getBoundingClientRect()
      return {
        listRight: listBox.right,
        detailLeft: detailBox.left,
        listBottom: listBox.bottom,
        detailTop: detailBox.top,
      }
    }, SECTION_IDS.thisSite)
    expect(
      layout.listRight,
      'side by side at the breakpoint: the detail starts at or after the list',
    ).toBeLessThanOrEqual(layout.detailLeft + 1)

    await page.setViewportSize({ width: TWO_COLUMNS - 1, height: 800 })
    const stacked = await page.evaluate((sectionId) => {
      const section = document.getElementById(sectionId)
      if (section === null) throw new Error('section missing')
      const list = section.querySelector('[role="tablist"]')
      const detail = [...section.querySelectorAll('[role="tabpanel"]')].find(
        (panel) => getComputedStyle(panel).visibility === 'visible',
      )
      if (list === null || detail === undefined) throw new Error('list or detail missing')
      return { listBottom: list.getBoundingClientRect().bottom, detailTop: detail.getBoundingClientRect().top }
    }, SECTION_IDS.thisSite)
    expect(stacked.listBottom, 'stacked below the breakpoint: the detail starts under the list').toBeLessThanOrEqual(
      stacked.detailTop + 1,
    )
  })
})
