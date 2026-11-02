import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { bookingEventId } from './eventId'

/** Characters Google accepts in an event id we supply: base32hex, lowercase. */
const BASE32HEX = /^[0-9a-v]+$/

describe('bookingEventId', () => {
  it('is the same for the same slot, so two confirmations cannot both create an event', () => {
    expect(bookingEventId('2026-06-11T07:30:00.000Z')).toBe(bookingEventId('2026-06-11T07:30:00.000Z'))
  })

  it('differs from one slot to the next', () => {
    expect(bookingEventId('2026-06-11T07:30:00.000Z')).not.toBe(bookingEventId('2026-06-11T08:00:00.000Z'))
    expect(bookingEventId('2026-06-11T07:30:00.000Z')).not.toBe(bookingEventId('2026-06-12T07:30:00.000Z'))
  })

  it('uses only the characters Google accepts, in a readable length', () => {
    const id = bookingEventId('2026-06-11T07:30:00.000Z')

    expect(id).toMatch(BASE32HEX)
    expect(id.startsWith('softn')).toBe(true)
    expect(id.length).toBeGreaterThanOrEqual(5)
    expect(id.length).toBeLessThanOrEqual(1024)
    expect(id).toBe(
      `softn${base32hex(createHash('sha256').update('2026-06-11T07:30:00.000Z').digest().subarray(0, 16))}`,
    )
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
