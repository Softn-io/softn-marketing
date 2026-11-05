import { describe, expect, it } from 'vitest'
import type { BookingRules } from './rules'
import { bookingInvitation, emailSequenceOf } from './ics'

/** The schedule these assertions were written for, fixed here: a schedule change never rewrites one. */
const TEST_RULES: BookingRules = {
  timeZone: 'Europe/Paris',
  weekdays: [1, 2, 3, 4, 5],
  windows: [{ start: '09:30', end: '12:00' }],
  slotMinutes: 30,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  rescheduleNoticeHours: 12,
  horizonDays: 21,
  maxCallsPerDay: 3,
}

const SENT_AT = new Date('2026-11-05T08:15:00.000Z')

const SLOT = { start: '2026-11-12T13:30:00.000Z', end: '2026-11-12T14:00:00.000Z' }

/** One booking file, or `null` when the inputs cannot build one. */
const build = (overrides: Readonly<Record<string, unknown>> = {}): string | null =>
  bookingInvitation({
    uid: 'softnabc123@google.com',
    sequence: 0,
    method: 'REQUEST',
    organizer: 'meet@softn.io',
    organizerName: 'Softn.io',
    attendeeEmail: 'marie@example.fr',
    attendeeName: 'Marie Dupont',
    slot: SLOT,
    summary: 'Échange Spark — Marie Dupont x Softn.io',
    description: 'Échange Spark : 30 minutes en visio, avec Softn.io.',
    location: 'https://meet.google.com/abc-defg-hij',
    rules: TEST_RULES,
    sentAt: SENT_AT,
    ...overrides,
  })

/** One booking file the tests are sure about. */
const invitation = (overrides: Readonly<Record<string, unknown>> = {}): string => {
  const file = build(overrides)
  if (file === null) throw new Error('the fixture must build a file')
  return file
}

/** Content lines of one file, folded lines unfolded back into their single logical line. */
const contentLines = (file: string): readonly string[] => {
  const unfolded: string[] = []
  for (const line of file.split('\r\n')) {
    if (line.startsWith(' ')) unfolded[unfolded.length - 1] += line.slice(1)
    else unfolded.push(line)
  }
  return unfolded
}

/** Every line of a file, as octet lengths. */
const lineOctets = (file: string): readonly number[] =>
  file
    .split('\r\n')
    .slice(0, -1)
    .map((line) => Buffer.byteLength(line, 'utf8'))

describe('bookingInvitation', () => {
  it('builds a request file for the booking: same UID, first sequence, Paris bounds and Meet link', () => {
    const file = invitation()

    expect(file.endsWith('\r\n')).toBe(true)
    expect(file).not.toMatch(/(^|[^\r])\n/)

    const lines = contentLines(file)
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines).toContain('METHOD:REQUEST')
    expect(lines).toContain('BEGIN:VTIMEZONE')
    expect(lines).toContain('TZID:Europe/Paris')
    // The block carries both transitions of the zone, so a guest's calendar renders the right offset
    // across a daylight-saving change.
    expect(lines).toContain('BEGIN:DAYLIGHT')
    expect(lines).toContain('TZOFFSETFROM:+0100')
    expect(lines).toContain('TZOFFSETTO:+0200')
    expect(lines).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU')
    expect(lines).toContain('BEGIN:STANDARD')
    expect(lines).toContain('TZOFFSETFROM:+0200')
    expect(lines).toContain('TZOFFSETTO:+0100')
    expect(lines).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU')
    expect(lines).toContain('END:VTIMEZONE')
    expect(lines).toContain('UID:softnabc123@google.com')
    expect(lines).toContain('SEQUENCE:0')
    expect(lines).toContain('DTSTAMP:20261105T081500Z')
    // The guest's slot as Paris wall clock, anchored on the zone the VTIMEZONE describes.
    expect(lines).toContain('DTSTART;TZID=Europe/Paris:20261112T143000')
    expect(lines).toContain('DTEND;TZID=Europe/Paris:20261112T150000')
    expect(lines).toContain('SUMMARY:Échange Spark — Marie Dupont x Softn.io')
    expect(lines).toContain('LOCATION:https://meet.google.com/abc-defg-hij')
    expect(lines).toContain('ORGANIZER;CN="Softn.io":mailto:meet@softn.io')
    expect(lines).toContain('ATTENDEE;CN="Marie Dupont":mailto:marie@example.fr')
    expect(lines).not.toContain('STATUS:CANCELLED')
    expect(lines[lines.length - 2]).toBe('END:VCALENDAR')
  })

  it('builds a cancellation file: CANCEL, STATUS:CANCELLED, the next sequence and no link', () => {
    const file = invitation({
      method: 'CANCEL',
      sequence: 1,
      description: 'Cet échange Spark est annulé.',
      location: undefined,
    })

    const lines = contentLines(file)
    expect(lines).toContain('METHOD:CANCEL')
    expect(lines).toContain('STATUS:CANCELLED')
    expect(lines).toContain('SEQUENCE:1')
    expect(lines).toContain('DESCRIPTION:Cet échange Spark est annulé.')
    expect(lines.some((line) => line.startsWith('LOCATION:'))).toBe(false)
    // The UID never changes: a guest's calendar updates the entry it holds instead of adding one.
    expect(lines).toContain('UID:softnabc123@google.com')
  })

  it('folds every line at 75 octets, without splitting a character', () => {
    const long = `${'é'.repeat(200)} — ${'x'.repeat(200)}`
    const file = invitation({ description: long })

    const octets = lineOctets(file)
    expect(Math.max(...octets)).toBeLessThanOrEqual(75)
    for (const line of file.split('\r\n').slice(0, -1)) {
      // A line that is not valid UTF-8 would be a character split across two lines.
      expect(Buffer.from(line, 'utf8').toString('utf8')).toBe(line)
    }

    const lines = contentLines(file)
    expect(lines).toContain(`DESCRIPTION:${long}`)
  })

  it('escapes the text values a name or a description could break a line with', () => {
    const file = invitation({
      summary: 'Échange, avec Softn.io; suite',
      attendeeName: 'Dupont, Marie; "la suite"',
      description: 'Première ligne\nDeuxième ligne\\fin',
    })

    const lines = contentLines(file)
    expect(lines).toContain('SUMMARY:Échange\\, avec Softn.io\\; suite')
    expect(lines).toContain('DESCRIPTION:Première ligne\\nDeuxième ligne\\\\fin')
    // A comma or a quote cannot break a parameter, and the parameters stay on their property line.
    expect(lines).toContain('ATTENDEE;CN="Dupont, Marie; la suite":mailto:marie@example.fr')
  })

  it('omits the attendee name when the booking carries none', () => {
    const lines = contentLines(invitation({ attendeeName: '' }))

    expect(lines).toContain('ATTENDEE:mailto:marie@example.fr')
  })

  it('refuses an unreadable slot and an impossible sequence instead of sending a wrong file', () => {
    expect(build({ slot: { start: 'not-a-date', end: 'not-a-date' } })).toBeNull()
    expect(build({ sequence: -1 })).toBeNull()
    expect(build({ sequence: 1.5 })).toBeNull()
  })
})

describe('emailSequenceOf', () => {
  it('numbers the first change 1, whether or not the event was booked with a counter', () => {
    expect(emailSequenceOf({ counter: undefined, googleSequence: undefined })).toBe(1)
    expect(emailSequenceOf({ counter: '0', googleSequence: 1 })).toBe(1)
    expect(emailSequenceOf({ counter: '0', googleSequence: undefined })).toBe(1)
  })

  it('counts one step per change of this application, even when Google moved on without one', () => {
    // Mel moving the event by hand bumps the event's own sequence: the counter still decides.
    expect(emailSequenceOf({ counter: '1', googleSequence: 7 })).toBe(2)
    // An event booked before the emails existed carries no counter: the first change is 1.
    expect(emailSequenceOf({ counter: 'not-a-number', googleSequence: 1 })).toBe(1)
  })
})
