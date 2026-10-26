import { SITE_URL } from '@/lib/site'
import { metadataContent } from '@/locales/fr/metadata'

const { professionalService } = metadataContent.structuredData

/**
 * Site-wide JSON-LD describing the studio as a brand-only `ProfessionalService`: no person,
 * address, phone, e-mail, opening hours, reviews or ratings. Every French string comes from
 * `locales/fr/metadata.ts`; only the schema keywords and the site URL are defined here.
 *
 * The serialized JSON escapes `<` as `\u003c`, so a value can never close the script tag.
 */
export const JsonLd = () => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: professionalService.name,
    url: SITE_URL,
    description: professionalService.description,
    areaServed: professionalService.areaServed,
    serviceType: professionalService.serviceType,
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
    />
  )
}
