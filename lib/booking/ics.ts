/*
 * Calendar file (`.ics`) of a booking, built by hand in RFC 5545.
 *
 * The file is what keeps a guest's calendar right whatever their mail provider: it is attached to
 * every Softn email of a booking, and its `UID` is the `iCalUID` of the Google event, so a guest on
 * Google updates the copy Google already synced instead of ending up with two entries. Booking and
 * update carry `METHOD:REQUEST` and the new slot; cancellation carries `METHOD:CANCEL` with
 * `STATUS:CANCELLED` and no link, because the appointment no longer exists.
 *
 * Four rules of the format are applied here, and each one has its own test:
 * - CRLF line endings, and every line folded at 75 octets with a leading space, never inside a
 *   multi-byte character;
 * - text values escaped (`\` `;` `,` and line breaks), so a name or an answer cannot break a line;
 * - `DTSTART`/`DTEND` anchored on Europe/Paris with a `VTIMEZONE` block, so the file renders in the
 *   guest's own time zone from a local time that stays right across a daylight-saving change;
 * - parameters (`CN`) quoted and stripped of control characters, so a name cannot break out of a
 *   property line.
 */

import { bookingWallClockOfInstant, type BookingSlot } from './availability'
import type { BookingRules } from './rules'

/** Line ending of every content line, as RFC 5545 requires. */
const CRLF = '\r\n'

/** Octet budget of one content line, line ending excluded. */
const LINE_OCTET_LIMIT = 75

/** Leading space of a folded continuation line, which counts inside the line's budget. */
const FOLDED_LINE_PREFIX = ' '

/**
 * Control characters RFC 5545 forbids in a text value, tab excepted.
 *
 * Line breaks are not in this set: {@link escapeText} already turned them into their `\n` escape
 * before this filter runs, so a description keeps its paragraphs.
 */
const FORBIDDEN_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/**
 * Escapes one text value, as RFC 5545 §3.3.11 defines it.
 *
 * The backslash is escaped first, so the escapes added for the other characters are not escaped
 * again. Line breaks become the two-character `\n` escape, which is what keeps a description's
 * paragraphs readable in the calendar.
 *
 * @param value Value as it is written by the locale or typed by the guest.
 * @returns The same text, inert inside a content line.
 */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(FORBIDDEN_CONTROL_CHARACTERS, '')

/**
 * Splits one content line into lines of at most 75 octets.
 *
 * The split is made on octets, never inside a character: a line of accented text is folded at the
 * last character that still fits. Every line after the first keeps the leading space that marks it
 * as a continuation, and that space counts inside its own 75-octet budget.
 *
 * @param line Complete content line, property name included.
 * @returns The line and its continuations.
 */
const foldLine = (line: string): readonly string[] => {
  if (Buffer.byteLength(line, 'utf8') <= LINE_OCTET_LIMIT) return [line]

  const parts: string[] = []
  let current = ''
  let currentOctets = 0

  for (const character of line) {
    const octets = Buffer.byteLength(character, 'utf8')
    // The first line may use the whole budget; a continuation keeps its leading space inside it.
    const limit = parts.length === 0 ? LINE_OCTET_LIMIT : LINE_OCTET_LIMIT - FOLDED_LINE_PREFIX.length
    if (currentOctets + octets > limit) {
      parts.push(current)
      current = ''
      currentOctets = 0
    }

    current += character
    currentOctets += octets
  }

  parts.push(current)
  return parts
}

/** One content line, folded and closed by CRLF. */
const contentLine = (line: string): string => `${foldLine(line).join(`${CRLF}${FOLDED_LINE_PREFIX}`)}${CRLF}`

/**
 * One parameter value, quoted and stripped of what could break the property line.
 *
 * A name carrying a comma or a colon would otherwise be read as a second parameter or as the value
 * start, and a quote cannot be escaped inside a quoted string per RFC 5545: those characters are
 * removed. Line breaks and the other control characters go with them.
 *
 * @param value Value as it was typed.
 * @returns The value, ready to sit after `name=`.
 */
const parameterValue = (value: string): string =>
  `"${value
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(FORBIDDEN_CONTROL_CHARACTERS, '')
    .replace(/["\\]/g, '')}"`

/**
 * `YYYYMMDDTHHMMSS` of one instant in the rules' time zone, for a `TZID`-anchored property.
 *
 * @param instant Instant as an ISO 8601 string.
 * @param rules Rules holding the time zone.
 * @returns The local date-time, or `null` when the instant cannot be read.
 */
const localDateTime = (instant: string, rules: BookingRules): string | null => {
  const wallClock = bookingWallClockOfInstant(instant, rules)
  return wallClock === null ? null : wallClock.replace(/[-:]/g, '')
}

/**
 * `YYYYMMDDTHHMMSSZ` of one instant, for `DTSTAMP`.
 *
 * @param instant Instant the file is built at.
 * @returns The same instant, in UTC and without separators.
 */
const utcDateTime = (instant: Date): string =>
  instant
    .toISOString()
    .replace(/\.\d{3}/, '')
    .replace(/[-:]/g, '')

/**
 * `VTIMEZONE` block of the time zone the slots are anchored in.
 *
 * A file that names a `TZID` must carry the matching `VTIMEZONE`. The European rules are stable
 * (last Sunday of March at 02:00 local, last Sunday of October at 03:00 local), which is what the
 * `RRULE`s below encode.
 *
 * @param timeZone IANA time zone of the rules.
 * @returns The block, one content line per entry.
 */
const timeZoneBlock = (timeZone: string): readonly string[] => [
  'BEGIN:VTIMEZONE',
  `TZID:${timeZone}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

/**
 * Sequence of the calendar file of one change: 0 at booking, +1 at each change.
 *
 * The counter kept in the event's private properties is what makes the rule exact: Google's own
 * `sequence` also moves for changes this application never emailed about (Mel editing the event by
 * hand bumps it), so it cannot be the increment's source. It is still the value kept when it is
 * exactly the expected one, because it is then the number the guest's synced Google copy carries,
 * and file and copy agree.
 *
 * @param input Counter of the last file sent, and the sequence the Google event answered with.
 * @returns The sequence the next file carries.
 */
export const emailSequenceOf = ({
  counter,
  googleSequence,
}: {
  /** Counter of the last file sent, from the event's private properties. */
  readonly counter: string | undefined
  /** Sequence the Google event carries after the change, when an answer carried one. */
  readonly googleSequence: number | undefined
}): number => {
  const previous = counter !== undefined && /^\d+$/.test(counter) ? Number(counter) : 0
  const expected = previous + 1

  return googleSequence === expected ? googleSequence : expected
}

/** What one calendar file of a booking describes. */
export type BookingInvitationInput = {
  /** `iCalUID` of the Google event, the same value in every file of one booking. */
  uid: string
  /** Sequence of the file: 0 at booking, +1 at each change. */
  sequence: number
  /** Whether the file proposes the event or cancels it. */
  method: 'REQUEST' | 'CANCEL'
  /** Address the file is organized from. */
  organizer: string
  /** Display name of the organizer. */
  organizerName: string
  /** Guest the file is addressed to. */
  attendeeEmail: string
  /** Guest's name, shown by the calendar; omitted when it is empty. */
  attendeeName: string
  /** Slot the file describes: the new one on an update, the cancelled one on a cancellation. */
  slot: BookingSlot
  /** Title of the event, from the booking locale. */
  summary: string
  /** Description of the event, from the booking locale. */
  description: string
  /** Meet link of the event; absent on a cancellation, whose appointment no longer exists. */
  location: string | undefined
  /** Rules holding the time zone the slot is anchored in. */
  rules: BookingRules
  /** Instant the file is built at, written to `DTSTAMP` in UTC. */
  sentAt: Date
}

/**
 * Builds the calendar file attached to one booking email.
 *
 * The event itself is the Google one: the same `UID`, its real bounds, its title as the locale
 * writes it, and the description of the copy the file was validated with. An unreadable slot or a
 * sequence that is not a whole number of steps is refused rather than sent, so a malformed file
 * never reaches a guest's calendar.
 *
 * @param input Identity of the event, click of the file, guest and wording.
 * @returns The file, CRLF and folded, or `null` when the inputs cannot build one.
 */
export const bookingInvitation = ({
  uid,
  sequence,
  method,
  organizer,
  organizerName,
  attendeeEmail,
  attendeeName,
  slot,
  summary,
  description,
  location,
  rules,
  sentAt,
}: BookingInvitationInput): string | null => {
  if (!Number.isInteger(sequence) || sequence < 0) return null

  const start = localDateTime(slot.start, rules)
  const end = localDateTime(slot.end, rules)
  if (start === null || end === null) return null

  const attendee = attendeeName.trim() === '' ? 'ATTENDEE' : `ATTENDEE;CN=${parameterValue(attendeeName)}`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Softn.io//Booking//FR',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    ...timeZoneBlock(rules.timeZone),
    'BEGIN:VEVENT',
    `UID:${escapeText(uid)}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${utcDateTime(sentAt)}`,
    `DTSTART;TZID=${rules.timeZone}:${start}`,
    `DTEND;TZID=${rules.timeZone}:${end}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(location === undefined ? [] : [`LOCATION:${escapeText(location)}`]),
    `ORGANIZER;CN=${parameterValue(organizerName)}:mailto:${organizer}`,
    `${attendee}:mailto:${attendeeEmail}`,
    ...(method === 'CANCEL' ? ['STATUS:CANCELLED'] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(contentLine).join('')
}
