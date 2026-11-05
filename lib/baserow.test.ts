import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBaserowRow, updateBaserowRow } from './baserow'

const fetchMock = vi.fn<typeof fetch>()

const firstCall = () => {
  const call = fetchMock.mock.calls[0]
  if (call === undefined) throw new Error('fetch was not called')
  return call
}

beforeEach(() => {
  vi.stubEnv('BASEROW_API_URL', 'https://api.baserow.io')
  vi.stubEnv('BASEROW_TOKEN', 'testDatabaseToken')
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('createBaserowRow', () => {
  it('posts the fields to the table and returns the new row id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 42,
          order: '1.00000000000000000000',
          Email: 'mel@example.fr',
          Source: 'coming-soon',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await createBaserowRow({
      tableId: '123456',
      fields: { Email: 'mel@example.fr', Source: 'coming-soon' },
    })

    expect(result).toEqual({ ok: true, data: { id: 42 } })

    const [url, init] = firstCall()
    expect(url).toBe('https://api.baserow.io/api/database/rows/table/123456/?user_field_names=true')
    expect(init?.method).toBe('POST')
    expect(init?.cache).toBe('no-store')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.headers).toMatchObject({
      Authorization: 'Token testDatabaseToken',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({ Email: 'mel@example.fr', Source: 'coming-soon' })
  })

  it('uses the configured API URL, for a self-hosted instance', async () => {
    vi.stubEnv('BASEROW_API_URL', 'https://baserow.example.fr/')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), { status: 200 }))

    await createBaserowRow({ tableId: '9', fields: { Email: 'mel@example.fr' } })

    const [url] = firstCall()
    expect(url).toBe('https://baserow.example.fr/api/database/rows/table/9/?user_field_names=true')
  })

  it('rejects a non-https API URL before any network call', async () => {
    vi.stubEnv('BASEROW_API_URL', 'http://api.baserow.io')

    const result = await createBaserowRow({ tableId: '123456', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to Baserow Cloud when the API URL is unset', async () => {
    vi.stubEnv('BASEROW_API_URL', '')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 200 }))

    await createBaserowRow({ tableId: '123456', fields: { Email: 'mel@example.fr' } })

    const [url] = firstCall()
    expect(url).toBe('https://api.baserow.io/api/database/rows/table/123456/?user_field_names=true')
  })

  it('returns a request failure with the status, without echoing the error body', async () => {
    // The body carries a sentinel the log must never see: it can echo the submitted values, which is
    // why nothing in the module reads it.
    const sentinel = 'SENTINEL-UPSTREAM-BODY-VALUE'
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'ERROR_REQUEST_BODY_VALIDATION', detail: sentinel }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const consoleSpies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]

    const result = await createBaserowRow({ tableId: '123456', fields: { Email: 'mel@example.fr' } })

    // The status is what tells a missing permission from a bad column; the body stays unread.
    expect(result).toEqual({ ok: false, error: 'request-failed', status: 400 })
    expect(JSON.stringify(result)).not.toContain(sentinel)
    expect(JSON.stringify(result)).not.toContain('mel@example.fr')
    for (const spy of consoleSpies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(sentinel)
      spy.mockRestore()
    }
  })

  it('returns a request failure when the request times out', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))

    const result = await createBaserowRow({ tableId: '123456', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'request-failed' })
  })

  it('returns a request failure on a malformed success body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    const result = await createBaserowRow({ tableId: '123456', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'request-failed' })
  })

  it('does not call Baserow when the token is unset', async () => {
    vi.stubEnv('BASEROW_TOKEN', '')

    const result = await createBaserowRow({ tableId: '123456', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call Baserow when the table id is empty', async () => {
    const result = await createBaserowRow({ tableId: '', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('updateBaserowRow', () => {
  it('patches the row with the given fields and returns its id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 42, Status: 'Spark cancelled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await updateBaserowRow({ tableId: '123456', rowId: 42, fields: { Status: 'Spark cancelled' } })

    expect(result).toEqual({ ok: true, data: { id: 42 } })

    const [url, init] = firstCall()
    expect(url).toBe('https://api.baserow.io/api/database/rows/table/123456/42/?user_field_names=true')
    expect(init?.method).toBe('PATCH')
    expect(init?.cache).toBe('no-store')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.headers).toMatchObject({
      Authorization: 'Token testDatabaseToken',
      'Content-Type': 'application/json',
    })
    // Only the named fields travel: a patch leaves every other cell of the row untouched.
    expect(JSON.parse(String(init?.body))).toEqual({ Status: 'Spark cancelled' })
  })

  it('uses the configured API URL, for a self-hosted instance', async () => {
    vi.stubEnv('BASEROW_API_URL', 'https://baserow.example.fr/')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), { status: 200 }))

    await updateBaserowRow({ tableId: '9', rowId: 7, fields: { Slot: '2026-11-03T08:30:00.000Z' } })

    const [url] = firstCall()
    expect(url).toBe('https://baserow.example.fr/api/database/rows/table/9/7/?user_field_names=true')
  })

  it('returns a request failure with the status, without echoing the error body', async () => {
    const sentinel = 'SENTINEL-UPSTREAM-BODY-VALUE'
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'ERROR_REQUEST_BODY_VALIDATION', detail: sentinel }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await updateBaserowRow({ tableId: '123456', rowId: 42, fields: { Status: 'Spark booked' } })

    expect(result).toEqual({ ok: false, error: 'request-failed', status: 400 })
    expect(JSON.stringify(result)).not.toContain(sentinel)
  })

  it('returns a request failure when the request times out or the body is malformed', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))

    expect(await updateBaserowRow({ tableId: '1', rowId: 2, fields: {} })).toEqual({
      ok: false,
      error: 'request-failed',
    })

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    expect(await updateBaserowRow({ tableId: '1', rowId: 2, fields: {} })).toEqual({
      ok: false,
      error: 'request-failed',
    })
  })

  it('does not call Baserow without a token, a table id or a usable row id', async () => {
    vi.stubEnv('BASEROW_TOKEN', '')

    expect(await updateBaserowRow({ tableId: '1', rowId: 2, fields: {} })).toEqual({
      ok: false,
      error: 'not-configured',
    })

    vi.stubEnv('BASEROW_TOKEN', 'testDatabaseToken')
    expect(await updateBaserowRow({ tableId: '', rowId: 2, fields: {} })).toEqual({
      ok: false,
      error: 'not-configured',
    })
    expect(await updateBaserowRow({ tableId: '1', rowId: 0, fields: {} })).toEqual({
      ok: false,
      error: 'not-configured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('createBaserowRow with verifyFields', () => {
  const verifyFields = [
    { field: 'First name', kind: 'text' },
    { field: 'Slot', kind: 'date-time' },
    { field: 'Consent', kind: 'boolean' },
    { field: 'Consent on', kind: 'date' },
  ] as const

  const fields = {
    'First name': 'Camille',
    Slot: '2026-11-05T09:00:00.000Z',
    Consent: true,
    'Consent on': '2026-11-01',
  } as const

  const respondWith = (body: unknown) =>
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

  it('accepts a create whose answer gives every verified value back', async () => {
    respondWith({ id: 42, ...fields })

    const result = await createBaserowRow({ tableId: '123456', fields, verifyFields })

    expect(result).toEqual({ ok: true, data: { id: 42 } })
  })

  it('accepts a date with time returned without its milliseconds', async () => {
    respondWith({ id: 42, ...fields, Slot: '2026-11-05T09:00:00Z' })

    const result = await createBaserowRow({ tableId: '123456', fields, verifyFields })

    expect(result).toEqual({ ok: true, data: { id: 42 } })
  })

  it('reports a missing verified column as a schema-mismatch that keeps the row id', async () => {
    respondWith({ id: 42, Slot: fields.Slot, Consent: fields.Consent, 'Consent on': fields['Consent on'] })

    const result = await createBaserowRow({ tableId: '123456', fields, verifyFields })

    expect(result).toEqual({ ok: false, error: 'schema-mismatch', rowId: 42 })
  })

  it('reports a changed text value as a schema-mismatch that keeps the row id', async () => {
    respondWith({ id: 42, ...fields, 'First name': 'Camille ' })

    const result = await createBaserowRow({ tableId: '123456', fields, verifyFields })

    expect(result).toEqual({ ok: false, error: 'schema-mismatch', rowId: 42 })
  })

  it('reports a null verified value as a schema-mismatch that keeps the row id', async () => {
    respondWith({ id: 42, ...fields, 'Consent on': null })

    const result = await createBaserowRow({ tableId: '123456', fields, verifyFields })

    expect(result).toEqual({ ok: false, error: 'schema-mismatch', rowId: 42 })
  })

  it('reports a verified value of another type as a schema-mismatch that keeps the row id', async () => {
    respondWith({ id: 42, ...fields, Consent: 'true' })

    const result = await createBaserowRow({ tableId: '123456', fields, verifyFields })

    expect(result).toEqual({ ok: false, error: 'schema-mismatch', rowId: 42 })
  })

  it('leaves the answer untouched without a verify list', async () => {
    respondWith({ id: 42, Email: 'mel@example.fr' })

    const result = await createBaserowRow({ tableId: '123456', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: true, data: { id: 42 } })
  })

  it('does not verify a failed request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }))

    const result = await createBaserowRow({ tableId: '123456', fields, verifyFields })

    expect(result).toEqual({ ok: false, error: 'request-failed', status: 400 })
  })
})
