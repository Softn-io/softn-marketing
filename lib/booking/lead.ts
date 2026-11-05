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
 *
 * `Status` is a single select of Mel's pipeline, and `Cancel reason` a text column beside it: the
 * booking writes `Spark booked`, a cancellation writes `Spark cancelled` and the label of the reason
 * the visitor picked, and a reschedule leaves both alone. The two other values of the select
 * (`New`, `Spark Done`) are hers to set by hand and are never written here.
 */

import type { BaserowFieldCheck, BaserowFields } from '@/lib/baserow'
import { bookingManage } from '@/locales/fr/bookingManage'
import type { BookingCancelReason } from '@/schemas/bookingManageLimits'
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
  status: 'Status',
  cancelReason: 'Cancel reason',
} as const

/**
 * Columns of the leads table whose value a create must give back unchanged, with the comparison
 * their actual Baserow type needs.
 *
 * Baserow accepts a write that names a column it does not know and answers 200 without the value:
 * the row exists but the cell stays empty. The booking route asks the create to check these columns,
 * the ones Mel reads first and the ones a reschedule or a cancellation needs. The optional answers
 * (phone, structure, role), the single select and the cancellation columns are not verified: they
 * are either optional or written by another path. Names come from {@link BOOKING_LEAD_FIELDS} so the
 * checks cannot drift from the payload.
 */
export const BOOKING_LEAD_REQUIRED_FIELD_CHECKS: readonly BaserowFieldCheck[] = [
  { field: BOOKING_LEAD_FIELDS.firstName, kind: 'text' },
  { field: BOOKING_LEAD_FIELDS.lastName, kind: 'text' },
  { field: BOOKING_LEAD_FIELDS.email, kind: 'email' },
  { field: BOOKING_LEAD_FIELDS.need, kind: 'text' },
  // Date with time: Baserow may drop the milliseconds, so the instants are compared, not the strings.
  { field: BOOKING_LEAD_FIELDS.slot, kind: 'date-time' },
  { field: BOOKING_LEAD_FIELDS.consent, kind: 'boolean' },
  // Date without time: the exact calendar day the booking sends.
  { field: BOOKING_LEAD_FIELDS.consentOn, kind: 'date' },
  { field: BOOKING_LEAD_FIELDS.source, kind: 'text' },
]

/** Value stored in the `Source` column of every booking made in the chat. */
export const BOOKING_LEAD_SOURCE = 'chatbot'

/** Value written in the `Status` column when a booking is made. */
export const BOOKING_LEAD_STATUS_BOOKED = 'Spark booked'

/** Value written in the `Status` column when a visitor cancels through the manage link. */
export const BOOKING_LEAD_STATUS_CANCELLED = 'Spark cancelled'

/**
 * Label of every cancellation reason, from the locale.
 *
 * The visitor picks a chip and a stable code travels to the route; the row stores the French label
 * Mel reads in her pipeline, never the code.
 */
export const BOOKING_CANCEL_REASON_LABELS: Readonly<Record<BookingCancelReason, string>> =
  bookingManage.cancel.reason.options

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
 * calendar event's private properties (`softnConsentAt`), not here. The status starts at
 * {@link BOOKING_LEAD_STATUS_BOOKED}, the first step of Mel's pipeline this application knows of.
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
  [BOOKING_LEAD_FIELDS.status]: BOOKING_LEAD_STATUS_BOOKED,
  ...(lead.phone === undefined ? {} : { [BOOKING_LEAD_FIELDS.phone]: lead.phone }),
  ...(lead.structure === undefined ? {} : { [BOOKING_LEAD_FIELDS.companyType]: lead.structure }),
  ...(lead.role === undefined ? {} : { [BOOKING_LEAD_FIELDS.role]: lead.role }),
})

/** Arguments of {@link bookingLeadRescheduleFields}. */
export type BookingLeadRescheduleFieldsInput = {
  /** New slot the visitor confirmed. */
  slot: BookingSlot
}

/**
 * Builds the fields a reschedule changes in the leads table: the slot, and nothing else.
 *
 * The status stays where Mel put it in her pipeline, and the answers of the booking are facts of the
 * booking: only the appointment moves.
 *
 * @param input New booked slot.
 * @returns The fields to patch, keyed by Baserow column name.
 */
export const bookingLeadRescheduleFields = ({ slot }: BookingLeadRescheduleFieldsInput): BaserowFields => ({
  [BOOKING_LEAD_FIELDS.slot]: slot.start,
})

/**
 * Builds the fields a cancellation changes in the leads table: the status, optionally the reason,
 * and nothing else.
 *
 * The slot is kept: Mel reads where the appointment was when she has to follow up. The reason is
 * the label of the chip the visitor picked, from the locale; no reason leaves the column untouched.
 *
 * @param input Optional cancellation reason, as the code the client sent.
 * @returns The fields to patch, keyed by Baserow column name.
 */
export const bookingLeadCancellationFields = ({
  reason,
}: {
  /** Code of the reason the visitor picked, absent when none was given. */
  reason?: BookingCancelReason
} = {}): BaserowFields => ({
  [BOOKING_LEAD_FIELDS.status]: BOOKING_LEAD_STATUS_CANCELLED,
  ...(reason === undefined ? {} : { [BOOKING_LEAD_FIELDS.cancelReason]: BOOKING_CANCEL_REASON_LABELS[reason] }),
})
