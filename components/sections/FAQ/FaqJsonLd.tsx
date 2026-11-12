import { serializeJsonLd } from '@/lib/seo/serializeJsonLd'
import type { Faq } from '@/locales/fr/faq'

/**
 * One FAQ entry, with the locale's literal text widened to `string`: the serializer only reads
 * these two fields, and the keys stay the locale's own.
 */
type FaqJsonLdItem = { [Key in keyof Faq['items'][number]]: string }

type FaqJsonLdProps = {
  /** Questions and answers of the locale, in the order the section renders them. */
  items: readonly FaqJsonLdItem[]
}

/**
 * `FAQPage` structured data of the FAQ section, as one `application/ld+json` block: a `Question`
 * per locale item, each carrying the answer the visitor reads in the accordion, so the markup
 * never describes copy the page does not show.
 *
 * Server-rendered from the section itself, so it exists wherever the FAQ does and never on a page
 * without it. Only the schema keywords are written here; every string comes from the locale.
 *
 * The block is serialized by `serializeJsonLd`, which owns the escaping rule that keeps a value
 * from closing the script tag.
 */
export const FaqJsonLd = ({ items }: FaqJsonLdProps) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
}
