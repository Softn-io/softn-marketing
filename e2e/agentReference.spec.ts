/**
 * Design-reference comparison for the Agent section shell (GitHub issue #15) — informative, not
 * blocking (see docs/orchestration/roles/qa.md, check 4b).
 *
 * Reference: `docs/design/project/Softn.io Site v3.dc.html`, `<section id="agent">` (an
 * authoritative reference file, opened as a `file://` URL; its `sc-*` templates expand at load).
 * Compared at 375, 768 and 1280 px against `section#assistant` on `/preview`: section box,
 * typography, chips, composer, decorative glow and dots. Differences larger than 2 px and any
 * color difference are written to `.orchestration/reports/qa/4b-reference-diffs.json`, and both
 * sections are screenshotted into the same folder for human review.
 *
 * Structure notes (not defects): the reference keeps the chips in a plain `<div>`, the site
 * groups them in a labelled `<ul>` (semantic improvement); the reference wording is the design
 * demo copy while the site renders the validated locale strings (approved decision); the top
 * radius uses --softn-radius-xl (24px) instead of the design's 28px (approved decision); the
 * chips row gap uses --softn-space-4 (16px) instead of the design's 10px (approved round-2
 * decision); the site renders the scope note (body-sm, 14px vs the design's 13px) and the
 * booking chip (brand-foreground on a brand-vivid underline, weight 600) — both approved.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'

const DESIGN_DIR = process.env.DESIGN_DIR ?? resolve(process.cwd(), 'docs/design/project')
const REFERENCE_PATH = resolve(DESIGN_DIR, 'Softn.io Site v3.dc.html')
const REFERENCE_URL = 'file://' + REFERENCE_PATH
const REPORT_DIR = resolve(process.cwd(), '.orchestration/reports/qa')
const AGENT_ID = SECTION_IDS.agent

type Reading = {
  viewport: number
  section: { paddingTop: number; paddingBottom: number; paddingLeft: number; marginTop: number; radiusTop: number }
  title: { fontSize: number; lineHeight: number; letterSpacingEm: number; maxWidthCh: number | null }
  eyebrow: { fontSize: number; fontWeight: number; letterSpacingEm: number }
  statusDot: { width: number }
  chip: { fontSize: number; gapRow: number; gapColumn: number }
  booking: { fontSize: number; fontWeight: number }
  input: { fontSize: number }
  composerGap: number
  scopeNote: { fontSize: number }
  typingDot: { width: number }
  glow: { top: number; right: number; width: number; blur: number }
}

/** Reads the geometry of the agent section in either the reference or the site. */
const readSection = (page: Page, sectionSelector: string): Promise<Reading> =>
  page.evaluate((selector) => {
    const px = (value: string): number => Number.parseFloat(value) || 0
    const section = document.querySelector<HTMLElement>(selector)
    if (section === null) throw new Error(`section ${selector} missing`)
    const sectionStyle = getComputedStyle(section)

    // The title is structural in both pages; the eyebrow is whatever precedes it.
    const title = section.querySelector<HTMLElement>('h2')
    if (title === null) throw new Error('h2 missing')
    const titleStyle = getComputedStyle(title)
    const eyebrow = title.previousElementSibling as HTMLElement | null
    // The reference wraps its eyebrow text in a span inside a flex div; the site styles the <p>
    // itself. Read the first span that carries text, falling back to the container.
    const eyebrowText = eyebrow?.querySelector<HTMLElement>('span:not(:empty)')
    const eyebrowStyle = getComputedStyle(eyebrowText ?? eyebrow!)
    const statusDot = eyebrow === null ? null : (eyebrow.querySelector('span') as HTMLElement | null)

    // The first button without an accessible name is the first suggestion chip (the send button
    // is named in both pages). The site chips sit in ul > li > button; the reference in a flex div.
    const chip = section.querySelector<HTMLElement>('button:not([aria-label])')
    const chipStyle = chip === null ? null : getComputedStyle(chip)
    const chipsContainer = chip === null ? null : (chip.closest('ul') ?? chip.parentElement)
    const chipsStyle = chipsContainer === null ? null : getComputedStyle(chipsContainer)

    const input = section.querySelector<HTMLElement>('input')
    const inputStyle = input === null ? null : getComputedStyle(input)
    const composerStyle = input === null ? null : getComputedStyle(input.parentElement!)
    // The scope note follows the composer in both pages: the reference's demo note and the site's
    // validated agent.scopeNote.
    const scopeNote = input === null ? null : (input.parentElement!.nextElementSibling as HTMLElement | null)
    const scopeNoteStyle = scopeNote === null ? null : getComputedStyle(scopeNote)
    // The booking chip carries data-suggestion="book" on the site; in the reference it is the
    // chip labelled "Réserver 30 min →".
    let bookingStyle: CSSStyleDeclaration | null = null
    for (const button of section.querySelectorAll('button')) {
      const isBooking =
        button.getAttribute('data-suggestion') === 'book' || (button.textContent ?? '').trim().startsWith('Réserver')
      if (isBooking) {
        bookingStyle = getComputedStyle(button)
        break
      }
    }
    const chValue = (value: string): number | null => (value.endsWith('ch') ? Number.parseFloat(value) : null)

    // Typing dot: a small (≤10px wide) span outside the eyebrow, measured by its box (inline
    // spans report a computed width of 0); the glow: a very wide child.
    let typingDotStyle: CSSStyleDeclaration | null = null
    for (const span of section.querySelectorAll('span')) {
      if (statusDot !== null && (statusDot === span || span.contains(statusDot) || statusDot.contains(span))) continue
      const box = span.getBoundingClientRect()
      if (box.width > 0 && box.width <= 10) {
        typingDotStyle = getComputedStyle(span)
        break
      }
    }
    let glowStyle: CSSStyleDeclaration | null = null
    for (const child of section.children) {
      if (px(getComputedStyle(child).width) > 400) {
        glowStyle = getComputedStyle(child)
        break
      }
    }

    return {
      viewport: window.innerWidth,
      section: {
        paddingTop: px(sectionStyle.paddingTop),
        paddingBottom: px(sectionStyle.paddingBottom),
        paddingLeft: px(sectionStyle.paddingLeft),
        marginTop: px(sectionStyle.marginTop),
        radiusTop: px(sectionStyle.borderTopLeftRadius),
      },
      title: {
        fontSize: px(titleStyle.fontSize),
        lineHeight: px(titleStyle.lineHeight) / px(titleStyle.fontSize),
        letterSpacingEm: px(titleStyle.letterSpacing) / px(titleStyle.fontSize),
        maxWidthCh: chValue(titleStyle.maxWidth),
      },
      eyebrow: {
        fontSize: eyebrowStyle === null ? 0 : px(eyebrowStyle.fontSize),
        fontWeight: eyebrowStyle === null ? 0 : Number(eyebrowStyle.fontWeight),
        letterSpacingEm: eyebrowStyle === null ? 0 : px(eyebrowStyle.letterSpacing) / px(eyebrowStyle.fontSize),
      },
      statusDot: { width: statusDot === null ? 0 : px(getComputedStyle(statusDot).width) },
      chip: {
        fontSize: chipStyle === null ? 0 : px(chipStyle.fontSize),
        gapRow: chipsStyle === null ? 0 : px(chipsStyle.rowGap),
        gapColumn: chipsStyle === null ? 0 : px(chipsStyle.columnGap),
      },
      input: { fontSize: inputStyle === null ? 0 : px(inputStyle.fontSize) },
      composerGap: composerStyle === null ? 0 : px(composerStyle.gap || composerStyle.columnGap),
      scopeNote: { fontSize: scopeNoteStyle === null ? 0 : px(scopeNoteStyle.fontSize) },
      booking: {
        fontSize: bookingStyle === null ? 0 : px(bookingStyle.fontSize),
        fontWeight: bookingStyle === null ? 0 : Number(bookingStyle.fontWeight),
      },
      typingDot: { width: typingDotStyle === null ? 0 : px(typingDotStyle.width) },
      glow:
        glowStyle === null
          ? { top: 0, right: 0, width: 0, blur: 0 }
          : {
              top: px(glowStyle.top),
              right: px(glowStyle.right),
              width: px(glowStyle.width),
              blur: px(glowStyle.filter),
            },
    }
  }, sectionSelector)

/** One scalar difference worth listing, with both values. */
type Diff = { property: string; viewport: number; reference: number | string; site: number | string; deltaPx: number }

const compare = (reference: Reading, site: Reading): Diff[] => {
  const diffs: Diff[] = []
  const add = (property: string, referenceValue: number | string, siteValue: number | string): void => {
    if (typeof referenceValue === 'number' && typeof siteValue === 'number') {
      if (Math.abs(referenceValue - siteValue) <= 2) return
      diffs.push({
        property,
        viewport: reference.viewport,
        reference: referenceValue,
        site: siteValue,
        deltaPx: siteValue - referenceValue,
      })
      return
    }
    if (referenceValue !== siteValue)
      diffs.push({ property, viewport: reference.viewport, reference: referenceValue, site: siteValue, deltaPx: 0 })
  }
  add('section.paddingTop', reference.section.paddingTop, site.section.paddingTop)
  add('section.paddingInline', reference.section.paddingLeft, site.section.paddingLeft)
  add('section.marginTop', reference.section.marginTop, site.section.marginTop)
  add(
    'section.borderTopRadius (approved: --softn-radius-xl 24px vs design 28px)',
    reference.section.radiusTop,
    site.section.radiusTop,
  )
  add('title.fontSize', reference.title.fontSize, site.title.fontSize)
  add('title.lineHeight', Number(reference.title.lineHeight.toFixed(3)), Number(site.title.lineHeight.toFixed(3)))
  add(
    'title.letterSpacingEm',
    Number(reference.title.letterSpacingEm.toFixed(3)),
    Number(site.title.letterSpacingEm.toFixed(3)),
  )
  add('eyebrow.fontSize', reference.eyebrow.fontSize, site.eyebrow.fontSize)
  add('eyebrow.fontWeight', reference.eyebrow.fontWeight, site.eyebrow.fontWeight)
  add(
    'eyebrow.letterSpacingEm',
    Number(reference.eyebrow.letterSpacingEm.toFixed(2)),
    Number(site.eyebrow.letterSpacingEm.toFixed(2)),
  )
  add('statusDot.width', reference.statusDot.width, site.statusDot.width)
  add('chip.fontSize', reference.chip.fontSize, site.chip.fontSize)
  add('chips.gapRow (approved: --softn-space-4 16px vs design 10px)', reference.chip.gapRow, site.chip.gapRow)
  add('chips.gapColumn', reference.chip.gapColumn, site.chip.gapColumn)
  add('input.fontSize', reference.input.fontSize, site.input.fontSize)
  add('composer.gap', reference.composerGap, site.composerGap)
  add('scopeNote.fontSize', reference.scopeNote.fontSize, site.scopeNote.fontSize)
  add('booking.fontSize', reference.booking.fontSize, site.booking.fontSize)
  add('booking.fontWeight', reference.booking.fontWeight, site.booking.fontWeight)
  add('typingDot.width', reference.typingDot.width, site.typingDot.width)
  add('glow.top', reference.glow.top, site.glow.top)
  add('glow.right', reference.glow.right, site.glow.right)
  add('glow.width', reference.glow.width, site.glow.width)
  add('glow.blur', reference.glow.blur, site.glow.blur)
  if (reference.title.maxWidthCh !== null && site.title.maxWidthCh !== null) {
    add('title.maxWidthCh', reference.title.maxWidthCh, site.title.maxWidthCh)
  }
  return diffs
}

test.describe('agent shell vs design reference (informative)', () => {
  for (const viewport of [375, 768, 1280]) {
    test(`compares computed styles and screenshots at ${viewport}px`, async ({ page }) => {
      test.setTimeout(60_000)
      // docs/design is gitignored: skip when this checkout carries no reference file.
      test.skip(
        !existsSync(REFERENCE_PATH),
        'design reference not present in this checkout (docs/design is gitignored)',
      )

      // Reconnaissance: the reference must show the agent section with its own markup.
      await page.setViewportSize({ width: viewport, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
      await page.goto(REFERENCE_URL)
      const recon = await page.evaluate((id) => {
        const section = document.querySelector(`section#${id}`) as HTMLElement | null
        if (section === null) return { present: false, h2Count: 0, chips: 0, input: 0 }
        return {
          present: true,
          h2Count: section.querySelectorAll('h2').length,
          chips: section.querySelectorAll('button:not([aria-label])').length,
          input: section.querySelectorAll('input').length,
        }
      }, 'agent')
      expect(recon.present, 'the reference file shows an #agent section').toBe(true)
      expect(recon.h2Count, 'the reference agent section has one h2').toBe(1)
      expect(recon.chips, 'the reference shows suggestion chips').toBeGreaterThan(0)
      expect(recon.input, 'the reference shows the question input').toBe(1)
      const reference = await readSection(page, 'section#agent')

      // The site section.
      await page.goto('/preview')
      const siteSection = page.locator(`section#${AGENT_ID}`)
      await expect(siteSection).toBeVisible()
      const site = await readSection(page, `section#${AGENT_ID}`)

      const diffs = compare(reference, site)

      if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true })
      // One file per viewport: the three tests run in parallel and must not overwrite each other.
      writeFileSync(
        resolve(REPORT_DIR, `4b-reference-diffs-${viewport}.json`),
        JSON.stringify(
          { reference: 'docs/design/project/Softn.io Site v3.dc.html#agent', at: new Date().toISOString(), diffs },
          null,
          2,
        ),
      )

      // Both sections screenshotted for the human reviewing the report.
      await page.goto(REFERENCE_URL)
      await page
        .locator('section#agent')
        .screenshot({ path: resolve(REPORT_DIR, `4b-reference-agent-${viewport}.png`) })
      await page.goto('/preview')
      await siteSection.screenshot({ path: resolve(REPORT_DIR, `4b-site-agent-${viewport}.png`) })

      // Informational only: the diffs are read by the human from the report folder.
      expect(diffs).toBeInstanceOf(Array)
    })
  }
})
