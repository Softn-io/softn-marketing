import type { Metadata } from 'next'
import { Footer } from '@components/layout/Footer'
import { MinimalHeader } from '@components/layout/MinimalHeader'
import { LegalPage, cookiesContent } from '@components/sections/LegalPage'
import { LEGAL_PAGE_ROBOTS } from '@/lib/legal/meta'
import { SITE_ROUTES } from '@/lib/routes'
import { metadataContent } from '@/locales/fr/metadata'

const { cookies } = metadataContent.legal

/**
 * Metadata of the cookie policy: its own title, description, canonical URL, and the `index, nofollow`
 * policy the three legal routes share (`lib/legal/meta.ts`).
 */
export const metadata: Metadata = {
  title: cookies.title,
  description: cookies.description,
  alternates: { canonical: SITE_ROUTES.cookiePolicy },
  robots: LEGAL_PAGE_ROBOTS,
}

/**
 * Cookie policy page: the minimal chrome, the policy and the site footer.
 *
 * Server component: the sections come from `locales/fr/legal.ts` through the shared legal renderer.
 * The banner's own consent machinery is a separate client island and does not live here.
 *
 * @returns The page, its chrome and its footer.
 */
const PolitiqueDeCookies = () => {
  return (
    <>
      <MinimalHeader />
      <LegalPage {...cookiesContent} />
      <Footer />
    </>
  )
}

export default PolitiqueDeCookies
