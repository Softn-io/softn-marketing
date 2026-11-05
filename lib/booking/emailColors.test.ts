import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMAIL_SIGNATURE_LINK_COLOR, EMAIL_SIGNATURE_TEXT_COLOR } from './emailColors'

/** Package that holds the single source of every Softn token. */
const TOKENS_ROOT = join(process.cwd(), 'node_modules', '@softnio-labs', 'tokens')

/**
 * Reads one `oklch(L C H)` value out of a stylesheet.
 *
 * @param css Stylesheet as it is published.
 * @param property Custom property to read, without its leading dashes.
 * @returns Lightness, chroma and hue, or `null` when the property is absent or unreadable.
 */
const oklchOf = (css: string, property: string): readonly [number, number, number] | null => {
  const found = new RegExp(`--${property}:\\s*oklch\\(([^)]+)\\)`).exec(css)
  const [lightness, chroma, hue] = (found?.[1] ?? '').trim().split(/\s+/).map(Number)
  if (lightness === undefined || chroma === undefined || hue === undefined) return null
  if (![lightness, chroma, hue].every((value) => Number.isFinite(value))) return null

  return [lightness, chroma, hue]
}

/** sRGB transfer function: linear value to gamma-encoded value. */
const gamma = (value: number): number => (value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055)

/**
 * sRGB hex of one `oklch` colour.
 *
 * The published tokens are `oklch`, emails read neither `oklch` nor custom properties, so the value
 * is converted the way the CSS Color 4 specification defines it: OKLCH to OKLab, OKLab to linear
 * sRGB with Björn Ottosson's matrices, then the gamma transfer function, clamped to the sRGB gamut
 * and rounded to one byte per channel.
 *
 * @param value Lightness, chroma and hue of the colour.
 * @returns The colour as `#rrggbb`, lowercase.
 */
const hexOf = ([lightness, chroma, hue]: readonly [number, number, number]): string => {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)

  const long = lightness + 0.3963377774 * a + 0.2158037573 * b
  const medium = lightness - 0.1055613458 * a - 0.0638541728 * b
  const short = lightness - 0.0894841775 * a - 1.291485548 * b

  const l = long ** 3
  const m = medium ** 3
  const s = short ** 3

  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]

  return `#${channels
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, gamma(channel))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

describe('email colours', () => {
  const colorsCss = readFileSync(join(TOKENS_ROOT, 'core', 'colors.css'), 'utf8')
  const lightCss = readFileSync(join(TOKENS_ROOT, 'themes', 'light.css'), 'utf8')

  it('inlines the grey of the text-tertiary light token', () => {
    const grey = oklchOf(colorsCss, 'softn-color-text-tertiary-light')

    expect(grey).not.toBeNull()
    expect(hexOf(grey ?? [0, 0, 0])).toBe(EMAIL_SIGNATURE_TEXT_COLOR)
  })

  it('inlines the violet of the brand-vivid token, which the light theme maps to violet500', () => {
    const vivid = oklchOf(colorsCss, 'softn-color-violet500')

    expect(vivid).not.toBeNull()
    expect(hexOf(vivid ?? [0, 0, 0])).toBe(EMAIL_SIGNATURE_LINK_COLOR)
    expect(lightCss).toContain('--softn-brand-vivid: var(--softn-color-violet500)')
  })

  it('refuses a token the stylesheet does not carry', () => {
    expect(oklchOf(colorsCss, 'softn-color-does-not-exist')).toBeNull()
    expect(oklchOf('--softn-color-broken: oklch(0.5 0.2);', 'softn-color-broken')).toBeNull()
  })
})
