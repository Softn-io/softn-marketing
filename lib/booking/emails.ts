/*
 * Booking emails sent by Softn.io: the confirmation after a booking, the update after a reschedule,
 * the cancellation after a cancel, and the reminder sent by the scheduled job a day or so before the
 * call. The same three moments also send Softn an internal notification, addressed to the Workspace
 * owner and built from the `owner` section of `locales/fr/bookingEmails.ts`.
 *
 * Google notifies nobody anymore (`sendUpdates=none`), so each of these moments sends its own
 * message through the Gmail API, from the Workspace alias of `lib/site.ts`. The first three carry
 * the calendar file of the booking; the reminder carries none, the call being already in the
 * guest's calendar.
 *
 * Two rules hold everywhere below. All wording comes from `locales/fr/bookingEmails.ts` and
 * `locales/fr/bookingManage.ts`, filled through named parameters: no sentence is built here.
 * And a failure never reaches the visitor: a booking, a reschedule, a cancel or a reminder stands
 * whatever the mail does, the caller only logs the non-personal code returned here, and the event is
 * marked so Mel can find the guest whose message never left. An internal notification is never
 * marked: those marks say a guest message never left, and a failed notification to Mel leaves the
 * event's own content to read instead.
 */

import { BOOKING_OPEN_QUERY_KEY, SECTION_IDS } from '@/lib/anchors'
import { baserowLeadRowUrl } from '@/lib/baserow'
import { readEnv } from '@/lib/env'
import type { GoogleAuthStep } from '@/lib/google/auth'
import { markBookingEmailFailed, storeBookingEmailSentAt, type BookingEmailKind } from '@/lib/google/calendar'
import { sendGmailMessage } from '@/lib/google/gmail'
import { interpolate } from '@/lib/interpolate'
import { BOOKING_SENDER_EMAIL, BOOKING_SENDER_NAME, SITE_URL } from '@/lib/site'
import { bookingEmails } from '@/locales/fr/bookingEmails'
import { bookingManage } from '@/locales/fr/bookingManage'
import type { BookingCancelReason } from '@/schemas/bookingManageLimits'
import type { BookingSlot } from './availability'
import { bookingEventTitle, type BookingLead } from './event'
import { bookingInvitation, emailSequenceOf } from './ics'
import { BOOKING_CANCEL_REASON_LABELS } from './lead'
import { formatBookingDateLabel, formatBookingTimeLabel } from './labels'
import { EMAIL_LINK_COLOR } from '@/lib/email/emailColors'
import { htmlBody, type HtmlLink, mimeMessage } from '@/lib/email/mime'
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
 * plain-text part keeps the raw address. Both anchors carry the service-email link colour: a mail
 * client paints a body anchor with its own colour otherwise.
 */
const meetAndManageLinks = (meetLink: string, manageLink: string): readonly HtmlLink[] => [
  { url: meetLink, label: meetLink, style: `color:${EMAIL_LINK_COLOR}` },
  { url: manageLink, label: bookingManage.calendarEvent.linkLabel, style: `color:${EMAIL_LINK_COLOR}` },
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
      // The rebooking link carries the service-email link colour: a mail client paints a body anchor
      // with its own colour otherwise.
      links: [{ url: bookingLink, label: bookingLinkLabel, style: `color:${EMAIL_LINK_COLOR}` }],
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

/** Recipient of an internal notification: the Workspace owner, or `undefined` when unset. */
const ownerRecipient = (): string | undefined => {
  try {
    return readEnv().GOOGLE_CALENDAR_OWNER
  } catch {
    return undefined
  }
}

/**
 * One optional line of the owner copy, filled whole, or `undefined` when its value is absent.
 *
 * A blank or whitespace-only value counts as absent, exactly like `answerLine` in the event
 * description: the validated copy never shows a label without a value, so the line drops instead,
 * and the value travels trimmed like the answers the event and the Baserow row already carry.
 */
const ownerLine = (template: string, name: string, value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : interpolate(template, { [name]: value.trim() })

/**
 * Drops from an owner body the lines whose value is absent.
 *
 * Every optional line of that copy stands alone on its line, as `{nameLine}`, and its value is the
 * whole line, label included. An absent one leaves no trace: its line and its line break go, and a
 * blank line directly above goes with it, so the body never widens the hole the line left. The lines
 * that stay are filled by {@link interpolate} with the values of the caller.
 *
 * @param body Body of the copy, as the locale writes it.
 * @param absent Names of the optional lines with no value.
 * @returns The body without those lines.
 */
const withoutAbsentOwnerLines = (body: string, absent: ReadonlySet<string>): string => {
  const kept: string[] = []
  for (const line of body.split('\n')) {
    const placeholder = /^\{(\w+)\}$/.exec(line)?.[1]
    if (placeholder !== undefined && absent.has(placeholder)) {
      if (kept[kept.length - 1] === '') kept.pop()
      continue
    }

    kept.push(line)
  }

  return kept.join('\n')
}

/**
 * The anchors of one owner HTML part: every address of the body, painted like the guest emails.
 *
 * The plain-text part keeps the raw addresses; the HTML part anchors them, under the address itself
 * as its label, and gives each the service-email link colour so no mail client paints it with its
 * own.
 */
const ownerLinks = (urls: readonly (string | undefined)[]): readonly HtmlLink[] =>
  urls
    .filter((url): url is string => url !== undefined && url.trim() !== '')
    .map((url) => ({ url, label: url, style: `color:${EMAIL_LINK_COLOR}` }))

/**
 * HTML alternative of one internal notification, built from its filled body.
 *
 * The two blocks the guest emails dress apart are empty here: the copy carries no preview line — the
 * subject already names the event, the guest and the slot — and no signature, so an empty string
 * matches no block of the body.
 */
const ownerHtml = (text: string, links: readonly HtmlLink[]): string =>
  htmlBody({ text, links, preheader: '', signature: '' })

/** Arguments of {@link ownerNewBookingEmailContent}. */
export type OwnerNewBookingEmailContentInput = {
  /** Answers the visitor gave; each optional one becomes its own line when present. */
  readonly lead: BookingLead
  /** Slot that was booked. */
  readonly slot: BookingSlot
  /** Rules holding the call length and the time zone. */
  readonly rules: BookingRules
  /** Meet link of the created event. */
  readonly meetLink: string
  /** Address of the leads row in Baserow, absent when it cannot be built. */
  readonly baserowLink: string | undefined
}

/**
 * Internal notification of a new booking: subject and both bodies, or `null` when the slot cannot be
 * rendered.
 *
 * The guest, the need and the Meet link always stand; the phone, the structure, the role and the
 * Baserow link each drop their whole line when they have no value.
 *
 * @param input Answers, slot, rules, Meet link and row link.
 * @returns The content to send, or `null` when the slot is unreadable.
 */
export const ownerNewBookingEmailContent = (input: OwnerNewBookingEmailContentInput): BookingEmailContent | null => {
  const date = formatBookingDateLabel(input.slot.start, input.rules)
  const time = formatBookingTimeLabel(input.slot.start, input.rules)
  if (date === '' || time === '') return null

  const phoneLine = ownerLine(bookingEmails.owner.phoneLine, 'phone', input.lead.phone)
  const structureLine = ownerLine(bookingEmails.owner.structureLine, 'structure', input.lead.structure)
  const roleLine = ownerLine(bookingEmails.owner.roleLine, 'role', input.lead.role)
  const baserowLine = ownerLine(bookingEmails.owner.baserowLine, 'baserowLink', input.baserowLink)
  const absent = new Set<string>()
  if (phoneLine === undefined) absent.add('phoneLine')
  if (structureLine === undefined) absent.add('structureLine')
  if (roleLine === undefined) absent.add('roleLine')
  if (baserowLine === undefined) absent.add('baserowLine')

  const values = {
    guestName: guestName(input.lead),
    guestEmail: input.lead.email,
    need: input.lead.need,
    date,
    time,
    duration: durationValue(input.rules),
    meetLink: input.meetLink,
    phoneLine: phoneLine ?? '',
    structureLine: structureLine ?? '',
    roleLine: roleLine ?? '',
    baserowLine: baserowLine ?? '',
  }
  const text = interpolate(withoutAbsentOwnerLines(bookingEmails.owner.newBooking.body, absent), values)

  return {
    subject: interpolate(bookingEmails.owner.newBooking.subject, values),
    text,
    html: ownerHtml(text, ownerLinks([input.meetLink, input.baserowLink])),
  }
}

/** Arguments of {@link ownerRescheduleEmailContent}. */
export type OwnerRescheduleEmailContentInput = {
  /** Guest's full name, first name then last name. */
  readonly guestName: string
  /** Guest's address. */
  readonly guestEmail: string
  /** Start the event left. */
  readonly previousStart: string
  /** New slot the event holds. */
  readonly slot: BookingSlot
  /** Rules holding the call length and the time zone. */
  readonly rules: BookingRules
  /** Meet link of the event, unchanged by the patch. */
  readonly meetLink: string
  /** Address of the leads row in Baserow, absent when it cannot be built. */
  readonly baserowLink: string | undefined
}

/**
 * Internal notification of a reschedule: subject and both bodies, or `null` when a slot or the
 * previous start cannot be rendered.
 *
 * The new slot comes first under `{date}` and `{time}`; the old one is spelled out above it, so
 * the two are never confused. The Baserow link drops its whole line when it has no value.
 *
 * @param input Guest, previous start, new slot, rules, Meet link and row link.
 * @returns The content to send, or `null` when a slot is unreadable.
 */
export const ownerRescheduleEmailContent = (input: OwnerRescheduleEmailContentInput): BookingEmailContent | null => {
  const date = formatBookingDateLabel(input.slot.start, input.rules)
  const time = formatBookingTimeLabel(input.slot.start, input.rules)
  const previousDate = formatBookingDateLabel(input.previousStart, input.rules)
  const previousTime = formatBookingTimeLabel(input.previousStart, input.rules)
  if (date === '' || time === '' || previousDate === '' || previousTime === '') return null

  const baserowLine = ownerLine(bookingEmails.owner.baserowLine, 'baserowLink', input.baserowLink)
  const absent = new Set<string>()
  if (baserowLine === undefined) absent.add('baserowLine')

  const values = {
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    previousDate,
    previousTime,
    date,
    time,
    duration: durationValue(input.rules),
    meetLink: input.meetLink,
    baserowLine: baserowLine ?? '',
  }
  const text = interpolate(withoutAbsentOwnerLines(bookingEmails.owner.reschedule.body, absent), values)

  return {
    subject: interpolate(bookingEmails.owner.reschedule.subject, values),
    text,
    html: ownerHtml(text, ownerLinks([input.meetLink, input.baserowLink])),
  }
}

/** Arguments of {@link ownerCancellationEmailContent}. */
export type OwnerCancellationEmailContentInput = {
  /** Guest's full name, first name then last name. */
  readonly guestName: string
  /** Guest's address. */
  readonly guestEmail: string
  /** Cancelled slot. */
  readonly slot: BookingSlot
  /** Rules holding the time zone. */
  readonly rules: BookingRules
  /** Code of the reason the visitor picked, absent when none was given. */
  readonly reason: BookingCancelReason | undefined
  /** Address of the leads row in Baserow, absent when it cannot be built. */
  readonly baserowLink: string | undefined
}

/**
 * Internal notification of a cancellation: subject and both bodies, or `null` when the slot cannot
 * be rendered.
 *
 * The reason line carries the label of the chip the visitor picked, never free text, and drops its
 * whole line when no reason was given; the Baserow link does the same.
 *
 * @param input Guest, cancelled slot, rules, reason and row link.
 * @returns The content to send, or `null` when the slot is unreadable.
 */
export const ownerCancellationEmailContent = (
  input: OwnerCancellationEmailContentInput,
): BookingEmailContent | null => {
  const date = formatBookingDateLabel(input.slot.start, input.rules)
  const time = formatBookingTimeLabel(input.slot.start, input.rules)
  if (date === '' || time === '') return null

  const reasonLabel = input.reason === undefined ? undefined : BOOKING_CANCEL_REASON_LABELS[input.reason]
  const reasonLine = ownerLine(bookingEmails.owner.reasonLine, 'reasonLabel', reasonLabel)
  const baserowLine = ownerLine(bookingEmails.owner.baserowLine, 'baserowLink', input.baserowLink)
  const absent = new Set<string>()
  if (reasonLine === undefined) absent.add('reasonLine')
  if (baserowLine === undefined) absent.add('baserowLine')

  const values = {
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    date,
    time,
    reasonLine: reasonLine ?? '',
    baserowLine: baserowLine ?? '',
  }
  const text = interpolate(withoutAbsentOwnerLines(bookingEmails.owner.cancellation.body, absent), values)

  return {
    subject: interpolate(bookingEmails.owner.cancellation.subject, values),
    text,
    html: ownerHtml(text, ownerLinks([input.baserowLink])),
  }
}

/** One internal notification, as the shared send path below takes it. */
type ComposedOwnerEmail = {
  readonly to: string
  /**
   * Builds the content at send time, inside the send path's own `try`: a copy that cannot be filled
   * answers `null` or throws, and neither ever reaches the caller.
   */
  readonly build: () => BookingEmailContent | null
  readonly sentAt: Date
  readonly subjectToken: string | undefined
}

/**
 * Sends one internal notification from the booking alias to the Workspace owner.
 *
 * The message carries the two bodies and no calendar file, and it never marks the event: the marks
 * of the calendar say a guest's message never left, which is not what a failed notification to Mel
 * means — the event's own description already holds the answers.
 *
 * Everything that can fail sits inside one `try`: the content build (a copy edit that leaves a
 * placeholder unanswered throws in `interpolate`), the MIME message and the send call. A build
 * answering `null` means the slot cannot be rendered, and anything thrown, whatever the stage, comes
 * back as `compose failed`; both are non-personal codes the caller logs, so no composing failure can
 * reject after the booking or the management action was already written. A Gmail failure keeps its
 * own code, the same the guest emails log.
 */
const sendOwnerNotification = async ({
  to,
  build,
  sentAt,
  subjectToken,
}: ComposedOwnerEmail): Promise<BookingEmailOutcome> => {
  try {
    const content = build()
    if (content === null) return { ok: false, detail: 'compose slot-unreadable' }

    const message = mimeMessage({
      from: { name: BOOKING_SENDER_NAME, address: BOOKING_SENDER_EMAIL },
      replyTo: BOOKING_SENDER_EMAIL,
      to,
      sentAt,
      subject: content.subject,
      text: content.text,
      html: content.html,
    })

    const sent = await sendGmailMessage({ message, subjectToken })
    return sent.ok ? { ok: true } : { ok: false, detail: failureDetail('gmail', sent) }
  } catch {
    return { ok: false, detail: 'compose failed' }
  }
}

/** Arguments of {@link sendBookingOwnerNewBookingEmail}. */
export type SendBookingOwnerNewBookingEmailInput = {
  /** Answers the visitor gave. */
  readonly lead: BookingLead
  /** Slot that was booked. */
  readonly slot: BookingSlot
  /** Rules holding the call length, the notice and the time zone. */
  readonly rules: BookingRules
  /** Meet link of the created event; absent, no notification is sent. */
  readonly meetLink: string | undefined
  /** Id of the leads row, absent when Baserow stored none; without it, no link line. */
  readonly baserowRowId: number | string | undefined
  /** Subject token of the current request, from {@link readSubjectToken}. */
  readonly subjectToken: string | undefined
  /** Instant the message is written at. Defaults to now; a test passes its own clock. */
  readonly sentAt?: Date
}

/**
 * Sends the internal notification of a new booking, addressed to the Workspace owner.
 *
 * @param input Answers, slot, Meet link, row id, rules and token.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendBookingOwnerNewBookingEmail = async (
  input: SendBookingOwnerNewBookingEmailInput,
): Promise<BookingEmailOutcome> => {
  const recipient = ownerRecipient()
  if (recipient === undefined) return { ok: false, detail: 'compose recipient-missing' }

  const meetLink = input.meetLink
  if (meetLink === undefined || meetLink.trim() === '') return { ok: false, detail: 'compose meet-link-missing' }

  return sendOwnerNotification({
    to: recipient,
    build: () =>
      ownerNewBookingEmailContent({
        lead: input.lead,
        slot: input.slot,
        rules: input.rules,
        meetLink,
        baserowLink: baserowLeadRowUrl(input.baserowRowId),
      }),
    sentAt: input.sentAt ?? new Date(),
    subjectToken: input.subjectToken,
  })
}

/** Arguments of {@link sendBookingOwnerRescheduleEmail}. */
export type SendBookingOwnerRescheduleEmailInput = {
  /** The event, as the route holds it after the patch it notifies about. */
  readonly event: BookingEmailEvent
  /** New slot the event holds. */
  readonly slot: BookingSlot
  /** Start the event left. */
  readonly previousStart: string
  /** Rules holding the call length, the notice and the time zone. */
  readonly rules: BookingRules
  /** Meet link of the event; absent, no notification is sent. */
  readonly meetLink: string | undefined
  /** Id of the leads row, as the event carries it; without it, no link line. */
  readonly baserowRowId: number | string | undefined
  /** Subject token of the current request, from {@link readSubjectToken}. */
  readonly subjectToken: string | undefined
  /** Instant the message is written at. Defaults to now; a test passes its own clock. */
  readonly sentAt?: Date
}

/**
 * Sends the internal notification of a reschedule, addressed to the Workspace owner.
 *
 * @param input Event, new slot, previous start, links, row id and rules.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendBookingOwnerRescheduleEmail = async (
  input: SendBookingOwnerRescheduleEmailInput,
): Promise<BookingEmailOutcome> => {
  const recipient = ownerRecipient()
  if (recipient === undefined) return { ok: false, detail: 'compose recipient-missing' }

  const guest = guestOf(input.event)
  if (guest === null) return { ok: false, detail: 'compose guest-missing' }

  const meetLink = input.meetLink
  if (meetLink === undefined || meetLink.trim() === '') return { ok: false, detail: 'compose meet-link-missing' }

  return sendOwnerNotification({
    to: recipient,
    build: () =>
      ownerRescheduleEmailContent({
        guestName: guestName(guest),
        guestEmail: guest.email,
        previousStart: input.previousStart,
        slot: input.slot,
        rules: input.rules,
        meetLink,
        baserowLink: baserowLeadRowUrl(input.baserowRowId),
      }),
    sentAt: input.sentAt ?? new Date(),
    subjectToken: input.subjectToken,
  })
}

/** Arguments of {@link sendBookingOwnerCancellationEmail}. */
export type SendBookingOwnerCancellationEmailInput = {
  /** The event, as the route holds it before the deletion it notifies about. */
  readonly event: BookingEmailEvent
  /** Cancelled slot. */
  readonly slot: BookingSlot
  /** Rules holding the time zone. */
  readonly rules: BookingRules
  /** Code of the reason the visitor picked, absent when none was given. */
  readonly reason: BookingCancelReason | undefined
  /** Id of the leads row, as the event carries it; without it, no link line. */
  readonly baserowRowId: number | string | undefined
  /** Subject token of the current request, from {@link readSubjectToken}. */
  readonly subjectToken: string | undefined
  /** Instant the message is written at. Defaults to now; a test passes its own clock. */
  readonly sentAt?: Date
}

/**
 * Sends the internal notification of a cancellation, addressed to the Workspace owner.
 *
 * @param input Event, cancelled slot, reason, row id and rules.
 * @returns `{ ok: true }` when the message left, or the code the caller logs.
 */
export const sendBookingOwnerCancellationEmail = async (
  input: SendBookingOwnerCancellationEmailInput,
): Promise<BookingEmailOutcome> => {
  const recipient = ownerRecipient()
  if (recipient === undefined) return { ok: false, detail: 'compose recipient-missing' }

  const guest = guestOf(input.event)
  if (guest === null) return { ok: false, detail: 'compose guest-missing' }

  return sendOwnerNotification({
    to: recipient,
    build: () =>
      ownerCancellationEmailContent({
        guestName: guestName(guest),
        guestEmail: guest.email,
        slot: input.slot,
        rules: input.rules,
        reason: input.reason,
        baserowLink: baserowLeadRowUrl(input.baserowRowId),
      }),
    sentAt: input.sentAt ?? new Date(),
    subjectToken: input.subjectToken,
  })
}
