/*
 * The Baserow row of a booking.
 *
 * The column names are the contract with the leads table Mel creates: they are grouped here rather
 * than spelled out at the call site, so the table and the code cannot drift apart quietly.
 *
 * Two values have a shape of their own. `Slot` is a date field with time, and the REST API accepts an
 * ISO 8601 string there (Baserow API docs: "Date fields accept ISO 8601 formatted strings"; the
 * example given is `"2024-01-15T10:30:00Z"`), so the slot travels as the very instant the calendar
 * event was created from. `Consent on` is a date field without time, and takes a date only
 * (`YYYY-MM-DD`, one of the accepted date formats), computed in Paris: the field holds no time, so a
 * UTC instant would land on the wrong day for a consent given after 22:00 or before 00:00 Paris.
 */

import type { BaserowFields } from '@/lib/baserow'
import type { BookingSlot } from './availability'
import type { BookingLead } from './event'

/** Column names of the Baserow leads table, by the value they hold. */
export const BOOKING_LEAD_FIELDS = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  companyType: 'Company type',
  role: 'Role',
  need: 'Need',
  slot: 'Slot',
  consent: 'Consent',
  consentOn: 'Consent on',
  source: 'Source',
} as const

/** Value stored in the `Source` column of every booking made in the chat. */
export const BOOKING_LEAD_SOURCE = 'chatbot'

/** Arguments of {@link bookingLeadFields}. */
export type BookingLeadFieldsInput = {
  /** Answers the visitor gave. */
  lead: BookingLead
  /** Slot that was booked in the calendar. */
  slot: BookingSlot
  /**
   * Calendar date the consent was given on, in the studio's time zone, as `YYYY-MM-DD`. The caller
   * reads it from the consent instant before the calendar event is created, so an unreadable instant
   * is refused while nothing is stored yet.
   */
  consentOn: string
}

/**
 * Builds the row to create in the leads table.
 *
 * The slot is stored as the ISO 8601 instant the calendar event itself uses, so the row and the
 * event cannot disagree on the time. Optional answers are left out of the payload, which leaves
 * their cell empty rather than writing an empty string; the consent is stored as the boolean the
 * visitor gave, beside the Paris date it was given on. The full instant of the consent stays in the
 * calendar event's private properties (`softnConsentAt`), not here.
 *
 * @param input Answers, booked slot and consent date.
 * @returns The fields of the row, keyed by Baserow column name.
 */
export const bookingLeadFields = ({ lead, slot, consentOn }: BookingLeadFieldsInput): BaserowFields => ({
  [BOOKING_LEAD_FIELDS.firstName]: lead.firstName,
  [BOOKING_LEAD_FIELDS.lastName]: lead.lastName,
  [BOOKING_LEAD_FIELDS.email]: lead.email,
  [BOOKING_LEAD_FIELDS.need]: lead.need,
  [BOOKING_LEAD_FIELDS.slot]: slot.start,
  [BOOKING_LEAD_FIELDS.consent]: true,
  [BOOKING_LEAD_FIELDS.consentOn]: consentOn,
  [BOOKING_LEAD_FIELDS.source]: BOOKING_LEAD_SOURCE,
  ...(lead.phone === undefined ? {} : { [BOOKING_LEAD_FIELDS.phone]: lead.phone }),
  ...(lead.structure === undefined ? {} : { [BOOKING_LEAD_FIELDS.companyType]: lead.structure }),
  ...(lead.role === undefined ? {} : { [BOOKING_LEAD_FIELDS.role]: lead.role }),
})
