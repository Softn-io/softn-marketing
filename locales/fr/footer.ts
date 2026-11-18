/**
 * Footer copy. `{year}` is computed parameters, never hardcoded.
 *
 * The cookie-settings link is absent on purpose: it reopens the consent banner, which does not exist
 * yet, so the key lands with the banner rather than pointing visitors at nothing.
 */
export const footer = {
  copyright: '© {year} softn.io. Tous droits réservés.',
  legal: {
    contact: 'Contact',
    mentions: 'Mentions légales',
    privacy: 'Politique de confidentialité',
    cookies: 'Politique de cookies',
  },
  nav: {
    ariaLabel: 'Liens du pied de page',
  },
} as const

export type Footer = typeof footer
