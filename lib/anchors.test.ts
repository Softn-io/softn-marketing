// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SECTION_IDS, goToSection } from './anchors'

describe('goToSection', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/preview')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  /** Adds the section `id` to the page with its own scroll spy, and returns that spy. */
  const addSection = (id: string): Mock<() => void> => {
    const section = document.createElement('section')
    section.id = id
    const scrollIntoView = vi.fn<() => void>()
    Object.defineProperty(section, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    document.body.appendChild(section)
    return scrollIntoView
  }

  it('changes the fragment and leaves the scrolling to the browser when it names another section', () => {
    window.history.replaceState(null, '', '/preview#services')
    const scrollIntoView = addSection(SECTION_IDS.agent)
    goToSection(SECTION_IDS.agent)
    expect(window.location.hash).toBe(`#${SECTION_IDS.agent}`)
    expect(window.location.pathname).toBe('/preview')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls the section into view when the fragment already names it', () => {
    window.history.replaceState(null, '', `/preview#${SECTION_IDS.agent}`)
    const scrollIntoView = addSection(SECTION_IDS.agent)
    const historyLength = window.history.length
    goToSection(SECTION_IDS.agent)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
    expect(window.history.length).toBe(historyLength)
  })

  it('scrolls instantly when the visitor asked for less motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    window.history.replaceState(null, '', `/preview#${SECTION_IDS.agent}`)
    const scrollIntoView = addSection(SECTION_IDS.agent)
    goToSection(SECTION_IDS.agent)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
  })

  it('does not throw when the target section is not rendered', () => {
    window.history.replaceState(null, '', `/preview#${SECTION_IDS.agent}`)
    expect(() => goToSection(SECTION_IDS.agent)).not.toThrow()
  })

  it('keeps the path and the query string when it changes the fragment', () => {
    window.history.replaceState(null, '', '/preview?x=1#services')
    const scrollIntoView = addSection(SECTION_IDS.agent)
    goToSection(SECTION_IDS.agent)
    expect(window.location.pathname).toBe('/preview')
    expect(window.location.search).toBe('?x=1')
    expect(window.location.hash).toBe(`#${SECTION_IDS.agent}`)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
