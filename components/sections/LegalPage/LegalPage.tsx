import type { ReactNode } from 'react'
import Link from 'next/link'
import { SITE_ROUTES } from '@/lib/routes'
import { interpolateSegments } from '@/lib/text/interpolateSegments'
import { chatbot } from '@/locales/fr/chatbot'
import { contact } from '@/locales/fr/contact'
import type { LegalPageContent } from './data/legalSections'
import styles from './styles/LegalPage.module.css'

/** Placeholder the copy uses where the link to the contact page belongs. */
const CONTACT_LINK_PLACEHOLDER = 'contactPageLink'

/** Placeholder the copy uses for the contact form's subject of a data request. */
const DATA_REQUEST_SUBJECT_PLACEHOLDER = 'dataRequestSubject'

/**
 * Values the legal copy interpolates. The contact link keeps the inline label the assistant copy
 * uses for the same placeholder, so the words inside the sentence read the same everywhere; the
 * data-request subject is the exact wording of the contact form's own option.
 */
const PLACEHOLDER_VALUES: Readonly<Record<string, string>> = {
  [CONTACT_LINK_PLACEHOLDER]: chatbot.contactPageLinkLabel,
  [DATA_REQUEST_SUBJECT_PLACEHOLDER]: contact.form.subject.options.dataRequest,
}

/**
 * Renders one paragraph of a legal page, replacing its link placeholder with a real link.
 *
 * Nothing is concatenated here: the sentence stays one template from `locales/fr/legal.ts`, and only
 * the placeholder becomes an element. A placeholder the copy does not carry a value for throws
 * through `interpolateSegments`, so a missing parameter fails at test time instead of shipping.
 */
const renderParagraph = (template: string): ReactNode =>
  interpolateSegments(template, PLACEHOLDER_VALUES).map((segment) =>
    segment.kind === 'placeholder' && segment.name === CONTACT_LINK_PLACEHOLDER ? (
      <Link key={segment.name} href={SITE_ROUTES.contact} className={styles.link}>
        {segment.value}
      </Link>
    ) : (
      segment.value
    ),
  )

/**
 * One legal page: the title, the last-updated line, an optional intro and the sections of the
 * document, each with its own `h2`.
 *
 * Server component; the structure comes from `data/legalSections.ts`, so the three legal routes
 * share this renderer and each owns only its copy wiring. The heading hierarchy is fixed here — one
 * `h1`, then `h2` — and no level can be skipped.
 *
 * @param content Title, updated line, intro and sections of the page, from `locales/fr/legal.ts`.
 * @returns The main landmark of the legal page.
 */
export const LegalPage = ({ title, updated, intro, sections }: LegalPageContent) => {
  return (
    <main className={styles.main}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={`${styles.title} font-display text-display-md`}>{title}</h1>
          <p className={`${styles.updated} text-body-sm`}>{updated}</p>
        </header>
        {intro === undefined ? null : (
          <p className={`${styles.intro} text-body-md text-foreground-secondary`}>{intro}</p>
        )}
        {sections.map((section) => (
          <section key={section.title} className={styles.section}>
            <h2 className={`${styles['section-title']} font-display text-title-md`}>{section.title}</h2>
            {section.intro === undefined ? null : (
              <p className={`${styles.paragraph} text-body-md text-foreground-secondary`}>{section.intro}</p>
            )}
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className={`${styles.paragraph} text-body-md text-foreground-secondary`}>
                {renderParagraph(paragraph)}
              </p>
            ))}
          </section>
        ))}
      </div>
    </main>
  )
}
