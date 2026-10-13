"use client"

import { useEffect, useState, type ReactNode } from "react"
import { HERO_CTA_ID } from "@/lib/anchors"
import styles from "./Header.module.css"

type ScrollRevealCtaProps = {
  children: ReactNode
  /** Layout classes (breakpoint visibility, alignment) for the wrapper. */
  className?: string
}

/**
 * Reveals its children once the hero call to action (`HERO_CTA_ID`) has scrolled out above the viewport,
 * so the page never shows two booking CTAs at once.
 *
 * Progressive enhancement: the server render and the no-JS page show the children. The hero element is
 * looked up once on mount; when it does not exist (or `IntersectionObserver` is unavailable) the
 * children simply stay visible.
 *
 * While hidden the wrapper is `inert` (not focusable, removed from the accessibility tree) and
 * `visibility: hidden` once its fade-out is done. It keeps its box in the layout, so the logo and
 * navigation never shift when the CTA appears.
 */
export const ScrollRevealCta = ({ children, className }: ScrollRevealCtaProps) => {
  const [isRevealed, setIsRevealed] = useState(true)

  useEffect(() => {
    const heroCta = document.getElementById(HERO_CTA_ID)
    if (heroCta === null || typeof IntersectionObserver === "undefined") return undefined

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
      className={[styles["scroll-reveal"], className].filter((value) => value !== undefined).join(" ")}
      data-state={isRevealed ? "visible" : "hidden"}
      inert={!isRevealed}
    >
      {children}
    </div>
  )
}
