// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { method } from '@/locales/fr/method'
import { MethodDiagram } from '../MethodDiagram'

/**
 * Wiring of the scroll-driven island: which listeners it attaches (scroll must be passive), what
 * each scroll frame writes on the stage, and how the whole thing tears down on unmount or when the
 * user switches `prefers-reduced-motion` on mid-session.
 *
 * jsdom has no layout, so the geometry helpers of `update()` are fed through stubs: the track and the
 * stage report fixed rectangles whose `top` follows a fake `scrollY`, the document reports a fixed
 * scroll height, and `requestAnimationFrame` runs its callback synchronously so a dispatched scroll
 * event applies the geometry immediately and deterministically.
 */

/** Viewport-ish values the stubbed layout reports. */
const TRACK_TOP = 100
const TRACK_HEIGHT = 800
const STAGE_HEIGHT = 400
const SCROLL_HEIGHT = 3000

type MediaQueryHandlers = Set<(event: { matches: boolean }) => void>

/** One `matchMedia` query the component reads, with its live `change` listeners. */
type MediaQueryStub = {
  matches: boolean
  addEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void
  removeEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void
}

/** All queries the island uses, so a test can flip one and fire its `change` event. */
const queryStubs = new Map<string, MediaQueryStub>()

/** Live `change` handlers of every stubbed query, keyed like `queryStubs`. */
const queryHandlers = new Map<string, MediaQueryHandlers>()

/** `window.matchMedia` stub: one shared object per query string, with a real listener registry. */
const matchMediaStub = vi.fn((query: string): MediaQueryStub => {
  const existing = queryStubs.get(query)
  if (existing !== undefined) return existing
  const handlers: MediaQueryHandlers = new Set()
  const stub: MediaQueryStub = {
    matches: query === '(prefers-reduced-motion: reduce)' ? reducedMotionInitial : false,
    addEventListener: (_type, handler) => {
      handlers.add(handler)
    },
    removeEventListener: (_type, handler) => {
      handlers.delete(handler)
    },
  }
  queryStubs.set(query, stub)
  queryHandlers.set(query, handlers)
  return stub
})

/** Start state of the reduced-motion query; each test sets its own before rendering. */
let reducedMotionInitial = false

/** Current fake scroll position, mirrored into the track's stubbed rectangle. */
let fakeScrollY = 0

/** A `getBoundingClientRect` result jsdom never produces on its own. */
const makeRect = (top: number, height: number): DOMRect => ({
  x: 0,
  y: top,
  top,
  bottom: top + height,
  left: 0,
  right: 0,
  width: 0,
  height,
  toJSON: () => ({}),
}) as DOMRect

/** Fires the `change` listeners of one stubbed query with a new `matches` value. */
const flipQuery = (query: string, matches: boolean): void => {
  const stub = queryStubs.get(query)
  const handlers = queryHandlers.get(query)
  if (stub === undefined || handlers === undefined) throw new Error(`query never stubbed: ${query}`)
  stub.matches = matches
  for (const handler of handlers) act(() => handler({ matches }))
}

/** Renders the island and returns its track and stage elements plus the RTL unmount handle. */
const renderDiagram = (): { track: HTMLElement; stage: HTMLElement; unmount: () => void } => {
  const { container, unmount } = render(<MethodDiagram />)
  const track = container.querySelector<HTMLElement>('[data-diagram-track]')
  const stage = container.querySelector<HTMLElement>('[data-diagram-stage]')
  if (track === null || stage === null) throw new Error('track or stage missing from the island')
  return { track, stage, unmount }
}

/** Scrolls the fake page and dispatches the real window event the island listens to. */
const scrollTo = (scrollY: number): void => {
  fakeScrollY = scrollY
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

beforeEach(() => {
  reducedMotionInitial = false
  fakeScrollY = 0
  queryStubs.clear()
  queryHandlers.clear()
  vi.stubGlobal('matchMedia', matchMediaStub)
  // Returns 0 so the island's `frame === 0` guard stays open: every scheduled update really runs.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    callback(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())

  // jsdom measures nothing: give the update() math a stable, scroll-following layout.
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => fakeScrollY })
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    get: () => SCROLL_HEIGHT,
  })
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    get: () => STAGE_HEIGHT * 2,
  })

  // The island measures the track and the stage inside its mount effect, so the stub has to be on
  // the prototype before React runs that effect.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute('data-diagram-track')) return makeRect(TRACK_TOP - fakeScrollY, TRACK_HEIGHT)
    if (this.hasAttribute('data-diagram-stage')) return makeRect(0, STAGE_HEIGHT)
    return makeRect(0, 0)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MethodDiagram scroll wiring', () => {
  it('arms the pinned mode and registers a passive scroll listener plus a resize listener', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const { track } = renderDiagram()

    expect(track.getAttribute('data-motion')).toBe('scroll')
    const scrollCall = addEventListener.mock.calls.find(([type]) => type === 'scroll')
    expect(scrollCall, 'no scroll listener registered').toBeDefined()
    expect(scrollCall?.[2]).toEqual({ passive: true })
    expect(addEventListener.mock.calls.some(([type]) => type === 'resize')).toBe(true)
  })

  it('writes the design geometry on the stage as custom properties and announces each status', () => {
    const { track, stage } = renderDiagram()

    // Page top: pin not reached, progress clamps to 0 — the queue is producing, nothing is built.
    expect(track.getAttribute('data-motion')).toBe('scroll')
    expect(screen.getByText(method.loop.status.producing)).toBeTruthy()
    expect(stage.style.getPropertyValue('--method-lane-live')).toBe('0')
    expect(stage.style.getPropertyValue('--method-gate-opacity')).toBe('0')
    expect(stage.style.getPropertyValue('--method-block-y-0')).toBe('0.0px')

    // Halfway: the review gate is fully faded in, the status announces the failure step.
    const travel = TRACK_HEIGHT - STAGE_HEIGHT
    scrollTo(TRACK_TOP + travel * 0.5)
    expect(screen.getByText(method.loop.status.failing)).toBeTruthy()
    expect(stage.style.getPropertyValue('--method-gate-opacity')).toBe('1')
    expect(Number.parseFloat(stage.style.getPropertyValue('--method-lane-live'))).toBeCloseTo(0.4, 5)

    // Page end of the pinned travel: every lane complete, the failing block left faded in the queue.
    scrollTo(TRACK_TOP + travel)
    expect(screen.getByText(method.loop.status.live)).toBeTruthy()
    expect(stage.style.getPropertyValue('--method-lane-live')).toBe('1')
    expect(stage.style.getPropertyValue('--method-block-opacity-2')).toBe('0.35')
  })

  it('cancels its frame and detaches every listener and the pinned mode on unmount', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const { track, unmount } = renderDiagram()

    const scrollHandler = addEventListener.mock.calls.find(([type]) => type === 'scroll')?.[1]
    const resizeHandler = addEventListener.mock.calls.find(([type]) => type === 'resize')?.[1]
    expect(scrollHandler, 'no scroll listener registered').toBeDefined()
    expect(resizeHandler, 'no resize listener registered').toBeDefined()

    unmount()

    expect(removeEventListener).toHaveBeenCalledWith('scroll', scrollHandler)
    expect(removeEventListener).toHaveBeenCalledWith('resize', resizeHandler)
    expect(track.hasAttribute('data-motion')).toBe(false)
  })

  it('switching reduced motion on mid-session tears the animation down to the final static state', () => {
    const { track, stage } = renderDiagram()
    const travel = TRACK_HEIGHT - STAGE_HEIGHT
    scrollTo(TRACK_TOP + travel * 0.5)
    expect(screen.getByText(method.loop.status.failing)).toBeTruthy()
    expect(stage.style.getPropertyValue('--method-lane-live')).not.toBe('')

    flipQuery('(prefers-reduced-motion: reduce)', true)

    expect(track.hasAttribute('data-motion')).toBe(false)
    expect(screen.getByText(method.loop.status.live)).toBeTruthy()
    for (const property of ['--method-lane-live', '--method-lane-review', '--method-gate-opacity']) {
      expect(stage.style.getPropertyValue(property), property).toBe('')
    }
  })

  it('switching reduced motion back off re-arms the pinned scroll mode', () => {
    const { track } = renderDiagram()
    flipQuery('(prefers-reduced-motion: reduce)', true)
    expect(track.hasAttribute('data-motion')).toBe(false)

    flipQuery('(prefers-reduced-motion: reduce)', false)

    expect(track.getAttribute('data-motion')).toBe('scroll')
  })

  it('never arms the pinned mode when reduced motion is preferred from the start', () => {
    reducedMotionInitial = true
    const { track, stage } = renderDiagram()

    expect(track.hasAttribute('data-motion')).toBe(false)
    expect(stage.getAttribute('style')).toBeNull()
    expect(screen.getByText(method.loop.status.live)).toBeTruthy()
  })
})
