// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { appel } from '@/locales/fr/hero'
import { FinalCta } from '../FinalCta'

/**
 * Every string the section is allowed to render, as the locale defines them, trimmed like the
 * text-node walker below normalizes each node.
 */
const localeStrings = [appel.title.line1, appel.title.line2, appel.body, appel.cta].map((value) => value.trim())

/**
 * Full title of the section: the two locale lines, trimmed, joined by the single space the `<h2>`
 * renders between them. Trimming keeps the assertion honest if the copy ever carries whitespace of
 * its own back: the `<h2>` then shows more than this string.
 */
const title = `${appel.title.line1.trim()} ${appel.title.line2.trim()}`

/** Characters the `<h2>` must show where the two lines meet: the last of one, a space, the first of the next. */
const lineJoin = `${appel.title.line1.trim().slice(-1)} ${appel.title.line2.trim().slice(0, 1)}`

/** The section's title lines, in reading order. */
const titleLines = [appel.title.line1, appel.title.line2]

// Vitest rewrites `import.meta.url`, so the folder is resolved from the project root instead.
const finalCtaDirectory = join(process.cwd(), 'components', 'sections', 'FinalCta')

/** Text of every non-empty text node in the tree. */
const textNodes = (root: HTMLElement): readonly string[] => {
  const collected: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').trim()
      if (text !== '') collected.push(text)
      return
    }
    node.childNodes.forEach(walk)
  }
  walk(root)
  return collected
}

/** The section, anchored on the stable `appel` fragment it is the only region of. */
const section = (): HTMLElement => screen.getByRole('region')

afterEach(cleanup)

describe('FinalCta section', () => {
  it('is anchored on the appel fragment and named by its single h2', () => {
    render(<FinalCta />)

    const region = section()
    expect(region.id).toBe(SECTION_IDS.finalCta)
    // The literal is locked on purpose: the fragment is part of shared links, so a rename here
    // silently breaks every URL that already points to `#appel`.
    expect(SECTION_IDS.finalCta).toBe('appel')
    const headings = within(region).getAllByRole('heading', { level: 2 })
    expect(headings).toHaveLength(1)
    // The section is named by that single heading, whose text joins the two locale lines.
    expect(region.getAttribute('aria-labelledby')).toBe(headings[0]?.id)
    expect(headings[0]?.textContent).toBe(title)
    // The separator is the markup's, not the copy's: exactly one space joins the two spans. A
    // regression to a trailing space in `line1` (two spaces) or a lost separator reads
    // "offert,  pour" or "offert,pour" and fails on the line join below.
    expect(headings[0]?.textContent).toContain(lineJoin)
  })

  it('renders the title, the paragraph and the call to action from the locale', () => {
    render(<FinalCta />)

    const heading = screen.getByRole('heading', { level: 2 })
    for (const line of titleLines) expect(heading.textContent).toContain(line)
    expect(screen.getByText(appel.body)).toBeTruthy()
    expect(screen.getByRole('link', { name: appel.cta })).toBeTruthy()
  })

  it('hides the decorative glow from assistive technology', () => {
    const { container } = render(<FinalCta />)

    const glow = container.querySelector('[aria-hidden="true"]')
    expect(glow).not.toBeNull()
    expect(glow?.textContent).toBe('')
  })

  it('call to action: in-page link to the assistant, no hero id', () => {
    render(<FinalCta />)

    const cta = screen.getByRole('link', { name: appel.cta })
    expect(cta.getAttribute('href')).toBe(`#${SECTION_IDS.agent}`)
    // The hero watches its own call to action by id; this one is not that element.
    expect(cta.hasAttribute('id')).toBe(false)
  })

  it('renders only strings coming from the locale', () => {
    const { container } = render(<FinalCta />)
    const texts = textNodes(container.querySelector('section') ?? container)
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) expect(localeStrings, `unexpected copy: "${text}"`).toContain(text)
  })

  it('keeps no copy hardcoded in its own sources', () => {
    const files = readdirSync(finalCtaDirectory, { recursive: true, encoding: 'utf8' }).filter(
      (name) => /\.tsx?$/.test(name) && !name.startsWith('tests'),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const source = readFileSync(join(finalCtaDirectory, name), 'utf8')
      for (const copy of localeStrings) expect(source, `${name} hardcodes "${copy}"`).not.toContain(copy)
    }
  })
})
