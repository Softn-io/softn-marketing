'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { method } from '@/locales/fr/method'
import { MethodDiagramSvg } from './MethodDiagramSvg'
import {
  METHOD_BLOCK_COUNT,
  METHOD_NARROW_QUERY,
  methodDiagramGeometry,
  type MethodDiagramLayout,
  type MethodDiagramStatus,
} from './data/methodGeometry'
import styles from './styles/Method.module.css'

/** Drawing layout the SVG renders on the server, where the viewport is unknown. */
const SERVER_LAYOUT: MethodDiagramLayout = 'wide'

/** Value of `data-motion` that turns the track into its pinned, scroll-driven mode. */
const SCROLL_MOTION = 'scroll'

/** How far outside the viewport the track still counts as near, so work starts before it is read. */
const TRACK_ROOT_MARGIN = '50% 0px'

/**
 * Custom properties the script writes on the stage. They are inherited by the SVG, so one element is
 * written per frame; clearing them falls back to the stylesheet's complete, static diagram.
 */
const GEOMETRY_PROPERTIES = [
  '--method-lane-live',
  '--method-lane-review',
  '--method-lane-agents',
  '--method-gate-opacity',
  ...Array.from({ length: METHOD_BLOCK_COUNT }, (_, index) => `--method-block-y-${index}`),
  ...Array.from({ length: METHOD_BLOCK_COUNT }, (_, index) => `--method-block-opacity-${index}`),
]

/** Subscribes to the layout breakpoint, so crossing it redraws the SVG with its other viewBox. */
const subscribeToLayout = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(METHOD_NARROW_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Current drawing layout, read from the same query the stylesheet uses. */
const getLayout = (): MethodDiagramLayout => (window.matchMedia(METHOD_NARROW_QUERY).matches ? 'narrow' : 'wide')

/** Deterministic hydration snapshot: the wide drawing is what the server rendered. */
const getServerLayout = (): MethodDiagramLayout => SERVER_LAYOUT

/** Sticky offset the stylesheet applies to the stage, in pixels; 0 when it has no pinned position. */
const readStickyTop = (stage: HTMLElement): number => {
  const top = Number.parseFloat(window.getComputedStyle(stage).top)
  return Number.isFinite(top) ? top : 0
}

/**
 * Scroll-driven review-loop diagram. The section around it stays a server component; this island
 * owns the tall track, the pinned stage and the scroll script.
 *
 * The server renders the diagram complete: lanes full, gate visible, blocks in place, status
 * announced as delivered. That state is also the no-JavaScript and reduced-motion state. Once
 * mounted, and only when motion is allowed, the script switches the track to its pinned mode and
 * writes the design's geometry for the current progress as CSS custom properties on the stage — no
 * React render per frame. A status sentence changes at the four choreography steps and is announced
 * through an `aria-live` region. The script only works while the track is near the viewport, and it
 * tears down its listeners, observer, frame and pinned mode on unmount or when reduced motion comes on.
 */
export const MethodDiagram = () => {
  const trackRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<MethodDiagramStatus>('live')
  const [status, setStatus] = useState<MethodDiagramStatus>('live')
  const layout = useSyncExternalStore(subscribeToLayout, getLayout, getServerLayout)

  useEffect(() => {
    const track = trackRef.current
    const stage = stageRef.current
    if (track === null || stage === null) return undefined

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let stopAnimation: (() => void) | null = null

    const applyStatus = (next: MethodDiagramStatus): void => {
      if (next === statusRef.current) return
      statusRef.current = next
      setStatus(next)
    }

    // The stylesheet's defaults are the final state: dropping the attribute and the written
    // properties restores it without another geometry pass.
    const showFinalState = (): void => {
      track.removeAttribute('data-motion')
      for (const property of GEOMETRY_PROPERTIES) stage.style.removeProperty(property)
      applyStatus('live')
    }

    const startAnimation = (): (() => void) => {
      track.setAttribute('data-motion', SCROLL_MOTION)

      let frame = 0
      let stageHeight = stage.getBoundingClientRect().height
      let stickyTop = readStickyTop(stage)
      let isNearViewport = typeof IntersectionObserver === 'undefined'

      const applyGeometry = (progress: number): void => {
        const geometry = methodDiagramGeometry(progress, layout)
        stage.style.setProperty('--method-lane-live', String(geometry.lanes.live))
        stage.style.setProperty('--method-lane-review', String(geometry.lanes.review))
        stage.style.setProperty('--method-lane-agents', String(geometry.lanes.agents))
        stage.style.setProperty('--method-gate-opacity', String(geometry.gateOpacity))
        geometry.blocks.forEach((block, index) => {
          stage.style.setProperty(`--method-block-y-${index}`, `${block.y.toFixed(1)}px`)
          stage.style.setProperty(`--method-block-opacity-${index}`, String(block.opacity))
        })
        applyStatus(geometry.status)
      }

      const update = (): void => {
        frame = 0
        const rect = track.getBoundingClientRect()
        // The stage pins from the moment its top offset is reached until its bottom meets the
        // track's bottom. When the document ends before that point, the page stops scrolling first,
        // so the available travel is capped by the scroll the page has left: without the cap, a
        // content-sized stage would never reach the end of the choreography.
        const pinStartScrollY = rect.top + window.scrollY - stickyTop
        const maxScrollY = document.documentElement.scrollHeight - document.documentElement.clientHeight
        const travel = Math.min(rect.height - stageHeight, maxScrollY - pinStartScrollY)
        applyGeometry(travel > 0 ? (stickyTop - rect.top) / travel : 0)
      }

      const scheduleUpdate = (): void => {
        if (frame === 0) frame = window.requestAnimationFrame(update)
      }

      const observer =
        typeof IntersectionObserver === 'undefined'
          ? null
          : new IntersectionObserver(
              (entries) => {
                const [entry] = entries
                if (entry === undefined) return
                isNearViewport = entry.isIntersecting
                if (isNearViewport) scheduleUpdate()
              },
              { rootMargin: TRACK_ROOT_MARGIN },
            )

      observer?.observe(track)
      if (observer === null) scheduleUpdate()

      const handleScroll = (): void => {
        if (!isNearViewport) return
        scheduleUpdate()
      }

      const handleResize = (): void => {
        stageHeight = stage.getBoundingClientRect().height
        stickyTop = readStickyTop(stage)
        if (isNearViewport) scheduleUpdate()
      }

      window.addEventListener('scroll', handleScroll, { passive: true })
      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('scroll', handleScroll)
        window.removeEventListener('resize', handleResize)
        observer?.disconnect()
        if (frame !== 0) window.cancelAnimationFrame(frame)
        track.removeAttribute('data-motion')
      }
    }

    const handleMotionPreference = (event: MediaQueryListEvent): void => {
      stopAnimation?.()
      stopAnimation = null
      if (event.matches) showFinalState()
      else stopAnimation = startAnimation()
    }

    motionPreference.addEventListener('change', handleMotionPreference)
    if (!motionPreference.matches) stopAnimation = startAnimation()

    return () => {
      motionPreference.removeEventListener('change', handleMotionPreference)
      stopAnimation?.()
    }
  }, [layout])

  return (
    <div className={styles.track} ref={trackRef} data-diagram-track="">
      <div className={styles.stage} ref={stageRef} data-diagram-stage="">
        <div className={styles.stageHeader}>
          <p className="text-caption text-foreground-tertiary uppercase">{method.loop.label}</p>
          <p className={`${styles.status} text-body-sm`} aria-live="polite" aria-atomic="true">
            {method.loop.status[status]}
          </p>
        </div>
        <MethodDiagramSvg layout={layout} />
      </div>
    </div>
  )
}
