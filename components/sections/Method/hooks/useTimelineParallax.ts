import { useEffect } from 'react'
import { SECTION_IDS } from '@/lib/anchors'
import { METHOD_TIMELINE_ID, computeTimelineParallaxProgress, timelineParallaxState } from '../data/timelineParallax'

/**
 * Moves the method timeline while the agent section enters the viewport, as the design does.
 *
 * One passive scroll listener and one resize listener schedule a single frame each, and the frame
 * reads the agent section's top and writes the timeline's transform and opacity. Nothing is applied
 * under `prefers-reduced-motion: reduce`, and the written properties are removed when the preference
 * turns on or when the island unmounts, so the timeline keeps the stylesheet's static state.
 */
export const useTimelineParallax = (): void => {
  useEffect(() => {
    const section = document.getElementById(SECTION_IDS.agent)
    const timeline = document.getElementById(METHOD_TIMELINE_ID)
    if (section === null || timeline === null) return undefined

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let running = false

    const reset = (): void => {
      timeline.style.removeProperty('transform')
      timeline.style.removeProperty('opacity')
    }

    const update = (): void => {
      frame = 0
      const progress = computeTimelineParallaxProgress(section.getBoundingClientRect().top, window.innerHeight)
      const state = timelineParallaxState(progress)
      timeline.style.transform = `translateY(${state.translateY}px) scale(${state.scale})`
      timeline.style.opacity = String(state.opacity)
    }

    const scheduleUpdate = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }

    const start = (): void => {
      if (running) return
      running = true
      window.addEventListener('scroll', scheduleUpdate, { passive: true })
      window.addEventListener('resize', scheduleUpdate)
      scheduleUpdate()
    }

    const stop = (): void => {
      running = false
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frame !== 0) window.cancelAnimationFrame(frame)
      frame = 0
      reset()
    }

    const handleMotionPreference = (event: MediaQueryListEvent): void => {
      if (event.matches) stop()
      else start()
    }

    motionPreference.addEventListener('change', handleMotionPreference)
    if (!motionPreference.matches) start()

    return () => {
      motionPreference.removeEventListener('change', handleMotionPreference)
      if (running) stop()
    }
  }, [])
}
