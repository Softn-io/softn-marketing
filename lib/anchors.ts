import { prefersReducedMotion } from '@/lib/motion'

/** Element ids of the one-page sections targeted by in-page links: stable French slugs of the section topics, shared by the header and the sections. */
export const SECTION_IDS = {
  main: 'main',
  offers: 'services',
  method: 'methode',
  agent: 'assistant',
  thisSite: 'coulisses',
  faq: 'faq',
  /** Final call to action, after the FAQ: not a header navigation entry, only a link target. */
  finalCta: 'appel',
} as const

/**
 * Element id of the hero's primary call to action. The hero (#10) must render it on that CTA so the
 * header can reveal its own CTA once the hero one has scrolled out of view.
 */
export const HERO_CTA_ID = 'hero-cta'

/**
 * Query key of the home page link that opens the reservation flow as it lands.
 *
 * A hash alone cannot carry that intent: `#assistant` is the target of the site's other calls to
 * action, which must not open the flow. The conversation island reads the key once and removes it
 * from the address bar, so a reload or a shared URL does not reopen the flow.
 */
export const BOOKING_OPEN_QUERY_KEY = 'rdv'

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS]

/**
 * Scrolls to a section by updating the URL fragment, which lets the browser apply the page's
 * `scroll-padding-top` and `scroll-behavior` and keeps the address bar in sync.
 *
 * When the fragment already names the target, changing it would be a no-op and the browser would
 * stay where it is: the section is scrolled into view explicitly instead, so a call to action always
 * reaches its section even while the hash already points there. That explicit scroll is smooth unless
 * the visitor asked for less motion.
 */
export const goToSection = (id: SectionId): void => {
  if (window.location.hash !== `#${id}`) {
    window.location.hash = id
    return
  }

  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}
