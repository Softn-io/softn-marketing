import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { interpolate } from '@/lib/interpolate'
import { bookingManage } from '@/locales/fr/bookingManage'
import { bookingEmails } from '@/locales/fr/bookingEmails'
import { BOOKING_RULES } from './rules'
import {
  confirmationEmailContent,
  cancellationEmailContent,
  invitationDescription,
  reminderEmailContent,
  sendBookingCancellationEmail,
  sendBookingConfirmationEmail,
  sendBookingReminderEmail,
  sendBookingUpdateEmail,
  updateEmailContent,
  type BookingEmailContent,
} from './emails'
import { htmlBody } from './mime'

const gmailMock = vi.hoisted(() => ({ sendGmailMessage: vi.fn() }))
const calendarMock = vi.hoisted(() => ({
  markBookingEmailFailed: vi.fn(),
  storeBookingEmailSentAt: vi.fn(),
}))

vi.mock('@/lib/google/gmail', () => gmailMock)
vi.mock('@/lib/google/calendar', () => calendarMock)

const EVENT_ID = 'softnabc0123456789abcdefghijkl'
const SUBJECT_TOKEN = 'subject-token-value'
const MEET_LINK = 'https://meet.google.com/abc-defg-hij'
const MANAGE_LINK = 'https://softn.io/rendez-vous/token-value'

/** 14:30 in Paris on Thursday 12 November 2026. */
const SLOT = { start: '2026-11-12T13:30:00.000Z', end: '2026-11-12T14:00:00.000Z' }

const SENT_AT = new Date('2026-11-05T08:15:00.000Z')

const event = {
  eventId: EVENT_ID,
  iCalUid: `${EVENT_ID}@google.com`,
  guestFirstName: 'Camille',
  guestLastName: 'Meyer',
  guestEmail: 'camille@example.fr',
}

/** The MIME message of the only send the test made. */
const sentMessage = (): string => {
  const call = gmailMock.sendGmailMessage.mock.calls[0]?.[0] as { message: string } | undefined
  if (call === undefined) throw new Error('no mail was sent')
  return call.message
}

/** Content of the part whose headers hold `marker`, base64 decoded back to text. */
const decodedPart = (source: string, marker: string): string => {
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1) throw new Error(`no part carrying ${marker}`)

  const contentStart = source.indexOf('\r\n\r\n', markerIndex)
  if (contentStart === -1) throw new Error(`no content after ${marker}`)

  const contentEnd = source.indexOf('\r\n--', contentStart)
  const encoded = source.slice(contentStart + 4, contentEnd === -1 ? undefined : contentEnd).replace(/\r\n/g, '')
  return Buffer.from(encoded, 'base64').toString('utf8')
}

/** The calendar file of the only send the test made. */
const sentCalendarFile = (): string => decodedPart(sentMessage(), 'Content-Type: text/calendar;')

/** The HTML part of the only send the test made. */
const sentHtml = (): string => decodedPart(sentMessage(), 'Content-Type: text/html;')

/** The plain-text part of the only send the test made. */
const sentText = (): string => decodedPart(sentMessage(), 'Content-Type: text/plain;')

/** HTML escaping the message builder applies to every value it writes. */
const escaped = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** The hidden preview line, as the HTML part of a message carries it. */
const hiddenPreheader = (value: string): string =>
  `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all" aria-hidden="true">${escaped(value)}</div>`

beforeEach(() => {
  gmailMock.sendGmailMessage.mockReset()
  calendarMock.markBookingEmailFailed.mockReset()
  calendarMock.storeBookingEmailSentAt.mockReset()
  gmailMock.sendGmailMessage.mockResolvedValue({ ok: true, data: { messageId: 'message-id' } })
  calendarMock.markBookingEmailFailed.mockResolvedValue({ ok: true, data: true })
  calendarMock.storeBookingEmailSentAt.mockResolvedValue({ ok: true, data: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendBookingConfirmationEmail', () => {
  it('sends the confirmation with the calendar file that adds the call to the guest calendar', async () => {
    const outcome = await sendBookingConfirmationEmail({
      event,
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({ ok: true })
    expect(gmailMock.sendGmailMessage).toHaveBeenCalledWith({
      message: expect.any(String),
      subjectToken: SUBJECT_TOKEN,
    })
    expect(calendarMock.markBookingEmailFailed).not.toHaveBeenCalled()

    const source = sentMessage()
    expect(source).toContain('From: "Softn.io" <meet@softn.io>')
    expect(source).toContain('Reply-To: meet@softn.io')
    expect(source).toContain('To: <camille@example.fr>')

    const text = decodedPart(source, 'Content-Type: text/plain;')
    expect(text).toContain('Bonjour Camille,')
    expect(text).toContain('Date : jeudi 12 novembre 2026')
    expect(text).toContain('Heure : 14:30 (heure de Paris)')
    expect(text).toContain('Durée : 30 minutes, en visio')
    expect(text).toContain(`Lien de connexion : ${MEET_LINK}`)
    expect(text).toContain(`jusqu'à 12 h avant l'appel : ${MANAGE_LINK}`)
    expect(text).toContain('Vous recevez ce message parce que vous avez réservé un échange Spark sur softn.io.')
    expect(text).toContain('Mélanie\nFounder\nSoftn.io')

    const file = sentCalendarFile()
    expect(file).toContain('UID:softnabc0123456789abcdefghijkl@google.com')
    expect(file).toContain('SEQUENCE:0')
    expect(file).toContain('METHOD:REQUEST')
    expect(file).toContain('DTSTART;TZID=Europe/Paris:20261112T143000')
    expect(file).toContain('ORGANIZER;CN="Softn.io":mailto:meet@softn.io')
    expect(file).toContain('ATTENDEE;CN="Camille Meyer":mailto:camille@example.fr')
    expect(file).toContain('SUMMARY:Échange Spark — Camille Meyer x Softn.io')
    expect(file).toContain('LOCATION:https://meet.google.com/abc-defg-hij')
    expect(file).toContain('DESCRIPTION:Échange Spark : 30 minutes en visio\\, avec Softn.io.')
  })

  it('dates the slot with the instant the confirmation left, for the reminder grace', async () => {
    await sendBookingConfirmationEmail({
      event,
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(calendarMock.storeBookingEmailSentAt).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      sentAt: SENT_AT.toISOString(),
      subjectToken: SUBJECT_TOKEN,
    })
  })

  it('hides the validated preheader at the top of the HTML part, and leaves it out of the text part', async () => {
    await sendBookingConfirmationEmail({
      event,
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    // The preview line is the first element of the HTML body, hidden, its `{duration}` filled.
    expect(
      sentHtml().startsWith(
        hiddenPreheader('30 minutes en visio, offertes. Le lien de connexion est dans ce message.'),
      ),
    ).toBe(true)
    // The plain-text body never carries it.
    expect(sentText()).not.toContain('30 minutes en visio, offertes.')
  })

  it('marks the event and answers a non-personal code when the message cannot leave', async () => {
    gmailMock.sendGmailMessage.mockResolvedValue({ ok: false, error: 'request-failed', status: 502 })

    const outcome = await sendBookingConfirmationEmail({
      event,
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({ ok: false, detail: 'gmail request-failed status=502' })
    expect(calendarMock.markBookingEmailFailed).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      email: 'confirmation',
      subjectToken: SUBJECT_TOKEN,
    })
    // The code Mel reads carries no name, no address and no body.
    expect(JSON.stringify(outcome)).not.toContain('camille@example.fr')
    expect(JSON.stringify(outcome)).not.toContain('Camille')
  })

  it("carries Google's machine-readable reason in the code Mel logs", async () => {
    gmailMock.sendGmailMessage.mockResolvedValue({
      ok: false,
      error: 'unauthorized',
      status: 403,
      reason: 'insufficientPermissions',
    })

    const outcome = await sendBookingConfirmationEmail({
      event,
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({
      ok: false,
      detail: 'gmail unauthorized status=403 reason=insufficientPermissions',
    })
  })

  it('reports a failed mark too, so the caller logs a second code', async () => {
    gmailMock.sendGmailMessage.mockResolvedValue({ ok: false, error: 'timeout' })
    calendarMock.markBookingEmailFailed.mockResolvedValue({ ok: false, error: 'request-failed', status: 500 })

    const outcome = await sendBookingConfirmationEmail({
      event,
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({
      ok: false,
      detail: 'gmail timeout',
      markDetail: 'events patch request-failed status=500',
    })
  })

  it('refuses to compose a message the event cannot describe, and marks the event', async () => {
    const outcome = await sendBookingConfirmationEmail({
      event: { ...event, iCalUid: undefined },
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({ ok: false, detail: 'compose calendar-uid-missing' })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()
    expect(calendarMock.markBookingEmailFailed).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      email: 'confirmation',
      subjectToken: SUBJECT_TOKEN,
    })
  })

  it('leaves no mail without a manage link: the validated body always carries it', async () => {
    const outcome = await sendBookingConfirmationEmail({
      event,
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: undefined,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({ ok: false, detail: 'compose manage-link-unset' })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()
  })
})

describe('sendBookingUpdateEmail', () => {
  it('sends the update with the next sequence, the same UID and the previous slot', async () => {
    const outcome = await sendBookingUpdateEmail({
      event,
      slot: SLOT,
      previousStart: '2026-11-10T09:00:00.000Z',
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      emailCounter: '0',
      googleSequence: 1,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({ ok: true })

    const source = sentMessage()
    const text = decodedPart(source, 'Content-Type: text/plain;')
    expect(text).toContain('Votre échange Spark est déplacé.')
    expect(text).toContain('Date : jeudi 12 novembre 2026')
    expect(text).toContain('Il remplace le créneau initialement prévu le mardi 10 novembre 2026 à 10:00.')

    const file = sentCalendarFile()
    expect(file).toContain('METHOD:REQUEST')
    expect(file).toContain('SEQUENCE:1')
    expect(file).toContain('UID:softnabc0123456789abcdefghijkl@google.com')

    // The update also dates its slot: a reschedule re-arms the reminder's grace too.
    expect(calendarMock.storeBookingEmailSentAt).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      sentAt: SENT_AT.toISOString(),
      subjectToken: SUBJECT_TOKEN,
    })
  })

  it('hides the validated preheader at the top of the HTML part, and leaves it out of the text part', async () => {
    await sendBookingUpdateEmail({
      event,
      slot: SLOT,
      previousStart: '2026-11-10T09:00:00.000Z',
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      emailCounter: '0',
      googleSequence: 1,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(
      sentHtml().startsWith(
        hiddenPreheader('Votre nouveau créneau est enregistré. Votre agenda se met à jour avec la pièce jointe.'),
      ),
    ).toBe(true)
    expect(sentText()).not.toContain('Votre agenda se met à jour avec la pièce jointe.')
  })

  it('counts one step per change, even when Google did not move its own sequence', async () => {
    await sendBookingUpdateEmail({
      event,
      slot: SLOT,
      previousStart: '2026-11-10T09:00:00.000Z',
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      emailCounter: '1',
      googleSequence: 1,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(sentCalendarFile()).toContain('SEQUENCE:2')
  })
})

describe('sendBookingCancellationEmail', () => {
  it('sends the cancellation with a CANCEL file, no link and the next sequence', async () => {
    const outcome = await sendBookingCancellationEmail({
      event,
      slot: SLOT,
      emailCounter: '1',
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({ ok: true })

    const source = sentMessage()
    const text = decodedPart(source, 'Content-Type: text/plain;')
    expect(text).toContain('Votre échange Spark prévu le jeudi 12 novembre 2026 à 14:30 (heure de Paris) est annulé.')
    expect(text).toContain('réserver un nouvel échange quand vous le souhaitez : https://softn.io/?rdv#assistant')
    expect(text).not.toContain(MEET_LINK)

    const file = sentCalendarFile()
    expect(file).toContain('METHOD:CANCEL')
    expect(file).toContain('STATUS:CANCELLED')
    expect(file).toContain('SEQUENCE:2')
    expect(file).toContain('DESCRIPTION:Cet échange Spark est annulé.')
    expect(file).not.toContain('LOCATION:')
    expect(file).not.toContain('meet.google.com')
  })

  it('hides the validated preheader at the top of the HTML part, and leaves it out of the text part', async () => {
    await sendBookingCancellationEmail({
      event,
      slot: SLOT,
      emailCounter: '1',
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(
      sentHtml().startsWith(
        hiddenPreheader("L'annulation est enregistrée. Vous pouvez réserver à nouveau quand vous le souhaitez."),
      ),
    ).toBe(true)
    expect(sentText()).not.toContain("L'annulation est enregistrée.")
  })
})

describe('sendBookingReminderEmail', () => {
  it('sends the reminder without a calendar file, with its hidden preheader and its links', async () => {
    const outcome = await sendBookingReminderEmail({
      event,
      slot: SLOT,
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({ ok: true })

    const source = sentMessage()
    // No calendar file: the call is already in the guest's calendar, and nothing is proposed again.
    expect(source).not.toContain('text/calendar')
    expect(source).not.toContain('invitation.ics')
    expect(source).toContain('Content-Type: multipart/alternative;')

    const text = decodedPart(source, 'Content-Type: text/plain;')
    expect(text).toContain('Bonjour Camille,')
    expect(text).toContain('Un petit rappel : nous nous retrouvons bientôt pour votre échange Spark.')
    expect(text).toContain('Date : jeudi 12 novembre 2026')
    expect(text).toContain(`Lien de connexion : ${MEET_LINK}`)
    expect(text).toContain(`l'appel, ou l'annuler : ${MANAGE_LINK}`)

    // The validated preview line, hidden, and absent from the plain-text part.
    expect(sentHtml().startsWith(hiddenPreheader("C'est bientôt. Voici le lien de connexion."))).toBe(true)
    expect(sentText()).not.toContain("C'est bientôt.")

    // Only the confirmation and the update date a slot: the reminder leaves the grace untouched.
    expect(calendarMock.storeBookingEmailSentAt).not.toHaveBeenCalled()
  })

  it('leaves no reminder without a Meet link or a manage link, and marks the event', async () => {
    const outcome = await sendBookingReminderEmail({
      event,
      slot: SLOT,
      meetLink: undefined,
      manageLink: MANAGE_LINK,
      rules: BOOKING_RULES,
      subjectToken: SUBJECT_TOKEN,
      sentAt: SENT_AT,
    })

    expect(outcome).toEqual({ ok: false, detail: 'compose meet-link-missing' })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()
    expect(calendarMock.markBookingEmailFailed).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      email: 'reminder',
      subjectToken: SUBJECT_TOKEN,
    })
  })
})

describe('preheaders of the booking emails', () => {
  /** Parameters the four templates share, filled with a slot the tests can read. */
  const PARAMETERS = {
    firstName: 'Camille',
    date: 'jeudi 12 novembre 2026',
    time: '14:30',
    duration: '30 minutes',
    meetLink: MEET_LINK,
    manageLink: MANAGE_LINK,
    bookingLink: 'https://softn.io/?rdv#assistant',
    rescheduleNoticeHours: '12',
    previousDate: 'mardi 10 novembre 2026',
    previousTime: '10:00',
  }

  it('hides the preview line of every email, the reminder included, with its parameters filled', () => {
    for (const kind of ['confirmation', 'update', 'cancellation', 'reminder'] as const) {
      const preheader = interpolate(bookingEmails[kind].preheader, PARAMETERS)

      // No placeholder survives, and the hidden line is the first element of the HTML body.
      expect(preheader).not.toMatch(/\{\w+\}/)
      expect(
        htmlBody({ text: 'Corps', links: [], preheader, signature: bookingEmails.signature }).startsWith(
          hiddenPreheader(preheader),
        ),
      ).toBe(true)
    }
  })
})

describe('rendered copy of the four booking emails', () => {
  /** The four emails as their production builder renders them, one content per kind. */
  const contentOf = (kind: 'confirmation' | 'update' | 'cancellation' | 'reminder'): BookingEmailContent => {
    const contents = {
      confirmation: () =>
        confirmationEmailContent({
          firstName: 'Camille',
          slot: SLOT,
          rules: BOOKING_RULES,
          meetLink: MEET_LINK,
          manageLink: MANAGE_LINK,
        }),
      update: () =>
        updateEmailContent({
          firstName: 'Camille',
          slot: SLOT,
          previousStart: '2026-11-10T09:00:00.000Z',
          rules: BOOKING_RULES,
          meetLink: MEET_LINK,
          manageLink: MANAGE_LINK,
        }),
      cancellation: () => cancellationEmailContent({ firstName: 'Camille', slot: SLOT, rules: BOOKING_RULES }),
      reminder: () =>
        reminderEmailContent({
          firstName: 'Camille',
          slot: SLOT,
          rules: BOOKING_RULES,
          meetLink: MEET_LINK,
          manageLink: MANAGE_LINK,
        }),
    }
    const content = contents[kind]()
    if (content === null) throw new Error(`the ${kind} content must build`)
    return content
  }

  for (const kind of ['confirmation', 'update', 'cancellation', 'reminder'] as const) {
    it(`the ${kind} leaves no placeholder unfilled, in the text and the HTML`, () => {
      const content = contentOf(kind)

      expect(content.text).not.toMatch(/\{\w+\}/)
      expect(content.html).not.toMatch(/\{\w+\}/)
      expect(content.subject).not.toMatch(/\{\w+\}/)
    })

    it(`the ${kind} closes on the three-line signature and the footer of its copy`, () => {
      const content = contentOf(kind)

      // A blank line separates the closing from the signature, in the text part.
      expect(content.text).toMatch(/\n\nMélanie\nFounder\nSoftn\.io\n\n—\n/)
      expect(content.text.endsWith(bookingEmails[kind].body.split('\n').pop() ?? '')).toBe(true)
    })

    it(`the ${kind} greys its signature and links the studio line, in the HTML part alone`, () => {
      const content = contentOf(kind)

      // The signature is a paragraph of its own, grey, its last line linked to the site...
      expect(content.html).toContain(
        '<p style="color:#5e577f">Mélanie<br />\r\n' +
          'Founder<br />\r\n' +
          '<a href="https://softn.io" style="color:#8b5cf6">Softn.io</a></p>',
      )
      // ...started by its own closing paragraph, which the blank line of the text produced.
      expect(content.html).toMatch(/<p>[^<]*<\/p>\r\n<p style="color:#5e577f">/)
      // The text part keeps the three plain lines, unlinked and unstyled.
      expect(content.text).toContain('\nMélanie\nFounder\nSoftn.io')
      expect(content.text).not.toContain('<a href')
    })

    it(`the ${kind} carries exactly the links the validated copy places in it`, () => {
      const content = contentOf(kind)

      if (kind === 'cancellation') {
        // No Meet link and no manage link: the appointment no longer exists.
        expect(content.text).toContain('https://softn.io/?rdv#assistant')
        expect(content.text).not.toContain(MEET_LINK)
        expect(content.text).not.toContain(MANAGE_LINK)
        // The plain-text part keeps the raw address, and never the HTML label...
        expect(content.text).toContain('https://softn.io/?rdv#assistant')
        expect(content.text).not.toContain(bookingEmails.cancellation.bookingLinkLabel)
        // ...while the HTML part shows it behind the validated label of the cancellation copy.
        expect(content.html).toContain(
          `<a href="https://softn.io/?rdv#assistant">${bookingEmails.cancellation.bookingLinkLabel}</a>`,
        )
        expect(content.html).not.toContain('>https://softn.io/?rdv#assistant</a>')
      } else {
        expect(content.text).toContain(MEET_LINK)
        expect(content.text).toContain(MANAGE_LINK)
        // The Meet address is printed as it is...
        expect(content.html).toContain(`<a href="${MEET_LINK}">${MEET_LINK}</a>`)
        // ...and the manage link is shown behind the validated label, its raw URL never reaching the
        // guest's eyes.
        expect(content.html).toContain(`<a href="${MANAGE_LINK}">${bookingManage.calendarEvent.linkLabel}</a>`)
        expect(content.html).not.toContain(`>${MANAGE_LINK}</a>`)
      }
    })
  }

  it('renders the rebooking link of the cancellation behind its validated label', () => {
    const content = cancellationEmailContent({ firstName: 'Camille', slot: SLOT, rules: BOOKING_RULES })
    if (content === null) throw new Error('the cancellation content must build')

    // The copy sentence keeps the address in the plain-text part...
    expect(content.text).toContain(
      "Si vous changez d'avis, vous pouvez réserver un nouvel échange quand vous le souhaitez : https://softn.io/?rdv#assistant",
    )
    // ...and the HTML part replaces it with the words Mel validated, exactly like the manage link.
    expect(content.html).toContain('<a href="https://softn.io/?rdv#assistant">Réserver un nouvel échange</a>')
    expect(content.html).not.toContain('>https://softn.io/?rdv#assistant</a>')
  })

  it('the calendar description fills the manage line of the manage copy, and nothing else', () => {
    const description = invitationDescription({
      duration: '30 minutes',
      meetLink: MEET_LINK,
      manageLink: MANAGE_LINK,
    })

    expect(description).toContain('Échange Spark : 30 minutes en visio, avec Softn.io.')
    expect(description).toContain(`Lien de connexion : ${MEET_LINK}`)
    expect(description).toContain(interpolate(bookingManage.calendarEvent.line, { link: MANAGE_LINK }))
    expect(description).not.toMatch(/\{\w+\}/)
  })
})
