// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { faq } from '@/locales/fr/faq'
import { FAQ } from '../FAQ'

/** Every string the FAQ section is allowed to render, as the locale defines them. */
const localeStrings = [faq.title, ...faq.items.flatMap((item) => [item.question, item.answer])]

// Vitest rewrites `import.meta.url`, so the folder is resolved from the project root instead.
const faqDirectory = join(process.cwd(), 'components', 'sections', 'FAQ')

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

/** The section, as its own heading names it. */
const section = (): HTMLElement => screen.getByRole('region', { name: faq.title })

afterEach(cleanup)

describe('FAQ section', () => {
  it('is anchored where the header navigation points, and named by its single h2', () => {
    render(<FAQ />)

    const region = section()
    expect(region.id).toBe(SECTION_IDS.faq)
    expect(within(region).getAllByRole('heading', { level: 2 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: faq.title })).toBeTruthy()
  })

  it('renders the questions of the locale as buttons inside h3 headings', () => {
    render(<FAQ />)

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(faq.items.length)

    for (const item of faq.items) {
      const heading = screen.getByRole('heading', { level: 3, name: item.question })
      expect(heading.tagName).toBe('H3')
      const button = within(heading).getByRole('button', { name: item.question })
      expect(button.tagName).toBe('BUTTON')
    }
  })

  it('keeps the answer of every question in the DOM, the closed ones included', () => {
    render(<FAQ />)

    for (const item of faq.items) expect(screen.getByText(item.answer)).toBeTruthy()
  })

  it('renders only strings coming from the locale', () => {
    const { container } = render(<FAQ />)
    const texts = textNodes(container.querySelector('section') ?? container)
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) expect(localeStrings, `unexpected copy: "${text}"`).toContain(text)
  })

  it('keeps no copy hardcoded in its own sources', () => {
    const files = readdirSync(faqDirectory, { recursive: true, encoding: 'utf8' }).filter(
      (name) => /\.tsx?$/.test(name) && !name.startsWith('tests'),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const source = readFileSync(join(faqDirectory, name), 'utf8')
      for (const copy of localeStrings) expect(source, `${name} hardcodes "${copy}"`).not.toContain(copy)
    }
  })
})
