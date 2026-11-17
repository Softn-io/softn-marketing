import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EMAIL_FOOTER_FONT_SIZE,
  EMAIL_QUOTE_BORDER_WIDTH,
  EMAIL_QUOTE_PADDING,
  EMAIL_QUOTE_RADIUS,
} from './emailLengths'

/** Package that holds the single source of every Softn token. */
const TOKENS_ROOT = join(process.cwd(), 'node_modules', '@softnio-labs', 'tokens')

/** Root font size the published `rem` lengths resolve against, in pixels. */
const ROOT_FONT_SIZE = 16

/**
 * Reads one `rem` value out of a stylesheet, in pixels.
 *
 * @param css Stylesheet as it is published.
 * @param property Custom property to read, without its leading dashes.
 * @returns The length in pixels, or `null` when the property is absent or unreadable.
 */
const remOf = (css: string, property: string): number | null => {
  const found = new RegExp(`--${property}:\\s*([\\d.]+)rem`).exec(css)
  const value = Number(found?.[1])
  return Number.isFinite(value) ? value * ROOT_FONT_SIZE : null
}

describe('email lengths', () => {
  const spacingCss = readFileSync(join(TOKENS_ROOT, 'core', 'spacing.css'), 'utf8')
  const radiusCss = readFileSync(join(TOKENS_ROOT, 'core', 'radius.css'), 'utf8')
  const typographyCss = readFileSync(join(TOKENS_ROOT, 'core', 'typography.css'), 'utf8')

  it('inlines the padding of the space-3 and space-4 tokens', () => {
    expect(remOf(spacingCss, 'softn-space-3')).toBe(12)
    expect(remOf(spacingCss, 'softn-space-4')).toBe(16)
    expect(EMAIL_QUOTE_PADDING).toBe('12px 16px')
  })

  it('inlines the radius of the radius-sm token', () => {
    expect(remOf(radiusCss, 'softn-radius-sm')).toBe(8)
    expect(EMAIL_QUOTE_RADIUS).toBe('8px')
  })

  it('carries the quote edge as a width of its own, since no token holds one', () => {
    expect(EMAIL_QUOTE_BORDER_WIDTH).toBe('3px')
    expect(spacingCss).not.toContain('--softn-border-width')
    expect(radiusCss).not.toContain('--softn-border-width')
  })

  it('inlines the smallest step of the type scale for the footer', () => {
    const steps = [...typographyCss.matchAll(/--softn-font-size-[\w-]+:\s*([\d.]+)rem;/g)].map(
      (match) => Number(match[1]) * ROOT_FONT_SIZE,
    )

    expect(remOf(typographyCss, 'softn-font-size-caption')).toBe(11)
    expect(steps.length).toBeGreaterThan(1)
    expect(Math.min(...steps)).toBe(11)
    expect(EMAIL_FOOTER_FONT_SIZE).toBe('11px')
  })

  it('refuses a token the stylesheet does not carry', () => {
    expect(remOf(spacingCss, 'softn-space-does-not-exist')).toBeNull()
  })
})
