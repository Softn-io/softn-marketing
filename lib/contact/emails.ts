/*
 * Contact emails sent by Softn.io: the notification Mel reads, and the automatic reply the visitor
 * receives.
 *
 * Both are sent through the Gmail API as the Workspace alias of `lib/site.ts`, and both are built
 * from `locales/fr/contactEmails.ts` with named parameters: no sentence is composed here, and the
 * signature is the one `bookingEmails.signature` already carries. The plain-text part prints each
 * link as its label followed by the raw address, while the HTML part renders the same address behind
 * that label, which is why the two alternatives are filled with different values from one template.
 * The HTML part quotes the message the visitor wrote (a blockquote per paragraph of it) and bolds
 * the labels each body carries: the answers of the notification, and the subject the auto-reply
 * repeats, so Mel and the visitor both read the shape of the message at a glance.
 *
 * The notification is addressed to the owner's mailbox with the visitor's address as `Reply-To`, so
 * answering it writes back to the visitor. A failure never reaches the visitor: the caller logs the
 * non-personal code returned here, and the message itself is already stored in Baserow.
 */

import { htmlBody, mimeMessage, type HtmlLink } from '@/lib/email/mime'
import { readEnv } from '@/lib/env'
import { sendGmailMessage, type GmailFailure } from '@/lib/google/gmail'
import { interpolate } from '@/lib/interpolate'
import { CONTACT_SENDER_EMAIL, SITE_URL } from '@/lib/site'
import { bookingEmails } from '@/locales/fr/bookingEmails'
import { contact } from '@/locales/fr/contact'
import { contactEmails } from '@/locales/fr/contactEmails'
import type { ContactSubject } from '@/schemas/contactLimits'
import { formatContactReceivedAt } from './labels'
import type { ContactLead } from './lead'
import { CONTACT_SUBJECT_LABELS } from './subjects'

/** Absolute address of the assistant section, the one the auto-reply offers to open. */
const contactAgentLink = (): string => `${SITE_URL}${contact.intro.agentLink.href}`

/** Absolute address of the privacy policy, the one both emails point at. */
const contactPrivacyLink = (): string => `${SITE_URL}${contact.consent.privacyLink.href}`

/** Absolute address of the contact page, the one the auto-reply footer points at. */
const contactPageLink = (): string => `${SITE_URL}${contact.link.href}`

/** Subject and both bodies of one email, ready to be written into a message. */
export type ContactEmailContent = {
  readonly subject: string
  readonly text: string
  readonly html: string
}

/** Outcome of one contact email: sent, or why it could not be, ready to be logged. */
export type ContactEmailOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false
      /** Stage and non-personal code of the failure; never a name, an address or a body. */
      readonly detail: string
    }

/**
 * Stage and code of a failed Gmail call, in the shape the booking routes already log.
 *
 * The step of the credential chain comes first when one failed — the send walks the same keyless
 * chain as the calendar — and the name of the call otherwise; the code, the upstream status and
 * Google's machine-readable reason follow. Never an upstream body beyond that reason token, nor a
 * name, an address or a body.
 */
const failureDetail = (call: string, failure: GmailFailure): string =>
  `${failure.step ?? call} ${failure.error}${failure.status === undefined ? '' : ` status=${failure.status}`}${
    failure.reason === undefined ? '' : ` reason=${failure.reason}`
  }`

/**
 * Quotes one visitor message for the plain-text part, one `>` per line.
 *
 * The HTML part renders the same message as a blockquote instead: the two alternatives differ only
 * in the markup a mail client reads, never in what the visitor wrote.
 *
 * @param message Message as the visitor wrote it.
 * @returns The message, every line prefixed for a quoted reply.
 */
const quoteForText = (message: string): string =>
  message
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')

/**
 * Blocks of one visitor message, as the HTML body splits them.
 *
 * A message may carry blank lines of its own: each of its blocks becomes its own quote, and every
 * one of them is escaped like any other value.
 *
 * @param message Message as the visitor wrote it.
 * @returns The blocks of the message, in order.
 */
const quotedBlocksOf = (message: string): readonly string[] => message.split(/\n{2,}/)

/** One `{name}` placeholder of a copy line. */
const PLACEHOLDER_PATTERN = /\{\w+\}/g

/** Longest label this module bolds, in characters: a sentence that ends on a colon is not a label. */
const LABEL_MAX_LENGTH = 24

/**
 * The label a line carries, or `null` when the line is not one: `Nom : {firstName}`, `Message :`.
 *
 * What is left of the line once its placeholders are taken out is the label, and nothing else: a
 * sentence that happens to end on a colon and carry a link is not one, however it is worded.
 */
const labelOfLine = (line: string): string | null => {
  const withoutValues = line.replace(PLACEHOLDER_PATTERN, '').trim()
  if (withoutValues === '' || !withoutValues.endsWith(':')) return null
  if (withoutValues.length > LABEL_MAX_LENGTH) return null

  return withoutValues
}

/**
 * Labels a body writes on their own line, read from the copy itself.
 *
 * Taking them from the body keeps the wording in one place — nothing is written twice — and the
 * renderer bolds exactly those, never a line the visitor wrote.
 *
 * @param body Body of an email, as the locale writes it.
 * @returns The labels, in the order the body carries them.
 */
const templateLabels = (body: string): readonly string[] =>
  body
    .split('\n')
    .map(labelOfLine)
    .filter((label): label is string => label !== null)

/**
 * Notification email Mel reads: subject and both bodies, or `null` when a value is missing.
 *
 * The body carries the answers as labelled lines and the message as its own block, so its line
 * breaks survive; the personal-data request notice is prepended, on its own paragraph, when the
 * visitor picked that subject.
 *
 * @param input Message, its subject and the instant it arrived at.
 * @returns The content to send, or `null` when the instant cannot be read.
 */
export const notificationEmailContent = (
  input: ContactLead & {
    /** Instant the message was received at. */
    readonly receivedAt: Date
  },
): ContactEmailContent | null => {
  const receivedAtLabel = formatContactReceivedAt(input.receivedAt)
  if (receivedAtLabel === '') return null

  const values = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    subjectLabel: CONTACT_SUBJECT_LABELS[input.subject],
    message: input.message,
    receivedAt: receivedAtLabel,
  }
  // The message travels quoted, line by line, like the auto-reply does: in a text-only client a raw
  // line could otherwise read as one of the labelled answers of this very email.
  const body = interpolate(contactEmails.notification.body, {
    ...values,
    message: quoteForText(input.message),
  })
  const text = input.subject === 'dataRequest' ? `${contactEmails.notification.dataRequestNotice}\n\n${body}` : body

  return {
    subject: interpolate(contactEmails.notification.subject, values),
    text,
    html: htmlBody({
      text,
      links: [],
      preheader: contactEmails.notification.preheader,
      // The notification closes on no signature block: an empty one matches no block.
      signature: '',
      // Every labelled answer is bolded, so Mel reads the shape of the message at a glance, and the
      // words of the visitor stay plain: their own lines never read as one of those labels.
      boldLabels: templateLabels(contactEmails.notification.body),
      plain: quotedBlocksOf(input.message),
    }),
  }
}

/**
 * Automatic reply sent to the visitor: subject and both bodies, or `null` when a value is missing.
 *
 * The message the visitor wrote is quoted, and the two links the copy carries are rendered as
 * `label (address)` in the plain-text part and as anchors in the HTML part. The signature is
 * `bookingEmails.signature`, filled into the `{signature}` placeholder, so the HTML part styles and
 * links the same three lines as the booking emails.
 *
 * @param input Visitor's first name, the subject picked and the message to quote.
 * @returns The content to send, or `null` when the signature cannot be rendered.
 */
export const autoReplyEmailContent = (input: {
  /** Visitor's first name, the one the copy greets. */
  readonly firstName: string
  /** Subject the visitor picked. */
  readonly subject: ContactSubject
  /** Message as the visitor wrote it, quoted back in both alternatives. */
  readonly message: string
}): ContactEmailContent | null => {
  const signature = bookingEmails.signature
  if (signature.trim() === '') return null

  const { agentLinkLabel, privacyLinkLabel, siteLinkLabel, contactLinkLabel } = contactEmails.autoReply
  const agentLink = contactAgentLink()
  const privacyLink = contactPrivacyLink()
  const siteLink = SITE_URL
  const contactLink = contactPageLink()
  const values = {
    firstName: input.firstName,
    subjectLabel: CONTACT_SUBJECT_LABELS[input.subject],
    message: input.message,
    signature,
  }
  const text = interpolate(contactEmails.autoReply.body, {
    ...values,
    message: quoteForText(input.message),
    agentLink: `${agentLinkLabel} (${agentLink})`,
    privacyLink: `${privacyLinkLabel} (${privacyLink})`,
    siteLink: `${siteLinkLabel} (${siteLink})`,
    contactLink: `${contactLinkLabel} (${contactLink})`,
  })
  const links: readonly HtmlLink[] = [
    { url: agentLink, label: agentLinkLabel },
    { url: privacyLink, label: privacyLinkLabel },
    { url: siteLink, label: siteLinkLabel },
    { url: contactLink, label: contactLinkLabel },
  ]

  return {
    subject: contactEmails.autoReply.subject,
    text,
    html: htmlBody({
      text: interpolate(contactEmails.autoReply.body, {
        ...values,
        agentLink,
        privacyLink,
        siteLink,
        contactLink,
      }),
      links,
      preheader: contactEmails.autoReply.preheader,
      signature,
      // The message the visitor wrote is quoted, its own blank lines included: a quoted block is
      // never bolded, so no line of it can read as one of the labels below.
      quoted: quotedBlocksOf(input.message),
      // The reminder bolds the label of the subject it repeats.
      boldLabels: templateLabels(contactEmails.autoReply.body),
    }),
  }
}

/** One composed email, as the shared send path below takes it. */
type ComposedContactEmail = {
  readonly to: string
  readonly replyTo: string
  readonly subject: string
  readonly text: string
  readonly html: string
  readonly sentAt: Date
  readonly subjectToken: string | undefined
}

/**
 * Sends one composed email from the contact alias, and maps a failure to a loggable code.
 *
 * The display name is the one the copy validates for the sender (`Softn.io`), for both emails: the
 * notification is a message from the studio too, and a visitor reading it should see the brand.
 */
const sendComposedContactEmail = async ({
  to,
  replyTo,
  subject,
  text,
  html,
  sentAt,
  subjectToken,
}: ComposedContactEmail): Promise<ContactEmailOutcome> => {
  try {
    const message = mimeMessage({
      from: { name: contactEmails.autoReply.senderName, address: CONTACT_SENDER_EMAIL },
      replyTo,
      to,
      sentAt,
      subject,
      text,
      html,
    })

    const sent = await sendGmailMessage({ message, subjectToken })
    return sent.ok ? { ok: true } : { ok: false, detail: failureDetail('gmail', sent) }
  } catch {
    return { ok: false, detail: 'compose failed' }
  }
}

/** Arguments shared by the two senders below. */
type ContactEmailInput = {
  /** Validated message the email is about. */
  readonly lead: ContactLead
  /** Subject token of the current request, from `readSubjectToken`. */
  readonly subjectToken: string | undefined
  /** Instant the message is written at. Defaults to now; a test passes its own clock. */
  readonly sentAt?: Date
}

/**
 * Sends the notification to the owner's mailbox, with the visitor's address as `Reply-To`.
 *
 * A deployment without `GOOGLE_CALENDAR_OWNER` has no recipient: the call answers a code instead of
 * sending anywhere, and the caller logs it without failing the submission.
 *
 * @param input Message, the instant it arrived at and the subject token of the request.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendContactNotificationEmail = async (
  input: ContactEmailInput & { readonly receivedAt: Date },
): Promise<ContactEmailOutcome> => {
  let owner: string | undefined
  try {
    owner = readEnv().GOOGLE_CALENDAR_OWNER
  } catch {
    owner = undefined
  }
  if (owner === undefined) return { ok: false, detail: 'compose recipient-missing' }

  const content = notificationEmailContent({ ...input.lead, receivedAt: input.receivedAt })
  if (content === null) return { ok: false, detail: 'compose received-at-unreadable' }

  return sendComposedContactEmail({
    to: owner,
    replyTo: input.lead.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    sentAt: input.sentAt ?? new Date(),
    subjectToken: input.subjectToken,
  })
}

/**
 * Sends the automatic reply to the visitor, with the contact alias as `Reply-To`.
 *
 * @param input Message the reply is about, and the subject token of the request.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendContactAutoReplyEmail = async (input: ContactEmailInput): Promise<ContactEmailOutcome> => {
  const content = autoReplyEmailContent({
    firstName: input.lead.firstName,
    subject: input.lead.subject,
    message: input.lead.message,
  })
  if (content === null) return { ok: false, detail: 'compose signature-missing' }

  return sendComposedContactEmail({
    to: input.lead.email,
    replyTo: CONTACT_SENDER_EMAIL,
    subject: content.subject,
    text: content.text,
    html: content.html,
    sentAt: input.sentAt ?? new Date(),
    subjectToken: input.subjectToken,
  })
}
