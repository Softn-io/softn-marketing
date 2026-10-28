import { contact } from '@/locales/fr/contact'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import styles from './styles/Agent.module.css'

/** Placeholder the locale copy uses where the contact-page link belongs. */
const CONTACT_LINK_PLACEHOLDER = '{contactPageLink}'

/**
 * Fills the assistant name in one message.
 *
 * Model answers are data, not locale templates: an unknown `{placeholder}` in a model answer must
 * render as written instead of throwing, so only the known placeholder is replaced.
 */
const fillAssistantName = (text: string): string => text.replaceAll('{assistantName}', ASSISTANT_NAME)

/** Props of {@link AgentMessageText}. */
export type AgentMessageTextProps = {
  /** Message text: a locale template for site copy, plain text for a model answer. */
  template: string
  /** Visible label of the contact-page link, chosen by the copy that owns the placeholder. */
  contactLinkLabel?: string
}

/**
 * Renders one message, turning the `{contactPageLink}` placeholder into the contact-page link.
 *
 * Everything is rendered as text: a model answer never becomes HTML. The link target comes from
 * `locales/fr/contact.ts`, and its label from the calling copy: the fallback and unavailable-answer
 * strings set the words inside their sentence, while the default is the shared contact-page label.
 */
export const AgentMessageText = ({ template, contactLinkLabel = contact.link.label }: AgentMessageTextProps) => {
  const segments = fillAssistantName(template).split(CONTACT_LINK_PLACEHOLDER)
  const [first = '', ...rest] = segments

  if (rest.length === 0) return <>{first}</>

  return (
    <>
      {first}
      {rest.map((segment, index) => (
        <span key={index}>
          <a className={styles.messageLink} href={contact.link.href}>
            {contactLinkLabel}
          </a>
          {segment}
        </span>
      ))}
    </>
  )
}
