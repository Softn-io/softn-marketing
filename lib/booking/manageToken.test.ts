import { describe, expect, it } from 'vitest'
import { BOOKING_MANAGE_TOKEN_MAX_LENGTH } from '@/schemas/bookingManageLimits'
import { BOOKING_MANAGE_PATH, bookingManageToken, bookingManageUrl, verifyBookingManageToken } from './manageToken'

const SECRET = 'a'.repeat(48)
const EVENT_ID = 'softnabc0123456789abcdefghijkl'
const EXPIRY = '2026-11-03T09:00:00.000Z'
const NOW = new Date('2026-11-02T09:00:00.000Z')

const build = (overrides: Partial<Parameters<typeof bookingManageToken>[0]> = {}): string => {
  const token = bookingManageToken({ secret: SECRET, eventId: EVENT_ID, expiresAt: EXPIRY, ...overrides })
  if (token === null) throw new Error('the fixture must build a token')
  return token
}

describe('bookingManageToken', () => {
  it('round trips: the token verifies to the event id and the expiry it was built from', () => {
    const token = build()

    expect(verifyBookingManageToken({ secret: SECRET, token, now: NOW })).toEqual({
      ok: true,
      data: { eventId: EVENT_ID, expiresAt: Date.parse(EXPIRY) },
    })
  })

  it('carries no personal data and no other event field', () => {
    const token = build()
    const payload = Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')

    expect(payload).toBe(`${EVENT_ID}.${Date.parse(EXPIRY)}`)
  })

  it('builds the same token every time, so a later reminder can recompute the link', () => {
    expect(build()).toBe(build())
  })

  it('refuses to build a token for an event id outside base32hex, or an unreadable expiry', () => {
    expect(bookingManageToken({ secret: SECRET, eventId: 'not a base32hex id', expiresAt: EXPIRY })).toBeNull()
    expect(bookingManageToken({ secret: SECRET, eventId: EVENT_ID, expiresAt: 'not-a-date' })).toBeNull()
    expect(bookingManageToken({ secret: '', eventId: EVENT_ID, expiresAt: EXPIRY })).toBeNull()
  })
})

describe('verifyBookingManageToken', () => {
  it('refuses a token whose payload was edited, without reading it', () => {
    const token = build()
    const [, signature] = token.split('.')
    const tampered = Buffer.from(`${EVENT_ID}.${Date.parse(EXPIRY) + 86_400_000}`).toString('base64url')

    expect(verifyBookingManageToken({ secret: SECRET, token: `${tampered}.${signature}`, now: NOW })).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('refuses a token signed with another secret', () => {
    expect(verifyBookingManageToken({ secret: 'b'.repeat(48), token: build(), now: NOW })).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('refuses a token whose signature was shortened or truncated to another length', () => {
    const token = build()
    const [payload, signature = ''] = token.split('.')
    const shortened = signature.slice(0, -4)

    expect(verifyBookingManageToken({ secret: SECRET, token: `${payload}.${shortened}`, now: NOW })).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it.each([['a plain value'], ['two.segments.three'], ['']])('refuses the malformed token %s', (token) => {
    expect(verifyBookingManageToken({ secret: SECRET, token, now: NOW })).toEqual({ ok: false, error: 'invalid' })
  })

  it('refuses a token longer than the accepted bound', () => {
    const token = 'x'.repeat(BOOKING_MANAGE_TOKEN_MAX_LENGTH + 1)

    expect(verifyBookingManageToken({ secret: SECRET, token, now: NOW })).toEqual({ ok: false, error: 'invalid' })
  })

  it('stops accepting the token once its expiry has passed', () => {
    const token = build()

    expect(verifyBookingManageToken({ secret: SECRET, token, now: new Date(Date.parse(EXPIRY)) })).toEqual({
      ok: false,
      error: 'expired',
    })
    expect(verifyBookingManageToken({ secret: SECRET, token, now: new Date(Date.parse(EXPIRY) + 1) })).toEqual({
      ok: false,
      error: 'expired',
    })
    // One millisecond before the expiry the link still works.
    expect(verifyBookingManageToken({ secret: SECRET, token, now: new Date(Date.parse(EXPIRY) - 1) }).ok).toBe(true)
  })

  it('refuses every token when the deployment has no secret, fail closed', () => {
    expect(verifyBookingManageToken({ secret: undefined, token: build(), now: NOW })).toEqual({
      ok: false,
      error: 'not-configured',
    })
    expect(verifyBookingManageToken({ secret: '', token: build(), now: NOW })).toEqual({
      ok: false,
      error: 'not-configured',
    })
  })
})

describe('bookingManageUrl', () => {
  it('appends the token to the manage path of the given origin', () => {
    expect(bookingManageUrl({ origin: 'https://preview-abc.vercel.app', token: 'token-value' })).toBe(
      `https://preview-abc.vercel.app${BOOKING_MANAGE_PATH}/token-value`,
    )
  })
})
