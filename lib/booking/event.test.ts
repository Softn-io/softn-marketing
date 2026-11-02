import { describe, expect, it } from 'vitest'
import { interpolate } from '@/lib/interpolate'
import { chatbot } from '@/locales/fr/chatbot'
import { formatSlotLabel } from './labels'
import { bookingEventDescription, bookingEventTitle, type BookingLead } from './event'
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
