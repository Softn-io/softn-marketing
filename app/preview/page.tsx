import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Header } from '@components/layout/Header'
import { Hero } from '@components/sections/Hero'
import { Offers } from '@components/sections/Offers'
import { SECTION_IDS } from '@/lib/anchors'
import { isPreviewRouteEnabled } from '@/lib/preview'
import { metadataContent } from '@/locales/fr/metadata'

const { preview } = metadataContent

/**
 * Preview metadata: hidden from search engines and without a canonical URL, so the temporary full
 * one-page render never competes with the coming-soon home page.
 */
export const metadata: Metadata = {
  title: preview.title,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
}

/**
 * Development preview of the full one-page site: header, hero and offers, exactly as the home page
 * rendered before the coming-soon launch screen. The gate is evaluated per request, after
 * `connection()` stops prerendering, so a build made with the flag never bakes the preview in;
 * without the flag at runtime the route answers with the 404 page.
 */
const Preview = async () => {
  await connection()

  if (!isPreviewRouteEnabled()) {
    notFound()
  }

  return (
    <>
      <Header />
      <main id={SECTION_IDS.main} className="flex flex-1 flex-col bg-base text-foreground">
        <Hero />
        <Offers />
      </main>
    </>
  )
}

export default Preview
