import { describe, expect, it } from 'vitest'
import { formatSlotLabel } from './labels'
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

/** Slots on a Tuesday, in the Paris morning window. */
const SLOTS = ['2026-11-03T08:30:00.000Z', '2026-11-03T09:30:00.000Z'] as const

const slotOf = (start: string): { start: string; end: string } => ({
  start,
  end: new Date(Date.parse(start) + TEST_RULES.slotMinutes * 60_000).toISOString(),
})

describe('formatSlotLabel', () => {
  it('names the Paris weekday, date and hour of the slot, in French', () => {
    // 09:30 UTC is 09:30+01:00 in Paris on Tuesday 3 November 2026 (winter time), inside the rules'
    // first working window: the label says 09:30 Paris, never 08:30.
    expect(formatSlotLabel(slotOf(SLOTS[0]), TEST_RULES)).toMatch(/mardi.*3 novembre.*09:30/)
  })

  it('reads the slot in the rules time zone, not in UTC', () => {
    // 08:30 UTC is 09:30 in Paris in November: the label must say 09:30, never 08:30.
    expect(formatSlotLabel(slotOf(SLOTS[0]), TEST_RULES)).toContain('09:30')
    expect(formatSlotLabel(slotOf(SLOTS[0]), TEST_RULES)).not.toContain('08:30')
  })

  it('is stable for the same instant, and differs between instants', () => {
    expect(formatSlotLabel(slotOf(SLOTS[0]), TEST_RULES)).toBe(formatSlotLabel(slotOf(SLOTS[0]), TEST_RULES))
    expect(formatSlotLabel(slotOf(SLOTS[0]), TEST_RULES)).not.toBe(formatSlotLabel(slotOf(SLOTS[1]), TEST_RULES))
  })
})
