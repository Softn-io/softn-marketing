'use client'

/*
 * Contact screen: the client boundary that owns the page heading, its intro and the form state.
 *
 * The page stays a server component and renders the pieces it owns — the eyebrow, the title and the
 * intro with its link to the assistant — then hands them here. Once the message is accepted, this
 * island replaces the title and the intro with the confirmation copy, so the page keeps exactly one
 * `<h1>` in both states, drops the form and keeps the back link. The heading takes focus when it
 * appears, and the sent status is announced from the live region of this island, which outlives the
 * form it replaces.
 */

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { interpolateSegments } from '@/lib/text/interpolateSegments'
import { contact } from '@/locales/fr/contact'
import { ContactForm } from './ContactForm'
import styles from './styles/ContactScreen.module.css'

/** Props of {@link ContactScreen}: the pieces the page renders. */
type ContactScreenProps = {
  /** Eyebrow above the heading, from the copy. */
  readonly eyebrow: string
  /** Heading of the page while the form is shown, from the copy. */
  readonly title: string
  /** Intro paragraph with its link, rendered by the page. */
  readonly intro: ReactNode
}

/**
 * Heading, intro and form of the contact page, and the confirmation that replaces them.
 *
 * @param props The eyebrow, the heading and the intro the page renders.
 * @returns The screen, in the state the form decided.
 */
export const ContactScreen = ({ eyebrow, title, intro }: ContactScreenProps) => {
  // First name of the visitor once the message was accepted, or `null` while the form is shown.
  const [sentTo, setSentTo] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  const handleSent = useCallback((firstName: string): void => {
    setSentTo(firstName)
  }, [])

  // The heading that appears is the page's only `<h1>`, and it takes focus: a keyboard or screen
  // reader visitor lands on the confirmation instead of at the top of the document.
  useEffect(() => {
    if (sentTo === null) return
    headingRef.current?.focus()
  }, [sentTo])

  const successSegments = sentTo === null ? [] : interpolateSegments(contact.success.body, { firstName: sentTo })

  return (
    <div className={styles.screen} data-umami-block="contact">
      <p className="sr-only" role="status" aria-live="polite">
        {sentTo === null ? '' : contact.a11y.status.sent}
      </p>
      <div className={styles.header}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        {sentTo === null ? (
          <h1 className={styles.title}>{title}</h1>
        ) : (
          <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
            {contact.success.title}
          </h1>
        )}
        <p className={styles.intro}>
          {sentTo === null
            ? intro
            : successSegments.map((segment, index) =>
                segment.kind === 'placeholder' ? <strong key={index}>{segment.value}</strong> : segment.value,
              )}
        </p>
      </div>
      {sentTo === null ? (
        <ContactForm onSent={handleSent} />
      ) : (
        <Link href="/" className={styles['success-link']}>
          {contact.success.backLink}
        </Link>
      )}
    </div>
  )
}
