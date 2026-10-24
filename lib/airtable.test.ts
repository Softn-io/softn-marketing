import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAirtableRecord } from './airtable'

const fetchMock = vi.fn<typeof fetch>()

const firstCall = () => {
  const call = fetchMock.mock.calls[0]
  if (call === undefined) throw new Error('fetch was not called')
  return call
}

beforeEach(() => {
  vi.stubEnv('AIRTABLE_TOKEN', 'patTestToken')
  vi.stubEnv('AIRTABLE_BASE_ID', 'appTestBase')
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('createAirtableRecord', () => {
  it('posts the fields to the table and returns the new record id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'rec123', createdTime: '2026-10-24T10:00:00.000Z', fields: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await createAirtableRecord({
      tableId: 'tblWaitlist',
      fields: { Email: 'mel@example.fr', Source: 'coming-soon' },
    })

    expect(result).toEqual({ ok: true, data: { id: 'rec123' } })

    const [url, init] = firstCall()
    expect(url).toBe('https://api.airtable.com/v0/appTestBase/tblWaitlist')
    expect(init?.method).toBe('POST')
    expect(init?.cache).toBe('no-store')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer patTestToken',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      fields: { Email: 'mel@example.fr', Source: 'coming-soon' },
      typecast: false,
    })
  })

  it('returns a request failure on a non-2xx response without echoing the error body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'mel@example.fr' } }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await createAirtableRecord({ tableId: 'tblWaitlist', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'request-failed' })
    expect(JSON.stringify(result)).not.toContain('UNKNOWN_FIELD_NAME')
    expect(JSON.stringify(result)).not.toContain('mel@example.fr')
  })

  it('returns a request failure when the request times out', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))

    const result = await createAirtableRecord({ tableId: 'tblWaitlist', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'request-failed' })
  })

  it('returns a request failure on a malformed success body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ records: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    const result = await createAirtableRecord({ tableId: 'tblWaitlist', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'request-failed' })
  })

  it('does not call Airtable when the token or base id is unset', async () => {
    vi.stubEnv('AIRTABLE_TOKEN', '')
    vi.stubEnv('AIRTABLE_BASE_ID', '')

    const result = await createAirtableRecord({ tableId: 'tblWaitlist', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call Airtable when the table id is empty', async () => {
    const result = await createAirtableRecord({ tableId: '', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
