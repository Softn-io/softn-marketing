/*
 * Subjects of the contact form and the label each one carries.
 *
 * The visitor picks a label in the select and a stable code travels to the Route Handler, so the
 * wording can change without touching the API. Every reader of a subject — the notification email,
 * the auto-reply and the Baserow row — shows the French label Mel reads, never the code.
 */

import { contact } from '@/locales/fr/contact'
import type { ContactSubject } from '@/schemas/contactLimits'

/** Label of every subject, from the validated copy. */
export const CONTACT_SUBJECT_LABELS: Readonly<Record<ContactSubject, string>> = contact.form.subject.options
