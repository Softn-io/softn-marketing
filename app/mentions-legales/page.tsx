import type { Metadata } from 'next'
import { Footer } from '@components/layout/Footer'
import { MinimalHeader } from '@components/layout/MinimalHeader'
import { LegalPage, mentionsContent } from '@components/sections/LegalPage'
import { LEGAL_PAGE_ROBOTS } from '@/lib/legal/meta'
import { SITE_ROUTES } from '@/lib/routes'
import { metadataContent } from '@/locales/fr/metadata'

const { mentions } = metadataContent.legal

/**
 * Metadata of the legal notice page: its own title, description, canonical URL, and the `index,
 * nofollow` policy the three legal routes share (`lib/legal/meta.ts`).
 */
export const metadata: Metadata = {
  title: mentions.title,
  description: mentions.description,
  alternates: { canonical: SITE_ROUTES.legalNotice },
  robots: LEGAL_PAGE_ROBOTS,
}

/**
 * Legal notice page: the minimal chrome, the notice itself and the site footer.
 *
 * Server component with no data of its own: the copy comes from `locales/fr/legal.ts` through the
 * shared legal renderer, and the footer closes the page the way it does on every other route.
 *
 * @returns The page, its chrome and its footer.
 */
const MentionsLegales = () => {
  return (
    <>
      <MinimalHeader />
      <LegalPage {...mentionsContent} />
      <Footer />
    </>
  )
}

export default MentionsLegales
