import { describe, expect, it } from 'vitest'
import {
  getWaitlistEmailError,
  WAITLIST_EMAIL_MAX_LENGTH,
  WAITLIST_FIELDS,
  WAITLIST_MIN_DELAY_MS,
  WAITLIST_SOURCE,
} from './waitlistLimits'

describe('waitlist constants', () => {
  it('exposes the shared field names, distinct from the visible e-mail field', () => {
    expect(WAITLIST_FIELDS.email).toBe('email')
    expect(WAITLIST_FIELDS.honeypot).toBe('reference')
    expect(WAITLIST_FIELDS.honeypot).not.toBe(WAITLIST_FIELDS.email)
    expect(WAITLIST_FIELDS.renderedAt).toBe('renderedAt')
  })

  it('exposes the anti-spam delay and the storage source', () => {
    expect(WAITLIST_MIN_DELAY_MS).toBe(2000)
    expect(WAITLIST_SOURCE).toBe('coming-soon')
  })

  it('caps the e-mail at the RFC 5321 length', () => {
    expect(WAITLIST_EMAIL_MAX_LENGTH).toBe(254)
  })
})

describe('getWaitlistEmailError', () => {
  it('accepts an address surrounded by whitespace', () => {
    expect(getWaitlistEmailError('  mel@example.fr ')).toBeNull()
  })

  it('reports an empty or blank value', () => {
    expect(getWaitlistEmailError('')).toBe('empty')
    expect(getWaitlistEmailError('   ')).toBe('empty')
  })

  it.each(['mel', 'mel@', '@example.fr', 'mel@example', 'mel @example.fr'])('reports %s as invalid', (value) => {
    expect(getWaitlistEmailError(value)).toBe('invalid')
  })
})
