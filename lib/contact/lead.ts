/*
 * The Baserow row of a contact message.
 *
 * The column names are the contract with the leads table Mel creates: they are grouped here rather
 * than spelled out at the call site, so the table and the code cannot drift apart quietly. A contact
 * message writes the same identity columns as a booking lead, plus its own `Subject` select and the
 * message itself in `Need`.
 *
 * `Consent on` is a date field without time and takes a date only (`YYYY-MM-DD`), computed in Paris:
 * the field holds no time, so a UTC instant would land on the wrong day for a consent given after
 * 22:00 or before 00:00 Paris. `Status` starts at `New`, the first step of Mel's pipeline a message
 * from the site enters, and `Source` tells a contact message from a booking.
 */

import type { BaserowFieldCheck, BaserowFields } from '@/lib/baserow'
import type { ContactRequest } from '@/schemas/contact'
import { CONTACT_SUBJECT_LABELS } from './subjects'

/** Column names of the Baserow leads table a contact message writes, by the value they hold. */
export const CONTACT_LEAD_FIELDS = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  subject: 'Subject',
  need: 'Need',
  consent: 'Consent',
  consentOn: 'Consent on',
  source: 'Source',
  status: 'Status',
} as const

/**
 * Columns of the leads table whose value a create must give back unchanged, with the comparison
 * their actual Baserow type needs.
 *
 * Baserow accepts a write that names a column it does not know and answers 200 without the value:
 * the row exists but the cell stays empty. Every column this form writes is therefore verified,
 * `Subject` included — a single select answers an object, which the `single-select` kind compares on
 * the option it carries. A missing or renamed column comes back as `schema-mismatch` with the id of
 * the row that was created, instead of a lead stored without its subject.
 */
export const CONTACT_LEAD_REQUIRED_FIELD_CHECKS: readonly BaserowFieldCheck[] = [
  { field: CONTACT_LEAD_FIELDS.firstName, kind: 'text' },
  { field: CONTACT_LEAD_FIELDS.lastName, kind: 'text' },
  { field: CONTACT_LEAD_FIELDS.email, kind: 'email' },
  { field: CONTACT_LEAD_FIELDS.subject, kind: 'single-select' },
  { field: CONTACT_LEAD_FIELDS.need, kind: 'text' },
  { field: CONTACT_LEAD_FIELDS.consent, kind: 'boolean' },
  { field: CONTACT_LEAD_FIELDS.consentOn, kind: 'date' },
  { field: CONTACT_LEAD_FIELDS.source, kind: 'text' },
]

/** Value stored in the `Source` column of every message sent through the contact form. */
export const CONTACT_LEAD_SOURCE = 'contact'

/** Value written in the `Status` column when a message arrives. */
export const CONTACT_LEAD_STATUS = 'New'

/** One validated contact message, as the row and the emails read it. */
export type ContactLead = Readonly<Pick<ContactRequest, 'firstName' | 'lastName' | 'email' | 'subject' | 'message'>>

/**
 * Builds the row to create in the leads table.
 *
 * The message is stored as it was written, in `Need`; the subject is stored as the French label Mel
 * reads, never the code the select carries. The consent is stored as the boolean the visitor gave,
 * beside the Paris date the server stamped it on, and the status starts at
 * {@link CONTACT_LEAD_STATUS}.
 *
 * @param input Message, and the Paris calendar date its consent was given on.
 * @returns The fields of the row, keyed by Baserow column name.
 */
export const contactLeadFields = ({
  lead,
  consentOn,
}: {
  /** Validated message. */
  lead: ContactLead
  /** Calendar date the consent was given on, in the studio's time zone, as `YYYY-MM-DD`. */
  consentOn: string
}): BaserowFields => ({
  [CONTACT_LEAD_FIELDS.firstName]: lead.firstName,
  [CONTACT_LEAD_FIELDS.lastName]: lead.lastName,
  [CONTACT_LEAD_FIELDS.email]: lead.email,
  [CONTACT_LEAD_FIELDS.subject]: CONTACT_SUBJECT_LABELS[lead.subject],
  [CONTACT_LEAD_FIELDS.need]: lead.message,
  [CONTACT_LEAD_FIELDS.consent]: true,
  [CONTACT_LEAD_FIELDS.consentOn]: consentOn,
  [CONTACT_LEAD_FIELDS.source]: CONTACT_LEAD_SOURCE,
  [CONTACT_LEAD_FIELDS.status]: CONTACT_LEAD_STATUS,
})
