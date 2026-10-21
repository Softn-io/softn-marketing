// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HERO_CTA_ID } from '@/lib/anchors'
import { ScrollRevealCta } from '../ScrollRevealCta'

type ObserverCallback = (
  entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect'>>,
) => void

let callback: ObserverCallback | undefined
const disconnect = vi.fn()

const emit = (isIntersecting: boolean, bottom: number): void => {
  act(() => {
    callback?.([{ isIntersecting, boundingClientRect: { bottom } as DOMRectReadOnly }])
  })
}

const mountHeroCta = (): HTMLElement => {
  const hero = document.createElement('a')
  hero.id = HERO_CTA_ID
  document.body.appendChild(hero)
  return hero
}

const renderCta = () =>
  render(
    <ScrollRevealCta>
      <a href="#reservation">Réserver</a>
    </ScrollRevealCta>,
  )

const wrapper = (): HTMLElement => {
  const element = screen.getByRole('link', { name: 'Réserver' }).parentElement
  if (element === null) throw new Error('wrapper not found')
  return element
}

beforeEach(() => {
  callback = undefined
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(received: ObserverCallback) {
        callback = received
      }
      observe = vi.fn()
      disconnect = disconnect
    },
  )
})

afterEach(() => {
  cleanup()
  document.getElementById(HERO_CTA_ID)?.remove()
  disconnect.mockClear()
  vi.unstubAllGlobals()
})

describe('ScrollRevealCta', () => {
  it('renders hidden and without `inert` on the server, which is also the first client render', () => {
    // The server render is the state the first client render repeats (`useState(false)`): both agree,
    // so hydration has nothing to correct and no frame can show a CTA that then disappears.
    const markup = renderToStaticMarkup(
      <ScrollRevealCta className="hidden lg:block">
        <a href="#reservation">Réserver</a>
      </ScrollRevealCta>,
    )
    expect(markup).toContain('data-state="hidden"')
    // No `inert` in the markup (D-1): nothing can lift an attribute without JavaScript, and the CTA the
    // `scripting: none` stylesheet shows has to stay a plain, operable `#reservation` link.
    expect(markup).not.toContain('inert')
  })

  it('becomes inert right after mount while hidden, so the hidden CTA is never focusable with JavaScript', () => {
    mountHeroCta()
    renderCta()
    // Hidden is still the only state reachable here (the observer never fired): the attribute is added
    // by the client, from mount on, and the wrapper carries it while it is hidden.
    expect(wrapper().dataset['state']).toBe('hidden')
    expect(wrapper().hasAttribute('inert')).toBe(true)
  })

  it('is revealed after mount when the hero CTA does not exist', async () => {
    renderCta()
    await waitFor(() => expect(wrapper().dataset['state']).toBe('visible'))
    expect(wrapper().hasAttribute('inert')).toBe(false)
    expect(callback).toBeUndefined()
  })

  it('is revealed after mount when IntersectionObserver is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    mountHeroCta()
    renderCta()
    await waitFor(() => expect(wrapper().dataset['state']).toBe('visible'))
    expect(wrapper().hasAttribute('inert')).toBe(false)
  })

  it('is hidden and inert while the hero CTA is in view', () => {
    mountHeroCta()
    renderCta()
    emit(true, 300)
    expect(wrapper().hasAttribute('inert')).toBe(true)
    expect(wrapper().dataset['state']).toBe('hidden')
  })

  it('stays hidden while the hero CTA is still below the viewport', () => {
    mountHeroCta()
    renderCta()
    emit(false, 1200)
    expect(wrapper().hasAttribute('inert')).toBe(true)
  })

  it('is revealed once the hero CTA has scrolled above the viewport', () => {
    mountHeroCta()
    renderCta()
    emit(true, 300)
    emit(false, -20)
    expect(wrapper().hasAttribute('inert')).toBe(false)
    expect(wrapper().dataset['state']).toBe('visible')
  })

  it('hides again once the hero CTA comes back into view', () => {
    mountHeroCta()
    renderCta()
    emit(false, -20)
    emit(true, 300)
    expect(wrapper().hasAttribute('inert')).toBe(true)
    expect(wrapper().dataset['state']).toBe('hidden')
  })

  it('disconnects the observer on unmount', () => {
    mountHeroCta()
    const { unmount } = renderCta()
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
