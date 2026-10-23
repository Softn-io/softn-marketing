// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { offers } from '@/locales/fr/offers'
import { Offers } from '../Offers'

const offerCards = [offers.create, offers.automate]

/** Every string the offers section is allowed to render, as the locale defines them. */
const localeStrings = [
  offers.eyebrow,
  offers.hint,
  offers.detailLink,
  offers.srTitle,
  ...offerCards.flatMap((offer) => [offer.kicker, offer.cardTitle, offer.cardText, ...offer.audiences]),
]

// Vitest rewrites `import.meta.url`, so the folder is resolved from the project root instead.
const offersDirectory = join(process.cwd(), 'components', 'sections', 'Offers')

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

afterEach(cleanup)

describe('Offers', () => {
  it('is the services section, named by a visually hidden h2', () => {
    const { container } = render(<Offers />)
    const section = container.querySelector('section')
    expect(section?.getAttribute('id')).toBe(SECTION_IDS.offers)
    expect(section?.getAttribute('id')).toBe('services')
    const heading = screen.getByRole('heading', { level: 2, name: offers.srTitle })
    expect(heading.className).toContain('sr-only')
    expect(section?.getAttribute('aria-labelledby')).toBe(heading.getAttribute('id'))
  })

  it('renders the eyebrow, the hint and the detail affordance from the locale', () => {
    render(<Offers />)
    expect(screen.getByText(offers.eyebrow)).toBeTruthy()
    expect(screen.getByText(offers.hint)).toBeTruthy()
    expect(screen.getAllByText(offers.detailLink)).toHaveLength(offerCards.length)
  })

  it('renders one card per offer with its kicker, h3 title, text and every audience', () => {
    render(<Offers />)
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(offerCards.length)
    for (const offer of offerCards) {
      const title = screen.getByRole('heading', { level: 3, name: offer.cardTitle })
      expect(title.tagName).toBe('H3')
      expect(screen.getByText(offer.kicker)).toBeTruthy()
      expect(screen.getByText(offer.cardText)).toBeTruthy()
      for (const audience of offer.audiences) expect(screen.getByText(audience)).toBeTruthy()
    }
  })

  it('exposes each card as a focusable button that announces a dialog, named by the card title', () => {
    render(<Offers />)
    for (const offer of offerCards) {
      const button = screen.getByRole('button', { name: offer.cardTitle })
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button.getAttribute('aria-haspopup')).toBe('dialog')
      expect(button.tabIndex).toBe(0)
    }
  })

  it('hides the decorative arrow from assistive technology', () => {
    const { container } = render(<Offers />)
    const arrows = Array.from(container.querySelectorAll('svg'))
    expect(arrows).toHaveLength(offerCards.length)
    for (const arrow of arrows) expect(arrow.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders only strings coming from the locale', () => {
    const { container } = render(<Offers />)
    const texts = textNodes(container.querySelector('section') ?? container)
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) expect(localeStrings, `unexpected copy: "${text}"`).toContain(text)
  })

  it('keeps no copy hardcoded in its own sources', () => {
    const files = readdirSync(offersDirectory, { recursive: true, encoding: 'utf8' }).filter(
      (name) => /\.tsx?$/.test(name) && !name.startsWith('tests'),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const source = readFileSync(join(offersDirectory, name), 'utf8')
      for (const copy of localeStrings) expect(source, `${name} hardcodes "${copy}"`).not.toContain(copy)
    }
  })
})
