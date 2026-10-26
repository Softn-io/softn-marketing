'use client'

import { useTimelineParallax } from './hooks/useTimelineParallax'

/**
 * Client island of the timeline parallax: mounts the scroll script and renders nothing, so the
 * method section and its timeline stay server components.
 */
export const MethodTimelineParallax = () => {
  useTimelineParallax()
  return null
}
