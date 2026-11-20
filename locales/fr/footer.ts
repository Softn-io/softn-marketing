/**
 * Footer copy. `{year}` is a computed parameter, never hardcoded.
 */
export const footer = {
  copyright: '© {year} softn.io. Tous droits réservés.',
  cookieSettings: 'Gérer mes cookies',
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
