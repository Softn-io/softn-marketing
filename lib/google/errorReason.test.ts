import { describe, expect, it } from 'vitest'
import { googleErrorReasonOfBody, readGoogleErrorReason } from './errorReason'

/** One error answer of Google, as the Calendar API documents it. */
const errorBody = (reason: string, message = 'Shared properties can only be changed by the organizer.'): string =>
  JSON.stringify({
    error: {
      errors: [{ domain: 'calendar', reason, message }],
      code: 403,
      message,
    },
  })

const responseWith = (body: string | null, status = 403): Response =>
  body === null
    ? new Response(null, { status })
    : new Response(body, { status, headers: { 'Content-Type': 'application/json' } })

describe('googleErrorReasonOfBody', () => {
  it('keeps the machine-readable reason of the first error entry', () => {
    expect(googleErrorReasonOfBody(errorBody('forbiddenForNonOrganizer'))).toBe('forbiddenForNonOrganizer')
    expect(googleErrorReasonOfBody(errorBody('rateLimitExceeded'))).toBe('rateLimitExceeded')
    expect(googleErrorReasonOfBody(errorBody('quotaExceeded', 'Calendar usage limits exceeded.'))).toBe('quotaExceeded')
  })

  it('falls back to the error status when no entry carries a reason', () => {
    const body = JSON.stringify({
      error: { code: 403, message: 'The caller does not have permission.', status: 'PermissionDenied' },
    })

    expect(googleErrorReasonOfBody(body)).toBe('PermissionDenied')
  })

  it('drops an underscored error status, whose shape is not that of a reason token', () => {
    const body = JSON.stringify({
      error: { code: 403, message: 'The caller does not have permission.', status: 'PERMISSION_DENIED' },
    })

    expect(googleErrorReasonOfBody(body)).toBeUndefined()
  })

  it('prefers the documented reason over the status', () => {
    const body = JSON.stringify({
      error: { errors: [{ reason: 'forbiddenForNonOrganizer' }], status: 'PERMISSION_DENIED' },
    })

    expect(googleErrorReasonOfBody(body)).toBe('forbiddenForNonOrganizer')
  })

  it('never returns the human-readable message', () => {
    const body = JSON.stringify({ error: { code: 403, message: 'melanie@example.com is not the organizer' } })

    expect(googleErrorReasonOfBody(body)).toBeUndefined()
  })

  it('drops a reason whose shape is not that of a reason token', () => {
    expect(googleErrorReasonOfBody(errorBody('forbidden_For_Non_Organizer'))).toBeUndefined()
    expect(googleErrorReasonOfBody(errorBody('forbiddenForNonOrganizer<script>'))).toBeUndefined()
    expect(googleErrorReasonOfBody(errorBody('réason'))).toBeUndefined()
    expect(googleErrorReasonOfBody(errorBody('a'.repeat(41)))).toBeUndefined()
  })

  it('drops a reason that is not a string, keeping the status fallback', () => {
    const body = JSON.stringify({ error: { errors: [{ reason: 403 }], status: 'PermissionDenied' } })

    expect(googleErrorReasonOfBody(body)).toBe('PermissionDenied')
  })

  it('answers nothing for a body that is not a Google error envelope', () => {
    expect(googleErrorReasonOfBody('')).toBeUndefined()
    expect(googleErrorReasonOfBody('not json at all')).toBeUndefined()
    expect(googleErrorReasonOfBody('[]')).toBeUndefined()
    expect(googleErrorReasonOfBody('{"reason":"forbiddenForNonOrganizer"}')).toBeUndefined()
  })

  it('keeps the status fallback when the error list itself is malformed', () => {
    const body = JSON.stringify({ error: { errors: 'not a list', status: 'PermissionDenied' } })

    expect(googleErrorReasonOfBody(body)).toBe('PermissionDenied')
  })
})

describe('readGoogleErrorReason', () => {
  it('reads the reason of a failed answer', async () => {
    expect(await readGoogleErrorReason(responseWith(errorBody('forbiddenForNonOrganizer')))).toBe(
      'forbiddenForNonOrganizer',
    )
  })

  it('answers nothing for an answer without a body', async () => {
    expect(await readGoogleErrorReason(responseWith(null))).toBeUndefined()
    expect(await readGoogleErrorReason(responseWith(''))).toBeUndefined()
  })

  it('answers nothing for a body that is not JSON', async () => {
    expect(await readGoogleErrorReason(new Response('<html>Forbidden</html>', { status: 403 }))).toBeUndefined()
  })

  it('never reads a body larger than a Google error envelope', async () => {
    const oversized = JSON.stringify({
      error: { errors: [{ reason: 'rateLimitExceeded' }], padding: 'x'.repeat(4096) },
    })

    expect(await readGoogleErrorReason(responseWith(oversized))).toBeUndefined()
  })

  it('reads a body close to the bound, so a normal envelope is never lost', async () => {
    const body = errorBody('quotaExceeded', 'Calendar usage limits exceeded.'.padEnd(600, ' '))

    expect(await readGoogleErrorReason(responseWith(body))).toBe('quotaExceeded')
  })

  it('answers nothing rather than throw when the body cannot be read', async () => {
    const failing = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('network interrupted'))
        },
      }),
      { status: 403 },
    )

    expect(await readGoogleErrorReason(failing)).toBeUndefined()
  })
})
