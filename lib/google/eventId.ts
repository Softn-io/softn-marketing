/*
 * Deterministic identifier of a booking event.
 *
 * Two visitors confirming the same slot at the same moment must not both succeed, and nothing in
 * the stack can serialise them: two serverless instances share no memory and no new store is
 * allowed. The calendar itself is the one shared, transactional component, and it refuses an event
 * id it already holds, so the id is derived from the slot instead of being generated: the second
 * writer is rejected by Google, and the slot stays booked once.
 *
 * Google accepts only base32hex characters (lowercase `a`-`v` and `0`-`9`) in a supplied event id,
 * so the digest is encoded in that alphabet rather than in base64.
 */

import { createHash } from 'node:crypto'

/** Base32hex alphabet, the one a supplied event id may use. */
const BASE32HEX_ALPHABET = '0123456789abcdefghijklmnopqrstuv'

/** Prefix of every booking id, readable in the calendar. Only base32hex characters. */
const EVENT_ID_PREFIX = 'softn'

/** Bytes of the digest kept in the id: 16 bytes encode to exactly 26 base32hex characters. */
const DIGEST_BYTES = 16

const toBase32Hex = (bytes: Buffer): string => {
  let output = ''
  let buffer = 0
  let bits = 0

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += BASE32HEX_ALPHABET.charAt((buffer >>> bits) & 31)
    }
    buffer &= (1 << bits) - 1
  }

  if (bits > 0) output += BASE32HEX_ALPHABET.charAt((buffer << (5 - bits)) & 31)
  return output
}

/**
 * Event id of one slot: the same slot always yields the same id, and no other slot yields it.
 *
 * The id is a pure function of the slot start, so a later cancellation and rebooking of the same
 * slot recomputes the very id the calendar already holds: the existing event can be found or
 * reinstated instead of a second one being created beside it.
 *
 * @param slotStart Slot start as an ISO 8601 instant, as returned by the availability.
 * @returns A base32hex event id, accepted by `events.insert` as it is.
 */
export const bookingEventId = (slotStart: string): string =>
  `${EVENT_ID_PREFIX}${toBase32Hex(createHash('sha256').update(slotStart).digest().subarray(0, DIGEST_BYTES))}`
