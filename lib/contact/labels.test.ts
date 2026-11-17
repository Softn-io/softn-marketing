import { describe, expect, it } from 'vitest'
import { contactDayKeyOfInstant, formatContactReceivedAt } from './labels'

describe('formatContactReceivedAt', () => {
  it('renders the instant in the studio time zone, in French', () => {
    expect(formatContactReceivedAt(new Date('2026-11-16T18:42:00Z'))).toBe('16 novembre 2026 à 19:42')
  })

  it('answers an empty string for an unreadable instant, so no email leaves with an empty date', () => {
    expect(formatContactReceivedAt(new Date('nope'))).toBe('')
  })
})

describe('contactDayKeyOfInstant', () => {
  it('renders the Paris calendar day a Baserow date field without time accepts', () => {
    expect(contactDayKeyOfInstant(new Date('2026-11-16T09:00:00Z'))).toBe('2026-11-16')
  })

  it('counts the day in Paris, not in UTC', () => {
    // 23:30 UTC is already the next day in Paris, and a consent is dated where it was given.
    expect(contactDayKeyOfInstant(new Date('2026-11-16T23:30:00Z'))).toBe('2026-11-17')
    // 00:30 UTC in summer is already 02:30 in Paris: the same day there too.
    expect(contactDayKeyOfInstant(new Date('2026-07-16T00:30:00Z'))).toBe('2026-07-16')
  })

  it('answers an empty string for an unreadable instant', () => {
    expect(contactDayKeyOfInstant(new Date('nope'))).toBe('')
  })
})
