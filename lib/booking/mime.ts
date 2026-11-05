/*
 * MIME message of a booking email, built by hand in RFC 5322 and MIME.
 *
 * The message carries the plain-text body of the copy exactly as it was validated, its minimal HTML
 * alternative (a hidden preview line, one `<p>` per paragraph, `<a>` for each link, and the
 * signature in the grey of its token with the studio line linked to the site) and the booking's
 * calendar file as an attachment. Both bodies travel base64-encoded, which keeps accents and long
 * lines inside the format whatever the mail client does — the same reason the calendar file is
 * encoded that way.
 *
 * Two rules hold here. A value that goes into a header can never carry a line break: a bare CR or
 * LF would start a new header, so a forged name or address could add a `Bcc`. And nothing of this
 * module is locale copy: the subject, the bodies and the attachment filename are handed in by the
 * caller, which reads them from `locales/fr/bookingEmails.ts`.
 */

import { randomUUID } from 'node:crypto'
import { SITE_URL } from '@/lib/site'
import { EMAIL_SIGNATURE_LINK_COLOR, EMAIL_SIGNATURE_TEXT_COLOR } from './emailColors'

/** Line ending of every line of the message, as RFC 5322 requires. */
const CRLF = '\r\n'

/** Widest header line this module writes; an encoded subject folds before crossing it. */
const HEADER_LINE_MAX_LENGTH = 76

/** Leading space of a folded continuation line of a header. */
const FOLDED_PREFIX = ' '

/** Longest encoded word RFC 2047 allows, wrapper included. */
const ENCODED_WORD_MAX_LENGTH = 75

/** Characters of a base64 encoded word's wrapper: `=?UTF-8?B?` and `?=`. */
const ENCODED_WORD_WRAPPER_LENGTH = 12

/** Octets of base64 per line of a body part, the usual width of a mail body. */
const BASE64_LINE_OCTETS = 76

/** Escapes of the five characters HTML reads, applied to every value of the HTML body. */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escapes one value so it stays text inside the HTML body. */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)

/**
 * Escapes one value for a header.
 *
 * A header value ends at its line break: an address or a name carrying a CR or an LF could add a
 * header of its own (a `Bcc`, a second `To`). Those characters are removed here, before any header
 * is written, so no value can open a new header.
 *
 * @param value Address, name or subject as it was typed or configured.
 * @returns The same value on a single line.
 */
const headerValue = (value: string): string => value.replace(/[\r\n\u0000]+/g, ' ').trim()

/** True when a value is printable ASCII, which is what a header may carry as-is. */
const isPrintableAscii = (value: string): boolean => /^[\u0020-\u007E]*$/.test(value)

/** One RFC 2047 base64 encoded word of a UTF-8 chunk. */
const encodedWord = (chunk: string): string => `=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`

/**
 * Splits one header value into encoded words, each within the RFC 2047 length limit.
 *
 * The split is made on characters, never inside one: a chunk of at most 45 UTF-8 octets encodes to
 * at most 60 base64 characters, which leaves room for the 12 characters of the wrapper.
 *
 * @param value Non-ASCII header value.
 * @returns The encoded words, in order.
 */
const encodedWords = (value: string): readonly string[] => {
  const words: string[] = []
  let chunk = ''

  for (const character of value) {
    const candidate = chunk + character
    const encodedLength = ENCODED_WORD_WRAPPER_LENGTH + 4 * Math.ceil(Buffer.byteLength(candidate, 'utf8') / 3)
    if (chunk !== '' && encodedLength > ENCODED_WORD_MAX_LENGTH) {
      words.push(encodedWord(chunk))
      chunk = character
      continue
    }

    chunk = candidate
  }

  words.push(encodedWord(chunk))
  return words
}

/**
 * The `Subject` header of a message.
 *
 * A subject that is printable ASCII travels as-is; anything else is encoded per RFC 2047, and the
 * encoded words are folded onto continuation lines with a leading space when they do not fit one
 * line. The header name is never folded away from its first word, so the value stays one header.
 *
 * @param subject Subject as the locale writes it.
 * @returns The header line, folded when needed.
 */
const subjectHeader = (subject: string): string => {
  const value = headerValue(subject)
  if (isPrintableAscii(value)) return `Subject: ${value}`

  const words = encodedWords(value)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line === '') {
      line = word
    } else if (line.length + 1 + word.length <= HEADER_LINE_MAX_LENGTH) {
      line += ` ${word}`
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)

  return `Subject: ${lines.join(`${CRLF}${FOLDED_PREFIX}`)}`
}

/** One address header, its value stripped of anything that could open a header of its own. */
const addressHeader = (name: string, value: string): string => `${name}: ${headerValue(value)}`

/**
 * Base64 of one part's content, wrapped in lines of the usual mail width.
 *
 * @param content Part content, as text.
 * @returns The base64, one line per {@link BASE64_LINE_OCTETS} octets.
 */
const base64Content = (content: string): string => {
  const encoded = Buffer.from(content, 'utf8').toString('base64')
  const lines: string[] = []
  for (let index = 0; index < encoded.length; index += BASE64_LINE_OCTETS) {
    lines.push(encoded.slice(index, index + BASE64_LINE_OCTETS))
  }

  return lines.join(CRLF)
}

/** One MIME part: its headers, an empty line, then its base64 content. */
const mimePart = (headers: readonly string[], content: string): string =>
  [...headers, '', base64Content(content)].join(CRLF)

/**
 * One link of an HTML body: the URL the copy shows, and the words the guest reads.
 *
 * A link whose label is the URL itself is the address the copy prints, as the Meet link is; a long
 * link carries the label the copy validated instead, like the manage link
 * (`bookingManage.calendarEvent.linkLabel`) and the rebooking link of the cancellation's HTML part
 * (`bookingEmails.cancellation.bookingLinkLabel`). Both are escaped, the `href` and the label alike.
 */
export type HtmlLink = {
  /** URL the anchor points at, matched in the body text. */
  readonly url: string
  /** Words of the anchor, the URL itself when the copy prints the address. */
  readonly label: string
}

/**
 * One line of the HTML body, with each link of the body turned into an anchor.
 *
 * Every other value is HTML-escaped, links included: the URL inside the `href` attribute and the
 * label the guest reads are escaped, so a typed answer can neither become markup nor a link. Links
 * are matched longest first, so a URL that starts with another one keeps its anchors.
 */
const htmlLine = (line: string, links: readonly HtmlLink[]): string => {
  const pending = links
    .filter((link) => link.url !== '')
    .map((link) => ({ ...link, length: link.url.length }))
    .sort((left, right) => right.length - left.length)
  let result = ''
  let rest = line

  while (rest !== '') {
    const matches = pending
      .map((link) => ({ link, index: rest.indexOf(link.url) }))
      .filter((match) => match.index !== -1)
      .sort((left, right) => left.index - right.index)
    const match = matches[0]
    if (match === undefined) {
      result += escapeHtml(rest)
      break
    }

    result += `${escapeHtml(rest.slice(0, match.index))}<a href="${escapeHtml(match.link.url)}">${escapeHtml(match.link.label)}</a>`
    rest = rest.slice(match.index + match.link.url.length)
  }

  return result
}

/**
 * Hidden preview line of one HTML body.
 *
 * A mail client shows the first readable lines of the HTML part next to the subject, before the
 * message is opened. The preheader is that preview, taken from the validated copy of the email:
 * hiding it removes it from the inbox listing while every text-only or screen-reader client that
 * ignores inline styles still reads it, which is why the line is worth having at all. The four
 * declarations keep it out of sight everywhere — `display:none` for most clients, `max-height:0`
 * and `overflow:hidden` for the ones that render it in the body block, `mso-hide:all` for Outlook —
 * and `aria-hidden` keeps it out of the speech of a screen reader, because the same words already
 * reach the guest in the body.
 *
 * @param preheader Preview text, parameters filled and escaped here.
 * @returns The hidden element, the first one of the HTML body.
 */
const htmlPreheader = (preheader: string): string =>
  `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all" aria-hidden="true">${escapeHtml(preheader)}</div>`

/** What one HTML alternative of a booking email carries. */
export type HtmlBodyInput = {
  /** Body as the locale writes it, its parameters filled. */
  readonly text: string
  /** URLs the body carries, each turned into an anchor where it appears. */
  readonly links: readonly HtmlLink[]
  /** Preview text of the email, parameters filled; hidden at the top of the body. */
  readonly preheader: string
  /** Signature block of the email, as the locale writes it; styled and linked in the HTML alone. */
  readonly signature: string
}

/**
 * Signature block of the HTML body: grey lines, the last one linked to the site.
 *
 * The block comes from the locale as it is validated, one line per entry, the studio name last. The
 * grey is the text-tertiary light token, and the studio line is the only link: it points at
 * {@link SITE_URL} in the brand violet, both written as the hex of their token because an email
 * cannot read a CSS variable (see `emailColors.ts`).
 *
 * @param signature Signature block of the email, as the locale writes it.
 * @returns The paragraph, styled inline.
 */
const htmlSignature = (signature: string): string => {
  const lines = signature.split('\n')
  const studio = lines[lines.length - 1] ?? ''
  const name = lines.slice(0, -1).map(escapeHtml)

  const link = `<a href="${escapeHtml(SITE_URL)}" style="color:${EMAIL_SIGNATURE_LINK_COLOR}">${escapeHtml(studio)}</a>`

  return `<p style="color:${EMAIL_SIGNATURE_TEXT_COLOR}">${[...name, link].join(`<br />${CRLF}`)}</p>`
}

/**
 * Paragraphs of one HTML body, without the preview line.
 *
 * The body is split on blank lines, one `<p>` per block, and the lines of one block are separated
 * by `<br />`: the copy writes `Date :`, `Heure :` and the rest on separate lines, and HTML would
 * otherwise join them. The block that is exactly the signature is rendered apart, grey and linked;
 * every other block is plain text, escaped everywhere except the anchors, with no image and no
 * tracking of any kind.
 *
 * @param text Body as the locale writes it.
 * @param links URLs the body carries, each turned into an anchor where it appears.
 * @param signature Signature block of the email, the one block that is styled.
 * @returns The paragraphs, one `<p>` per block.
 */
const htmlParagraphs = (text: string, links: readonly HtmlLink[], signature: string): string =>
  text
    .split(/\n{2,}/)
    .map((block) =>
      block === signature
        ? htmlSignature(block)
        : `<p>${block
            .split('\n')
            .map((line) => htmlLine(line, links))
            .join(`<br />${CRLF}`)}</p>`,
    )
    .join(CRLF)

/**
 * HTML alternative of one booking email: its hidden preview line, then its paragraphs.
 *
 * @param input Body, links, preview text and signature of the email.
 * @returns The HTML body, preview line first.
 */
export const htmlBody = ({ text, links, preheader, signature }: HtmlBodyInput): string =>
  `${htmlPreheader(preheader)}${CRLF}${htmlParagraphs(text, links, signature)}`

/** What one booking email carries into the message. */
export type MimeMessageInput = {
  /** Sender, as the guest reads it in their mail client. */
  from: { readonly name: string; readonly address: string }
  /** Address a reply goes to, normally the sender's own. */
  replyTo: string
  /** Guest the message is addressed to. */
  to: string
  /** Instant the message is written at, written to `Date`. */
  sentAt: Date
  /** Subject as the locale writes it. */
  subject: string
  /** Body as the locale writes it. */
  text: string
  /** Minimal HTML alternative of the same body. */
  html: string
  /**
   * Calendar file of the booking, attached as `filename`; absent on the reminder, which carries
   * none. Without one, the message is the `multipart/alternative` of the two bodies alone.
   */
  attachment?: {
    /** Name the guest's mail client shows and saves, `invitation.ics`. */
    readonly filename: string
    /** Method of the calendar file: `REQUEST` proposes the event, `CANCEL` withdraws it. */
    readonly method: 'REQUEST' | 'CANCEL'
    /** The calendar file itself. */
    readonly content: string
  }
}

/**
 * Builds the RFC 5322 message one booking email sends.
 *
 * A message with a calendar file is `multipart/mixed` holding the `multipart/alternative` of the two
 * bodies and the file as an attachment, so a client that understands calendar files updates its
 * guest's calendar and a client that does not still shows the text. A message without one — the
 * reminder — is that `multipart/alternative` alone: a single part that a client can only read as
 * text, which is exactly what the reminder is. Every header value is guarded against injection, and
 * the boundaries carry a fresh random suffix so no content can ever be read as a boundary.
 *
 * @param input Sender, guest, wording of the email and, when there is one, the calendar file.
 * @returns The message, ready to be base64url-encoded for the send call.
 */
export const mimeMessage = ({
  from,
  replyTo,
  to,
  sentAt,
  subject,
  text,
  html,
  attachment,
}: MimeMessageInput): string => {
  const alternativeBoundary = `softn-alternative-${randomUUID()}`
  const fromName = headerValue(from.name).replace(/["\\]/g, '')

  const alternative = [
    `--${alternativeBoundary}`,
    mimePart(['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'], text),
    `--${alternativeBoundary}`,
    mimePart(['Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64'], html),
    `--${alternativeBoundary}--`,
  ].join(CRLF)

  const mixedBoundary = `softn-mixed-${randomUUID()}`
  // A nested multipart part is not encoded: its boundaries must stay readable to the client that
  // walks them, so only the leaf parts and the attachment carry base64.
  const body =
    attachment === undefined
      ? [`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, '', alternative]
      : [
          `--${mixedBoundary}`,
          `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
          '',
          alternative,
          `--${mixedBoundary}`,
          mimePart(
            [
              `Content-Type: text/calendar; charset="UTF-8"; method=${attachment.method}; name="${attachment.filename}"`,
              'Content-Transfer-Encoding: base64',
              `Content-Disposition: attachment; filename="${attachment.filename}"`,
            ],
            attachment.content,
          ),
          `--${mixedBoundary}--`,
        ]

  const headers = [
    addressHeader('From', `"${fromName}" <${headerValue(from.address)}>`),
    addressHeader('Reply-To', replyTo),
    addressHeader('To', `<${headerValue(to)}>`),
    subjectHeader(subject),
    addressHeader('Date', sentAt.toUTCString()),
    'MIME-Version: 1.0',
    attachment === undefined
      ? `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`
      : `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  ]

  return [...headers, '', ...body, ''].join(CRLF)
}
