// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHasPaintedOnce } from './useHasPaintedOnce'

/**
 * The frame scheduling is stubbed on a macrotask timer so the tests do not depend on jsdom's
 * `pretendToBeVisual` setting: the stub returns a timer id that `cancelAnimationFrame` can be
 * asserted against, which is exactly the contract the hook relies on.
 */
beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => window.clearTimeout(id)),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useHasPaintedOnce', () => {
  it('is false on the first render, so a lazily mounted Root is held closed', () => {
    const { result } = renderHook(() => useHasPaintedOnce())
    expect(result.current).toBe(false)
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('turns true after one animation frame', async () => {
    const { result } = renderHook(() => useHasPaintedOnce())
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 5)
      })
    })
    expect(result.current).toBe(true)
  })

  it('cancels the scheduled frame on unmount, so a component that never paints past its first commit never flips', () => {
    const { unmount } = renderHook(() => useHasPaintedOnce())
    const frameId = vi.mocked(window.requestAnimationFrame).mock.results[0]?.value
    if (frameId === undefined) throw new Error('no frame scheduled')
    unmount()
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(frameId)
  })
})
