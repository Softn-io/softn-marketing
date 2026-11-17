/*
 * Server-only Zod schemas of the contact API. Client code imports `contactLimits` instead:
 * importing this module would ship Zod to the browser, whose JIT probe calls `Function("")` and
 * trips the production CSP.
 */
import { z } from 'zod'
import {
  CONTACT_ALTCHA_MAX_LENGTH,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_MIN_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_SUBJECTS,
  CONTACT_HONEYPOT_FIELD,
} from './contactLimits'

export * from './contactLimits'

/** Room kept for the characters that may be stripped before the final bound is applied. */
const CONTROL_CHARACTER_COUNT_MARGIN = 64

/** Control characters a single-line field never needs, DEL included; a line break is one of them. */
const SINGLE_LINE_CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g

/**
 * Control characters a message never needs, DEL included. The line feed is kept: the message is a
 * free-text body, and the emails quote it line by line.
 */
const MULTILINE_CONTROL_CHARACTERS = /[\u0000-\u0009\u000B-\u001F\u007F]/g

/** Returns the text without the characters the given pattern removes. */
const stripCharacters =
  (pattern: RegExp) =>
  (value: string): string =>
    value.replace(pattern, '')

/**
 * Text a visitor types in a single-line field, with control characters removed.
 *
 * A newline or a tab inside a name would otherwise let a visitor forge extra labelled lines in the
 * notification Mel reads. The characters are dropped first, then the value is trimmed and bounded,
 * so the shape of the email stays the one the code builds. The raw length is capped one step
 * earlier, so a hostile payload cannot make the server clean megabytes of text.
 */
const printableText = (maxLength: number) =>
  z
    .string()
    .max(maxLength + CONTROL_CHARACTER_COUNT_MARGIN)
    .transform(stripCharacters(SINGLE_LINE_CONTROL_CHARACTERS))
    .pipe(z.string().trim().min(1).max(maxLength))

/**
 * Body of a `POST /api/contact` request.
 *
 * Consent is a literal `true` only: a message without recorded consent is rejected before anything
 * is read from it. The e-mail is trimmed and lowercased so `  Mel@Example.FR ` and
 * `mel@example.fr` are the same address. The Altcha payload is required here and verified by the
 * route, so a submission that never solved a challenge never reaches Baserow.
 */
export const ContactRequestSchema = z.object({
  firstName: printableText(CONTACT_NAME_MAX_LENGTH),
  lastName: printableText(CONTACT_NAME_MAX_LENGTH),
  email: z.string().trim().toLowerCase().max(CONTACT_EMAIL_MAX_LENGTH).pipe(z.email()),
  subject: z.enum(CONTACT_SUBJECTS),
  message: z
    .string()
    .max(CONTACT_MESSAGE_MAX_LENGTH + CONTROL_CHARACTER_COUNT_MARGIN)
    .transform(stripCharacters(MULTILINE_CONTROL_CHARACTERS))
    .pipe(z.string().trim().min(CONTACT_MESSAGE_MIN_LENGTH).max(CONTACT_MESSAGE_MAX_LENGTH)),
  consent: z.literal(true),
  [CONTACT_HONEYPOT_FIELD]: z.string().max(200).default(''),
  renderedAt: z.string().max(20).default(''),
  altcha: z.string().min(1).max(CONTACT_ALTCHA_MAX_LENGTH),
})

export type ContactRequest = z.infer<typeof ContactRequestSchema>
