import type { Metadata } from 'next'
import { Footer } from '@components/layout/Footer'
import { MinimalHeader } from '@components/layout/MinimalHeader'
import { LegalPage, privacyContent } from '@components/sections/LegalPage'
import { LEGAL_PAGE_ROBOTS } from '@/lib/legal/meta'
import { SITE_ROUTES } from '@/lib/routes'
import { metadataContent } from '@/locales/fr/metadata'

const { privacy } = metadataContent.legal

/**
 * Metadata of the privacy policy: its own title, description, canonical URL, and the `index,
 * nofollow` policy the three legal routes share (`lib/legal/meta.ts`).
 */
export const metadata: Metadata = {
  title: privacy.title,
  description: privacy.description,
  alternates: { canonical: SITE_ROUTES.privacyPolicy },
  robots: LEGAL_PAGE_ROBOTS,
}

/**
 * Privacy policy page: the minimal chrome, the policy and the site footer.
 *
 * Server component: the sections come from `locales/fr/legal.ts` through the shared legal renderer,
 * so this route only wires the copy and its metadata.
 *
 * @returns The page, its chrome and its footer.
 */
const PolitiqueDeConfidentialite = () => {
  return (
    <>
      <MinimalHeader />
      <LegalPage {...privacyContent} />
      <Footer />
    </>
  )
}

export default PolitiqueDeConfidentialite
