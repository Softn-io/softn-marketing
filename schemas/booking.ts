/*
 * Server-only Zod schemas of the booking API. Client code imports `bookingLimits` instead:
 * importing this module would ship Zod to the browser, whose JIT probe calls `Function("")` and
 * trips the production CSP.
 */
import { z } from 'zod'
import { chatbot } from '@/locales/fr/chatbot'
import {
  BOOKING_EMAIL_MAX_LENGTH,
  BOOKING_HONEYPOT_FIELD,
  BOOKING_NAME_MAX_LENGTH,
  BOOKING_NEED_MAX_LENGTH,
  BOOKING_PHONE_MAX_LENGTH,
  getBookingEmailError,
  getBookingPhoneError,
} from './bookingLimits'

export * from './bookingLimits'

/** Room kept for the characters that may be stripped before the final bound is applied. */
const CONTROL_CHARACTER_COUNT_MARGIN = 64

/** Control characters a single-line field never needs, DEL included. */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g

/** Returns the text without its control characters. */
const stripControlCharacters = (value: string): string => value.replace(CONTROL_CHARACTERS, '')

/**
 * Text a visitor types in a single-line field, with control characters removed.
 *
 * A newline or a tab inside a name or a need would otherwise let a visitor forge extra labelled lines
 * in the calendar event description Mel reads. The characters are dropped first, then the value is
 * trimmed and bounded, so the shape of the event stays the one the code builds. The raw length is
 * capped one step earlier, so a hostile payload cannot make the server clean megabytes of text.
 */
const printableText = (maxLength: number) =>
  z
    .string()
    .max(maxLength + CONTROL_CHARACTER_COUNT_MARGIN)
    .transform(stripControlCharacters)
    .pipe(z.string().trim().min(1).max(maxLength))

/**
 * Body of a `POST /api/booking` request.
 *
 * Consent is a literal `true` only: the instant it was given is stamped by the server on receipt, and
 * a booking without recorded consent is rejected before anything is read from the body. The need, the
 * slot and the identity are all bounded here, so nothing unbounded reaches the calendar or Baserow.
 * The e-mail is trimmed and lowercased so `  Mel@Example.FR ` and `mel@example.fr` are the same
 * address. The phone number, structure and role are optional, and the structure and role are
 * restricted to the options the flow offers.
 */
export const BookingRequestSchema = z.object({
  consent: z.literal(true),
  [BOOKING_HONEYPOT_FIELD]: z.string().max(200).default(''),
  need: printableText(BOOKING_NEED_MAX_LENGTH).pipe(z.string().trim().min(1)),
  slot: z.iso.datetime(),
  firstName: printableText(BOOKING_NAME_MAX_LENGTH).pipe(z.string().trim().min(1)),
  lastName: printableText(BOOKING_NAME_MAX_LENGTH).pipe(z.string().trim().min(1)),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(BOOKING_EMAIL_MAX_LENGTH)
    .pipe(z.email())
    .refine((value) => getBookingEmailError(value) === null),
  phone: z
    .string()
    .trim()
    .max(BOOKING_PHONE_MAX_LENGTH)
    .refine((value) => getBookingPhoneError(value) === null)
    .optional(),
  structure: z.enum(chatbot.booking.steps.structure.options).optional(),
  role: z.enum(chatbot.booking.steps.role.options).optional(),
})

export type BookingRequest = z.infer<typeof BookingRequestSchema>
