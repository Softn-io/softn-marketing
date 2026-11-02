/*
 * Constants, plain types, field checks and response guards of the booking API, with no runtime
 * dependency.
 *
 * This module is imported by the client island, so it must stay free of Zod: Zod v4 probes its JIT
 * support with `Function("")` at load time, which the production CSP (`script-src` without `eval`)
 * blocks. The Zod schemas live in `schemas/booking.ts`, on the server only, and reuse these
 * constants so both sides share one source of truth.
 */

import type { BookingSlot } from '@/lib/booking/availability'

/** Longest need text the booking accepts, in characters. */
export const BOOKING_NEED_MAX_LENGTH = 500

/** Longest first or last name the booking accepts, in characters. */
export const BOOKING_NAME_MAX_LENGTH = 100

/** Longest phone number the booking accepts, in characters. */
export const BOOKING_PHONE_MAX_LENGTH = 40

/** Longest e-mail address the booking accepts; RFC 5321 caps a full address at 254 characters. */
export const BOOKING_EMAIL_MAX_LENGTH = 254

/**
 * Name of the honeypot field of the booking request. A field a visitor never sees: a client that
 * fills it is not a visitor, and the request is answered as if it had succeeded.
 */
export const BOOKING_HONEYPOT_FIELD = 'reference'

/** Slots shown at once in the chat. The proposal asks for 3 to 5 chips, never the whole horizon. */
export const BOOKING_SLOTS_PAGE_SIZE = 4

/** Most slots one slots answer carries, so a visitor browses a page of the horizon, not all of it. */
export const BOOKING_SLOTS_MAX = 60

/** Error codes of the booking Route Handlers, mapped to locale copy by the UI. */
export const BOOKING_ERROR_CODES = ['invalid', 'rate-limited', 'unavailable', 'slot-taken'] as const

/** One error code of the booking Route Handlers. */
export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number]

/** Body of a `GET /api/booking/slots` answer: free slot times only, never a busy detail. */
export type BookingSlotsResponse = {
  /** Free slots, oldest first, bounded by the server. */
  slots: readonly BookingSlot[]
}

/** Body of a `POST /api/booking` success answer. */
export type BookingSuccessResponse = {
  /** Always true: a booking either exists in the calendar or answers an error code. */
  booked: true
}

/** Generic error returned to the UI: it carries no answer and no upstream detail. */
export type BookingErrorResponse = {
  /** Generic error code, mapped to locale copy. */
  error: BookingErrorCode
}

/** Problem the flow can report on one field, mapped to locale copy by the UI. */
export type BookingFieldError = 'empty' | 'invalid'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && Number.isFinite(Date.parse(value))

/**
 * Checks that a parsed JSON body is the `{ slots }` answer of the slots route.
 *
 * The server is same-origin and its contract is tested; this guard only keeps an unexpected body
 * (proxy error page, truncated response) from reaching the flow as a partial list. Unreadable
 * instants are dropped rather than rendered as a slot a visitor could confirm.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value carries a list of readable slots.
 */
export const isBookingSlotsResponse = (value: unknown): value is BookingSlotsResponse =>
  isRecord(value) &&
  Array.isArray(value.slots) &&
  value.slots.every((slot) => isRecord(slot) && isInstant(slot.start) && isInstant(slot.end))

/**
 * Checks that a parsed JSON body is the `{ booked: true }` success answer.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value confirms the booking.
 */
export const isBookingSuccessResponse = (value: unknown): value is BookingSuccessResponse =>
  isRecord(value) && value.booked === true

/**
 * Checks that a parsed JSON body is one of the generic `{ error }` shapes.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value carries a known error code.
 */
export const isBookingErrorResponse = (value: unknown): value is BookingErrorResponse =>
  isRecord(value) && typeof value.error === 'string' && (BOOKING_ERROR_CODES as readonly string[]).includes(value.error)

/**
 * Catches the typos worth reporting before a round trip; the server schema stays authoritative.
 *
 * The label after the final dot holds at least two characters, and no dot, space or `@`: `a@b.c` and
 * `a@b.fr.x` are the typos this catches, while `a@b.co.uk` passes. Every part is a plain character
 * class, so no input makes it backtrack, and the length is capped before it runs.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/

/** Phone shape accepted before a round trip: an optional `+`, then digits and separators only. */
const PHONE_PATTERN = /^\+?[\d\s().-]+$/

/** Separators a visitor may use inside a number, ignored before its shape is checked. */
const PHONE_SEPARATOR_PATTERN = /[\s().-]/g

/** French number written nationally: `0`, then a digit from 1 to 9, then eight more. */
const FRENCH_NATIONAL_PHONE = /^0[1-9]\d{8}$/

/** French number written internationally, the common `+33 (0)6 …` form included. */
const FRENCH_INTERNATIONAL_PHONE = /^\+33(?:\(0\))?[1-9]\d{8}$/

/** Any other international number: a `+`, then the 8 to 15 digits of a country code and a number. */
const INTERNATIONAL_PHONE = /^\+\d{8,15}$/

/** True when every digit of the number is the same one: `0000000000` is not a number. */
const isRepeatedDigit = (digits: string): boolean => /^(\d)\1*$/.test(digits)

/**
 * Checks the e-mail field before submitting, without Zod: the client bundle must not load it.
 *
 * Mirrors the server schema's first two failure modes only; the server re-validates everything it
 * stores. Surrounding whitespace is ignored, as the server trims before validating.
 *
 * @param value Raw field value.
 * @returns `empty` for a blank value, `invalid` for a malformed address, `null` when accepted.
 */
export const getBookingEmailError = (value: string): BookingFieldError | null => {
  const trimmed = value.trim()
  if (trimmed === '') return 'empty'
  if (trimmed.length > BOOKING_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(trimmed)) return 'invalid'
  return null
}

/**
 * Checks the phone field before submitting, without Zod.
 *
 * An empty value is accepted: the field is optional and the flow offers a way past it. Once the usual
 * separators are ignored, a value is accepted when it is one of these, and nothing else:
 *
 * - a French number written nationally, `0` then a digit from 1 to 9 then eight more;
 * - a French number written internationally, `+33` with the common `+33 (0)6 …` form included;
 * - any other international number, a `+` then 8 to 15 digits.
 *
 * A national number of any other length is refused, so is a `00`-prefixed number, and so is a number
 * made of one repeated digit. The server schema applies this same check, which keeps the rule in one
 * place: this module stays free of Zod, so the client bundle never loads it.
 *
 * @param value Raw field value.
 * @returns `invalid` for a malformed number, `null` when accepted or left empty.
 */
export const getBookingPhoneError = (value: string): BookingFieldError | null => {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed.length > BOOKING_PHONE_MAX_LENGTH || !PHONE_PATTERN.test(trimmed)) return 'invalid'

  const compact = trimmed.replace(PHONE_SEPARATOR_PATTERN, '')
  if (isRepeatedDigit(compact.replace(/\D/g, ''))) return 'invalid'
  if (FRENCH_NATIONAL_PHONE.test(compact) || FRENCH_INTERNATIONAL_PHONE.test(compact)) return null

  return INTERNATIONAL_PHONE.test(compact) ? null : 'invalid'
}
