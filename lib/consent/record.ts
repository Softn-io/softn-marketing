/**
 * Consent record: the versioned choice kept in the visitor's browser, its validation and its
 * six-month lifetime.
 *
 * The record lives in `localStorage`, never in a cookie. It is read through a small hand-written
 * guard rather than a schema library, so no validation dependency reaches the browser bundle. Every
 * read and write is guarded: a disabled or full storage degrades to "no stored choice", never a
 * crash.
 */

/** Key of the single `localStorage` entry that holds the consent choice. */
export const CONSENT_STORAGE_KEY = 'softn-consent'

/** Schema version of the stored record. A record with another version is treated as absent. */
export const CONSENT_SCHEMA_VERSION = 1

/** How long a choice stays valid, in months, before the banner is shown again. */
export const CONSENT_LIFETIME_MONTHS = 6

/** The visitor's choice per category. Strictly necessary storage is always on and not a category. */
export type ConsentChoice = {
  /** Whether the visitor allows audience measurement. */
  readonly audience: boolean
}

/** The versioned record kept in `localStorage`, with the ISO timestamp of the decision. */
export type ConsentRecord = {
  /** Schema version of the record. */
  readonly version: typeof CONSENT_SCHEMA_VERSION
  /** Whether the visitor allows audience measurement. */
  readonly audience: boolean
  /** ISO timestamp of the decision. */
  readonly decidedAt: string
}

/** Outcome of a write: the record built from the choice and whether the storage kept it. */
export type ConsentSaveResult = {
  /** The record the caller can use even when the storage refused it. */
  readonly record: ConsentRecord
  /** Whether the storage accepted the write. */
  readonly stored: boolean
}

const readField = (value: object, key: string): unknown => Reflect.get(value, key)

/**
 * Whether the decision date is old enough to expire. The month arithmetic follows the calendar: a
 * decision taken on 31 August expires on 3 March, because the sixth month has no 31st. A decision
 * dated in the future is treated as malformed and expires immediately, so a clock skew cannot extend
 * the lifetime.
 */
const isExpired = (decidedAt: number, now: number): boolean => {
  if (decidedAt > now) return true

  const expiry = new Date(decidedAt)
  expiry.setUTCMonth(expiry.getUTCMonth() + CONSENT_LIFETIME_MONTHS)
  return now >= expiry.getTime()
}

/**
 * Validates a value read from storage. Returns the record only when it carries the current schema
 * version, a boolean audience choice, a parseable ISO decision date and has not expired.
 *
 * @param value Raw value read from storage (already parsed from JSON).
 * @param now Current time in milliseconds, for the expiry check. Defaults to the clock.
 * @returns The validated record, or `null` when the value is absent, malformed or expired.
 */
export const parseConsentRecord = (value: unknown, now: number = Date.now()): ConsentRecord | null => {
  if (typeof value !== 'object' || value === null) return null

  const version = readField(value, 'version')
  const audience = readField(value, 'audience')
  const decidedAt = readField(value, 'decidedAt')

  if (version !== CONSENT_SCHEMA_VERSION) return null
  if (typeof audience !== 'boolean') return null
  if (typeof decidedAt !== 'string') return null

  const decidedAtTime = Date.parse(decidedAt)
  if (Number.isNaN(decidedAtTime)) return null
  if (isExpired(decidedAtTime, now)) return null

  return { version: CONSENT_SCHEMA_VERSION, audience, decidedAt }
}

/**
 * Parses a raw value read from storage. Invalid JSON, a malformed record or an expired record all
 * read as "no choice".
 *
 * @param raw Raw string read from storage, or `null` when the key is absent.
 * @param now Current time in milliseconds, for the expiry check. Defaults to the clock.
 * @returns The validated record, or `null`.
 */
export const parseStoredConsent = (raw: string | null, now: number = Date.now()): ConsentRecord | null => {
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    return parseConsentRecord(parsed, now)
  } catch {
    return null
  }
}

/**
 * Reads the consent record from a storage. A missing entry, invalid JSON, a malformed record, an
 * expired record or a storage that throws all read as "no choice".
 *
 * @param storage Storage to read, or `null` when the browser exposes none.
 * @param now Current time in milliseconds, for the expiry check. Defaults to the clock.
 * @returns The validated record, or `null`.
 */
export const readConsentRecord = (storage: Storage | null, now: number = Date.now()): ConsentRecord | null => {
  if (storage === null) return null

  try {
    return parseStoredConsent(storage.getItem(CONSENT_STORAGE_KEY), now)
  } catch {
    return null
  }
}

/**
 * Writes a choice as a versioned record. The storage write is attempted, never required: when it
 * throws, the caller still receives the record and knows the storage refused it.
 *
 * @param storage Storage to write, or `null` when the browser exposes none.
 * @param choice The visitor's choice per category.
 * @param now Current time in milliseconds, used for the ISO decision timestamp. Defaults to the clock.
 * @returns The record built from the choice and whether the storage kept it.
 */
export const writeConsentRecord = (
  storage: Storage | null,
  choice: ConsentChoice,
  now: number = Date.now(),
): ConsentSaveResult => {
  const record: ConsentRecord = {
    version: CONSENT_SCHEMA_VERSION,
    audience: choice.audience,
    decidedAt: new Date(now).toISOString(),
  }

  if (storage === null) return { record, stored: false }

  try {
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record))
    return { record, stored: true }
  } catch {
    return { record, stored: false }
  }
}
