import type { Metadata } from 'next'
import { ComingSoon } from '@components/sections/ComingSoon'
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

/** Home page: the coming-soon screen and its e-mail waitlist. */
const Home = () => {
  return <ComingSoon />
}

export default Home
