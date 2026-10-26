// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { Method } from '../Method'
import { METHOD_TIMELINE_ID } from '../data/timelineParallax'

/** Minimal `matchMedia` stub: reduced motion is the only preference the island reads. */
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

/** The timeline element the island writes to. */
const timeline = (): HTMLElement | null => document.getElementById(METHOD_TIMELINE_ID)

beforeEach(() => {
  stubMatchMedia(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MethodTimelineParallax', () => {
  it('moves the timeline to the start of the entrance when the agent section is at the viewport top', async () => {
    /* jsdom measures every box at the origin, so the section top reads 0 and the progress is 1. */
    render(
      <>
        <Method />
        <div id={SECTION_IDS.agent} />
      </>,
    )

    await waitFor(() => {
      expect(timeline()?.style.transform).toBe('translateY(-60px) scale(0.94)')
      expect(timeline()?.style.opacity).toBe('0.45')
    })
  })

  it('writes nothing under prefers-reduced-motion: reduce', async () => {
    stubMatchMedia(true)
    render(
      <>
        <Method />
        <div id={SECTION_IDS.agent} />
      </>,
    )

    /* Let any scheduled frame run before checking that nothing was written. */
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    expect(timeline()?.getAttribute('style')).toBeNull()
  })

  it('does nothing when no agent section is on the page', async () => {
    render(<Method />)
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    expect(timeline()?.getAttribute('style')).toBeNull()
  })
})
