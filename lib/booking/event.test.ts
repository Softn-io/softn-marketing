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

describe('bookingEventTitle', () => {
  it('names the call, the visitor and the studio, from the locale', () => {
    expect(bookingEventTitle(LEAD)).toBe('Échange Spark — Marie Dupont x Softn.io')
    expect(chatbot.booking.event.title).toContain('{firstName}')
  })
})

describe('bookingEventDescription', () => {
  it('writes one labelled line per answer, in the order of the reservation', () => {
    const description = bookingEventDescription({ lead: { ...LEAD, phone: '06 12 34 56 78', role: 'Dirigeant' } })
    const line = (label: string, value: string): string => interpolate(chatbot.booking.event.line, { label, value })

    expect(description.split('\n')).toEqual([
      line(chatbot.booking.steps.need.field, 'Automatiser mes devis'),
      line(chatbot.booking.steps.role.field, 'Dirigeant'),
      line(chatbot.booking.steps.phone.field, '06 12 34 56 78'),
      line(chatbot.booking.steps.email.field, 'marie@example.fr'),
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
    const linkLine = interpolate(bookingManage.calendarEvent.line, { link: manageUrl })

    expect(description.split('\n').at(-1)).toBe(linkLine)
    expect(description).toContain('marie@example.fr')
  })

  it('writes no management line when there is no link to write', () => {
    const description = bookingEventDescription({ lead: LEAD })

    expect(description).not.toContain(bookingManage.calendarEvent.line.split('{link}')[0])
  })
})

describe('bookingEventDescriptionWithFreshLink', () => {
  const OLD_URL = 'https://softn.io/rendez-vous/old-token'
  const NEW_URL = 'https://softn.io/rendez-vous/new-token'

  it('replaces the manage URL and keeps every answer line around it', () => {
    const description = `Besoin : automatiser mes devis\n${interpolate(bookingManage.calendarEvent.line, { link: OLD_URL })}`
    const refreshed = bookingEventDescriptionWithFreshLink({ description, manageUrl: NEW_URL })

    expect(refreshed).toContain(NEW_URL)
    expect(refreshed).not.toContain('old-token')
    expect(refreshed).toContain('Besoin : automatiser mes devis')
    expect(refreshed.split('\n')).toHaveLength(2)
  })

  it('replaces the URL of another origin, so a preview link is lifted to production', () => {
    const description = interpolate(bookingManage.calendarEvent.line, {
      link: 'https://preview-abc.vercel.app/rendez-vous/old-token',
    })

    expect(bookingEventDescriptionWithFreshLink({ description, manageUrl: NEW_URL })).toBe(
      interpolate(bookingManage.calendarEvent.line, { link: NEW_URL }),
    )
  })

  it('ignores the manage path inside a visitor answer and replaces the real link', () => {
    const description = `Besoin : un parcours /rendez-vous/interne à refondre\n${interpolate(bookingManage.calendarEvent.line, { link: OLD_URL })}`
    const refreshed = bookingEventDescriptionWithFreshLink({ description, manageUrl: NEW_URL })

    expect(refreshed).toContain('Besoin : un parcours /rendez-vous/interne à refondre')
    expect(refreshed).toContain(NEW_URL)
    expect(refreshed).not.toContain('old-token')
  })

  it('adds the line to an event that carries no link yet, instead of losing its answers', () => {
    const refreshed = bookingEventDescriptionWithFreshLink({ description: 'Besoin : un site', manageUrl: NEW_URL })

    expect(refreshed.split('\n')).toEqual([
      'Besoin : un site',
      interpolate(bookingManage.calendarEvent.line, { link: NEW_URL }),
    ])
  })

  it('uses the link line alone when the description is empty', () => {
    expect(bookingEventDescriptionWithFreshLink({ description: '', manageUrl: NEW_URL })).toBe(
      interpolate(bookingManage.calendarEvent.line, { link: NEW_URL }),
    )
  })

  it('leaves an answer that mentions the manage path alone, replacing the link after it', () => {
    const need = 'Reprendre la page /rendez-vous/ de mon site'
    const description = `Besoin : ${need}\n${interpolate(bookingManage.calendarEvent.line, { link: OLD_URL })}`

    const refreshed = bookingEventDescriptionWithFreshLink({ description, manageUrl: NEW_URL })

    expect(refreshed.split('\n')).toEqual([
      `Besoin : ${need}`,
      interpolate(bookingManage.calendarEvent.line, { link: NEW_URL }),
    ])
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
