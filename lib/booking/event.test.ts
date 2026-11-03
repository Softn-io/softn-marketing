import { afterEach, describe, expect, it, vi } from 'vitest'
import { interpolate } from '@/lib/interpolate'
import { SITE_URL } from '@/lib/site'
import { bookingManage } from '@/locales/fr/bookingManage'
import { chatbot } from '@/locales/fr/chatbot'
import { formatSlotLabel } from './labels'
import {
  bookingEventDescription,
  bookingEventDescriptionWithFreshLink,
  bookingEventTitle,
  bookingManageLinkOrigin,
  type BookingLead,
} from './event'
import type { BookingRules } from './rules'

/**
 * The schedule these assertions were written for, fixed here: `TEST_RULES` is Mel's to edit, and a
 * schedule change must never rewrite a test. Only the time zone and the call length matter below.
 */
const TEST_RULES: BookingRules = {
  timeZone: 'Europe/Paris',
  weekdays: [1, 2, 3, 4, 5],
  windows: [{ start: '09:30', end: '12:00' }],
  slotMinutes: 30,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  rescheduleNoticeHours: 12,
  horizonDays: 21,
  maxCallsPerDay: 3,
}

const LEAD: BookingLead = {
  need: 'Automatiser mes devis',
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'marie@example.fr',
  consentAt: '2026-10-31T09:00:00.000Z',
}

/** One answer line as the description writes it: the locale line, its label and value filled in. */
const answerLine = (label: string, value: string): string => interpolate(chatbot.booking.event.line, { label, value })

/** Manage line as the invitation carries it: the locale sentence, its link an anchor of the locale. */
const manageLine = (manageUrl: string): string =>
  interpolate(bookingManage.calendarEvent.line, {
    link: `<a href="${manageUrl}">${bookingManage.calendarEvent.linkLabel}</a>`,
  })

/** Description as the calendar holds it after a booking: the answers, then the manage line. */
const storedDescription = (manageUrl: string, lead: BookingLead = LEAD): string =>
  bookingEventDescription({ lead, manageUrl })

describe('bookingEventTitle', () => {
  it('names the call, the visitor and the studio, from the locale', () => {
    expect(bookingEventTitle(LEAD)).toBe('Échange Spark — Marie Dupont x Softn.io')
    expect(chatbot.booking.event.title).toContain('{firstName}')
  })
})

describe('bookingEventDescription', () => {
  it('writes one labelled line per answer, in the order of the reservation', () => {
    const description = bookingEventDescription({ lead: { ...LEAD, phone: '06 12 34 56 78', role: 'Dirigeant' } })

    expect(description.split('\n')).toEqual([
      answerLine(chatbot.booking.steps.need.field, 'Automatiser mes devis'),
      answerLine(chatbot.booking.steps.role.field, 'Dirigeant'),
      answerLine(chatbot.booking.steps.phone.field, '06 12 34 56 78'),
      answerLine(chatbot.booking.steps.email.field, 'marie@example.fr'),
    ])
  })

  it('carries no consent line: the consent lives with the event and the row', () => {
    const description = bookingEventDescription({ lead: LEAD })

    expect(description).not.toContain('Consentement')
    expect(description).not.toContain(LEAD.consentAt)
  })

  it('leaves no empty label behind for an answer the visitor skipped', () => {
    const description = bookingEventDescription({ lead: LEAD })

    expect(description).not.toContain(chatbot.booking.steps.phone.field)
    expect(description).not.toContain(chatbot.booking.steps.structure.field)
    expect(description).not.toContain(chatbot.booking.steps.role.field)
    expect(description.split('\n')).toHaveLength(2)
  })

  it('keeps the answers in the description, where a lost lead is still readable', () => {
    const description = bookingEventDescription({ lead: { ...LEAD, structure: 'PME' } })
    const structureLine = interpolate(chatbot.booking.event.line, {
      label: chatbot.booking.steps.structure.field,
      value: 'PME',
    })

    expect(description).toContain(structureLine)
    expect(description).toContain('marie@example.fr')
  })

  it('appends the manage link as its own line when the deployment builds one', () => {
    const manageUrl = 'https://softn.io/rendez-vous/token-value'
    const description = bookingEventDescription({ lead: LEAD, manageUrl })
    const linkLine = description.split('\n').at(-1) ?? ''

    expect(linkLine).toBe(manageLine(manageUrl))
    // The URL is the target of the link, never its visible text: the label from the locale is.
    expect(linkLine).toContain(`<a href="${manageUrl}">${bookingManage.calendarEvent.linkLabel}</a>`)
    expect(linkLine.endsWith(`>${bookingManage.calendarEvent.linkLabel}</a>`)).toBe(true)
    expect(description).toContain('marie@example.fr')
  })

  it('escapes an answer that carries markup, so a typed tag never becomes one', () => {
    const description = bookingEventDescription({ lead: { ...LEAD, need: '<script>alert("bonjour")</script>' } })

    expect(description).toContain('&lt;script&gt;alert(&quot;bonjour&quot;)&lt;/script&gt;')
    expect(description).not.toContain('<script>')
    expect(description).not.toContain('<')
  })

  it('escapes the ampersands and the quotes of every answer', () => {
    const lead: BookingLead = {
      ...LEAD,
      need: 'Devis & factures',
      structure: `L'atelier "Ampersand" & Cie`,
      role: 'Dirigeant & fondateur',
      phone: '06 12 "34" & 56',
    }
    const description = bookingEventDescription({ lead, manageUrl: 'https://softn.io/rendez-vous/token-value' })

    expect(description).toContain('Devis &amp; factures')
    expect(description).toContain('L&#39;atelier &quot;Ampersand&quot; &amp; Cie')
    expect(description).toContain('Dirigeant &amp; fondateur')
    expect(description).toContain('06 12 &quot;34&quot; &amp; 56')
    // The anchor is the only markup the description carries: one opening tag, one closing tag.
    expect(description.match(/</g) ?? []).toHaveLength(2)
  })

  it('leaves no markup at all in the description of a booking without a link', () => {
    const description = bookingEventDescription({ lead: { ...LEAD, need: '<b>Devis</b>' } })

    expect(description).toContain('&lt;b&gt;Devis&lt;/b&gt;')
    expect(description).not.toContain('<')
  })

  it('writes no management line when there is no link to write', () => {
    const description = bookingEventDescription({ lead: LEAD })

    expect(description).not.toContain(bookingManage.calendarEvent.line.split('{link}')[0])
  })
})

describe('bookingEventDescriptionWithFreshLink', () => {
  const OLD_URL = 'https://softn.io/rendez-vous/old-token'
  const NEW_URL = 'https://softn.io/rendez-vous/new-token'

  it('replaces the anchor as a whole, keeping every answer line around it', () => {
    const refreshed = bookingEventDescriptionWithFreshLink({
      description: storedDescription(OLD_URL),
      manageUrl: NEW_URL,
    })

    expect(refreshed).toContain(NEW_URL)
    expect(refreshed).not.toContain('old-token')
    expect(refreshed).toBe(storedDescription(NEW_URL))
    // One anchor, replaced whole: the old URL leaves no orphaned attribute and no second label.
    expect(refreshed.match(/<a /g) ?? []).toHaveLength(1)
    expect(refreshed.match(/<\/a>/g) ?? []).toHaveLength(1)
    expect(refreshed.match(RegExp(bookingManage.calendarEvent.linkLabel, 'g')) ?? []).toHaveLength(1)
  })

  it('leaves every answer exactly as it was written', () => {
    const lead: BookingLead = { ...LEAD, need: 'Devis & factures', structure: `L'atelier "A"` }
    const refreshed = bookingEventDescriptionWithFreshLink({
      description: storedDescription(OLD_URL, lead),
      manageUrl: NEW_URL,
    })

    expect(refreshed).toBe(storedDescription(NEW_URL, lead))
  })

  it('replaces the URL of another origin, so a preview link is lifted to production', () => {
    const description = storedDescription('https://preview-abc.vercel.app/rendez-vous/old-token')

    expect(bookingEventDescriptionWithFreshLink({ description, manageUrl: NEW_URL })).toBe(storedDescription(NEW_URL))
  })

  it('ignores the manage path inside an answer and replaces the real link', () => {
    const need = 'Reprendre la page /rendez-vous/ de mon site'
    const description = storedDescription(OLD_URL, { ...LEAD, need })
    const refreshed = bookingEventDescriptionWithFreshLink({ description, manageUrl: NEW_URL })

    expect(refreshed).toBe(storedDescription(NEW_URL, { ...LEAD, need }))
    expect(refreshed).toContain(answerLine(chatbot.booking.steps.need.field, need))
    expect(refreshed).toContain(NEW_URL)
    expect(refreshed).not.toContain('old-token')
  })

  it('never mistakes an escaped answer for the link, even when it mimics an anchor', () => {
    const need = '<a href="https://exemple.fr/rendez-vous/faux">ici</a>'
    const description = storedDescription(OLD_URL, { ...LEAD, need })
    const refreshed = bookingEventDescriptionWithFreshLink({ description, manageUrl: NEW_URL })

    expect(refreshed).toBe(storedDescription(NEW_URL, { ...LEAD, need }))
    expect(refreshed).toContain('&lt;a href=&quot;https://exemple.fr/rendez-vous/faux&quot;&gt;ici&lt;/a&gt;')
  })

  it('adds the line to an event that carries no link yet, instead of losing its answers', () => {
    const refreshed = bookingEventDescriptionWithFreshLink({ description: 'Besoin : un site', manageUrl: NEW_URL })

    expect(refreshed.split('\n')).toEqual(['Besoin : un site', manageLine(NEW_URL)])
  })

  it('uses the link line alone when the description is empty', () => {
    expect(bookingEventDescriptionWithFreshLink({ description: '', manageUrl: NEW_URL })).toBe(manageLine(NEW_URL))
  })

  it('replaces the bare URL of an event booked before the line carried an anchor', () => {
    const refreshed = bookingEventDescriptionWithFreshLink({
      description: `Besoin : un site\nlien : ${OLD_URL}`,
      manageUrl: NEW_URL,
    })

    expect(refreshed).toBe(`Besoin : un site\nlien : ${NEW_URL}`)
  })

  it('leaves an answer that mentions the manage path alone, replacing the link after it', () => {
    const need = 'Reprendre la page /rendez-vous/ de mon site'
    const description = `${answerLine(chatbot.booking.steps.need.field, need)}\n${manageLine(OLD_URL)}`

    const refreshed = bookingEventDescriptionWithFreshLink({ description, manageUrl: NEW_URL })

    expect(refreshed.split('\n')).toEqual([answerLine(chatbot.booking.steps.need.field, need), manageLine(NEW_URL)])
  })
})

describe('bookingManageLinkOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps the origin of the request outside production, so a preview links to itself', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    const request = new Request('https://preview-abc.vercel.app/api/booking', { method: 'POST' })

    expect(bookingManageLinkOrigin(request)).toBe('https://preview-abc.vercel.app')
  })

  it('pins the link to the canonical site origin in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')

    const request = new Request('https://preview-abc.vercel.app/api/booking', { method: 'POST' })

    expect(bookingManageLinkOrigin(request)).toBe(SITE_URL)
  })

  it('pins a request whose forged origin and host agree to the canonical site in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    // Both headers carry the forged origin, which is exactly what the same-origin guard compares:
    // the request passes it, and only the production pin keeps the attacker's origin out of the
    // invitation e-mailed to the visitor.
    const forged = new Request('https://evil.example/api/booking', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    })

    expect(bookingManageLinkOrigin(forged)).toBe(SITE_URL)
  })
})

describe('formatSlotLabel', () => {
  it('renders the slot in the studio time zone, on the visitor platform formatting', () => {
    expect(formatSlotLabel({ start: '2026-11-03T08:30:00.000Z', end: '2026-11-03T09:00:00.000Z' }, TEST_RULES)).toBe(
      'mardi 3 novembre à 09:30',
    )
  })

  it('renders the same wall clock across a daylight saving change', () => {
    const summer = formatSlotLabel({ start: '2026-03-30T07:30:00.000Z', end: '2026-03-30T08:00:00.000Z' }, TEST_RULES)
    const winter = formatSlotLabel({ start: '2026-03-27T08:30:00.000Z', end: '2026-03-27T09:00:00.000Z' }, TEST_RULES)

    expect(summer).toContain('09:30')
    expect(winter).toContain('09:30')
  })

  it('returns nothing for an instant it cannot read', () => {
    expect(formatSlotLabel({ start: 'not-a-date', end: 'not-a-date' }, TEST_RULES)).toBe('')
  })
})
