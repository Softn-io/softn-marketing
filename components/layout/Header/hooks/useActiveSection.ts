'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SectionId } from '@/lib/anchors'

/** Share of the viewport height, counted from the top, that the reading band leaves below it. */
const READING_BAND_BOTTOM_INSET = 60

/** Bottom edge of the reading band, as a fraction of the viewport height. */
const READING_BAND_BOTTOM_FRACTION = 1 - READING_BAND_BOTTOM_INSET / 100

/** Scroll silence after which a click lock is released. */
const SCROLL_IDLE_MS = 150

/** Upper bound of a click lock, whatever the scroll does. */
const MAX_LOCK_MS = 3000

/** Gestures that mean the visitor takes the scroll back: they release a click lock immediately. */
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown'] as const

export type ActiveSection = {
  /** Id of the section highlighted in the navigation, or `null` when none applies (hero, footer). */
  activeId: SectionId | null
  /** Marks a section active right away and holds it until the resulting scroll has settled. */
  select: (id: SectionId) => void
}

/** Header height the page already compensates for with `scroll-padding-top`, resolved to pixels. */
const readStickyOffset = (): number => {
  const offset = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
  return Number.isFinite(offset) ? offset : 0
}

/**
 * Section the URL fragment names, or `null` when there is no fragment or it names a section the page
 * does not render. A fragment is the visitor's target: the page opens on it, exactly like a click.
 */
const readFragmentId = (ids: readonly SectionId[]): SectionId | null => {
  const fragment = window.location.hash.slice(1)
  return fragment === '' ? null : (ids.find((id) => id === fragment) ?? null)
}

/** Section the observer reports on, with the id the navigation knows it by. */
type ObservedSection = {
  id: SectionId
  element: HTMLElement
}

/** Reading band in viewport coordinates: its top is the bottom of the sticky header. */
type ReadingBand = {
  top: number
  bottom: number
}

/**
 * Scroll-spy for the in-page navigation.
 *
 * The reading band runs from the bottom of the sticky header (read from `scroll-padding-top`, so it
 * follows the tokens) down to 40% of the viewport. Among the observed sections that intersect the
 * band, the last one in `ids` order is active: a section takes over as soon as its top enters the
 * band. No intersecting section (hero, booking, footer) means no active link.
 *
 * Ids whose element is not in the DOM at mount are ignored, so sections can ship independently.
 *
 * Fragment: the browser applies a fragment in the URL against the layout of that moment, and this
 * page keeps growing afterwards — the method diagram's pinned track adds 250vh once it hydrates, the
 * self-hosted fonts swap in after load — which leaves the reader short of the section the fragment
 * asked for. The first layout pass therefore marks the fragment's section active (a fragment is a
 * choice, like a click) and re-applies it from the section's own box whenever a section grows or
 * shrinks, until the visitor takes the scroll back (a gesture or a pointer press, a click on a link,
 * a new fragment).
 *
 * URL: once the reader drives, the active section follows into the address with `replaceState`, so a
 * shared URL names the section on screen. The sync adds no history entry, keeps the path and query
 * string, fires no `hashchange` and scrolls nothing; it writes no fragment while the page holds the
 * visitor's own fragment or a click lock, and after a settled scroll the URL matches the active
 * section — with no fragment at all when none is active (hero, footer).
 *
 * Click lock: `select` sets the active id and ignores the observer until the scroll that follows the
 * click has settled (no scroll event for `SCROLL_IDLE_MS`), the visitor scrolls by hand, or
 * `MAX_LOCK_MS` elapses. On release the active id is recomputed from what the observer saw meanwhile.
 *
 * @param ids Section ids in document order. Only their content matters, not the array identity.
 */
export const useActiveSection = (ids: readonly SectionId[]): ActiveSection => {
  const [activeId, setActiveId] = useState<SectionId | null>(null)
  const startLock = useRef<(() => void) | null>(null)
  const idsKey = ids.join(',')

  const select = useCallback((id: SectionId): void => {
    setActiveId(id)
    startLock.current?.()
  }, [])

  useEffect(() => {
    const ordered = idsKey === '' ? [] : (idsKey.split(',') as SectionId[])
    const observed: ObservedSection[] = ordered.flatMap((id) => {
      const element = document.getElementById(id)
      return element === null ? [] : [{ id, element }]
    })
    if (observed.length === 0 || typeof IntersectionObserver === 'undefined') return undefined

    const intersecting = new Set<SectionId>()
    const stickyOffset = readStickyOffset()
    let isLocked = false
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let capTimer: ReturnType<typeof setTimeout> | undefined
    /** Section the URL asks for, held and re-applied until the visitor takes the scroll back. */
    let fragmentId = readFragmentId(observed.map(({ id }) => id))
    let fragmentHeld = false

    const computeActive = (): SectionId | null => observed.filter(({ id }) => intersecting.has(id)).at(-1)?.id ?? null

    /**
     * Mirrors the active section into the URL fragment: the address keeps telling where the reader
     * is, and a shared URL opens on it. `replaceState` adds no history entry, fires no `hashchange`
     * and scrolls nothing — the back button stays on real navigations, and this hook's own
     * `hashchange` listener only sees the visitor's own fragment changes.
     */
    const syncFragment = (id: SectionId | null): void => {
      const nextHash = id === null ? '' : `#${id}`
      const { hash, pathname, search } = window.location
      if (hash === nextHash) return
      window.history.replaceState(null, '', `${pathname}${search}${nextHash}`)
    }

    /**
     * Publishes an active section to the navigation and the URL. While the page still holds the
     * fragment it was opened on, the URL is the visitor's choice: the observer's first reading, taken
     * before the layout pass that marks and holds that fragment, must not replace it.
     */
    const applyActive = (id: SectionId | null): void => {
      setActiveId(id)
      if (fragmentId !== null && !fragmentHeld) return
      syncFragment(id)
    }

    /** Reading band of the current frame: the bottom follows the viewport, the top the sticky header. */
    const readingBand = (): ReadingBand => ({
      top: stickyOffset,
      bottom: window.innerHeight * READING_BAND_BOTTOM_FRACTION,
    })

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const match = observed.find(({ element }) => element === entry.target)
          if (match === undefined) continue
          if (entry.isIntersecting) intersecting.add(match.id)
          else intersecting.delete(match.id)
        }
        if (!isLocked) applyActive(computeActive())
      },
      { rootMargin: `-${stickyOffset}px 0px -${READING_BAND_BOTTOM_INSET}% 0px` },
    )
    observed.forEach(({ element }) => observer.observe(element))

    const armIdleTimer = (): void => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(releaseLock, SCROLL_IDLE_MS)
    }

    const clearLock = (): void => {
      isLocked = false
      clearTimeout(idleTimer)
      clearTimeout(capTimer)
      window.removeEventListener('scroll', armIdleTimer)
    }

    const releaseLock = (): void => {
      if (!isLocked) return
      clearLock()
      applyActive(computeActive())
    }

    /** Holds the active section against the observer until the scroll it causes has settled. */
    const hold = (): void => {
      if (isLocked) {
        armIdleTimer()
        return
      }
      isLocked = true
      armIdleTimer()
      capTimer = setTimeout(releaseLock, MAX_LOCK_MS)
      window.addEventListener('scroll', armIdleTimer, { passive: true })
    }

    /**
     * Layout pass over the sections: the fragment is the visitor's chosen position, so it is marked
     * and held once, and re-applied whenever the layout has moved its section out of the reading
     * band — a section that grows (the method diagram's pinned track) or a document that reflows
     * (font swap) would otherwise leave the reader short of the target they asked for.
     */
    const applyFragment = (): void => {
      if (fragmentId === null) return
      const target = observed.find(({ id }) => id === fragmentId)
      if (target === undefined) return
      if (!fragmentHeld) {
        fragmentHeld = true
        setActiveId(fragmentId)
        hold()
      }
      const band = readingBand()
      const { top } = target.element.getBoundingClientRect()
      if (top >= band.top && top <= band.bottom) return
      target.element.scrollIntoView({ block: 'start', behavior: 'instant' })
    }

    /** Only a fragment is re-applied on layout passes: without one there is nothing to re-apply. */
    const resizer =
      fragmentId === null || typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applyFragment)
    resizer?.observe(document.body)
    observed.forEach(({ element }) => resizer?.observe(element))

    /** A gesture or a new fragment ends the page's own fragment: the reading position is the scroll's. */
    const stopResyncing = (): void => {
      fragmentId = null
      resizer?.disconnect()
    }

    const takeScrollBack = (): void => {
      stopResyncing()
      releaseLock()
    }

    startLock.current = (): void => {
      stopResyncing()
      hold()
    }

    USER_SCROLL_EVENTS.forEach((type) => window.addEventListener(type, takeScrollBack, { passive: true }))
    // A pointer press is the visitor driving too (a scrollbar drag, a click on another in-page link),
    // but it must not release a click lock the way a scroll gesture does.
    window.addEventListener('pointerdown', stopResyncing, { passive: true })
    window.addEventListener('hashchange', stopResyncing)

    return () => {
      observer.disconnect()
      clearLock()
      resizer?.disconnect()
      USER_SCROLL_EVENTS.forEach((type) => window.removeEventListener(type, takeScrollBack))
      window.removeEventListener('pointerdown', stopResyncing)
      window.removeEventListener('hashchange', stopResyncing)
      startLock.current = null
    }
  }, [idsKey])

  return { activeId, select }
}
