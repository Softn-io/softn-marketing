import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { BOOKING_EVENT_ID_ATTEMPTS, bookingEventId, bookingEventIdAttempt } from './eventId'

/** Characters Google accepts in an event id we supply: base32hex, lowercase. */
const BASE32HEX = /^[0-9a-v]+$/

const SLOT = '2026-06-11T07:30:00.000Z'

describe('bookingEventId', () => {
  it('is the same for the same slot, so two confirmations cannot both create an event', () => {
    expect(bookingEventId(SLOT)).toBe(bookingEventId(SLOT))
  })

  it('differs from one slot to the next', () => {
    expect(bookingEventId(SLOT)).not.toBe(bookingEventId('2026-06-11T08:00:00.000Z'))
    expect(bookingEventId(SLOT)).not.toBe(bookingEventId('2026-06-12T07:30:00.000Z'))
  })

  it('is exactly the id earlier bookings used: attempt 0 is the plain hash of the slot', () => {
    expect(bookingEventId(SLOT)).toBe(`softn${base32hex(createHash('sha256').update(SLOT).digest().subarray(0, 16))}`)
    expect(bookingEventId(SLOT)).toBe(bookingEventIdAttempt(SLOT, 0))
  })

  it('uses only the characters Google accepts, in a readable length', () => {
    const id = bookingEventId(SLOT)

    expect(id).toMatch(BASE32HEX)
    expect(id.startsWith('softn')).toBe(true)
    expect(id.length).toBeGreaterThanOrEqual(5)
    expect(id.length).toBeLessThanOrEqual(1024)
  })
})

describe('bookingEventIdAttempt', () => {
  it('returns a deterministic id per attempt, different from the others', () => {
    const ids = Array.from({ length: BOOKING_EVENT_ID_ATTEMPTS }, (_unused, attempt) =>
      bookingEventIdAttempt(SLOT, attempt),
    )

    expect(new Set(ids).size).toBe(BOOKING_EVENT_ID_ATTEMPTS)
    for (const id of ids) expect(id).toMatch(BASE32HEX)
    expect(ids[0]).toBe(bookingEventId(SLOT))
  })

  it('keeps the attempts of two different slots apart', () => {
    const other = '2026-06-12T07:30:00.000Z'

    for (let attempt = 0; attempt < BOOKING_EVENT_ID_ATTEMPTS; attempt += 1) {
      expect(bookingEventIdAttempt(SLOT, attempt)).not.toBe(bookingEventIdAttempt(other, attempt))
    }
  })
})

/** Independent base32hex encoder, so the assertions do not restate the implementation. */
const base32hex = (bytes: Buffer): string => {
  const alphabet = '0123456789abcdefghijklmnopqrstuv'
  let bits = ''
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0')
  while (bits.length % 5 !== 0) bits += '0'

  let output = ''
  for (let index = 0; index < bits.length; index += 5) {
    output += alphabet.charAt(Number.parseInt(bits.slice(index, index + 5), 2))
  }
  return output
}
