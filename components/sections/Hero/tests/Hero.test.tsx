// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HERO_CTA_ID } from '@/lib/anchors'
import { ASSISTANT_INTENT_EVENT, ASSISTANT_INTENTS } from '@/lib/assistant/intent'
import { interpolate } from '@/lib/interpolate'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { hero } from '@/locales/fr/hero'
import { Hero } from '../Hero'

/** Every string the hero is allowed to render, as the locale defines them. */
const localeStrings = [
  hero.eyebrow,
  hero.title.line1,
  hero.title.line2,
  hero.title.line3,
  hero.subtitle,
  hero.cta.primary,
  hero.cta.secondary,
  hero.reassurance,
  interpolate(hero.agentPrompt, { assistantName: ASSISTANT_NAME }),
]

// Vitest rewrites `import.meta.url`, so the folder is resolved from the project root instead.
const heroDirectory = join(process.cwd(), 'components', 'sections', 'Hero')

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

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Hero', () => {
  it('renders a single h1 holding the three title lines', () => {
    render(<Hero />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    const heading = headings[0]
    const text = heading?.textContent ?? ''
    expect(text).toBe(`${hero.title.line1} ${hero.title.line2} ${hero.title.line3}`)
    for (const line of [hero.title.line1, hero.title.line2, hero.title.line3]) expect(text).toContain(line)
  })

  it('renders the eyebrow, the subtitle and the reassurance line from the locale', () => {
    render(<Hero />)
    expect(screen.getByText(hero.eyebrow)).toBeTruthy()
    expect(screen.getByText(hero.subtitle)).toBeTruthy()
    expect(screen.getByText(hero.reassurance)).toBeTruthy()
  })

  it('primary call to action: hero CTA id, in-page link to the assistant, booking intent on click', () => {
    const received = vi.fn()
    const listener = (event: Event): void => received((event as CustomEvent).detail)
    window.addEventListener(ASSISTANT_INTENT_EVENT, listener)
    render(<Hero />)
    const cta = screen.getByRole('link', { name: hero.cta.primary })
    expect(cta.getAttribute('id')).toBe(HERO_CTA_ID)
    expect(cta.getAttribute('href')).toBe('#assistant')
    const notCancelled = fireEvent.click(cta)
    expect(received).toHaveBeenCalledWith({ intent: ASSISTANT_INTENTS.booking })
    // Fire-and-forget event: the default anchor navigation is kept, nothing is prevented.
    expect(notCancelled).toBe(true)
    window.removeEventListener(ASSISTANT_INTENT_EVENT, listener)
  })

  it('secondary call to action links to the method section', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: hero.cta.secondary }).getAttribute('href')).toBe('#methode')
  })

  it('scroll indicator links to the assistant with the assistant name interpolated in its name', () => {
    render(<Hero />)
    const indicator = screen.getByRole('link', {
      name: interpolate(hero.agentPrompt, { assistantName: ASSISTANT_NAME }),
    })
    expect(indicator.getAttribute('href')).toBe('#assistant')
    // The arrow badge is decorative: it carries no text and is hidden from assistive technology.
    const badge = indicator.querySelector('span')
    expect(badge?.getAttribute('aria-hidden')).toBe('true')
    expect(badge?.querySelector('svg')).not.toBeNull()
  })

  it('renders only strings coming from the locale', () => {
    const { container } = render(<Hero />)
    const texts = textNodes(container.querySelector('section') ?? container)
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) expect(localeStrings, `unexpected copy: "${text}"`).toContain(text)
  })

  it('keeps no copy hardcoded in its own sources', () => {
    const files = readdirSync(heroDirectory, { recursive: true, encoding: 'utf8' }).filter(
      (name) => /\.tsx?$/.test(name) && !name.startsWith('tests'),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const source = readFileSync(join(heroDirectory, name), 'utf8')
      for (const copy of localeStrings) expect(source, `${name} hardcodes "${copy}"`).not.toContain(copy)
    }
  })
})
