import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_URL } from '@/lib/site'
import { bookingEmails } from '@/locales/fr/bookingEmails'
import { contact } from '@/locales/fr/contact'
import { contactEmails } from '@/locales/fr/contactEmails'
import { EMAIL_QUOTE_BACKGROUND_COLOR, EMAIL_QUOTE_BORDER_COLOR, EMAIL_QUOTE_TEXT_COLOR } from '@/lib/email/emailColors'
import { EMAIL_QUOTE_BORDER_WIDTH, EMAIL_QUOTE_PADDING, EMAIL_QUOTE_RADIUS } from '@/lib/email/emailLengths'
import {
  autoReplyEmailContent,
  notificationEmailContent,
  sendContactAutoReplyEmail,
  sendContactNotificationEmail,
} from './emails'

const gmailMock = vi.hoisted(() => ({ sendGmailMessage: vi.fn() }))

vi.mock('@/lib/google/gmail', () => gmailMock)

const CRLF = '\r\n'

const lead = {
  firstName: 'Camille',
  lastName: 'Durand',
  email: 'camille@example.fr',
  subject: 'quote',
  message: 'Bonjour,\nje souhaite un devis.',
} as const

/** Every quote of an HTML part, as the email carries it. */
const quotesOf = (html: string): readonly string[] => html.match(/<blockquote[\s\S]*?<\/blockquote>/g) ?? []

/** Decodes every base64 part of a MIME message, in order. */
const decodedParts = (message: string): readonly string[] => {
  const marker = `Content-Transfer-Encoding: base64${CRLF}${CRLF}`
  const parts: string[] = []
  let cursor = 0

  for (;;) {
    const start = message.indexOf(marker, cursor)
    if (start === -1) return parts

    const from = start + marker.length
    const end = message.indexOf(`${CRLF}--`, from)
    const encoded = message.slice(from, end === -1 ? undefined : end).replace(/\r\n/g, '')
    parts.push(Buffer.from(encoded, 'base64').toString('utf8'))
    if (end === -1) return parts
    cursor = end
  }
}

beforeEach(() => {
  gmailMock.sendGmailMessage.mockReset()
  gmailMock.sendGmailMessage.mockResolvedValue({ ok: true, data: { messageId: 'msg-1' } })
  vi.stubEnv('GOOGLE_CALENDAR_OWNER', 'melanie@softn.io')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('notificationEmailContent', () => {
  it('labels the answers, quotes the message and keeps its line breaks', () => {
    const content = notificationEmailContent({ ...lead, receivedAt: new Date('2026-11-16T18:42:00Z') })

    expect(content).not.toBeNull()
    if (content === null) return
    expect(content.subject).toBe('Nouveau message : Demande de devis — Camille Durand')
    expect(content.text).toContain('Nom : Camille Durand')
    expect(content.text).toContain('Adresse e-mail : camille@example.fr')
    expect(content.text).toContain('Objet : Demande de devis')
    expect(content.text).toContain('Reçu le : 16 novembre 2026 à 19:42')
    // The message travels quoted, line by line, like the auto-reply's.
    expect(content.text).toContain('> Bonjour,\n> je souhaite un devis.')
    expect(content.text).toContain("Répondre à cet e-mail écrit directement à l'expéditeur.")
  })

  it('prepends the personal-data notice on its own paragraph when the visitor picked that subject', () => {
    const content = notificationEmailContent({
      ...lead,
      subject: 'dataRequest',
      receivedAt: new Date('2026-11-16T18:42:00Z'),
    })

    expect(content?.text.startsWith(contactEmails.notification.dataRequestNotice)).toBe(true)
    expect(content?.html).toContain('Demande relative aux données personnelles')
  })

  it('bolds the label of every answer in the HTML part, and leaves the words of the visitor plain', () => {
    const content = notificationEmailContent({ ...lead, receivedAt: new Date('2026-11-16T18:42:00Z') })

    expect(content?.html).toContain('<strong>Nom :</strong> Camille Durand')
    expect(content?.html).toContain('<strong>Adresse e-mail :</strong> camille@example.fr')
    expect(content?.html).toContain('<strong>Objet :</strong> Demande de devis')
    expect(content?.html).toContain('<strong>Reçu le :</strong> 16 novembre 2026 à 19:42')
    expect(content?.html).toContain('<strong>Message :</strong>')
    expect(content?.html).not.toContain('<strong>Bonjour,')
  })

  it('renders the message as one blockquote, with no quote marker of the plain-text part', () => {
    const content = notificationEmailContent({ ...lead, receivedAt: new Date('2026-11-16T18:42:00Z') })

    expect(quotesOf(content?.html ?? '')).toHaveLength(1)
    expect(content?.html).toContain('Bonjour,<br />\r\nje souhaite un devis.</blockquote>')
    expect(content?.html).not.toContain('&gt; Bonjour')
    // The marker stays in the text alternative, where it is the convention.
    expect(content?.text).toContain('> Bonjour,\n> je souhaite un devis.')
  })

  it('gathers every paragraph of a multi-paragraph message into that one blockquote', () => {
    const content = notificationEmailContent({
      ...lead,
      message: 'Bonjour,\n\nje souhaite un devis.\n\nMerci.',
      receivedAt: new Date('2026-11-16T18:42:00Z'),
    })

    expect(quotesOf(content?.html ?? '')).toHaveLength(1)
    expect(content?.html).toContain('Bonjour,<br /><br />\r\nje souhaite un devis.<br /><br />\r\nMerci.</blockquote>')
    expect(content?.html).not.toContain('&gt;')
    expect(content?.text).toContain('> Bonjour,\n> \n> je souhaite un devis.\n> \n> Merci.')
  })

  it('bolds exactly the five labels of the copy, so a copy edit cannot drop one silently', () => {
    const content = notificationEmailContent({ ...lead, receivedAt: new Date('2026-11-16T18:42:00Z') })
    const labels = content?.html.match(/<strong>[^<]+<\/strong>/g) ?? []

    expect(labels).toEqual([
      '<strong>Nom :</strong>',
      '<strong>Adresse e-mail :</strong>',
      '<strong>Objet :</strong>',
      '<strong>Reçu le :</strong>',
      '<strong>Message :</strong>',
    ])
  })

  it('quotes the message of the notification line by line in the text part', () => {
    const content = notificationEmailContent({ ...lead, receivedAt: new Date('2026-11-16T18:42:00Z') })

    // The label stands on its own paragraph (the copy gives the message its own block), then the
    // message travels quoted line by line.
    expect(content?.text).toContain('Message :\n\n> Bonjour,\n> je souhaite un devis.')
    expect(content?.text).not.toContain('\nBonjour,\nje souhaite un devis.')
  })

  it('leaves the words of the visitor plain, even when one of their lines reads like a label', () => {
    const content = notificationEmailContent({
      ...lead,
      message: 'Adresse e-mail : autre@exemple.fr\nEt voici mon besoin.',
      receivedAt: new Date('2026-11-16T18:42:00Z'),
    })

    // The header still carries its own bold label, once, and the message keeps its line plain.
    expect(content?.html).toContain('<strong>Adresse e-mail :</strong> camille@example.fr')
    expect(content?.html).toContain('Adresse e-mail : autre@exemple.fr')
    expect(content?.html).not.toContain('<strong>Adresse e-mail :</strong> autre@exemple.fr')
    expect(content?.html.match(/<strong>/g)).toHaveLength(5)
    // The visitor's line travels inside the quote, where no label is ever applied.
    const [quote = ''] = quotesOf(content?.html ?? '')
    expect(quote).toContain('Adresse e-mail : autre@exemple.fr')
    expect(quote).not.toContain('<strong>')
  })

  it('escapes what the visitor typed, in both alternatives', () => {
    const content = notificationEmailContent({
      ...lead,
      message: '<script>alert(1)</script>',
      receivedAt: new Date('2026-11-16T18:42:00Z'),
    })

    expect(content?.text).toContain('<script>alert(1)</script>')
    expect(content?.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(content?.html).not.toContain('<script>')
  })

  it('leaves no content when the instant cannot be read', () => {
    expect(notificationEmailContent({ ...lead, receivedAt: new Date('nope') })).toBeNull()
  })
})

describe('autoReplyEmailContent', () => {
  const contentOf = () => {
    const content = autoReplyEmailContent({ firstName: lead.firstName, subject: lead.subject, message: lead.message })
    if (content === null) throw new Error('the content should exist')
    return content
  }

  it('uses the validated subject and preheader', () => {
    const content = contentOf()

    expect(content.subject).toBe('Votre message à Softn.io a bien été reçu')
    // The preheader is the hidden preview line, escaped like every other value of the HTML part.
    expect(content.html).toContain('J&#39;étudie votre demande et reviens vers vous dans les plus brefs délais.')
  })

  it('prints each link as its label followed by the address in the plain-text part', () => {
    const content = contentOf()

    expect(content.text).toContain(`Réserver un échange Spark (${SITE_URL}${contact.intro.agentLink.href})`)
    expect(content.text).toContain('politique de confidentialité (https://softn.io/politique-de-confidentialite)')
  })

  it('renders the same addresses as labelled anchors in the HTML part', () => {
    const content = contentOf()

    expect(content.html).toContain(`<a href="${SITE_URL}${contact.intro.agentLink.href}">Réserver un échange Spark</a>`)
    expect(content.html).toContain(
      '<a href="https://softn.io/politique-de-confidentialite">politique de confidentialité</a>',
    )
  })

  it('quotes the message line by line in the text part, and as a styled blockquote in the HTML part', () => {
    const content = contentOf()

    expect(content.text).toContain('> Bonjour,\n> je souhaite un devis.')
    expect(content.html).toContain('Bonjour,<br />\r\nje souhaite un devis.</blockquote>')
    expect(content.html).not.toContain('&gt; Bonjour')
    // The quote carries its own background, its edge and its ink, so it reads in either theme.
    expect(content.html).toContain(
      `<blockquote style="margin:0;padding:${EMAIL_QUOTE_PADDING};` +
        `border-left:${EMAIL_QUOTE_BORDER_WIDTH} solid ${EMAIL_QUOTE_BORDER_COLOR};` +
        `border-radius:${EMAIL_QUOTE_RADIUS};background-color:${EMAIL_QUOTE_BACKGROUND_COLOR};` +
        `color:${EMAIL_QUOTE_TEXT_COLOR}">`,
    )
  })

  it('bolds the label of the subject the reminder repeats, and nothing the visitor wrote', () => {
    const content = contentOf()

    expect(content.html).toContain('<strong>Objet :</strong> Demande de devis')
    expect(content.html.match(/<strong>/g)).toHaveLength(1)
  })

  it('turns both footer mentions of softn.io into links, built from the site URL', () => {
    const content = contentOf()

    expect(content.html).toContain(`<a href="${SITE_URL}">softn.io</a>`)
    expect(content.html).toContain(`<a href="${SITE_URL}${contact.link.href}">softn.io</a>`)
    expect(content.text).toContain(`softn.io (${SITE_URL})`)
    expect(content.text).toContain(`softn.io (${SITE_URL}${contact.link.href})`)
  })

  it('starts the personal-data sentence on its own line, in both alternatives', () => {
    const content = contentOf()

    expect(content.text).toContain('\nPour exercer un droit sur vos données personnelles')
    expect(content.html).toContain('<br />\r\nPour exercer un droit sur vos données personnelles')
  })

  it('builds every link from the canonical site URL, whatever origin the request came from', () => {
    const content = contentOf()

    for (const url of [SITE_URL + contact.intro.agentLink.href, SITE_URL + contact.consent.privacyLink.href]) {
      expect(url.startsWith('https://softn.io/')).toBe(true)
      expect(content.text).toContain(url)
      expect(content.html).toContain(`href="${url}"`)
    }
    expect(content.text).not.toContain('localhost')
    expect(content.html).not.toContain('localhost')
  })

  it('gathers every paragraph of a message that carries blank lines of its own into one blockquote', () => {
    const content = autoReplyEmailContent({
      firstName: lead.firstName,
      subject: lead.subject,
      message: 'Bonjour,\n\nje souhaite un devis.',
    })

    expect(quotesOf(content?.html ?? '')).toHaveLength(1)
    expect(content?.html).toContain('Bonjour,<br /><br />\r\nje souhaite un devis.</blockquote>')
    expect(content?.html).not.toContain('&gt;')
    expect(content?.text).toContain('> Bonjour,\n> \n> je souhaite un devis.')
  })

  it('escapes the quoted message, so nothing a visitor typed becomes markup', () => {
    const content = autoReplyEmailContent({
      firstName: lead.firstName,
      subject: lead.subject,
      message: '<script>alert(1)</script>',
    })

    expect(content?.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;</blockquote>')
    expect(content?.html).not.toContain('<script>')
  })

  it('reuses the booking signature and styles that block in the HTML part', () => {
    const content = contentOf()

    expect(content.text).toContain(bookingEmails.signature)
    expect(content.html).toContain('Founder<br />')
    expect(content.html).toContain('<a href="https://softn.io"')
  })

  it('never repeats the privacy-policy words the copy already carries', () => {
    const content = contentOf()

    expect(content.text).toContain(
      'le détail figure dans la politique de confidentialité (https://softn.io/politique-de-confidentialite).',
    )
  })
})

describe('sendContactNotificationEmail', () => {
  it('sends to the owner with the visitor as Reply-To, from the contact alias', async () => {
    const outcome = await sendContactNotificationEmail({
      lead,
      receivedAt: new Date('2026-11-16T18:42:00Z'),
      subjectToken: undefined,
    })

    expect(outcome).toEqual({ ok: true })
    const [input] = gmailMock.sendGmailMessage.mock.calls[0] ?? []
    expect(input?.message).toContain('From: "Softn.io" <hello@softn.io>')
    expect(input?.message).toContain('To: <melanie@softn.io>')
    expect(input?.message).toContain('Reply-To: camille@example.fr')
    expect(decodedParts(String(input?.message)).join('\n')).toContain('camille@example.fr')
  })

  it('answers a code instead of sending anywhere when no recipient is configured', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_OWNER', '')

    const outcome = await sendContactNotificationEmail({ lead, receivedAt: new Date(), subjectToken: undefined })

    expect(outcome).toEqual({ ok: false, detail: 'compose recipient-missing' })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()
  })

  it('maps a Gmail failure to a loggable code, never a body', async () => {
    gmailMock.sendGmailMessage.mockResolvedValue({ ok: false, error: 'unauthorized', status: 403, reason: 'forbidden' })

    const outcome = await sendContactNotificationEmail({
      lead,
      receivedAt: new Date('2026-11-16T18:42:00Z'),
      subjectToken: undefined,
    })

    expect(outcome).toEqual({ ok: false, detail: 'gmail unauthorized status=403 reason=forbidden' })
  })
})

describe('sendContactAutoReplyEmail', () => {
  it('sends to the visitor with the contact alias as Reply-To', async () => {
    const outcome = await sendContactAutoReplyEmail({ lead, subjectToken: undefined })

    expect(outcome).toEqual({ ok: true })
    const [input] = gmailMock.sendGmailMessage.mock.calls[0] ?? []
    expect(input?.message).toContain('To: <camille@example.fr>')
    expect(input?.message).toContain('Reply-To: hello@softn.io')
    expect(input?.message).toContain('From: "Softn.io" <hello@softn.io>')
  })

  it('never carries the notification line about replying to the sender', async () => {
    await sendContactAutoReplyEmail({ lead, subjectToken: undefined })

    const [input] = gmailMock.sendGmailMessage.mock.calls[0] ?? []
    expect(decodedParts(String(input?.message)).join('\n')).not.toContain(
      "Répondre à cet e-mail écrit directement à l'expéditeur.",
    )
  })
})
