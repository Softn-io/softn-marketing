import { describe, expect, it } from 'vitest'
import {
  EMAIL_FOOTER_TEXT_COLOR,
  EMAIL_LINK_COLOR,
  EMAIL_QUOTE_BACKGROUND_COLOR,
  EMAIL_QUOTE_BORDER_COLOR,
  EMAIL_QUOTE_TEXT_COLOR,
} from './emailColors'
import {
  EMAIL_FOOTER_FONT_SIZE,
  EMAIL_QUOTE_BORDER_WIDTH,
  EMAIL_QUOTE_PADDING,
  EMAIL_QUOTE_RADIUS,
} from './emailLengths'
import { htmlBody, mimeMessage, type HtmlLink, type MimeMessageInput } from './mime'

const SENT_AT = new Date('2026-11-05T08:15:00.000Z')

/** One message, with every value the tests vary named. */
const message = (overrides: Partial<MimeMessageInput> = {}): string =>
  mimeMessage({
    from: { name: 'Softn.io', address: 'meet@softn.io' },
    replyTo: 'meet@softn.io',
    to: 'marie@example.fr',
    sentAt: SENT_AT,
    subject: 'Votre échange Spark est confirmé : jeudi 12 novembre 2026 à 14:30',
    text: 'Bonjour Marie,\n\nÀ bientôt,\nMélanie',
    html: '<p>Bonjour Marie,</p>\r\n<p>À bientôt,<br />\nMélanie</p>',
    attachment: {
      filename: 'invitation.ics',
      method: 'REQUEST',
      content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
    },
    ...overrides,
  })

/** The boundary of one part of a message, read from its `Content-Type` header. */
const boundaryOf = (source: string, name: 'mixed' | 'alternative'): string => {
  const found = new RegExp(`boundary="([^"]+)"`).exec(
    source
      .split('\r\n')
      .filter((line) => line.includes(`multipart/${name}`))
      .join('\n'),
  )
  if (found?.[1] === undefined) throw new Error(`no ${name} boundary in the message`)
  return found[1]
}

/** The part that follows one boundary delimiter, headers and content included. */
const partAfter = (source: string, boundary: string, index: number): string => {
  const parts = source.split(`--${boundary}`)
  const part = parts[index + 1]
  if (part === undefined) throw new Error(`no part ${index} for that boundary`)
  return part
}

/** Decodes the base64 content of one part. */
const decodedContent = (part: string): string => {
  const [, content = ''] = part.split('\r\n\r\n')
  return Buffer.from(content.replace(/\r\n/g, ''), 'base64').toString('utf8')
}

describe('mimeMessage', () => {
  it('writes the sender, the reply address, the guest and a base64 encoded subject', () => {
    const source = message()

    const headers = source.split('\r\n\r\n')[0] ?? ''
    expect(headers).toContain('From: "Softn.io" <meet@softn.io>')
    expect(headers).toContain('Reply-To: meet@softn.io')
    expect(headers).toContain('To: <marie@example.fr>')
    expect(headers).toContain('Date: Thu, 05 Nov 2026 08:15:00 GMT')
    expect(headers).toContain('MIME-Version: 1.0')

    // The subject holds accents and an em dash: it travels as RFC 2047 encoded words.
    const words = [...headers.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map((match) =>
      Buffer.from(match[1] ?? '', 'base64').toString('utf8'),
    )
    expect(words.join('')).toBe('Votre échange Spark est confirmé : jeudi 12 novembre 2026 à 14:30')
  })

  it('keeps an ASCII subject readable, without encoding it', () => {
    const source = message({ subject: 'Your call is confirmed' })

    expect(source).toContain('Subject: Your call is confirmed\r\n')
  })

  it('carries both bodies in a multipart/alternative, and the calendar file as an attachment', () => {
    const source = message()
    const mixed = boundaryOf(source, 'mixed')
    const alternative = boundaryOf(source, 'alternative')

    // The alternative part holds the two bodies, and is not itself base64 encoded.
    const alternativePart = partAfter(source, mixed, 0)
    expect(alternativePart).toContain(`Content-Type: multipart/alternative; boundary="${alternative}"`)
    expect(decodedContent(partAfter(source, alternative, 0))).toBe('Bonjour Marie,\n\nÀ bientôt,\nMélanie')
    expect(decodedContent(partAfter(source, alternative, 1))).toBe(
      '<p>Bonjour Marie,</p>\r\n<p>À bientôt,<br />\nMélanie</p>',
    )

    // The calendar file is the second mixed part, an attachment with the method of its file.
    const attachment = partAfter(source, mixed, 1)
    expect(attachment).toContain('Content-Type: text/calendar; charset="UTF-8"; method=REQUEST; name="invitation.ics"')
    expect(attachment).toContain('Content-Disposition: attachment; filename="invitation.ics"')
    expect(decodedContent(attachment)).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')

    expect(partAfter(source, mixed, 2).trim()).toBe('--')
  })

  it('marks a cancellation file as such', () => {
    const source = message({ attachment: { filename: 'invitation.ics', method: 'CANCEL', content: 'x' } })

    expect(source).toContain('method=CANCEL')
  })

  it('is a multipart/alternative alone when there is no calendar file, as the reminder is', () => {
    const source = mimeMessage({
      from: { name: 'Softn.io', address: 'meet@softn.io' },
      replyTo: 'meet@softn.io',
      to: 'marie@example.fr',
      sentAt: SENT_AT,
      subject: 'Rappel : votre échange Spark',
      text: 'Bonjour Marie,\n\nÀ bientôt,\nMélanie',
      html: '<p>Bonjour Marie,</p>\r\n<p>À bientôt,<br />\nMélanie</p>',
    })

    const headers = source.split('\r\n\r\n')[0] ?? ''
    expect(headers).toContain('Content-Type: multipart/alternative; boundary="')
    expect(source).not.toContain('multipart/mixed')
    expect(source).not.toContain('text/calendar')

    const alternative = boundaryOf(source, 'alternative')
    expect(decodedContent(partAfter(source, alternative, 0))).toBe('Bonjour Marie,\n\nÀ bientôt,\nMélanie')
    expect(decodedContent(partAfter(source, alternative, 1))).toBe(
      '<p>Bonjour Marie,</p>\r\n<p>À bientôt,<br />\nMélanie</p>',
    )
  })

  it('never lets an address or a name open a header of its own', () => {
    const source = message({
      from: { name: 'Softn.io\r\nBcc: evil@example.fr', address: 'meet@softn.io\r\nBcc: evil@example.fr' },
      to: 'marie@example.fr\r\nBcc: evil@example.fr',
      replyTo: 'meet@softn.io\r\nBcc: evil@example.fr',
    })

    expect(source).not.toMatch(/^Bcc:/m)
    expect(source).not.toMatch(/\r\nBcc:/)
    // Every forged value lands on the header line it belongs to, on a single line.
    expect(source).toContain('From: "Softn.io Bcc: evil@example.fr" <meet@softn.io Bcc: evil@example.fr>\r\n')
    expect(source).toContain('Reply-To: meet@softn.io Bcc: evil@example.fr\r\n')
    expect(source).toContain('To: <marie@example.fr Bcc: evil@example.fr>\r\n')
  })
})

describe('htmlBody', () => {
  const PREHEADER = '30 minutes en visio, offertes. Le lien de connexion est dans ce message.'
  const SIGNATURE = 'Mélanie\nFounder\nSoftn.io'

  /** The hidden preview line, as the HTML part carries it. */
  const hidden = (value: string): string =>
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all" aria-hidden="true">${value}</div>`

  /** Links of a test whose label is the URL the copy prints. */
  const plainLinks = (urls: readonly string[] = []): readonly HtmlLink[] => urls.map((url) => ({ url, label: url }))

  /** One HTML body of a test, with the preview line and the signature the callers always pass. */
  const body = (text: string, urls: readonly string[] = []): string =>
    htmlBody({ text, links: plainLinks(urls), preheader: PREHEADER, signature: SIGNATURE })

  /** The styled signature block, as the HTML part carries it. */
  const signatureHtml =
    '<p style="color:#5e577f">Mélanie<br />\r\n' +
    'Founder<br />\r\n' +
    '<a href="https://softn.io" style="color:#7c3aed">Softn.io</a></p>'

  it('starts with the hidden preview line, out of sight and out of a screen reader speech', () => {
    const html = body('Bonjour Marie,')

    expect(html.startsWith(hidden(PREHEADER))).toBe(true)
    expect(hidden(PREHEADER)).toBe(
      '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all" aria-hidden="true">30 minutes en visio, offertes. Le lien de connexion est dans ce message.</div>',
    )
    // One paragraph per block, right after the preview line, and nothing else: no image, no tracker.
    expect(html.slice(hidden(PREHEADER).length)).toBe('\r\n<p>Bonjour Marie,</p>')
    expect(html).not.toContain('<img')
  })

  it('escapes the preview text like any other value', () => {
    const html = htmlBody({ text: 'Bonjour', links: [], preheader: '<script> & "guillemets"', signature: SIGNATURE })

    expect(html.startsWith(hidden('&lt;script&gt; &amp; &quot;guillemets&quot;'))).toBe(true)
  })

  it('writes one paragraph per block, one line break per inner break and one anchor per link', () => {
    const text =
      'Bonjour Marie,\n\nDate : jeudi 12 novembre 2026\nLien de connexion : https://meet.google.com/abc\n\n—\nÀ bientôt.'

    expect(body(text, ['https://meet.google.com/abc'])).toBe(
      `${hidden(PREHEADER)}\r\n` +
        '<p>Bonjour Marie,</p>\r\n' +
        '<p>Date : jeudi 12 novembre 2026<br />\r\nLien de connexion : <a href="https://meet.google.com/abc">https://meet.google.com/abc</a></p>\r\n' +
        '<p>—<br />\r\nÀ bientôt.</p>',
    )
  })

  it('shows a link behind its label when the copy gives it one', () => {
    const link = 'https://softn.io/rendez-vous/token-value'
    const text = `Un empêchement ? Vous pouvez déplacer ou annuler ce rendez-vous en ligne : ${link}`

    expect(
      htmlBody({
        text,
        links: [{ url: link, label: 'Modifier ou annuler mon rendez-vous' }],
        preheader: PREHEADER,
        signature: SIGNATURE,
      }),
    ).toBe(
      `${hidden(PREHEADER)}\r\n` +
        '<p>Un empêchement ? Vous pouvez déplacer ou annuler ce rendez-vous en ligne : ' +
        '<a href="https://softn.io/rendez-vous/token-value">Modifier ou annuler mon rendez-vous</a></p>',
    )
  })

  it('paints a link with the style the caller gives it, over the client default', () => {
    const link = 'https://softn.io/#assistant'

    expect(
      htmlBody({
        text: `Réservez un échange Spark : ${link}`,
        links: [{ url: link, label: 'Réserver un échange Spark', style: `color:${EMAIL_LINK_COLOR}` }],
        preheader: PREHEADER,
        signature: SIGNATURE,
      }),
    ).toBe(
      `${hidden(PREHEADER)}\r\n` +
        `<p>Réservez un échange Spark : <a href="${link}" style="color:${EMAIL_LINK_COLOR}">Réserver un échange Spark</a></p>`,
    )
  })

  it('renders the signature apart: grey lines, the studio line linked to the site', () => {
    const html = body(`À bientôt,\n\n${SIGNATURE}\n\n—\nVous recevez ce message parce que vous avez réservé.`)

    expect(html).toContain(signatureHtml)
    // The block is one paragraph of its own, and the closing line is another.
    expect(html).toContain(`<p>À bientôt,</p>\r\n${signatureHtml}`)
  })

  it('escapes every value that is not a link', () => {
    const text = '<script>alert(1)</script> & "quotes" de Marie <marie@example.fr>'

    expect(body(text)).toBe(
      `${hidden(PREHEADER)}\r\n` +
        '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot; de Marie &lt;marie@example.fr&gt;</p>',
    )
  })

  it('keeps a URL inside its attribute when it carries characters HTML reads', () => {
    const link = 'https://softn.io/rendez-vous/token?a=1&b="2"'

    expect(body(`Lien : ${link}`, [link])).toBe(
      `${hidden(PREHEADER)}\r\n` +
        '<p>Lien : <a href="https://softn.io/rendez-vous/token?a=1&amp;b=&quot;2&quot;">https://softn.io/rendez-vous/token?a=1&amp;b=&quot;2&quot;</a></p>',
    )
  })

  it('renders a block the caller names as a quote, styled inline and keeping its line breaks', () => {
    const quoted = 'Bonjour,\nje souhaite un devis.'
    const html = htmlBody({
      text: `Avant.\n\n${quoted}\n\nAprès.`,
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      quoted: [quoted],
    })

    expect(html).toBe(
      `${hidden(PREHEADER)}\r\n<p>Avant.</p>\r\n` +
        `<blockquote style="margin:0;padding:${EMAIL_QUOTE_PADDING};` +
        `border-left:${EMAIL_QUOTE_BORDER_WIDTH} solid ${EMAIL_QUOTE_BORDER_COLOR};` +
        `border-radius:${EMAIL_QUOTE_RADIUS};background-color:${EMAIL_QUOTE_BACKGROUND_COLOR};` +
        `color:${EMAIL_QUOTE_TEXT_COLOR}">` +
        `Bonjour,<br />\r\nje souhaite un devis.</blockquote>\r\n<p>Après.</p>`,
    )
  })

  it('gathers every paragraph of a quoted message into a single quote', () => {
    const message = 'Bonjour,\n\nje souhaite un devis.'
    const html = htmlBody({
      text: message,
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      quoted: message.split(/\n{2,}/),
    })

    expect(html.match(/<blockquote style="margin:0;/g)).toHaveLength(1)
    expect(html).toContain('Bonjour,<br /><br />\r\nje souhaite un devis.</blockquote>')
  })

  it('keeps every line of a quote plain, even a line that reads like a named label', () => {
    const quoted = 'Adresse e-mail : autre@exemple.fr\nEt voici mon besoin.'
    const html = htmlBody({
      text: `Adresse e-mail : camille@example.fr\n\n${quoted}`,
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      boldLabels: ['Adresse e-mail :'],
      quoted: [quoted],
    })

    expect(html).toContain('<p><strong>Adresse e-mail :</strong> camille@example.fr</p>')
    expect(html).toContain('Adresse e-mail : autre@exemple.fr<br />\r\nEt voici mon besoin.</blockquote>')
    // The label of the header is the only one bolded: the visitor's line stays plain.
    expect(html.match(/<strong>/g)).toHaveLength(1)
  })

  it('quotes a block that reads like the signature: what the visitor wrote wins', () => {
    const html = htmlBody({
      text: SIGNATURE,
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      quoted: [SIGNATURE],
    })

    expect(html).toContain('<blockquote style="margin:0;')
    expect(html).toContain('Mélanie<br />\r\nFounder<br />\r\nSoftn.io</blockquote>')
    expect(html).not.toContain('style="color:#5e577f"')
  })

  it('escapes the quoted text and keeps its links, like every other value', () => {
    const quoted = '<script>alert(1)</script> et https://softn.io/contact'
    const html = htmlBody({
      text: quoted,
      links: plainLinks(['https://softn.io/contact']),
      preheader: PREHEADER,
      signature: SIGNATURE,
      quoted: [quoted],
    })

    expect(html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; et <a href="https://softn.io/contact">https://softn.io/contact</a></blockquote>',
    )
    expect(html).not.toContain('<script>')
  })

  it('bolds a line that opens with one of the named labels, and nothing else', () => {
    const html = htmlBody({
      text: 'Nom : Camille Durand\nAdresse e-mail : camille@example.fr\n\nMessage :\nUn mot de Camille.',
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      boldLabels: ['Nom :', 'Adresse e-mail :', 'Message :'],
    })

    expect(html).toContain(
      '<p><strong>Nom :</strong> Camille Durand<br />\r\n<strong>Adresse e-mail :</strong> camille@example.fr</p>',
    )
    // A label alone on its line is bolded, and the words of the visitor stay unbolded.
    expect(html).toContain('<p><strong>Message :</strong><br />\r\nUn mot de Camille.</p>')
  })

  it('escapes a label and a value of the notification like every other value', () => {
    const html = htmlBody({
      text: 'Nom : <script>alert(1)</script>',
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      boldLabels: ['Nom :'],
    })

    expect(html).toContain('<p><strong>Nom :</strong> &lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(html).not.toContain('<script>')
  })

  it('leaves every block and line alone when the caller names no quote and no label', () => {
    const text = 'Nom : Camille\n\nBonjour,\nje souhaite un devis.'

    expect(htmlBody({ text, links: plainLinks(), preheader: PREHEADER, signature: SIGNATURE })).toBe(body(text))
  })

  it('renders a block the caller names as the footer in the small grey type of the email', () => {
    const footer = '—\nVous recevez ce message parce que vous avez réservé.'
    const html = htmlBody({
      text: `À bientôt,\n\n${SIGNATURE}\n\n${footer}`,
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      footer: [footer],
    })

    expect(html).toContain(
      `<p style="color:${EMAIL_FOOTER_TEXT_COLOR};font-size:${EMAIL_FOOTER_FONT_SIZE}">` +
        '—<br />\r\nVous recevez ce message parce que vous avez réservé.</p>',
    )
    // The signature keeps its own style, and the footer is not read as it.
    expect(html).toContain(signatureHtml)
  })

  it('dresses the links of the footer too, so they stay links inside its grey', () => {
    const link = 'https://softn.io/politique-de-confidentialite'
    const footer = `Le détail figure dans la ${link}.`
    const html = htmlBody({
      text: `À bientôt,\n\n${SIGNATURE}\n\n${footer}`,
      links: plainLinks([link]),
      preheader: PREHEADER,
      signature: SIGNATURE,
      footer: [footer],
    })

    expect(html).toContain(
      `<a href="${link}" style="color:${EMAIL_LINK_COLOR};font-size:${EMAIL_FOOTER_FONT_SIZE}">${link}</a>`,
    )
  })

  it('dresses every block the caller names as the footer, and no other one', () => {
    const footer = '—\nVous recevez ce message parce que vous avez réservé.'
    const after = 'Une dernière ligne.'
    const html = htmlBody({
      text: `Bonjour Marie,\n\n${footer}\n\n${after}`,
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      footer: [footer],
    })

    expect(html).toContain(`font-size:${EMAIL_FOOTER_FONT_SIZE}">—<br />\r\nVous recevez`)
    expect(html).toContain(`\r\n<p>${after}</p>`)
    expect(html.match(/font-size:/g)).toHaveLength(1)
  })

  it('never reads a quoted block as the footer: what the visitor wrote stays plain', () => {
    const footer = '—\nVous recevez ce message parce que vous avez réservé.'
    const html = htmlBody({
      text: `${footer}`,
      links: plainLinks(),
      preheader: PREHEADER,
      signature: SIGNATURE,
      quoted: [footer],
      footer: [footer],
    })

    expect(html).toContain('<blockquote style="margin:0;')
    expect(html).not.toContain('font-size:')
  })
})
