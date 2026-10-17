"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SectionId } from "@/lib/anchors"

/** Share of the viewport height, counted from the top, that is excluded from the reading band at its bottom edge. */
const READING_BAND_BOTTOM_INSET = "60%"

/** Scroll silence after which a click lock is released. */
const SCROLL_IDLE_MS = 150

/** Upper bound of a click lock, whatever the scroll does. */
const MAX_LOCK_MS = 3000

/** Gestures that mean the visitor takes the scroll back: they release a click lock immediately. */
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown"] as const

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
 * Scroll-spy for the in-page navigation.
 *
 * The reading band runs from the bottom of the sticky header (read from `scroll-padding-top`, so it
 * follows the tokens) down to 40% of the viewport. Among the observed sections that intersect the
 * band, the last one in `ids` order is active: a section takes over as soon as its top enters the
 * band. No intersecting section (hero, booking, footer) means no active link.
 *
 * Ids whose element is not in the DOM at mount are ignored, so sections can ship independently.
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
  const idsKey = ids.join(",")

  const select = useCallback((id: SectionId): void => {
    setActiveId(id)
    startLock.current?.()
  }, [])

  useEffect(() => {
    const ordered = idsKey === "" ? [] : (idsKey.split(",") as SectionId[])
    const elements = ordered.flatMap((id) => {
      const element = document.getElementById(id)
      return element === null ? [] : [{ id, element }]
    })
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") return undefined

    const intersecting = new Set<SectionId>()
    let isLocked = false
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let capTimer: ReturnType<typeof setTimeout> | undefined

    const computeActive = (): SectionId | null =>
      elements.filter(({ id }) => intersecting.has(id)).at(-1)?.id ?? null

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const match = elements.find(({ element }) => element === entry.target)
          if (match === undefined) continue
          if (entry.isIntersecting) intersecting.add(match.id)
          else intersecting.delete(match.id)
        }
        if (!isLocked) setActiveId(computeActive())
      },
      { rootMargin: `-${readStickyOffset()}px 0px -${READING_BAND_BOTTOM_INSET} 0px` },
    )
    elements.forEach(({ element }) => observer.observe(element))

    const armIdleTimer = (): void => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(releaseLock, SCROLL_IDLE_MS)
    }

    const clearLock = (): void => {
      isLocked = false
      clearTimeout(idleTimer)
      clearTimeout(capTimer)
      window.removeEventListener("scroll", armIdleTimer)
      USER_SCROLL_EVENTS.forEach((type) => window.removeEventListener(type, releaseLock))
    }

    const releaseLock = (): void => {
      if (!isLocked) return
      clearLock()
      setActiveId(computeActive())
    }

    startLock.current = () => {
      if (isLocked) {
        armIdleTimer()
        return
      }
      isLocked = true
      armIdleTimer()
      capTimer = setTimeout(releaseLock, MAX_LOCK_MS)
      window.addEventListener("scroll", armIdleTimer, { passive: true })
      USER_SCROLL_EVENTS.forEach((type) => window.addEventListener(type, releaseLock, { passive: true }))
    }

    return () => {
      observer.disconnect()
      clearLock()
      startLock.current = null
    }
  }, [idsKey])

  return { activeId, select }
}
