import { contact } from '@/locales/fr/contact'
import { ASSISTANT_NAME, chatbot } from '@/locales/fr/chatbot'
import styles from './styles/Agent.module.css'

/** Placeholders the locale copy uses where a link belongs, and the target each one renders. */
const CONTACT_LINK_PLACEHOLDER = '{contactPageLink}'
const PRIVACY_POLICY_PLACEHOLDER = '{privacyPolicyLink}'

/**
 * Fills the assistant name in one message.
 *
 * Model answers are data, not locale templates: an unknown `{placeholder}` in a model answer must
 * render as written instead of throwing, so only the known placeholders are treated as links.
 */
const fillAssistantName = (text: string): string => text.replaceAll('{assistantName}', ASSISTANT_NAME)

/** Splits a template on its link placeholders, so each link keeps the words the copy placed in it. */
const splitOnPlaceholders = (text: string): readonly string[] =>
  text.split(new RegExp(`(${CONTACT_LINK_PLACEHOLDER}|${PRIVACY_POLICY_PLACEHOLDER})`))

/** Props of {@link AgentMessageText}. */
export type AgentMessageTextProps = {
  /** Message text: a locale template for site copy, plain text for a model answer. */
  template: string
  /** Visible label of the contact-page link, chosen by the copy that owns the placeholder. */
  contactLinkLabel?: string
  /** Visible label of the privacy-policy link, chosen by the copy that owns the placeholder. */
  privacyPolicyLinkLabel?: string
}

/**
 * Renders one message, turning its link placeholders into real links.
 *
 * Everything is rendered as text: a model answer never becomes HTML. `{contactPageLink}` targets the
 * contact page from `locales/fr/contact.ts` and `{privacyPolicyLink}` the privacy policy from
 * `locales/fr/chatbot.ts`; each label comes from the calling copy, so the words a sentence places
 * inside a link are the words a visitor reads. A placeholder a caller does not fill renders as the
 * locale writes it, never as an empty link.
 */
export const AgentMessageText = ({
  template,
  contactLinkLabel = contact.link.label,
  privacyPolicyLinkLabel = chatbot.consent.link.inlineLabel,
}: AgentMessageTextProps) => (
  <>
    {splitOnPlaceholders(fillAssistantName(template)).map((segment, index) => {
      if (segment === CONTACT_LINK_PLACEHOLDER) {
        return (
          <a key={index} className={styles.messageLink} href={contact.link.href}>
            {contactLinkLabel}
          </a>
        )
      }
      if (segment === PRIVACY_POLICY_PLACEHOLDER) {
        return (
          <a key={index} className={styles.messageLink} href={chatbot.consent.link.href}>
            {privacyPolicyLinkLabel}
          </a>
        )
      }
      return segment
    })}
  </>
)
