/** Element ids of the one-page sections targeted by in-page links: stable French slugs of the section topics, shared by the header and the sections. */
export const SECTION_IDS = {
  main: "main",
  offers: "services",
  method: "methode",
  agent: "assistant",
  thisSite: "coulisses",
  faq: "faq",
  booking: "reservation",
} as const

/**
 * Element id of the hero's primary call to action. The hero (#10) must render it on that CTA so the
 * header can reveal its own CTA once the hero one has scrolled out of view.
 */
export const HERO_CTA_ID = "hero-cta"

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS]

/**
 * Scrolls to a section by updating the URL fragment, which lets the browser apply the page's
 * `scroll-padding-top` and `scroll-behavior` and keeps the address bar in sync.
 */
export const goToSection = (id: SectionId): void => {
  window.location.hash = id
}
