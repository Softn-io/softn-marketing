import type { Metadata } from 'next'

/**
 * Robots directives of the three legal pages, shared by their routes: `index, nofollow`.
 *
 * `index`: a visitor looking for the legal notice, the privacy policy or the cookie policy finds it
 * in search results. `nofollow`: their links carry no ranking signal, and nothing on those pages
 * needs crawling depth. The routes stay in `app/sitemap.ts` and `app/robots.ts` allows them, so a
 * crawler can read this directive.
 */
export const LEGAL_PAGE_ROBOTS: Metadata['robots'] = { index: true, follow: false }
