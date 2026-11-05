/*
 * Colours the HTML parts of the booking emails inline.
 *
 * An email cannot read a CSS variable and does not speak `oklch`, so the two token values the
 * signature needs are written here as sRGB hex, computed from the package's own `oklch` values. The
 * JSDoc names the source token, and `lib/booking/emailColors.test.ts` recomputes the conversion from
 * `node_modules/@softnio-labs/tokens` on every run: that test fails the day a token moves, which is
 * what keeps these copies honest.
 */

/**
 * Grey of the signature block, the hex of `--softn-color-text-tertiary-light`
 * (`oklch(0.4799 0.064 291.83)`, `@softnio-labs/tokens/core/colors.css`), the token the light theme
 * maps to `--softn-color-tertiary`.
 */
export const EMAIL_SIGNATURE_TEXT_COLOR = '#5e577f'

/**
 * Violet of the signature's site link, the hex of `--softn-brand-vivid` in the light theme, which
 * `@softnio-labs/tokens/themes/light.css` maps to `--softn-color-violet500`
 * (`oklch(0.6056 0.2189 292.72)`).
 */
export const EMAIL_SIGNATURE_LINK_COLOR = '#8b5cf6'
