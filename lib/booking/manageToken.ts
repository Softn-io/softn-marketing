/*
 * Signed link of the booking management page.
 *
 * The invitation carries a link that lets a visitor reschedule or cancel without any account. The
 * link's token is a keyed digest of the event id and the expiry only — no name, no address, no need
 * — so a leaked token tells nothing about the person, and a token of another event cannot be
 * derived from it. The digest is an HMAC-SHA256 over the two values, both sides encoded base64url,
 * and it is verified with a constant-time comparison so a wrong token cannot be probed byte by byte.
 *
 * The expiry is the event start at the moment the token was built. A token is refused once it has
 * passed, and refused as well when the deployment has no signing secret: fail closed, so a missing
 * secret never opens a management page rather than leaving it unauthenticated.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { readEnv } from '@/lib/env'
import { BOOKING_MANAGE_TOKEN_MAX_LENGTH } from '@/schemas/bookingManageLimits'

/** Path of the manage page, the one a token is appended to as its last segment. */
export const BOOKING_MANAGE_PATH = '/rendez-vous'

/** Characters a signed event id may use: base32hex, the alphabet {@link bookingEventIdAttempt} emits. */
const EVENT_ID_PATTERN = /^[0-9a-v]{5,1024}$/

/** Separator between the two segments of a token, and between the two fields of its payload. */
const SEGMENT_SEPARATOR = '.'

/** What a verified token attests: which event, and until when the link is valid. */
export type BookingManageTokenPayload = {
  /** Event the link manages. */
  readonly eventId: string
  /** Instant the token stops being accepted, as milliseconds since the epoch. */
  readonly expiresAt: number
}

/** Why a token was refused. Never personal, and never the token itself. */
export type BookingManageTokenError = 'invalid' | 'expired' | 'not-configured'

/** Outcome of a token verification: its payload, or the reason it was refused. */
export type BookingManageTokenVerdict =
  | { readonly ok: true; readonly data: BookingManageTokenPayload }
  | { readonly ok: false; readonly error: BookingManageTokenError }

/**
 * Reads the signing secret of the manage links, or `undefined` when the deployment has none.
 *
 * The environment is read at call time so a running server sees its own value, and an invalid or
 * unreadable environment answers `undefined`: every token is then refused instead of accepted
 * unsigned.
 *
 * @returns The secret, or `undefined`.
 */
export const readBookingLinkSecret = (): string | undefined => {
  try {
    return readEnv().BOOKING_LINK_SECRET
  } catch {
    return undefined
  }
}

/** Arguments of {@link bookingManageToken}. */
export type BookingManageTokenInput = {
  /** Signing secret, from {@link readBookingLinkSecret}. */
  secret: string
  /** Event the link manages. */
  eventId: string
  /** Instant the link stops being accepted, as an ISO 8601 string. */
  expiresAt: string
}

/**
 * Builds the token of one booking event.
 *
 * The payload holds the event id and the expiry, separated by a dot, and the signature is the HMAC
 * of that exact payload string: changing either value invalidates the signature. Both sides are
 * base64url encoded so the token survives a URL and an e-mail untouched.
 *
 * @param input Signing secret, event id and expiry instant.
 * @returns The token, or `null` when the inputs cannot make one.
 */
export const bookingManageToken = ({ secret, eventId, expiresAt }: BookingManageTokenInput): string | null => {
  const expiresAtMs = Date.parse(expiresAt)
  if (!EVENT_ID_PATTERN.test(eventId) || !Number.isFinite(expiresAtMs)) return null
  if (secret === '') return null

  const payload = `${eventId}${SEGMENT_SEPARATOR}${expiresAtMs}`
  const signature = createHmac('sha256', secret).update(payload).digest()

  return `${Buffer.from(payload).toString('base64url')}${SEGMENT_SEPARATOR}${signature.toString('base64url')}`
}

/** Arguments of {@link bookingManageUrl}. */
export type BookingManageUrlInput = {
  /** Origin of the request that builds the link, so a preview deployment links to itself. */
  origin: string
  /** Token of the event, from {@link bookingManageToken}. */
  token: string
}

/**
 * Builds the manage URL a visitor follows from the invitation.
 *
 * @param input Origin and token.
 * @returns The absolute URL of the manage page.
 */
export const bookingManageUrl = ({ origin, token }: BookingManageUrlInput): string =>
  `${origin}${BOOKING_MANAGE_PATH}/${token}`

/** Arguments of {@link verifyBookingManageToken}. */
export type VerifyBookingManageTokenInput = {
  /** Signing secret, from {@link readBookingLinkSecret}. Absent, every token is refused. */
  secret: string | undefined
  /** Token as it arrived, from the request body. */
  token: string
  /** Instant the verification happens at. Defaults to now. */
  now?: Date
}

/** Parses the payload of a token whose signature already matched. */
const payloadOf = (value: string): BookingManageTokenPayload | null => {
  const [eventId, expiresAt] = value.split(SEGMENT_SEPARATOR)
  if (eventId === undefined || expiresAt === undefined || !EVENT_ID_PATTERN.test(eventId)) return null

  const expiresAtMs = Number(expiresAt)
  if (!/^\d+$/.test(expiresAt) || !Number.isFinite(expiresAtMs)) return null

  return { eventId, expiresAt: expiresAtMs }
}

/**
 * Verifies a manage token and reads the event it points at.
 *
 * The signature is checked first, with a constant-time comparison, and only then is the payload
 * parsed, so an unsigned value is never interpreted. A missing secret refuses every token
 * (`not-configured`); a wrong signature (`invalid`) and a passed expiry (`expired`) are told apart,
 * because the page and the route answer them with different states. The expiry is the one the token
 * carries: the timing rules of an action are checked against the event's real start, never against
 * this value.
 *
 * @param input Secret, token and current instant.
 * @returns The event id and expiry of the token, or the reason it was refused.
 */
export const verifyBookingManageToken = ({
  secret,
  token,
  now = new Date(),
}: VerifyBookingManageTokenInput): BookingManageTokenVerdict => {
  if (secret === undefined || secret === '') return { ok: false, error: 'not-configured' }
  if (token === '' || token.length > BOOKING_MANAGE_TOKEN_MAX_LENGTH) return { ok: false, error: 'invalid' }

  const [encodedPayload, encodedSignature, ...rest] = token.split(SEGMENT_SEPARATOR)
  if (encodedPayload === undefined || encodedSignature === undefined || rest.length > 0) {
    return { ok: false, error: 'invalid' }
  }

  const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8')
  const provided = Buffer.from(encodedSignature, 'base64url')
  const expected = createHmac('sha256', secret).update(payload).digest()
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, error: 'invalid' }
  }

  const parsed = payloadOf(payload)
  if (parsed === null) return { ok: false, error: 'invalid' }
  if (parsed.expiresAt <= now.getTime()) return { ok: false, error: 'expired' }

  return { ok: true, data: parsed }
}
