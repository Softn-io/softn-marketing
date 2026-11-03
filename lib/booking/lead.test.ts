import { describe, expect, it } from 'vitest'
import type { BookingLead } from './event'
import {
  BOOKING_LEAD_FIELDS,
  BOOKING_LEAD_SOURCE,
  BOOKING_LEAD_STATUS_BOOKED,
  BOOKING_LEAD_STATUS_CANCELLED,
  bookingLeadCancellationFields,
  bookingLeadFields,
  bookingLeadRescheduleFields,
} from './lead'

/** Slot the calendar event was created from, as an ISO 8601 instant. */
const SLOT = { start: '2026-11-03T08:30:00.000Z', end: '2026-11-03T09:00:00.000Z' }

/**
 * A complete lead. The consent instant is late on 31 October in UTC, which is already 1 November in
 * Paris: the row must record the Paris date, not the UTC one.
 */
const LEAD: BookingLead = {
  need: 'Automatiser mes devis',
  firstName: 'Camille',
  lastName: 'Moreau',
  email: 'camille.moreau@example.com',
  phone: '06 12 34 56 78',
  structure: 'PME',
  role: 'Dirigeant',
  consentAt: '2026-10-31T23:30:00.000Z',
}

describe('bookingLeadFields', () => {
  it('builds the row with the exact column names and value types of the leads table', () => {
    expect(bookingLeadFields({ lead: LEAD, slot: SLOT, consentOn: '2026-11-01' })).toEqual({
      [BOOKING_LEAD_FIELDS.firstName]: 'Camille',
      [BOOKING_LEAD_FIELDS.lastName]: 'Moreau',
      [BOOKING_LEAD_FIELDS.email]: 'camille.moreau@example.com',
      [BOOKING_LEAD_FIELDS.need]: 'Automatiser mes devis',
      // Date field with time: an ISO 8601 instant, the one the calendar event was created from.
      [BOOKING_LEAD_FIELDS.slot]: SLOT.start,
      [BOOKING_LEAD_FIELDS.consent]: true,
      // Date field without time: the Paris calendar date, not the UTC one.
      [BOOKING_LEAD_FIELDS.consentOn]: '2026-11-01',
      [BOOKING_LEAD_FIELDS.source]: BOOKING_LEAD_SOURCE,
      // Single select: the option name travels as a plain string.
      [BOOKING_LEAD_FIELDS.status]: BOOKING_LEAD_STATUS_BOOKED,
      [BOOKING_LEAD_FIELDS.phone]: '06 12 34 56 78',
      [BOOKING_LEAD_FIELDS.companyType]: 'PME',
      [BOOKING_LEAD_FIELDS.role]: 'Dirigeant',
    })
  })

  it('names every column of the table, once', () => {
    expect(Object.values(BOOKING_LEAD_FIELDS)).toEqual([
      'First name',
      'Last name',
      'Email',
      'Phone',
      'Company type',
      'Role',
      'Need',
      'Slot',
      'Consent',
      'Consent on',
      'Source',
      'Status',
      'Cancel reason',
    ])
  })

  it('sends this exact JSON body for a sample lead', () => {
    const fields = bookingLeadFields({ lead: LEAD, slot: SLOT, consentOn: '2026-11-01' })

    expect(JSON.stringify(fields)).toBe(
      '{"First name":"Camille","Last name":"Moreau","Email":"camille.moreau@example.com","Need":"Automatiser mes devis","Slot":"2026-11-03T08:30:00.000Z","Consent":true,"Consent on":"2026-11-01","Source":"chatbot","Status":"Spark booked","Phone":"06 12 34 56 78","Company type":"PME","Role":"Dirigeant"}',
    )
  })

  it('carries the consent date of the studio time zone, not of UTC', () => {
    const sameDay = bookingLeadFields({
      lead: { ...LEAD, consentAt: '2026-10-31T09:00:00.000Z' },
      slot: SLOT,
      consentOn: '2026-10-31',
    })
    const nextDayInParis = bookingLeadFields({ lead: LEAD, slot: SLOT, consentOn: '2026-11-01' })

    expect(sameDay[BOOKING_LEAD_FIELDS.consentOn]).toBe('2026-10-31')
    expect(nextDayInParis[BOOKING_LEAD_FIELDS.consentOn]).toBe('2026-11-01')
    // The instant itself is kept out of the row: it lives in the event's private properties.
    expect(JSON.stringify(nextDayInParis)).not.toContain(LEAD.consentAt)
  })

  it('omits the optional answers instead of writing empty cells', () => {
    const required: BookingLead = {
      need: LEAD.need,
      firstName: LEAD.firstName,
      lastName: LEAD.lastName,
      email: LEAD.email,
      consentAt: LEAD.consentAt,
    }

    const fields = bookingLeadFields({ lead: required, slot: SLOT, consentOn: '2026-11-01' })

    expect(fields[BOOKING_LEAD_FIELDS.phone]).toBeUndefined()
    expect(fields[BOOKING_LEAD_FIELDS.companyType]).toBeUndefined()
    expect(fields[BOOKING_LEAD_FIELDS.role]).toBeUndefined()
    expect(JSON.stringify(fields)).not.toContain('Phone')
    expect(JSON.stringify(fields)).not.toContain('Company type')
    expect(JSON.stringify(fields)).not.toContain('Role')
  })

  it('keeps a structure answer in the Company type column', () => {
    const fields = bookingLeadFields({
      lead: { ...LEAD, structure: 'Association' },
      slot: SLOT,
      consentOn: '2026-11-01',
    })

    expect(fields[BOOKING_LEAD_FIELDS.companyType]).toBe('Association')
  })
})

describe('bookingLeadRescheduleFields', () => {
  it('patches the slot only, leaving the status of the pipeline alone', () => {
    const moved = { start: '2026-11-05T13:30:00.000Z', end: '2026-11-05T14:00:00.000Z' }

    expect(bookingLeadRescheduleFields({ slot: moved })).toEqual({ [BOOKING_LEAD_FIELDS.slot]: moved.start })
  })
})

describe('bookingLeadCancellationFields', () => {
  it('writes the cancelled status only, keeping the slot of the appointment', () => {
    expect(bookingLeadCancellationFields()).toEqual({ [BOOKING_LEAD_FIELDS.status]: BOOKING_LEAD_STATUS_CANCELLED })
  })

  it('never writes the values only Mel sets by hand', () => {
    const payload = JSON.stringify(bookingLeadCancellationFields())

    expect(payload).not.toContain('New')
    expect(payload).not.toContain('Spark Done')
  })
})
