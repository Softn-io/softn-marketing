'use client'

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { HERO_CTA_ID } from '@/lib/anchors'
import styles from './styles/Header.module.css'

type ScrollRevealCtaProps = {
  children: ReactNode
  /** Layout classes (breakpoint visibility, alignment) for the wrapper. */
  className?: string
}

/*
 * The client marker behind `inert` (see the JSDoc): a snapshot that is `false` on the server and `true` in
 * the browser, with nothing to subscribe to — the value never changes after hydration. Module scope, so
 * the identities stay stable across renders as `useSyncExternalStore` requires.
 */
const subscribeToNothing = (): (() => void) => () => {}
const getClientMarker = (): boolean => true
const getServerMarker = (): boolean => false

/**
 * Reveals its children once the hero call to action (`HERO_CTA_ID`) has scrolled out above the viewport,
 * so the page never shows two booking CTAs at once.
 *
 * Hidden is the initial state, in the server render and in the first client render alike: the wrapper
 * ships `data-state="hidden"` — and no `inert` — in the HTML, so nothing is ever painted at a position
 * the hydration would then take away (no flash), and both renders agree (no hydration mismatch). While
 * hidden it is also out of flow — see `scroll-reveal` in the stylesheet: it takes no space, which is what
 * leaves the theme toggle against the header's right edge.
 *
 * `visibility: hidden` (in the hidden rule) is the hiding mechanism: on its own it already takes the
 * wrapper out of the tab order, out of the accessibility tree and out of hit testing, and the hide is
 * instantaneous (`transition: opacity 0s, visibility 0s`), so no fade window ever leaves a half-visible
 * focusable CTA. `inert` is only belt and braces on top of it, and it is applied **client-side only**,
 * never in the server markup: no CSS can lift an attribute, so a server-rendered `inert` would keep the
 * CTA the stylesheet shows without JavaScript (`scripting` media feature) painted but unfocusable and
 * unclickable — a dead button, when that state exists precisely to keep it a plain `#reservation` link
 * (see `BookingCta`).
 *
 * `isScripted` is that client marker, and `useSyncExternalStore` is what makes it hydration-safe rather
 * than an effect that flips state after mount: its server snapshot is `false`, which is what the server
 * render and the hydration render both read — the wrapper carries no `inert` there, matching the served
 * HTML — and React swaps in the client snapshot (`true`) on its own right after hydration, without any
 * setState in an effect and without a cascading render. From that point on the hidden wrapper is inert as
 * well as invisible, and it stops being inert the moment the reveal lands (`!isRevealed`).
 *
 * The hero element is looked up once on mount, and the reveal is a CSS transition on the wrapper. The
 * fallback for a page (or a state) where the hero CTA does not exist — and for an environment without
 * `IntersectionObserver` — is to reveal the children after mount, on the frame that follows hydration,
 * so the booking call to action is never lost.
 * Without JavaScript the reveal never runs, so the stylesheet shows the CTA on its own (`scripting`
 * media feature), and reduced-motion users get the same appearance with the fade shortened.
 */
export const ScrollRevealCta = ({ children, className }: ScrollRevealCtaProps) => {
  const [isRevealed, setIsRevealed] = useState(false)
  const isScripted = useSyncExternalStore(subscribeToNothing, getClientMarker, getServerMarker)

  useEffect(() => {
    const heroCta = document.getElementById(HERO_CTA_ID)
    if (heroCta === null || typeof IntersectionObserver === 'undefined') {
      // Nothing to watch: reveal on the next frame. The deferral is deliberate — hidden is the state
      // the server and the first client render agree on (see the JSDoc), so the reveal can only
      // happen after hydration, and one frame keeps the header from reflowing inside the hydration
      // commit itself.
      const frame = window.requestAnimationFrame(() => setIsRevealed(true))
      return () => window.cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined) return
      // Below the viewport the hero CTA is not reached yet: only "scrolled past" reveals the header CTA.
      setIsRevealed(!entry.isIntersecting && entry.boundingClientRect.bottom < 0)
    })
    observer.observe(heroCta)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={[styles['scroll-reveal'], className].filter((value) => value !== undefined).join(' ')}
      data-state={isRevealed ? 'visible' : 'hidden'}
      inert={isScripted && !isRevealed}
    >
      {children}
    </div>
  )
}
