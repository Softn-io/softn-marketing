import { describe, expect, it } from 'vitest'
import {
  CONTACT_LEAD_FIELDS,
  CONTACT_LEAD_REQUIRED_FIELD_CHECKS,
  CONTACT_LEAD_SOURCE,
  CONTACT_LEAD_STATUS,
  contactLeadFields,
} from './lead'

const lead = {
  firstName: 'Camille',
  lastName: 'Durand',
  email: 'camille@example.fr',
  subject: 'dataRequest',
  message: 'Bonjour, je souhaite accéder à mes données.',
} as const

describe('contactLeadFields', () => {
  it('maps one message onto the leads table, with the subject label Mel reads', () => {
    const fields = contactLeadFields({ lead, consentOn: '2026-11-16' })

    expect(fields[CONTACT_LEAD_FIELDS.firstName]).toBe('Camille')
    expect(fields[CONTACT_LEAD_FIELDS.lastName]).toBe('Durand')
    expect(fields[CONTACT_LEAD_FIELDS.email]).toBe('camille@example.fr')
    expect(fields[CONTACT_LEAD_FIELDS.subject]).toBe('Demande relative à mes données personnelles')
    expect(fields[CONTACT_LEAD_FIELDS.need]).toBe('Bonjour, je souhaite accéder à mes données.')
    expect(fields[CONTACT_LEAD_FIELDS.consent]).toBe(true)
    expect(fields[CONTACT_LEAD_FIELDS.consentOn]).toBe('2026-11-16')
    expect(fields[CONTACT_LEAD_FIELDS.source]).toBe(CONTACT_LEAD_SOURCE)
    expect(fields[CONTACT_LEAD_FIELDS.status]).toBe(CONTACT_LEAD_STATUS)
  })

  it('stores the label of every subject, never its code', () => {
    const labels = (['project', 'quote', 'partnership', 'dataRequest', 'other'] as const).map(
      (subject) =>
        contactLeadFields({ lead: { ...lead, subject }, consentOn: '2026-11-16' })[CONTACT_LEAD_FIELDS.subject],
    )

    for (const label of labels) expect(label).toMatch(/^[A-ZÉÀÈ]/)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('verifies every column it writes, the single select included', () => {
    const verified = CONTACT_LEAD_REQUIRED_FIELD_CHECKS.map((check) => check.field)

    expect(verified).toEqual([
      CONTACT_LEAD_FIELDS.firstName,
      CONTACT_LEAD_FIELDS.lastName,
      CONTACT_LEAD_FIELDS.email,
      CONTACT_LEAD_FIELDS.subject,
      CONTACT_LEAD_FIELDS.need,
      CONTACT_LEAD_FIELDS.consent,
      CONTACT_LEAD_FIELDS.consentOn,
      CONTACT_LEAD_FIELDS.source,
    ])
    expect(CONTACT_LEAD_REQUIRED_FIELD_CHECKS.find((check) => check.field === CONTACT_LEAD_FIELDS.subject)?.kind).toBe(
      'single-select',
    )
  })
})
