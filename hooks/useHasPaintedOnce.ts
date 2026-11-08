'use client'

import { useEffect, useState } from 'react'

/**
 * False on the first commit, true from the next animation frame on.
 *
 * A lazily loaded Base UI Root can mount while the open state that drives it is already true, when
 * the visitor opened the layer before its chunk arrived. Base UI derives both the document scroll
 * lock and the popup's enter transition from a closed → open change, so a Root that mounts already
 * open paints the popup before it locks the page — at least one frame, and longer when the main
 * thread is busy. Rendering the Root closed until this flag flips turns that first open into the
 * same mounted, closed → open transition as every later one (see
 * `docs/decisions/0002-hand-rolled-lazy-drawer-triggers.md`).
 *
 * The flag flips inside a frame callback rather than in the effect body so the update is not a
 * cascading render, and the frame only ever delays a cold open, which already waits for the chunk.
 */
export const useHasPaintedOnce = (): boolean => {
  const [hasPaintedOnce, setHasPaintedOnce] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setHasPaintedOnce(true)
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])

  return hasPaintedOnce
}
