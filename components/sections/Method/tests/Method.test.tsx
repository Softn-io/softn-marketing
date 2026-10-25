// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { method } from '@/locales/fr/method'
import { Method } from '../Method'

/** Every string the section and its diagram are allowed to render, as the locale defines them. */
const localeStrings = [
  method.eyebrow,
  method.title.part1,
  method.title.part2,
  method.intro,
  method.loop.label,
  ...Object.values(method.loop.lanes),
  ...Object.values(method.loop.status),
]

// Vitest rewrites `import.meta.url`, so the folder is resolved from the project root instead.
const methodDirectory = join(process.cwd(), 'components', 'sections', 'Method')

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

/** Minimal `matchMedia` stub: reduced motion is the only preference the diagram reads. */
const stubMatchMedia = (isReducedMotion: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? isReducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

beforeEach(() => {
  stubMatchMedia(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Method', () => {
  it('is the method section, named by a single h2 holding both title parts', () => {
    const { container } = render(<Method />)
    const section = container.querySelector('section')
    expect(section?.getAttribute('id')).toBe(SECTION_IDS.method)
    expect(section?.getAttribute('id')).toBe('methode')
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toContain(method.title.part1)
    expect(heading.textContent).toContain(method.title.part2)
    expect(heading.getAttribute('id')).toBeTruthy()
    expect(section?.getAttribute('aria-labelledby')).toBe(heading.getAttribute('id'))
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
  })

  it('highlights the second title part like the design', () => {
    render(<Method />)
    expect(screen.getByText(method.title.part2).className).toContain('text-brand-foreground')
  })

  it('renders the eyebrow and the intro from the locale', () => {
    render(<Method />)
    expect(screen.getByText(method.eyebrow)).toBeTruthy()
    expect(screen.getByText(method.intro)).toBeTruthy()
  })

  it('exposes the diagram as one image named by the locale, with its drawing texts hidden', () => {
    render(<Method />)
    const image = screen.getByRole('img', { name: method.loop.ariaLabel })
    expect(image.tagName.toLowerCase()).toBe('svg')
    expect(image.getAttribute('role')).toBe('img')
    expect(image.getAttribute('aria-label')).toBe(method.loop.ariaLabel)
    const drawingTexts = Array.from(image.querySelectorAll('text'))
    expect(drawingTexts.length).toBeGreaterThan(0)
    for (const text of drawingTexts) expect(text.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders the loop label, the three lane labels and the announced status', () => {
    render(<Method />)
    expect(screen.getByText(method.loop.label)).toBeTruthy()
    for (const lane of Object.values(method.loop.lanes)) expect(screen.getByText(lane)).toBeTruthy()
    const status = screen.getByText(method.loop.status.live)
    expect(status.getAttribute('aria-live')).toBe('polite')
  })

  it('arms the pinned scroll mode when motion is allowed', () => {
    const { container } = render(<Method />)
    const track = container.querySelector('[data-diagram-track]')
    expect(track?.getAttribute('data-motion')).toBe('scroll')
  })

  it('keeps the final state static when reduced motion is preferred', () => {
    stubMatchMedia(true)
    const { container } = render(<Method />)
    const track = container.querySelector('[data-diagram-track]')
    const stage = container.querySelector('[data-diagram-stage]')
    expect(track?.hasAttribute('data-motion')).toBe(false)
    expect(stage?.getAttribute('style')).toBeNull()
    expect(screen.getByText(method.loop.status.live)).toBeTruthy()
    expect(screen.queryByText(method.loop.status.producing)).toBeNull()
  })

  it('renders only strings coming from the locale', () => {
    const { container } = render(<Method />)
    const texts = textNodes(container.querySelector('section') ?? container)
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) expect(localeStrings, `unexpected copy: "${text}"`).toContain(text)
  })

  it('keeps no copy hardcoded in its own sources', () => {
    const files = readdirSync(methodDirectory, { recursive: true, encoding: 'utf8' }).filter(
      (name) => /\.tsx?$/.test(name) && !name.startsWith('tests'),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const source = readFileSync(join(methodDirectory, name), 'utf8')
      for (const copy of localeStrings) expect(source, `${name} hardcodes "${copy}"`).not.toContain(copy)
    }
  })
})
