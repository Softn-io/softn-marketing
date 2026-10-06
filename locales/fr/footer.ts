/** Footer copy. `{year}` is a computed parameter, never hardcoded. */
export const footer = {
  copyright: "© {year} softn.io. Tous droits réservés.",
  legal: {
    contact: "Contact",
    mentions: "Mentions légales",
    privacy: "Politique de confidentialité",
    cookies: "Politique de cookies",
  },
  cookieSettings: "Gérer mes cookies",
  nav: {
    ariaLabel: "Liens du pied de page",
  },
  contactLine:
    "Une question ? {assistantName}, l'assistant virtuel du site, vous répond et vous aide à réserver votre échange Spark.",
} as const

export type Footer = typeof footer
