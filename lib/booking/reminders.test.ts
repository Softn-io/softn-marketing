import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runBookingReminders, type BookingReminderJobResult } from './reminders'

const gmailMock = vi.hoisted(() => ({ sendGmailMessage: vi.fn() }))

const calendarMock = vi.hoisted(() => ({
  listBookingReminderCandidates: vi.fn(),
  markBookingReminderSent: vi.fn(),
  markBookingEmailFailed: vi.fn(),
  storeBookingEmailSentAt: vi.fn(),
}))

vi.mock('@/lib/google/gmail', () => gmailMock)
vi.mock('@/lib/google/calendar', () => calendarMock)

const EVENT_ID = 'softnabc0123456789abcdefghijkl'
const SUBJECT_TOKEN = 'subject-token-value'
const ORIGIN = 'https://softn.io'
const SECRET = 's'.repeat(48)

/** Instant the runs are written for, and the call they remind about: twenty hours later. */
const NOW = new Date('2026-11-11T12:00:00.000Z')
const START = '2026-11-12T08:00:00.000Z'

/** One candidate of the reminder window, as the list helper answers it. */
const candidate = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  eventId: EVENT_ID,
  start: START,
  iCalUid: `${EVENT_ID}@google.com`,
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  guestFirstName: 'Camille',
  guestLastName: 'Meyer',
  guestEmail: 'camille@example.fr',
  remindedFor: undefined,
  emailSentAt: undefined,
  ...overrides,
})

const listAnswering = (...candidates: readonly Readonly<Record<string, unknown>>[]): void => {
  calendarMock.listBookingReminderCandidates.mockResolvedValue({ ok: true, data: candidates })
}

const run = (overrides: Readonly<Record<string, unknown>> = {}) =>
  runBookingReminders({ now: NOW, origin: ORIGIN, subjectToken: SUBJECT_TOKEN, ...overrides })

/**
 * The run of a test that listed its window: throws when it did not, so no assertion on the counts
 * can hide a run that never started.
 */
const listed = (result: BookingReminderJobResult): Extract<BookingReminderJobResult, { ok: true }> => {
  if (!result.ok) throw new Error(`the run must have listed its window: ${result.detail}`)
  return result
}

/** The MIME message of the only reminder the run sent. */
const sentMessage = (): string => {
  const call = gmailMock.sendGmailMessage.mock.calls[0]?.[0] as { message: string } | undefined
  if (call === undefined) throw new Error('no reminder was sent')
  return call.message
}

/** The plain-text part of that message, decoded back to its text. */
const sentText = (): string => {
  const source = sentMessage()
  const markerIndex = source.indexOf('Content-Type: text/plain;')
  if (markerIndex === -1) throw new Error('the message carries no text part')

  const start = source.indexOf('\r\n\r\n', markerIndex) + 4
  const end = source.indexOf('\r\n--', start)
  return Buffer.from(source.slice(start, end).replace(/\r\n/g, ''), 'base64').toString('utf8')
}

beforeEach(() => {
  vi.stubEnv('BOOKING_LINK_SECRET', SECRET)
  gmailMock.sendGmailMessage.mockReset()
  calendarMock.listBookingReminderCandidates.mockReset()
  calendarMock.markBookingReminderSent.mockReset()
  calendarMock.markBookingEmailFailed.mockReset()
  calendarMock.storeBookingEmailSentAt.mockReset()

  gmailMock.sendGmailMessage.mockResolvedValue({ ok: true, data: { messageId: 'message-id' } })
  listAnswering(candidate())
  calendarMock.markBookingReminderSent.mockResolvedValue({ ok: true, data: true })
  calendarMock.markBookingEmailFailed.mockResolvedValue({ ok: true, data: true })
  calendarMock.storeBookingEmailSentAt.mockResolvedValue({ ok: true, data: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('runBookingReminders', () => {
  it('asks for the 24 hours that follow the run, and reminds the call it finds', async () => {
    const result = listed(await run())

    expect(result).toEqual({ ok: true, sent: 1, failed: 0, skipped: 0, details: [] })

    expect(calendarMock.listBookingReminderCandidates).toHaveBeenCalledWith({
      timeMin: NOW.toISOString(),
      timeMax: new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
      subjectToken: SUBJECT_TOKEN,
    })

    // The reminder copy, the signed manage link of the call and no calendar file.
    const message = sentMessage()
    expect(message).toContain('Reply-To: meet@softn.io')
    expect(message).not.toContain('text/calendar')
    expect(sentText()).toContain('Bonjour Camille,')
    expect(sentText()).toContain('Durée : 30 minutes, en visio')
    expect(sentText()).toContain('https://softn.io/rendez-vous/')
    expect(sentText()).not.toContain('{manageLink}')

    // The flag names the slot, and is written after the message left.
    expect(calendarMock.markBookingReminderSent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      slotStart: START,
      subjectToken: SUBJECT_TOKEN,
    })

    // The order matters: a run that dies between the two retries the reminder at the next one
    // rather than losing it.
    const [sendOrder] = gmailMock.sendGmailMessage.mock.invocationCallOrder
    const [flagOrder] = calendarMock.markBookingReminderSent.mock.invocationCallOrder
    expect(sendOrder).toBeDefined()
    expect(flagOrder).toBeDefined()
    expect(sendOrder ?? 0).toBeLessThan(flagOrder ?? 0)
  })

  it('leaves no reminder when the deployment cannot sign a manage link', async () => {
    vi.stubEnv('BOOKING_LINK_SECRET', '')

    const result = listed(await run())

    expect(result).toEqual({
      ok: true,
      sent: 0,
      failed: 1,
      skipped: 0,
      details: ['reminder not sent: compose manage-link-unset'],
    })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()
  })

  it('answers a run that never started when the calendar cannot be listed', async () => {
    calendarMock.listBookingReminderCandidates.mockResolvedValue({ ok: false, error: 'request-failed', status: 502 })

    expect(await run()).toEqual({
      ok: false,
      detail: 'calendar unavailable: events list request-failed status=502',
    })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()
  })

  it('names the credential step of a list failure, so a live 400 is not read as a calendar bug', async () => {
    calendarMock.listBookingReminderCandidates.mockResolvedValue({
      ok: false,
      error: 'request-failed',
      status: 400,
      step: 'sts',
    })

    expect(await run()).toEqual({ ok: false, detail: 'calendar unavailable: sts request-failed status=400' })
  })

  it('skips a call already reminded about, for that very slot', async () => {
    listAnswering(candidate({ remindedFor: START }))

    expect(listed(await run())).toEqual({ ok: true, sent: 0, failed: 0, skipped: 1, details: [] })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()
  })

  it('re-arms a reminder when the call was moved: the flag names another slot', async () => {
    listAnswering(candidate({ remindedFor: '2026-11-13T08:00:00.000Z' }))

    expect(listed(await run()).sent).toBe(1)
    expect(calendarMock.markBookingReminderSent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      slotStart: START,
      subjectToken: SUBJECT_TOKEN,
    })
  })

  it('waits two hours after the confirmation or the update of the same slot', async () => {
    listAnswering(candidate({ emailSentAt: new Date(NOW.getTime() - 60 * 60_000).toISOString() }))

    // One hour after the email: too early, the run leaves the reminder to a later one.
    expect(listed(await run())).toEqual({ ok: true, sent: 0, failed: 0, skipped: 1, details: [] })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()

    // Two hours and a minute after it: due, and the next run sends it.
    expect(listed(await run({ now: new Date(NOW.getTime() + 61 * 60_000) })).sent).toBe(1)
  })

  it('leaves a call whose start cannot be read, without failing the run', async () => {
    listAnswering(candidate({ start: 'not-a-date' }), candidate({ eventId: 'other' }))

    const result = listed(await run())

    expect(result.sent).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.details).toEqual(['reminder skipped: start-unreadable'])
  })

  it('does not flag a reminder that could not leave, so the next run retries it', async () => {
    gmailMock.sendGmailMessage.mockResolvedValue({ ok: false, error: 'request-failed', status: 502 })

    const result = listed(await run())

    expect(result).toEqual({
      ok: true,
      sent: 0,
      failed: 1,
      skipped: 0,
      details: ['reminder not sent: gmail request-failed status=502'],
    })
    expect(calendarMock.markBookingReminderSent).not.toHaveBeenCalled()
    // The mail path marked the event, so Mel can find the guest whose reminder never left.
    expect(calendarMock.markBookingEmailFailed).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      email: 'reminder',
      subjectToken: SUBJECT_TOKEN,
    })
  })

  it('names the credential step of a failed send too', async () => {
    gmailMock.sendGmailMessage.mockResolvedValue({
      ok: false,
      error: 'unauthorized',
      status: 403,
      step: 'delegation-token',
    })

    expect(listed(await run()).details).toEqual(['reminder not sent: delegation-token unauthorized status=403'])
  })

  it("logs Google's machine-readable reason beside the code", async () => {
    calendarMock.markBookingReminderSent.mockResolvedValue({
      ok: false,
      error: 'unauthorized',
      status: 403,
      reason: 'forbiddenForNonOrganizer',
    })

    expect(listed(await run()).details).toEqual([
      'reminder flag not stored: events patch unauthorized status=403 reason=forbiddenForNonOrganizer (duplicate possible)',
    ])
  })

  it('reports a failed failure-mark too, and still leaves the call unreminded', async () => {
    gmailMock.sendGmailMessage.mockResolvedValue({ ok: false, error: 'timeout' })
    calendarMock.markBookingEmailFailed.mockResolvedValue({ ok: false, error: 'not-configured' })

    expect(listed(await run()).details).toEqual([
      'reminder not sent: gmail timeout',
      'reminder failure mark not stored: events patch not-configured',
    ])
  })

  it('logs a distinct code when the flag could not be written after a sent reminder', async () => {
    calendarMock.markBookingReminderSent.mockResolvedValue({ ok: false, error: 'request-failed', status: 412 })

    const result = listed(await run())

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.details).toEqual([
      'reminder flag not stored: events patch request-failed status=412 (duplicate possible)',
    ])
  })

  it('keeps reminding the other calls when one of them fails', async () => {
    listAnswering(candidate({ eventId: 'first' }), candidate({ eventId: 'second', start: '2026-11-12T09:00:00.000Z' }))
    gmailMock.sendGmailMessage
      .mockResolvedValueOnce({ ok: false, error: 'timeout' })
      .mockResolvedValueOnce({ ok: true, data: { messageId: 'message-id' } })

    const result = listed(await run())

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    // The second call was reminded about, flag included.
    expect(calendarMock.markBookingReminderSent).toHaveBeenCalledTimes(1)
    expect(calendarMock.markBookingReminderSent).toHaveBeenCalledWith({
      eventId: 'second',
      slotStart: '2026-11-12T09:00:00.000Z',
      subjectToken: SUBJECT_TOKEN,
    })
  })

  it('reports a call the copy cannot describe, without any personal value', async () => {
    listAnswering(candidate({ guestEmail: undefined }))

    const result = listed(await run())

    expect(result).toEqual({
      ok: true,
      sent: 0,
      failed: 1,
      skipped: 0,
      details: ['reminder not sent: compose guest-missing'],
    })
    expect(gmailMock.sendGmailMessage).not.toHaveBeenCalled()
    for (const personal of [EVENT_ID, 'Camille', 'Meyer', 'camille@example.fr', START]) {
      expect(JSON.stringify(result)).not.toContain(personal)
    }
  })

  it('dates nothing: the reminder leaves the grace of a slot to its confirmation and update', async () => {
    listed(await run())

    expect(calendarMock.storeBookingEmailSentAt).not.toHaveBeenCalled()
  })
})
