/*
 * Calendar wording of a booking: the event title and the event description.
 *
 * Both are built from `locales/fr/chatbot.ts`, so no sentence of the invitation is written here.
 * The description carries the visitor's answers, which is what keeps a lead readable in the calendar
 * even if the Baserow row never lands.
 */

import { interpolate } from '@/lib/interpolate'
import { chatbot } from '@/locales/fr/chatbot'

/** One lead as the booking flow collected it, with the consent that allowed the collection. */
export type BookingLead = {
  /** Need the visitor described, in their own words. */
  need: string
  /** Visitor's first name. */
  firstName: string
  /** Visitor's last name. */
  lastName: string
  /** Address the invitation is sent to. */
  email: string
  /** Optional phone number. */
  phone?: string
  /** Optional structure the visitor represents. */
  structure?: string
  /** Optional role of the visitor. */
  role?: string
  /** Instant the visitor accepted the consent, written to the calendar event and the Baserow row. */
  consentAt: string
}

/** Arguments of {@link bookingEventDescription}. */
export type BookingEventDescriptionInput = {
  /** Answers the description is built from. */
  lead: BookingLead
}

/** One labelled line of the description, or nothing when an optional answer was left out. */
const answerLine = (label: string, value: string | undefined): readonly string[] =>
  value === undefined || value.trim() === ''
    ? []
    : [interpolate(chatbot.booking.event.line, { label, value: value.trim() })]

/**
 * Event title of a booking, from the locale.
 *
 * @param lead Answers of the visitor.
 * @returns The title Mel reads in her calendar.
 */
export const bookingEventTitle = (lead: BookingLead): string =>
  interpolate(chatbot.booking.event.title, { firstName: lead.firstName, lastName: lead.lastName })

/**
 * Event description of a booking: the visitor's answers, one labelled line each.
 *
 * The lines follow the order of the reservation, and are labelled with the field names of the flow,
 * so the description reads like the recap the visitor saw. An optional answer left out produces no
 * line at all, rather than an empty label. The consent is not repeated here: it is written to the
 * event's private properties and to the Baserow row.
 *
 * @param input Answers of the visitor.
 * @returns The description, one answer per line.
 */
export const bookingEventDescription = ({ lead }: BookingEventDescriptionInput): string => {
  const lines = [
    ...answerLine(chatbot.booking.steps.need.field, lead.need),
    ...answerLine(chatbot.booking.steps.structure.field, lead.structure),
    ...answerLine(chatbot.booking.steps.role.field, lead.role),
    ...answerLine(chatbot.booking.steps.phone.field, lead.phone),
    ...answerLine(chatbot.booking.steps.email.field, lead.email),
  ]

  return lines.join('\n')
}
