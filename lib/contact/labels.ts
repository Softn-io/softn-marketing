/*
 * Labels of the contact emails and of the Baserow row, formatted from the instants with the
 * platform's own internationalisation. The notification shows when the message arrived, and the row
 * stores the Paris day the consent was given on: neither is written by hand.
 */

/** BCP 47 tag of the labels. The site ships French only; the tag moves with the locale folder. */
const CONTACT_LOCALE_TAG = 'fr-FR'

/** Time zone the labels are rendered in: the studio's own, the one its days are counted in. */
const CONTACT_TIME_ZONE = 'Europe/Paris'

/** Tag that renders a date as `YYYY-MM-DD`, the format a Baserow date field without time accepts. */
const DATE_ONLY_LOCALE_TAG = 'en-CA'

/**
 * The two formatters of this module, built once: each has fixed options, so neither ever changes.
 */
const receivedAtFormatter = new Intl.DateTimeFormat(CONTACT_LOCALE_TAG, {
  timeZone: CONTACT_TIME_ZONE,
  dateStyle: 'long',
  timeStyle: 'short',
})

const dayKeyFormatter = new Intl.DateTimeFormat(DATE_ONLY_LOCALE_TAG, {
  timeZone: CONTACT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Reads the instant a message arrived at, as the notification writes it: « 16 novembre 2026 à
 * 19:42 », in the studio's time zone. An unreadable instant answers an empty string, which the
 * caller treats as a message it must not send.
 *
 * @param instant Instant the message was received at.
 * @returns The label, or an empty string when the instant cannot be read.
 */
export const formatContactReceivedAt = (instant: Date): string => {
  if (Number.isNaN(instant.getTime())) return ''

  return receivedAtFormatter.format(instant)
}

/**
 * Reads the calendar day of one instant in the studio's time zone, as `YYYY-MM-DD`.
 *
 * The `Consent on` column of the leads table holds a date without time, so a UTC instant would land
 * on the wrong day for a consent given after 22:00 or before 00:00 Paris. An unreadable instant
 * answers an empty string, which the caller treats as a consent it cannot date.
 *
 * @param instant Instant the consent was given at.
 * @returns The Paris calendar day, or an empty string when the instant cannot be read.
 */
export const contactDayKeyOfInstant = (instant: Date): string => {
  if (Number.isNaN(instant.getTime())) return ''

  return dayKeyFormatter.format(instant)
}
