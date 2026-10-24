// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PointerGlow } from './PointerGlow'

type MediaPreferences = { hover: boolean; reducedMotion: boolean }

let preferences: MediaPreferences

const stubMatchMedia = (): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        query === '(hover: hover)'
          ? preferences.hover
          : query === '(prefers-reduced-motion: reduce)'
            ? preferences.reducedMotion
            : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

const stubAnimationFrame = (): void => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
}

const pointerMove = (target: Element, pointerType: string, clientX: number, clientY: number): void => {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX, clientY })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  target.dispatchEvent(event)
}

const renderGlow = (): { parent: HTMLElement; glow: HTMLElement } => {
  const { container } = render(
    <div>
      <PointerGlow />
    </div>,
  )
  const parent = container.firstElementChild
  const glow = parent?.firstElementChild
  if (!(parent instanceof HTMLElement) || !(glow instanceof HTMLElement)) {
    throw new Error('missing glow or parent')
  }
  return { parent, glow }
}

beforeEach(() => {
  preferences = { hover: true, reducedMotion: false }
  stubMatchMedia()
  stubAnimationFrame()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 1000,
    height: 500,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 500,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PointerGlow', () => {
  it('renders a decorative element hidden from assistive technology', () => {
    const { container } = render(<PointerGlow />)
    const glow = container.firstElementChild

    expect(glow?.getAttribute('aria-hidden')).toBe('true')
    expect(glow?.textContent).toBe('')
  })

  it('writes the pointer position relative to its parent box', () => {
    const { parent, glow } = renderGlow()

    pointerMove(parent, 'mouse', 250, 100)

    expect(glow.style.getPropertyValue('--pointer-glow-x')).toBe('25%')
    expect(glow.style.getPropertyValue('--pointer-glow-y')).toBe('20%')
  })

  it('ignores a touch pointer', () => {
    const { parent, glow } = renderGlow()

    pointerMove(parent, 'touch', 250, 100)

    expect(glow.style.getPropertyValue('--pointer-glow-x')).toBe('')
  })

  it('does not follow the pointer when motion is reduced', () => {
    preferences.reducedMotion = true
    const { parent, glow } = renderGlow()

    pointerMove(parent, 'mouse', 250, 100)

    expect(glow.style.getPropertyValue('--pointer-glow-x')).toBe('')
  })

  it('does not follow the pointer without a hovering device', () => {
    preferences.hover = false
    const { parent, glow } = renderGlow()

    pointerMove(parent, 'mouse', 250, 100)

    expect(glow.style.getPropertyValue('--pointer-glow-x')).toBe('')
  })
})
