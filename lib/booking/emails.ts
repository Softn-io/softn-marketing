/*
 * Booking emails sent by Softn.io: the confirmation after a booking, the update after a reschedule,
 * the cancellation after a cancel, and the reminder sent by the scheduled job a day or so before the
 * call.
 *
 * Google notifies nobody anymore (`sendUpdates=none`), so each of these moments sends its own
 * message through the Gmail API, from the Workspace alias of `lib/site.ts`. The first three carry
 * the calendar file of the booking; the reminder carries none, the call being already in the
 * guest's calendar.
 *
 * Two rules hold everywhere below. All wording comes from `locales/fr/bookingEmails.ts` and
 * `locales/fr/bookingManage.ts`, filled through named parameters: no sentence is built here. And a
 * failure never reaches the visitor: a booking, a reschedule, a cancel or a reminder stands
 * whatever the mail does, the caller only logs the non-personal code returned here, and the event is
 * marked so Mel can find the guest whose message never left.
 */

import { BOOKING_OPEN_QUERY_KEY, SECTION_IDS } from '@/lib/anchors'
import type { GoogleAuthStep } from '@/lib/google/auth'
import { markBookingEmailFailed, storeBookingEmailSentAt, type BookingEmailKind } from '@/lib/google/calendar'
import { sendGmailMessage } from '@/lib/google/gmail'
import { interpolate } from '@/lib/interpolate'
import { BOOKING_SENDER_EMAIL, BOOKING_SENDER_NAME, SITE_URL } from '@/lib/site'
import { bookingEmails } from '@/locales/fr/bookingEmails'
import { bookingManage } from '@/locales/fr/bookingManage'
import type { BookingSlot } from './availability'
import { bookingEventTitle } from './event'
import { bookingInvitation, emailSequenceOf } from './ics'
import { formatBookingDateLabel, formatBookingTimeLabel } from './labels'
import { htmlBody, type HtmlLink, mimeMessage } from './mime'
import type { BookingRules } from './rules'

/** Name of the calendar file, as the guest's mail client shows it. */
export const BOOKING_INVITATION_FILENAME = 'invitation.ics'

/** What every email of one booking needs from the calendar event. */
export type BookingEmailEvent = {
  /** Event the email is about, marked here when the message could not be sent. */
  readonly eventId: string
  /** `iCalUID` of the event; absent when the calendar did not answer one. */
  readonly iCalUid: string | undefined
  /** Guest's first name, from the event's private properties. */
  readonly guestFirstName: string | undefined
  /** Guest's last name, from the event's private properties. */
  readonly guestLastName: string | undefined
  /** Guest's address, from the event's attendee list. */
  readonly guestEmail: string | undefined
}

/** Guest of one booking, once every part of it is known. */
type BookingEmailGuest = {
  readonly firstName: string
  readonly lastName: string
  readonly email: string
}

/** Subject and bodies of one email, ready to be written into a message. */
export type BookingEmailContent = {
  readonly subject: string
  readonly text: string
  readonly html: string
}

/** Outcome of one booking email: sent, or why it could not be, ready to be logged. */
export type BookingEmailOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false
      /** Stage and non-personal code of the failure; never a name, an address or a body. */
      readonly detail: string
      /** Code of the failed mark, present only when the event could not even be marked. */
      readonly markDetail?: string
    }

/** Absolute address of the booking flow, opened on the assistant: the cancellation email's link. */
export const bookingOpenLink = (): string => `${SITE_URL}/?${BOOKING_OPEN_QUERY_KEY}#${SECTION_IDS.agent}`

/**
 * The two links the body of a confirmation, an update or a reminder carries.
 *
 * The Meet address is printed as it is; the manage link is signed and long, so the HTML shows the
 * validated label of `bookingManage.calendarEvent.linkLabel` instead of the URL, while the
 * plain-text part keeps the raw address.
 */
const meetAndManageLinks = (meetLink: string, manageLink: string): readonly HtmlLink[] => [
  { url: meetLink, label: meetLink },
  { url: manageLink, label: bookingManage.calendarEvent.linkLabel },
]

/**
 * Stage and code of a failed call, in the shape the booking routes already log.
 *
 * The step of the credential chain comes first when one failed — the mail send walks the same keyless
 * chain as the calendar — and the name of the call otherwise; the code, the upstream status and
 * Google's machine-readable reason follow. Never an upstream body beyond that reason token, nor a
 * name, an address or a link.
 */
const failureDetail = (
  call: string,
  failure: {
    readonly error: string
    readonly status?: number
    readonly step?: GoogleAuthStep
    readonly reason?: string
  },
): string =>
  `${failure.step ?? call} ${failure.error}${failure.status === undefined ? '' : ` status=${failure.status}`}${
    failure.reason === undefined ? '' : ` reason=${failure.reason}`
  }`

/** The guest of one email, or `null` when the event does not carry every part of it. */
const guestOf = (event: BookingEmailEvent): BookingEmailGuest | null => {
  const { guestFirstName, guestLastName, guestEmail } = event
  if (guestFirstName === undefined || guestLastName === undefined || guestEmail === undefined) return null
  if (guestFirstName.trim() === '' || guestEmail.trim() === '') return null

  return { firstName: guestFirstName, lastName: guestLastName, email: guestEmail }
}

/** The guest's full name, as the calendar file's title and attendee line write it. */
const guestName = (guest: BookingEmailGuest): string => `${guest.firstName} ${guest.lastName}`.trim()

/**
 * Call length as the copy writes it, from the booking rules: « 30 minutes ».
 *
 * @param rules Rules holding the call length.
 * @returns The duration, filled into the locale template.
 */
const durationValue = (rules: BookingRules): string =>
  interpolate(bookingEmails.duration, { minutes: String(rules.slotMinutes) })

/** The four values every email of a booking shares, or `null` when the slot cannot be rendered. */
type BookingSlotValues = {
  readonly firstName: string
  readonly date: string
  readonly time: string
  readonly duration: string
}

/**
 * Renders the guest, the slot and the call length of one email.
 *
 * The date and the time are formatted by `Intl` in the rules' time zone, and the duration is the
 * call length of the same rules filled into the locale's template. An unreadable instant answers
 * `null`, so no email ever leaves with an empty date.
 */
const slotValuesOf = ({
  firstName,
  slot,
  rules,
}: {
  firstName: string
  slot: BookingSlot
  rules: BookingRules
}): BookingSlotValues | null => {
  const date = formatBookingDateLabel(slot.start, rules)
  const time = formatBookingTimeLabel(slot.start, rules)
  if (date === '' || time === '') return null

  return { firstName, date, time, duration: durationValue(rules) }
}

/** Confirmation email of one booking: subject and both bodies, or `null` when a value is missing. */
export const confirmationEmailContent = (input: {
  readonly firstName: string
  readonly slot: BookingSlot
  readonly rules: BookingRules
  readonly meetLink: string
  readonly manageLink: string
}): BookingEmailContent | null => {
  const values = slotValuesOf(input)
  if (values === null) return null

  const { subject, body, preheader } = bookingEmails.confirmation
  const parameters = {
    ...values,
    meetLink: input.meetLink,
    manageLink: input.manageLink,
    rescheduleNoticeHours: String(input.rules.rescheduleNoticeHours),
  }
  const text = interpolate(body, parameters)

  return {
    subject: interpolate(subject, parameters),
    text,
    html: htmlBody({
      text,
      links: meetAndManageLinks(input.meetLink, input.manageLink),
      preheader: interpolate(preheader, parameters),
      signature: bookingEmails.signature,
    }),
  }
}

/** Update email of one reschedule: subject and both bodies, or `null` when a value is missing. */
export const updateEmailContent = (input: {
  readonly firstName: string
  readonly slot: BookingSlot
  readonly previousStart: string
  readonly rules: BookingRules
  readonly meetLink: string
  readonly manageLink: string
}): BookingEmailContent | null => {
  const values = slotValuesOf(input)
  if (values === null) return null

  const previousDate = formatBookingDateLabel(input.previousStart, input.rules)
  const previousTime = formatBookingTimeLabel(input.previousStart, input.rules)
  if (previousDate === '' || previousTime === '') return null

  const { subject, body, preheader } = bookingEmails.update
  const parameters = {
    ...values,
    previousDate,
    previousTime,
    meetLink: input.meetLink,
    manageLink: input.manageLink,
    rescheduleNoticeHours: String(input.rules.rescheduleNoticeHours),
  }
  const text = interpolate(body, parameters)

  return {
    subject: interpolate(subject, parameters),
    text,
    html: htmlBody({
      text,
      links: meetAndManageLinks(input.meetLink, input.manageLink),
      preheader: interpolate(preheader, parameters),
      signature: bookingEmails.signature,
    }),
  }
}

/**
 * Cancellation email of one booking: subject and both bodies, or `null` when a value is missing.
 *
 * The plain-text part prints the raw rebooking address, as it does for every link; the HTML part
 * renders it behind the validated label of `bookingEmails.cancellation.bookingLinkLabel`, exactly
 * like the manage link of the other emails.
 */
export const cancellationEmailContent = (input: {
  readonly firstName: string
  readonly slot: BookingSlot
  readonly rules: BookingRules
}): BookingEmailContent | null => {
  const values = slotValuesOf(input)
  if (values === null) return null

  const bookingLink = bookingOpenLink()
  const { subject, body, preheader, bookingLinkLabel } = bookingEmails.cancellation
  const parameters = { ...values, bookingLink }
  const text = interpolate(body, parameters)

  return {
    subject: interpolate(subject, parameters),
    text,
    html: htmlBody({
      text,
      links: [{ url: bookingLink, label: bookingLinkLabel }],
      preheader: interpolate(preheader, parameters),
      signature: bookingEmails.signature,
    }),
  }
}

/** Reminder email of one booking: subject and both bodies, or `null` when a value is missing. */
export const reminderEmailContent = (input: {
  readonly firstName: string
  readonly slot: BookingSlot
  readonly rules: BookingRules
  readonly meetLink: string
  readonly manageLink: string
}): BookingEmailContent | null => {
  const values = slotValuesOf(input)
  if (values === null) return null

  const { subject, body, preheader } = bookingEmails.reminder
  const parameters = {
    ...values,
    meetLink: input.meetLink,
    manageLink: input.manageLink,
    rescheduleNoticeHours: String(input.rules.rescheduleNoticeHours),
  }
  const text = interpolate(body, parameters)

  return {
    subject: interpolate(subject, parameters),
    text,
    html: htmlBody({
      text,
      links: meetAndManageLinks(input.meetLink, input.manageLink),
      preheader: interpolate(preheader, parameters),
      signature: bookingEmails.signature,
    }),
  }
}

/** Description the calendar file of a booking or an update carries. */
export const invitationDescription = (input: {
  readonly duration: string
  readonly meetLink: string
  readonly manageLink: string
}): string =>
  interpolate(bookingEmails.ics.description, {
    duration: input.duration,
    meetLink: input.meetLink,
    // The manage sentence has one source: the calendar-event line of the manage copy.
    manageLine: interpolate(bookingManage.calendarEvent.line, { link: input.manageLink }),
  })

/** One composed email, as the shared send path below takes it. */
type ComposedBookingEmail = {
  readonly kind: BookingEmailKind
  readonly eventId: string
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string
  /** Calendar file to attach, with its method; absent on the reminder, which carries none. */
  readonly calendarFile: { readonly method: 'REQUEST' | 'CANCEL'; readonly content: string } | undefined
  readonly sentAt: Date
  readonly subjectToken: string | undefined
}

/**
 * Marks one event whose email could not be sent, and answers the code the caller logs.
 *
 * The mark is what makes the failure findable in Mel's calendar; when it fails too, the second code
 * travels back so the caller logs both and the visitor is still never told anything.
 */
const failedOutcome = async ({
  eventId,
  kind,
  detail,
  subjectToken,
}: {
  eventId: string
  kind: BookingEmailKind
  detail: string
  subjectToken: string | undefined
}): Promise<BookingEmailOutcome> => {
  const mark = await markBookingEmailFailed({ eventId, email: kind, subjectToken })
  return mark.ok ? { ok: false, detail } : { ok: false, detail, markDetail: failureDetail('events patch', mark) }
}

/**
 * Sends one composed email, marks the event when the Gmail call fails, and dates the slot when it
 * leaves.
 *
 * The date is what the reminder job's grace reads: it is written for the confirmation and the
 * update alone, once the message has really left, and best effort — a failed write never changes
 * the answer, it only leaves the reminder without a grace to observe.
 */
const sendComposedEmail = async ({
  kind,
  eventId,
  to,
  subject,
  text,
  html,
  calendarFile,
  sentAt,
  subjectToken,
}: ComposedBookingEmail): Promise<BookingEmailOutcome> => {
  const message = mimeMessage({
    from: { name: BOOKING_SENDER_NAME, address: BOOKING_SENDER_EMAIL },
    replyTo: BOOKING_SENDER_EMAIL,
    to,
    sentAt,
    subject,
    text,
    html,
    ...(calendarFile === undefined
      ? {}
      : {
          attachment: {
            filename: BOOKING_INVITATION_FILENAME,
            method: calendarFile.method,
            content: calendarFile.content,
          },
        }),
  })

  const sent = await sendGmailMessage({ message, subjectToken })
  if (!sent.ok) return failedOutcome({ eventId, kind, detail: failureDetail('gmail', sent), subjectToken })

  if (kind === 'confirmation' || kind === 'update') {
    await storeBookingEmailSentAt({ eventId, sentAt: sentAt.toISOString(), subjectToken })
  }

  return { ok: true }
}

/** Arguments of {@link sendBookingConfirmationEmail}, shared by the three emails of a booking. */
type BookingEmailInput = {
  /** The event, as the route holds it after the write it emails about. */
  readonly event: BookingEmailEvent
  /** Slot the email describes. */
  readonly slot: BookingSlot
  /** Rules holding the call length, the notice and the time zone. */
  readonly rules: BookingRules
  /** Subject token of the current request, from {@link readSubjectToken}. */
  readonly subjectToken: string | undefined
  /** Instant the message is written at. Defaults to now; a test passes its own clock. */
  readonly sentAt?: Date
}

/** Arguments of {@link sendBookingConfirmationEmail}. */
export type SendBookingConfirmationEmailInput = BookingEmailInput & {
  /** Meet link of the created event. */
  readonly meetLink: string | undefined
  /** Signed manage link, absent when the deployment cannot sign one. */
  readonly manageLink: string | undefined
}

/** Arguments of {@link sendBookingUpdateEmail}. */
export type SendBookingUpdateEmailInput = BookingEmailInput & {
  /** Start the event left, which the email reminds the guest of. */
  readonly previousStart: string
  /** Meet link of the event, unchanged by the patch. */
  readonly meetLink: string | undefined
  /** Fresh signed manage link, signed for the new start. */
  readonly manageLink: string | undefined
  /** Counter of the last calendar file, as the event carried it before this change. */
  readonly emailCounter: string | undefined
  /** Sequence the patched event answered, when the answer carried one. */
  readonly googleSequence: number | undefined
}

/** Arguments of {@link sendBookingCancellationEmail}. */
export type SendBookingCancellationEmailInput = BookingEmailInput & {
  /** Counter of the last calendar file, as the event carried it before the deletion. */
  readonly emailCounter: string | undefined
}

/**
 * Sends the confirmation of a booking, with the calendar file that adds the call to the guest's
 * calendar.
 *
 * Sent once the event exists, and never before: the file is built from the event's `iCalUID` and
 * its real bounds. A missing piece of the event — the uid, the guest, the Meet link or the manage
 * link — leaves no email rather than a wrong one, and marks the event so Mel can tell the guest.
 *
 * @param input Event, slot, links and rules.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendBookingConfirmationEmail = async (
  input: SendBookingConfirmationEmailInput,
): Promise<BookingEmailOutcome> => {
  const { event, slot, rules, subjectToken } = input
  const kind: BookingEmailKind = 'confirmation'
  const refuse = (detail: string): Promise<BookingEmailOutcome> =>
    failedOutcome({ eventId: event.eventId, kind, detail, subjectToken })

  const guest = guestOf(event)
  if (guest === null) return refuse('compose guest-missing')
  if (event.iCalUid === undefined) return refuse('compose calendar-uid-missing')
  if (input.meetLink === undefined || input.meetLink.trim() === '') return refuse('compose meet-link-missing')
  if (input.manageLink === undefined) return refuse('compose manage-link-unset')

  const content = confirmationEmailContent({
    firstName: guest.firstName,
    slot,
    rules,
    meetLink: input.meetLink,
    manageLink: input.manageLink,
  })
  if (content === null) return refuse('compose slot-unreadable')

  const sentAt = input.sentAt ?? new Date()
  const calendarFile = bookingInvitation({
    uid: event.iCalUid,
    sequence: 0,
    method: 'REQUEST',
    organizer: BOOKING_SENDER_EMAIL,
    organizerName: BOOKING_SENDER_NAME,
    attendeeEmail: guest.email,
    attendeeName: guestName(guest),
    slot,
    summary: bookingEventTitle(guest),
    description: invitationDescription({
      duration: durationValue(rules),
      meetLink: input.meetLink,
      manageLink: input.manageLink,
    }),
    location: input.meetLink,
    rules,
    sentAt,
  })
  if (calendarFile === null) return refuse('compose slot-unreadable')

  return sendComposedEmail({
    kind,
    eventId: event.eventId,
    to: guest.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    calendarFile: { method: 'REQUEST', content: calendarFile },
    sentAt,
    subjectToken,
  })
}

/**
 * Sends the update of a reschedule, with the calendar file that replaces the earlier appointment.
 *
 * The file keeps the booking's `iCalUID` and carries the next sequence, so the guest's calendar
 * updates the entry it already holds instead of adding a second one.
 *
 * @param input Event, new slot, previous start, links, counters and rules.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendBookingUpdateEmail = async (input: SendBookingUpdateEmailInput): Promise<BookingEmailOutcome> => {
  const { event, slot, rules, subjectToken } = input
  const kind: BookingEmailKind = 'update'
  const refuse = (detail: string): Promise<BookingEmailOutcome> =>
    failedOutcome({ eventId: event.eventId, kind, detail, subjectToken })

  const guest = guestOf(event)
  if (guest === null) return refuse('compose guest-missing')
  if (event.iCalUid === undefined) return refuse('compose calendar-uid-missing')
  if (input.meetLink === undefined || input.meetLink.trim() === '') return refuse('compose meet-link-missing')
  if (input.manageLink === undefined) return refuse('compose manage-link-unset')

  const content = updateEmailContent({
    firstName: guest.firstName,
    slot,
    previousStart: input.previousStart,
    rules,
    meetLink: input.meetLink,
    manageLink: input.manageLink,
  })
  if (content === null) return refuse('compose slot-unreadable')

  const sentAt = input.sentAt ?? new Date()
  const sequence = emailSequenceOf({ counter: input.emailCounter, googleSequence: input.googleSequence })
  const calendarFile = bookingInvitation({
    uid: event.iCalUid,
    sequence,
    method: 'REQUEST',
    organizer: BOOKING_SENDER_EMAIL,
    organizerName: BOOKING_SENDER_NAME,
    attendeeEmail: guest.email,
    attendeeName: guestName(guest),
    slot,
    summary: bookingEventTitle(guest),
    description: invitationDescription({
      duration: durationValue(rules),
      meetLink: input.meetLink,
      manageLink: input.manageLink,
    }),
    location: input.meetLink,
    rules,
    sentAt,
  })
  if (calendarFile === null) return refuse('compose slot-unreadable')

  return sendComposedEmail({
    kind,
    eventId: event.eventId,
    to: guest.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    calendarFile: { method: 'REQUEST', content: calendarFile },
    sentAt,
    subjectToken,
  })
}

/**
 * Sends the cancellation of a booking, with the calendar file that withdraws the appointment.
 *
 * The file carries `METHOD:CANCEL` and `STATUS:CANCELLED`, no link and no location: the appointment
 * no longer exists. The counter is the only sequence source here, because a deletion answers no
 * event to read one from.
 *
 * @param input Event, cancelled slot, counter and rules.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendBookingCancellationEmail = async (
  input: SendBookingCancellationEmailInput,
): Promise<BookingEmailOutcome> => {
  const { event, slot, rules, subjectToken } = input
  const kind: BookingEmailKind = 'cancellation'
  const refuse = (detail: string): Promise<BookingEmailOutcome> =>
    failedOutcome({ eventId: event.eventId, kind, detail, subjectToken })

  const guest = guestOf(event)
  if (guest === null) return refuse('compose guest-missing')
  if (event.iCalUid === undefined) return refuse('compose calendar-uid-missing')

  const content = cancellationEmailContent({ firstName: guest.firstName, slot, rules })
  if (content === null) return refuse('compose slot-unreadable')

  const sentAt = input.sentAt ?? new Date()
  const calendarFile = bookingInvitation({
    uid: event.iCalUid,
    sequence: emailSequenceOf({ counter: input.emailCounter, googleSequence: undefined }),
    method: 'CANCEL',
    organizer: BOOKING_SENDER_EMAIL,
    organizerName: BOOKING_SENDER_NAME,
    attendeeEmail: guest.email,
    attendeeName: guestName(guest),
    slot,
    summary: bookingEventTitle(guest),
    description: bookingEmails.ics.cancellationDescription,
    location: undefined,
    rules,
    sentAt,
  })
  if (calendarFile === null) return refuse('compose slot-unreadable')

  return sendComposedEmail({
    kind,
    eventId: event.eventId,
    to: guest.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    calendarFile: { method: 'CANCEL', content: calendarFile },
    sentAt,
    subjectToken,
  })
}

/** Arguments of {@link sendBookingReminderEmail}. */
export type SendBookingReminderEmailInput = BookingEmailInput & {
  /** Meet link of the event; absent when the calendar never carried one. */
  readonly meetLink: string | undefined
  /** Signed manage link, absent when the deployment cannot sign one. */
  readonly manageLink: string | undefined
}

/**
 * Sends the reminder of a call, a day or so before it.
 *
 * The reminder carries no calendar file: the call is already in the guest's calendar, and the file
 * of the booking described it. It is composed from the same copy file as the other emails, hidden
 * preview line included, and its failure is treated like theirs — the event is marked and the
 * caller logs one non-personal code, never the visitor.
 *
 * @param input Event, slot, links and rules.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendBookingReminderEmail = async (input: SendBookingReminderEmailInput): Promise<BookingEmailOutcome> => {
  const { event, slot, rules, subjectToken } = input
  const kind: BookingEmailKind = 'reminder'
  const refuse = (detail: string): Promise<BookingEmailOutcome> =>
    failedOutcome({ eventId: event.eventId, kind, detail, subjectToken })

  const guest = guestOf(event)
  if (guest === null) return refuse('compose guest-missing')
  if (input.meetLink === undefined || input.meetLink.trim() === '') return refuse('compose meet-link-missing')
  if (input.manageLink === undefined) return refuse('compose manage-link-unset')

  const content = reminderEmailContent({
    firstName: guest.firstName,
    slot,
    rules,
    meetLink: input.meetLink,
    manageLink: input.manageLink,
  })
  if (content === null) return refuse('compose slot-unreadable')

  return sendComposedEmail({
    kind,
    eventId: event.eventId,
    to: guest.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    calendarFile: undefined,
    sentAt: input.sentAt ?? new Date(),
    subjectToken,
  })
}
