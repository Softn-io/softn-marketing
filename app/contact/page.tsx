import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactScreen } from '@components/forms/ContactForm'
import { Footer } from '@components/layout/Footer'
import { MinimalHeader } from '@components/layout/MinimalHeader'
import { contactRobots } from '@/lib/contact/meta'
import { interpolate } from '@/lib/interpolate'
import { SITE_ROUTES } from '@/lib/routes'
import { interpolateSegments } from '@/lib/text/interpolateSegments'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { contact } from '@/locales/fr/contact'
import styles from './Contact.module.css'

/**
 * Metadata of the contact page: its own title, description, canonical URL and robots directives.
 */
export const metadata: Metadata = {
  title: contact.meta.title,
  description: contact.meta.description,
  alternates: { canonical: SITE_ROUTES.contact },
  robots: contactRobots(contact.meta.robots),
}

/** Id of the anchor the skip link points at, and of the region that holds the form. */
const CONTACT_FORM_ID = 'contact-form'

/**
 * Contact page: the minimal chrome, the title and the form.
 *
 * The page is a server component and stays static: the anti-bot secret is read by the Route
 * Handlers, never here, so a build without it still renders the page and a deployment without it
 * fails closed at submission time. The pieces of the heading and the intro are rendered here — the
 * intro keeps its link to the assistant — and handed to the client screen, which replaces them with
 * the confirmation once the message is accepted. The site footer closes the page, as the footer of
 * the design bundle does.
 *
 * @returns The page, its chrome and its screen.
 */
const Contact = () => {
  const agentLabel = interpolate(contact.intro.agentLink.label, { assistantName: ASSISTANT_NAME })

  const intro = interpolateSegments(contact.intro.body, { agentLink: agentLabel }).map((segment, index) =>
    segment.kind === 'placeholder' ? (
      <Link key={index} href={contact.intro.agentLink.href} className={styles['agent-link']}>
        {segment.value}
      </Link>
    ) : (
      segment.value
    ),
  )

  return (
    <>
      <MinimalHeader />
      <main className={styles.main}>
        <div className={styles.content}>
          <a href={`#${CONTACT_FORM_ID}`} className={`${styles['skip-link']} text-body-sm`}>
            {contact.a11y.skipLink}
          </a>
          <noscript>
            <p className={styles.noscript}>{contact.fallback.noScript}</p>
          </noscript>
          <div id={CONTACT_FORM_ID} tabIndex={-1} className={styles['form-anchor']}>
            <ContactScreen eyebrow={contact.eyebrow} title={contact.title} intro={intro} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

export default Contact
