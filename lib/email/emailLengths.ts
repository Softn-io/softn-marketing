/*
 * Lengths the HTML parts of the service emails inline.
 *
 * An email cannot read a CSS variable, so the lengths the emails need are written here as CSS
 * lengths. The JSDoc names the token each one copies, and `lib/email/emailLengths.test.ts` recomputes
 * it from `node_modules/@softnio-labs/tokens` on every run: that test fails the day a token moves,
 * which is what keeps these copies honest.
 */

/**
 * Padding of a quoted message, the `--softn-space-3` and `--softn-space-4` tokens
 * (`@softnio-labs/tokens/core/spacing.css`, `0.75rem` and `1rem`).
 */
export const EMAIL_QUOTE_PADDING = '12px 16px'

/**
 * Left border of a quoted message. No token carries this width: it is the weight the design gives a
 * quote, kept here beside the other lengths so it is reviewed with them.
 */
export const EMAIL_QUOTE_BORDER_WIDTH = '3px'

/** Corner radius of a quoted message, the `--softn-radius-sm` token (`core/radius.css`, `0.5rem`). */
export const EMAIL_QUOTE_RADIUS = '8px'

/**
 * Font size of the email footer, the `--softn-font-size-caption` token
 * (`@softnio-labs/tokens/core/typography.css`, `0.6875rem`), the smallest step of the type scale. Only
 * the size is copied: the weight and the letter spacing of that step dress the site's labels, not a
 * paragraph of a mail.
 */
export const EMAIL_FOOTER_FONT_SIZE = '11px'
