// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { MethodTimelineParallax } from '../MethodTimelineParallax'
import { METHOD_TIMELINE_ID } from '../data/timelineParallax'

/*
 * Lifecycle of the parallax island, complementary to `MethodTimelineParallax.test.tsx`:
 * the passive/registration contract of the two window listeners, the rAF throttling (one
 * frame per burst of scroll events), the cleanup on unmount and the live reduced-motion
 * preference switching.
 *
 * Only the island is mounted (with a stub timeline element and the agent section id), so the
 * window listener and rAF counts belong to the parallax alone — the sibling Method components
 * register their own scroll listeners (see MethodDiagram) and would pollute every count.
 */

/** A pending rAF callback, kept so tests can flush frames manually. */
const frames: Array<((time: number) => void) | undefined> = []

let rafSpy: MockInstance
let cancelSpy: MockInstance

/** Runs every pending frame, oldest first. */
const flushFrames = (): void => {
  while (frames.some((frame) => frame !== undefined)) {
    const index = frames.findIndex((frame) => frame !== undefined)
    const frame = frames[index]
    frames[index] = undefined
    frame!(performance.now())
  }
}

/** The window listeners the island registers, captured from `window.addEventListener`. */
type Listener = (event: Event) => void
const registered = vi.fn()
const unregistered = vi.fn()

const listenerOf = (type: string): Listener => {
  const call = registered.mock.calls.find(([name]) => name === type)
  if (call === undefined) throw new Error(`no "${type}" listener was registered`)
  return call[1] as Listener
}

const passiveOf = (type: string): unknown => {
  const call = registered.mock.calls.find(([name]) => name === type)
  return Reflect.get(call?.[2] ?? {}, 'passive')
}

/** The matchMedia change handler the island subscribes to, for live preference flips. */
let motionChangeHandler: ((event: { matches: boolean }) => void) | null = null

const stubMatchMedia = (isReducedMotion: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? isReducedMotion : false,
      media: query,
      addEventListener: (_type: string, handler: (event: { matches: boolean }) => void) => {
        motionChangeHandler = handler
      },
      removeEventListener: () => {
        motionChangeHandler = null
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  )
}

const timeline = (): HTMLElement => {
  const element = document.getElementById(METHOD_TIMELINE_ID)
  if (element === null) throw new Error('timeline missing')
  return element
}

const renderIsland = (): void => {
  render(
    <>
      <ol id={METHOD_TIMELINE_ID}>
        <li>step</li>
      </ol>
      <div id={SECTION_IDS.agent} />
      <MethodTimelineParallax />
    </>,
  )
}

beforeEach(() => {
  /* jsdom exposes requestAnimationFrame only with `pretendToBeVisual`; provide controllable ones. */
  if (typeof window.requestAnimationFrame !== 'function') {
    Object.defineProperty(window, 'requestAnimationFrame', { value: () => 0, configurable: true })
  }
  if (typeof window.cancelAnimationFrame !== 'function') {
    Object.defineProperty(window, 'cancelAnimationFrame', { value: () => {}, configurable: true })
  }
  stubMatchMedia(false)
  /* The spies record AND let the real window attach the handlers, so `dispatchEvent` reaches them. */
  const realAdd = window.addEventListener.bind(window)
  const realRemove = window.removeEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
    registered(type, handler, options)
    realAdd(type, handler, options)
  })
  vi.spyOn(window, 'removeEventListener').mockImplementation((type, handler) => {
    unregistered(type, handler)
    realRemove(type, handler)
  })
  rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames[Number(id) - 1] = undefined
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  frames.length = 0
  motionChangeHandler = null
})

describe('MethodTimelineParallax lifecycle', () => {
  it('registers one passive scroll listener and one resize listener, and schedules the first frame', () => {
    renderIsland()
    expect(rafSpy).toHaveBeenCalledTimes(1)

    expect(passiveOf('scroll'), 'the scroll listener is passive').toBe(true)
    expect(passiveOf('resize'), 'the resize listener is not declared passive').toBeUndefined()
    expect(registered.mock.calls.filter(([name]) => name === 'scroll')).toHaveLength(1)
    expect(registered.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(1)
  })

  it('throttles a burst of scroll events to a single frame', () => {
    renderIsland()

    /* The mount frame is still pending: these scrolls must not schedule more frames. */
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('scroll'))
    expect(rafSpy, 'one frame per burst').toHaveBeenCalledTimes(1)

    flushFrames()
    expect(timeline().style.transform).toBe('translateY(-60px) scale(0.94)')
    expect(timeline().style.opacity).toBe('0.45')

    /* A new scroll after the frame ran schedules exactly one new frame. */
    window.dispatchEvent(new Event('scroll'))
    expect(rafSpy, 'one new frame after the previous one ran').toHaveBeenCalledTimes(2)
  })

  it('drops the pending frame when the preference turns to reduce, and stops writing', () => {
    renderIsland()

    window.dispatchEvent(new Event('scroll'))
    expect(
      frames.some((frame) => frame !== undefined),
      'a frame is pending',
    ).toBe(true)

    expect(motionChangeHandler).not.toBeNull()
    motionChangeHandler!({ matches: true })

    expect(
      frames.some((frame) => frame !== undefined),
      'the pending frame was cancelled',
    ).toBe(false)
    expect(cancelSpy).toHaveBeenCalled()
    expect(unregistered.mock.calls.filter(([name]) => name === 'scroll')).toHaveLength(1)
    expect(unregistered.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(1)
    expect(['', null], 'the written properties are removed (an empty attribute when jsdom kept one)').toContain(
      timeline().getAttribute('style'),
    )

    /* A removed listener must not fire: the real dispatch reaches nothing, so no frame is scheduled. */
    window.dispatchEvent(new Event('scroll'))
    expect(rafSpy, 'no frame is scheduled while reduced').toHaveBeenCalledTimes(1)
  })

  it('restarts the listeners when the preference turns back to allow motion', () => {
    renderIsland()
    motionChangeHandler!({ matches: true })
    const registrationsAtStop = registered.mock.calls.length

    motionChangeHandler!({ matches: false })
    expect(registered.mock.calls.length, 'scroll and resize are registered again').toBe(registrationsAtStop + 2)
    expect(rafSpy).toHaveBeenCalledTimes(2)

    flushFrames()
    expect(timeline().style.transform).toBe('translateY(-60px) scale(0.94)')
    expect(timeline().style.opacity).toBe('0.45')
  })

  it('removes both listeners and restores the static timeline on unmount', () => {
    renderIsland()
    const scroll = listenerOf('scroll')
    const resize = listenerOf('resize')

    scroll(new Event('scroll'))
    flushFrames()
    expect(timeline().style.transform).toBe('translateY(-60px) scale(0.94)')
    const element = timeline()

    const scrollRegistrations = registered.mock.calls.filter(([name]) => name === 'scroll').length
    const resizeRegistrations = registered.mock.calls.filter(([name]) => name === 'resize').length

    cleanup()
    vi.restoreAllMocks() // the spies were active while the effect unmounted: the calls are recorded

    expect(unregistered.mock.calls.filter(([name, handler]) => name === 'scroll' && handler === scroll)).toHaveLength(
      scrollRegistrations,
    )
    expect(unregistered.mock.calls.filter(([name, handler]) => name === 'resize' && handler === resize)).toHaveLength(
      resizeRegistrations,
    )
    expect(element.style.getPropertyValue('transform'), 'no transform left').toBe('')
    expect(element.style.getPropertyValue('opacity'), 'no opacity left').toBe('')
  })
})
