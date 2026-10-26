import { describe, expect, it } from 'vitest'
import { computeTimelineParallaxProgress, timelineParallaxState } from '../data/timelineParallax'

/*
 * Edge cases of the pure parallax math, complementary to `timelineParallax.test.ts`:
 * section tops beyond the viewport ends, infinite inputs, the rounding of the written
 * values and the monotonicity of the three interpolated properties.
 */

describe('computeTimelineParallaxProgress: section top at and beyond the viewport ends', () => {
  it('reads a section top one pixel above the viewport top as fully entered', () => {
    expect(computeTimelineParallaxProgress(-1, 1000)).toBe(1)
  })

  it('reads a section top one pixel past one viewport below as not entered', () => {
    expect(computeTimelineParallaxProgress(1001, 1000)).toBe(0)
  })

  it('reads a non-finite section top as never entered', () => {
    expect(computeTimelineParallaxProgress(Number.NaN, 1000)).toBe(0)
    expect(computeTimelineParallaxProgress(Number.POSITIVE_INFINITY, 1000)).toBe(0)
    expect(computeTimelineParallaxProgress(Number.NEGATIVE_INFINITY, 1000)).toBe(0)
  })

  it('treats an infinite viewport as always entered, whatever the finite top', () => {
    expect(computeTimelineParallaxProgress(0, Number.POSITIVE_INFINITY)).toBe(1)
    expect(computeTimelineParallaxProgress(1e9, Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('is exact at the midpoints whose ratio is exact', () => {
    expect(computeTimelineParallaxProgress(250, 1000)).toBe(0.75)
    expect(computeTimelineParallaxProgress(400, 1000)).toBe(0.6)
  })

  it('clamps a section top already past the viewport top', () => {
    expect(computeTimelineParallaxProgress(-250, 1000)).toBe(1)
  })
})

describe('timelineParallaxState: rounding and non-finite inputs', () => {
  it('rounds the written values to three decimals', () => {
    /* 1 - 0.55 / 3 = 0.816666…, written as 0.817 so the CSS string stays short and exact. */
    expect(timelineParallaxState(1 / 3)).toEqual({ translateY: -20, scale: 0.98, opacity: 0.817 })
  })

  it('reads a non-finite progress as the untouched state, even on the positive side', () => {
    expect(timelineParallaxState(Number.NaN)).toEqual({ translateY: 0, scale: 1, opacity: 1 })
    expect(timelineParallaxState(Number.POSITIVE_INFINITY)).toEqual({ translateY: 0, scale: 1, opacity: 1 })
    expect(timelineParallaxState(Number.NEGATIVE_INFINITY)).toEqual({ translateY: 0, scale: 1, opacity: 1 })
  })

  it('keeps the exact design amplitude at progress 1', () => {
    expect(timelineParallaxState(1)).toEqual({ translateY: -60, scale: 0.94, opacity: 0.45 })
  })

  it('interpolates monotonically across the whole range', () => {
    let previous = timelineParallaxState(0)
    for (let step = 1; step <= 100; step += 1) {
      const current = timelineParallaxState(step / 100)
      expect(current.translateY, `translateY at ${step}%`).toBeLessThanOrEqual(previous.translateY)
      expect(current.scale, `scale at ${step}%`).toBeLessThanOrEqual(previous.scale)
      expect(current.opacity, `opacity at ${step}%`).toBeLessThanOrEqual(previous.opacity)
      previous = current
    }
  })
})
