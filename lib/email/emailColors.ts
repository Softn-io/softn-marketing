/*
 * Colours the HTML parts of the service emails inline.
 *
 * An email cannot read a CSS variable and does not speak `oklch`, so the token values the signature,
 * the quoted message and the footer need are written here as sRGB hex, computed from the package's own
 * `oklch` values. The JSDoc names the source token, and `lib/email/emailColors.test.ts` recomputes the
 * conversion from `node_modules/@softnio-labs/tokens` on every run: that test fails the day a token
 * moves, which is what keeps these copies honest.
 */

/**
 * Grey of the signature block, the hex of `--softn-color-text-tertiary-light`
 * (`oklch(0.4799 0.064 291.83)`, `@softnio-labs/tokens/core/colors.css`), the token the light theme
 * maps to `--softn-color-tertiary`.
 */
export const EMAIL_SIGNATURE_TEXT_COLOR = '#5e577f'

/**
 * Violet of every link the service emails carry — the site line of the signature, the links of the
 * footer and the anchors of the bodies — the hex of `--softn-brand-accent` in the light theme, which
 * `@softnio-labs/tokens/themes/light.css` maps to `--softn-color-violet600`
 * (`oklch(0.5413 0.2466 293.01)`, `@softnio-labs/tokens/core/colors.css`): the link colour the light
 * theme paints the site with, dark enough to stay legible at the small size of the footer and at the
 * body size of the other links (5.70:1 on the white of the email background).
 */
export const EMAIL_LINK_COLOR = '#7c3aed'

/**
 * Background of a quoted message, the hex of `--softn-color-surface-page-light`
 * (`oklch(0.9691 0.0161 293.76)`, `@softnio-labs/tokens/core/colors.css`), the light page surface the
 * light theme maps `--softn-background` to.
 *
 * A quote travels in a box of its own, so it carries its own background and its own text colour:
 * that is what keeps it readable in a mail client set to dark, where the surrounding message is
 * painted light on dark.
 */
export const EMAIL_QUOTE_BACKGROUND_COLOR = '#f5f3ff'

/**
 * Left border of a quoted message, the hex of `--softn-color-violet400`
 * (`oklch(0.709 0.1592 293.54)`, `@softnio-labs/tokens/core/colors.css`), the soft violet that marks
 * the quote without competing with the message around it.
 */
export const EMAIL_QUOTE_BORDER_COLOR = '#a78bfa'

/**
 * Text of a quoted message, the hex of `--softn-color-text-primary-light`
 * (`oklch(0.1589 0.0508 297.12)`, `@softnio-labs/tokens/core/colors.css`), the dark ink the light
 * theme maps `--softn-color` to, chosen against the background above rather than against the
 * client's own colours.
 */
export const EMAIL_QUOTE_TEXT_COLOR = '#100720'

/**
 * Grey of the email footer, the hex of `--softn-color-text-placeholder-light`
 * (`oklch(0.5034 0.068 292.31)`, `@softnio-labs/tokens/core/colors.css`), the lightest text token of
 * the light theme. It is the lightest grey that stays legible on the surface a mail client paints the
 * message on, the white of `--softn-color-surface-panel-light`: 6.04:1, above the 4.5:1 the
 * accessibility rules ask of text this size, and `emailColors.test.ts` recomputes both the hex and
 * that ratio from the package.
 */
export const EMAIL_FOOTER_TEXT_COLOR = '#655d88'
