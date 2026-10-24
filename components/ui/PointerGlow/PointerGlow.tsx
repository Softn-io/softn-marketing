'use client'

import { useEffect, useRef } from 'react'
import styles from './PointerGlow.module.css'

/**
 * Decorative warm glow that follows the pointer, shared by the hero and the coming-soon backdrop.
 *
 * The pointer position is written to two custom properties of this element instead of React state,
 * so moving the pointer never re-renders anything. The listener lives on the parent element: the
 * same box the design measures the pointer against. Touch-only devices, reduced-motion users and
 * the no-JavaScript page keep the static position declared in the stylesheet.
 *
 * The handler only stores the pointer coordinates; the box is measured and the custom properties
 * written in the frame callback, so a burst of pointer events never reads the layout more than once
 * per frame.
 */
export const PointerGlow = () => {
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const glow = glowRef.current
    if (glow === null) return undefined

    const container = glow.parentElement
    if (container === null) return undefined

    if (!window.matchMedia('(hover: hover)').matches) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let frame = 0
    let clientX = 0
    let clientY = 0

    // The box is read inside the frame callback, not in the input handler: the handler stays free of
    // layout reads, and the read happens before the write of the same frame.
    const apply = (): void => {
      frame = 0
      const box = container.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      const x = Number((((clientX - box.left) / box.width) * 100).toFixed(1))
      const y = Number((((clientY - box.top) / box.height) * 100).toFixed(1))
      glow.style.setProperty('--pointer-glow-x', `${x}%`)
      glow.style.setProperty('--pointer-glow-y', `${y}%`)
    }

    const handlePointerMove = (event: PointerEvent): void => {
      // A finger drags the page instead of pointing at it: only a hovering pointer moves the glow.
      if (event.pointerType === 'touch') return
      clientX = event.clientX
      clientY = event.clientY
      if (frame === 0) frame = window.requestAnimationFrame(apply)
    }

    container.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      container.removeEventListener('pointermove', handlePointerMove)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [])

  return <div ref={glowRef} aria-hidden="true" className={styles.glow} />
}
