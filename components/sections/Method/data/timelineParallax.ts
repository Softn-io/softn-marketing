/** Element id of the method timeline the parallax moves. */
export const METHOD_TIMELINE_ID = 'method-timeline'

/**
 * Amplitudes of the timeline parallax, from the design: the timeline rises 60px, shrinks by 6% and
 * fades to 45% opacity while the agent section covers the viewport.
 */
export const TIMELINE_PARALLAX = {
  translatePx: 60,
  scaleDrop: 0.06,
  opacityDrop: 0.55,
} as const

/** Transform and opacity the timeline takes for a given progress. */
export type TimelineParallaxState = {
  readonly translateY: number
  readonly scale: number
  readonly opacity: number
}

/** Keeps a progress ratio inside [0, 1]; a non-finite input reads as 0. */
const clampProgress = (progress: number): number => (Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0)

/** Rounds a computed CSS value to three decimals, so the written string stays short and exact. */
const round = (value: number): number => Number(value.toFixed(3))

/**
 * Progress of the agent section's entrance, from 0 (its top still a viewport below) to 1 (its top
 * at the viewport's top or above).
 *
 * @param sectionTop `top` of the agent section's bounding rectangle, in pixels.
 * @param viewportHeight Window height, in pixels.
 * @returns The clamped progress ratio.
 */
export const computeTimelineParallaxProgress = (sectionTop: number, viewportHeight: number): number => {
  if (!(viewportHeight > 0)) return 0
  return clampProgress(1 - sectionTop / viewportHeight)
}

/**
 * Timeline state for a progress ratio: `translateY(-60 * p)`, `scale(1 - 0.06 * p)` and
 * `opacity(1 - 0.55 * p)`.
 *
 * @param progress Entrance progress, clamped to [0, 1].
 * @returns The transform values and opacity to apply.
 */
export const timelineParallaxState = (progress: number): TimelineParallaxState => {
  const ratio = clampProgress(progress)
  return {
    translateY: round(-TIMELINE_PARALLAX.translatePx * ratio),
    scale: round(1 - TIMELINE_PARALLAX.scaleDrop * ratio),
    opacity: round(1 - TIMELINE_PARALLAX.opacityDrop * ratio),
  }
}
