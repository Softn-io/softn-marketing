/** Canonical origin of the production site, without trailing slash. Used as `metadataBase` to resolve relative metadata URLs. */
export const SITE_URL = 'https://softn.io'

/**
 * Workspace address the booking emails are sent from.
 *
 * It is a "Send mail as" alias of the impersonated owner (`GOOGLE_CALENDAR_OWNER`), so the Gmail
 * API sends as it under the owner's delegated authority. It is a constant rather than an
 * environment variable: nothing in a deployment changes it, and the calendar file's `ORGANIZER`
 * must carry the same address.
 */
export const BOOKING_SENDER_EMAIL = 'meet@softn.io'

/** Display name of the sender address, as the guest reads it in their mail client. */
export const BOOKING_SENDER_NAME = 'Softn.io'
