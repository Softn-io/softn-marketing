import { describe, expect, it } from 'vitest'
import {
  CONTACT_MESSAGE_MIN_LENGTH,
  getContactEmailError,
  getContactMessageError,
  getContactRequiredError,
  isContactErrorResponse,
  isContactSubmissionTooFast,
  isContactSuccessResponse,
} from './contactLimits'

describe('contact field checks', () => {
  it('reads the e-mail field like the server schema does', () => {
    expect(getContactEmailError('')).toBe('empty')
    expect(getContactEmailError('   ')).toBe('empty')
    expect(getContactEmailError('mel@example.fr')).toBeNull()
    expect(getContactEmailError('  mel@example.fr ')).toBeNull()
    expect(getContactEmailError('not-an-email')).toBe('invalid')
    expect(getContactEmailError('mel@example')).toBe('invalid')
    expect(getContactEmailError(`${'a'.repeat(250)}@example.fr`)).toBe('invalid')
  })

  it('reads the message field on the trimmed value', () => {
    expect(getContactMessageError('')).toBe('empty')
    expect(getContactMessageError('\n   \n')).toBe('empty')
    expect(getContactMessageError('court')).toBe('tooShort')
    expect(getContactMessageError('a'.repeat(CONTACT_MESSAGE_MIN_LENGTH))).toBeNull()
    expect(getContactMessageError(`  ${'a'.repeat(CONTACT_MESSAGE_MIN_LENGTH)}  `)).toBeNull()
  })

  it('reads a required single-line field', () => {
    expect(getContactRequiredError('')).toBe('empty')
    expect(getContactRequiredError('  ')).toBe('empty')
    expect(getContactRequiredError('Camille')).toBeNull()
  })
})

describe('isContactSubmissionTooFast', () => {
  const now = Date.UTC(2026, 10, 16, 18, 0, 0)

  it('flags a form submitted under the minimum delay', () => {
    expect(isContactSubmissionTooFast(String(now - 500), now)).toBe(true)
  })

  it('accepts a form submitted after the delay', () => {
    expect(isContactSubmissionTooFast(String(now - 5_000), now)).toBe(false)
  })

  it('ignores a missing, malformed or future timestamp, so a skewed clock never blocks a visitor', () => {
    expect(isContactSubmissionTooFast('', now)).toBe(false)
    expect(isContactSubmissionTooFast('hier', now)).toBe(false)
    expect(isContactSubmissionTooFast('0', now)).toBe(false)
    expect(isContactSubmissionTooFast(String(now + 60_000), now)).toBe(false)
  })
})

describe('contact response guards', () => {
  it('accepts the success answer and rejects anything else', () => {
    expect(isContactSuccessResponse({ sent: true })).toBe(true)
    expect(isContactSuccessResponse({ sent: false })).toBe(false)
    expect(isContactSuccessResponse({ booked: true })).toBe(false)
    expect(isContactSuccessResponse(null)).toBe(false)
    expect(isContactSuccessResponse([])).toBe(false)
  })

  it('accepts the known error codes only', () => {
    expect(isContactErrorResponse({ error: 'rate-limited' })).toBe(true)
    expect(isContactErrorResponse({ error: 'unavailable' })).toBe(true)
    expect(isContactErrorResponse({ error: 'invalid' })).toBe(true)
    expect(isContactErrorResponse({ error: 'slot-taken' })).toBe(false)
    expect(isContactErrorResponse({ error: 42 })).toBe(false)
    expect(isContactErrorResponse('invalid')).toBe(false)
  })
})
