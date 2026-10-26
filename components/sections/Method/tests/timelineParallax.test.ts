import { describe, expect, it } from 'vitest'
import {
  METHOD_TIMELINE_ID,
  TIMELINE_PARALLAX,
  computeTimelineParallaxProgress,
  timelineParallaxState,
} from '../data/timelineParallax'

describe('computeTimelineParallaxProgress', () => {
  it('is 0 while the section top is one viewport below, and 1 when it reaches the top', () => {
    expect(computeTimelineParallaxProgress(1000, 1000)).toBe(0)
    expect(computeTimelineParallaxProgress(0, 1000)).toBe(1)
    expect(computeTimelineParallaxProgress(500, 1000)).toBe(0.5)
  })

  it('clamps both ends: never negative, never above 1', () => {
    expect(computeTimelineParallaxProgress(2000, 1000)).toBe(0)
    expect(computeTimelineParallaxProgress(-1000, 1000)).toBe(1)
  })

  it('falls back to 0 for a zero, negative or non-finite viewport', () => {
    expect(computeTimelineParallaxProgress(0, 0)).toBe(0)
    expect(computeTimelineParallaxProgress(0, -10)).toBe(0)
    expect(computeTimelineParallaxProgress(0, Number.NaN)).toBe(0)
  })

  it('falls back to 0 for a non-finite section top', () => {
    expect(computeTimelineParallaxProgress(Number.NaN, 1000)).toBe(0)
  })
})

describe('timelineParallaxState', () => {
  it('leaves the timeline untouched at progress 0', () => {
    expect(timelineParallaxState(0)).toEqual({ translateY: 0, scale: 1, opacity: 1 })
  })

  it('applies the design amplitudes at progress 1', () => {
    const state = timelineParallaxState(1)
    expect(state.translateY).toBe(-60)
    expect(state.scale).toBeCloseTo(0.94, 10)
    expect(state.opacity).toBeCloseTo(0.45, 10)
  })

  it('interpolates linearly at progress 0.5', () => {
    const state = timelineParallaxState(0.5)
    expect(state.translateY).toBe(-30)
    expect(state.scale).toBeCloseTo(0.97, 10)
    expect(state.opacity).toBeCloseTo(0.725, 10)
  })

  it('clamps an out-of-range progress before interpolating', () => {
    expect(timelineParallaxState(-1)).toEqual(timelineParallaxState(0))
    expect(timelineParallaxState(2)).toEqual(timelineParallaxState(1))
  })

  it('keeps the documented amplitudes in one place', () => {
    expect(TIMELINE_PARALLAX).toEqual({ translatePx: 60, scaleDrop: 0.06, opacityDrop: 0.55 })
  })
})

describe('METHOD_TIMELINE_ID', () => {
  it('targets the timeline element by its stable id', () => {
    expect(METHOD_TIMELINE_ID).toBe('method-timeline')
  })
})
