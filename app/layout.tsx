import type { Metadata } from 'next'
import { JsonLd } from '@components/layout/JsonLd'
import { plusJakartaSans, zalandoSans } from './fonts'
import { metadataContent } from '@/locales/fr/metadata'
import { SITE_URL } from '@/lib/site'
import { themeInitScript } from '@/lib/theme'
import './globals.css'

const { home } = metadataContent

/**
 * Default metadata for every route. Deliberately no `alternates.canonical` and no `openGraph.url`:
 * a page that does not set its own would otherwise declare `/` as canonical. Each indexable page
 * sets its own canonical URL.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: home.title,
  description: home.description,
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    title: home.openGraph.title,
    description: home.openGraph.description,
    locale: home.openGraph.locale,
  },
}

/** Root layout: French document shell, self-hosted fonts, theme init and the site-wide JSON-LD. */
const RootLayout = ({ children }: LayoutProps<'/'>) => {
  return (
    <html
      lang="fr"
      className={`${plusJakartaSans.variable} ${zalandoSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <JsonLd />
        {children}
      </body>
    </html>
  )
}

export default RootLayout
