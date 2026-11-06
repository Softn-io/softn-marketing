/**
 * True when the visitor asked the system for less motion.
 *
 * Reading the preference needs a browser: outside one (server render, tests without a `matchMedia`
 * stub) motion stays on, and a guard replaces the media query rather than throwing.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
