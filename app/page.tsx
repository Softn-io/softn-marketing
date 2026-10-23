import type { Metadata } from 'next'
import { ComingSoon } from '@components/sections/ComingSoon'
import { SECTION_IDS } from '@/lib/anchors'
import { metadataContent } from '@/locales/fr/metadata'

const { comingSoon } = metadataContent

/** Coming-soon metadata: the only page indexed until the full site launches. */
export const metadata: Metadata = {
  title: comingSoon.title,
  description: comingSoon.description,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: '/',
    title: comingSoon.openGraph.title,
    description: comingSoon.openGraph.description,
    locale: comingSoon.openGraph.locale,
  },
}

/** Home page: a single-screen coming-soon message, centred in the viewport with no scroll. */
const Home = () => {
  return (
    <main id={SECTION_IDS.main} className="h-dvh overflow-hidden bg-base text-foreground">
      <ComingSoon />
    </main>
  )
}

export default Home
