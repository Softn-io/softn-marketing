import { describe, expect, it } from 'vitest'
import { BOOKING_HONEYPOT_FIELD, BookingRequestSchema, type BookingRequest } from './booking'
import { getBookingEmailError, getBookingPhoneError } from './bookingLimits'

/** Body of a valid booking, on fictional values, with the fields a test overrides. */
const validBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  consent: true,
  [BOOKING_HONEYPOT_FIELD]: '',
  need: 'Automatiser mes devis',
  slot: '2026-11-03T09:30:00.000Z',
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'marie@example.fr',
  ...overrides,
})

/** Numbers the rule accepts, the empty optional field included. */
const ACCEPTED_PHONES = [
  '0601020304',
  '06 01 02 03 04',
  '06.01.02.03.04',
  '+33601020304',
  '+33 6 01 02 03 04',
  '+33 (0)6 01 02 03 04',
  '+14155552671',
  '',
] as const

/** Numbers the rule refuses: too short, too long, 00-prefixed, or one repeated digit. */
const REFUSED_PHONES = [
  'abc',
  '06-01-02',
  '601020304',
  '06010203',
  '060102030405',
  '0012345678',
  '0000000000',
  '1111111111',
  '+1234567',
  '+1234567890123456',
] as const

describe('getBookingPhoneError', () => {
  it.each(ACCEPTED_PHONES)('accepts %s, on the client and through the server schema', (value) => {
    expect(getBookingPhoneError(value)).toBeNull()
    expect(BookingRequestSchema.safeParse(validBody({ phone: value })).success).toBe(true)
  })

  it.each(REFUSED_PHONES)('refuses %s, on the client and through the server schema', (value) => {
    expect(getBookingPhoneError(value)).toBe('invalid')
    expect(BookingRequestSchema.safeParse(validBody({ phone: value })).success).toBe(false)
  })
})

/** Addresses the rule accepts, the two-label domain and the tagged local part included. */
const ACCEPTED_EMAILS = ['a@b.fr', 'a@b.co.uk', 'prenom.nom+tag@sous.domaine.io'] as const

/** Addresses the rule refuses: under two characters after the final dot, a dot or a space in that
 * label, no label at all, a space in the address, or another dot after that label. */
const REFUSED_EMAILS = ['a@b.c', 'a@b.', 'a@b', 'a@.fr', 'a b@c.fr', 'a@b.c d', 'a@b.fr.x'] as const

describe('getBookingEmailError', () => {
  it.each(ACCEPTED_EMAILS)('accepts %s, on the client and through the server schema', (value) => {
    expect(getBookingEmailError(value)).toBeNull()
    expect(BookingRequestSchema.safeParse(validBody({ email: value })).success).toBe(true)
  })

  it.each(REFUSED_EMAILS)('refuses %s, on the client and through the server schema', (value) => {
    expect(getBookingEmailError(value)).toBe('invalid')
    expect(BookingRequestSchema.safeParse(validBody({ email: value })).success).toBe(false)
  })
})

describe('BookingRequestSchema', () => {
  it('accepts the body the flow sends, with optional answers left out', () => {
    const parsed = BookingRequestSchema.safeParse(validBody())

    expect(parsed.success).toBe(true)
    expect(parsed.data?.[BOOKING_HONEYPOT_FIELD]).toBe('')
  })

  it('accepts a booking that carries the optional answers', () => {
    const parsed = BookingRequestSchema.safeParse({
      ...validBody(),
      phone: '06 12 34 56 78',
      structure: 'PME',
      role: 'Dirigeant',
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual<BookingRequest>({
      consent: true,
      [BOOKING_HONEYPOT_FIELD]: '',
      need: 'Automatiser mes devis',
      slot: '2026-11-03T09:30:00.000Z',
      firstName: 'Marie',
      lastName: 'Dupont',
      email: 'marie@example.fr',
      phone: '06 12 34 56 78',
      structure: 'PME',
      role: 'Dirigeant',
    })
  })

  it('rejects a booking without a consent', () => {
    expect(BookingRequestSchema.safeParse({ ...validBody(), consent: false }).success).toBe(false)
    expect(BookingRequestSchema.safeParse(validBody({ consent: false })).success).toBe(false)

    const withoutConsent = validBody()
    delete withoutConsent['consent']
    expect(BookingRequestSchema.safeParse(withoutConsent).success).toBe(false)
  })

  it('never keeps a consent instant declared by the client', () => {
    // The instant is stamped by the Route Handler on receipt; a payload value must not survive.
    const parsed = BookingRequestSchema.safeParse({ ...validBody(), consentAt: '2000-01-01T00:00:00.000Z' })

    expect(parsed.success).toBe(true)
    expect(JSON.stringify(parsed.data)).not.toContain('2000-01-01')
    expect(JSON.stringify(parsed.data)).not.toContain('consentAt')
  })

  it('rejects a slot instant that is not ISO 8601', () => {
    expect(BookingRequestSchema.safeParse(validBody({ slot: '2026-11-03 09:30' })).success).toBe(false)
  })

  it('trims the need and the names, and rejects the empty remainder', () => {
    const parsed = BookingRequestSchema.safeParse(validBody({ need: '  Automatiser mes devis  ', firstName: '  ' }))
    expect(parsed.success).toBe(false)

    const accepted = BookingRequestSchema.safeParse(validBody({ need: '  Automatiser mes devis ' }))
    expect(accepted.success).toBe(true)
    expect(accepted.data?.need).toBe('Automatiser mes devis')
  })

  it('lowercases and trims the e-mail, and refuses one that is not an address', () => {
    const parsed = BookingRequestSchema.safeParse(validBody({ email: '  Marie@Example.FR  ' }))
    expect(parsed.success).toBe(true)
    expect(parsed.data?.email).toBe('marie@example.fr')

    expect(BookingRequestSchema.safeParse(validBody({ email: 'marie@example' })).success).toBe(false)
    expect(BookingRequestSchema.safeParse(validBody({ email: `${'a'.repeat(250)}@example.fr` })).success).toBe(false)
  })

  it('bounds the need, the names and the phone to the declared lengths', () => {
    expect(BookingRequestSchema.safeParse(validBody({ need: 'a'.repeat(501) })).success).toBe(false)
    expect(BookingRequestSchema.safeParse(validBody({ need: 'a'.repeat(500) })).success).toBe(true)
    expect(BookingRequestSchema.safeParse(validBody({ firstName: 'a'.repeat(101) })).success).toBe(false)
    expect(BookingRequestSchema.safeParse(validBody({ lastName: 'a'.repeat(100) })).success).toBe(true)
    expect(BookingRequestSchema.safeParse(validBody({ phone: '06 12 34 5' })).success).toBe(false)
    expect(BookingRequestSchema.safeParse(validBody({ phone: '06 12 34 56 78' })).success).toBe(true)
  })

  it('strips control characters from the need and the names', () => {
    const parsed = BookingRequestSchema.safeParse(
      validBody({
        need: 'Automatiser\nmes\tdevis',
        firstName: 'Ma\rrie',
        lastName: 'Du\u0007pont',
      }),
    )

    expect(parsed.success).toBe(true)
    // The characters are dropped, not replaced: a single-line field never needed them.
    expect(parsed.data?.need).toBe('Automatisermesdevis')
    expect(parsed.data?.firstName).toBe('Marie')
    expect(parsed.data?.lastName).toBe('Dupont')
  })

  it('refuses a name that is only control characters', () => {
    expect(BookingRequestSchema.safeParse(validBody({ firstName: '\n\t\r' })).success).toBe(false)
  })

  it('cannot smuggle a forged description line through the need', () => {
    const parsed = BookingRequestSchema.safeParse(validBody({ need: 'devis\nStructure : Grand compte' }))

    expect(parsed.success).toBe(true)
    expect(parsed.data?.need).not.toContain('\n')
  })

  it('defaults the honeypot to empty and refuses a value that is too long', () => {
    const withoutHoneypot = validBody()
    delete withoutHoneypot[BOOKING_HONEYPOT_FIELD]

    expect(BookingRequestSchema.safeParse(withoutHoneypot).success).toBe(true)
    expect(BookingRequestSchema.safeParse({ ...validBody(), [BOOKING_HONEYPOT_FIELD]: 'a'.repeat(201) }).success).toBe(
      false,
    )
    expect(BookingRequestSchema.safeParse({ ...validBody(), [BOOKING_HONEYPOT_FIELD]: 'a'.repeat(200) }).success).toBe(
      true,
    )
  })

  it('refuses an optional answer that is not one of the offered options', () => {
    expect(BookingRequestSchema.safeParse({ ...validBody(), structure: 'Astronaute' }).success).toBe(false)
    expect(BookingRequestSchema.safeParse({ ...validBody(), role: 'Astronaute' }).success).toBe(false)
    expect(BookingRequestSchema.safeParse({ ...validBody(), structure: 'TPE' }).success).toBe(true)
    expect(BookingRequestSchema.safeParse({ ...validBody(), role: 'Marketing' }).success).toBe(true)
  })
})
