/*
 * Deterministic identifiers of a booking event: one ordered list per slot.
 *
 * Two visitors confirming the same slot at the same moment must not both succeed, and nothing in
 * the stack can serialise them: two serverless instances share no memory and no new store is
 * allowed. The calendar itself is the one shared, transactional component, and it refuses an event
 * id it already holds, so the ids are derived from the slot instead of being generated: the second
 * writer is rejected by Google, and the slot stays booked once.
 *
 * A slot's first id is the id every earlier booking already used. A later booking of the same slot
 * walks the following ids in order, because Google keeps refusing an id held by a cancelled event,
 * and one held by an event Mel moved by hand. Attempt 0 is exactly the former id, so an existing
 * event is still found where it always was; every later attempt is a different deterministic id,
 * and all of them stay valid base32hex.
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

/** Separator between the slot and the attempt rank in the hashed seed; never part of an id. */
const ATTEMPT_SEPARATOR = '#'

/** Number of ids one slot offers: the number of attempts a booking walks before giving up. */
export const BOOKING_EVENT_ID_ATTEMPTS = 8

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
 * Event id of one slot and one attempt: the same pair always yields the same id, and no other pair
 * yields it.
 *
 * The id is a pure function of the slot start and the attempt rank, so a booking that walks the
 * list after a cancelled or moved event recomputes the very ids the calendar already holds: each
 * attempt either finds the existing event of that id or is refused once, never twice.
 *
 * @param slotStart Slot start as an ISO 8601 instant, as returned by the availability.
 * @param attempt Zero-based rank of the id in the slot's ordered list; attempt 0 is the id earlier
 * bookings used.
 * @returns A base32hex event id, accepted by `events.insert` as it is.
 */
export const bookingEventIdAttempt = (slotStart: string, attempt: number): string => {
  const seed = attempt === 0 ? slotStart : `${slotStart}${ATTEMPT_SEPARATOR}${attempt}`
  return `${EVENT_ID_PREFIX}${toBase32Hex(createHash('sha256').update(seed).digest().subarray(0, DIGEST_BYTES))}`
}

/**
 * First event id of one slot, the one every earlier booking used.
 *
 * Kept as its own export because the id of an existing event never moves: a cancellation and a
 * rebooking of the same slot start from this id and walk the list only when it is still held.
 *
 * @param slotStart Slot start as an ISO 8601 instant, as returned by the availability.
 * @returns The attempt 0 id, a base32hex event id.
 */
export const bookingEventId = (slotStart: string): string => bookingEventIdAttempt(slotStart, 0)
