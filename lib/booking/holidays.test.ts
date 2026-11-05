import { describe, expect, it } from 'vitest'
import { frenchPublicHolidays, isFrenchPublicHoliday } from './holidays'

/** Day keys of one year's holidays, so the expectations read as the calendar they assert. */
const dayKeysOf = (year: number): readonly string[] =>
  frenchPublicHolidays(year).map(
    ({ month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  )

describe('frenchPublicHolidays', () => {
  it('answers the eleven national days of 2024, in calendar order', () => {
    expect(dayKeysOf(2024)).toEqual([
      '2024-01-01',
      '2024-04-01',
      '2024-05-01',
      '2024-05-08',
      '2024-05-09',
      '2024-05-20',
      '2024-07-14',
      '2024-08-15',
      '2024-11-01',
      '2024-11-11',
      '2024-12-25',
    ])
  })

  it('answers the eleven national days of 2026, with its Easter Monday, Ascension and Whit Monday', () => {
    expect(dayKeysOf(2026)).toEqual([
      '2026-01-01',
      '2026-04-06',
      '2026-05-01',
      '2026-05-08',
      '2026-05-14',
      '2026-05-25',
      '2026-07-14',
      '2026-08-15',
      '2026-11-01',
      '2026-11-11',
      '2026-12-25',
    ])
  })

  it('follows a late Easter: 2038, whose Easter Sunday falls on 25 April', () => {
    expect(dayKeysOf(2038)).toEqual([
      '2038-01-01',
      '2038-04-26',
      '2038-05-01',
      '2038-05-08',
      '2038-06-03',
      '2038-06-14',
      '2038-07-14',
      '2038-08-15',
      '2038-11-01',
      '2038-11-11',
      '2038-12-25',
    ])
  })

  it('follows an early Easter: 2008, whose Easter Sunday falls on 23 March', () => {
    const days = dayKeysOf(2008)

    expect(days).toContain('2008-03-24')
    expect(days).toContain('2008-05-01')
    expect(days).toContain('2008-05-12')
    expect(days).toContain('2008-01-01')
    expect(days).toContain('2008-12-25')
  })

  it('answers the distinct days of 2008, whose Ascension falls on the 1st of May', () => {
    expect(dayKeysOf(2008)).toEqual([
      '2008-01-01',
      '2008-03-24',
      '2008-05-01',
      '2008-05-08',
      '2008-05-12',
      '2008-07-14',
      '2008-08-15',
      '2008-11-01',
      '2008-11-11',
      '2008-12-25',
    ])
    expect(isFrenchPublicHoliday('2008-05-01')).toBe(true)
  })

  it('answers an empty list for a year it cannot compute', () => {
    expect(frenchPublicHolidays(0)).toEqual([])
    expect(frenchPublicHolidays(-2026)).toEqual([])
    expect(frenchPublicHolidays(2026.5)).toEqual([])
  })
})

describe('isFrenchPublicHoliday', () => {
  it('reads every fixed day of a year', () => {
    expect(isFrenchPublicHoliday('2026-01-01')).toBe(true)
    expect(isFrenchPublicHoliday('2026-05-01')).toBe(true)
    expect(isFrenchPublicHoliday('2026-05-08')).toBe(true)
    expect(isFrenchPublicHoliday('2026-07-14')).toBe(true)
    expect(isFrenchPublicHoliday('2026-08-15')).toBe(true)
    expect(isFrenchPublicHoliday('2026-11-01')).toBe(true)
    expect(isFrenchPublicHoliday('2026-11-11')).toBe(true)
    expect(isFrenchPublicHoliday('2026-12-25')).toBe(true)
  })

  it('reads the Easter-based days of a year', () => {
    expect(isFrenchPublicHoliday('2026-04-06')).toBe(true)
    expect(isFrenchPublicHoliday('2026-05-14')).toBe(true)
    expect(isFrenchPublicHoliday('2026-05-25')).toBe(true)
  })

  it('recognises the Easter-based days of an early and a late Easter', () => {
    expect(isFrenchPublicHoliday('2008-03-24')).toBe(true)
    expect(isFrenchPublicHoliday('2008-05-12')).toBe(true)
    expect(isFrenchPublicHoliday('2038-04-26')).toBe(true)
    expect(isFrenchPublicHoliday('2038-06-03')).toBe(true)
    expect(isFrenchPublicHoliday('2038-06-14')).toBe(true)
  })

  it('answers false on a day that is not a national holiday', () => {
    expect(isFrenchPublicHoliday('2026-04-07')).toBe(false)
    expect(isFrenchPublicHoliday('2026-05-13')).toBe(false)
    expect(isFrenchPublicHoliday('2026-05-26')).toBe(false)
    expect(isFrenchPublicHoliday('2026-01-02')).toBe(false)
  })

  it('answers false on a key that is not a calendar day', () => {
    expect(isFrenchPublicHoliday('not-a-day')).toBe(false)
    expect(isFrenchPublicHoliday('2026-4-6')).toBe(false)
    expect(isFrenchPublicHoliday('2026-06-10T07:30:00.000Z')).toBe(false)
  })
})
