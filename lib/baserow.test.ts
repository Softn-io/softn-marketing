import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBaserowRow } from './baserow'

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

  it('returns a request failure on a non-2xx response without echoing the error body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'ERROR_REQUEST_BODY_VALIDATION', detail: 'mel@example.fr' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await createBaserowRow({ tableId: '123456', fields: { Email: 'mel@example.fr' } })

    expect(result).toEqual({ ok: false, error: 'request-failed' })
    expect(JSON.stringify(result)).not.toContain('ERROR_REQUEST_BODY_VALIDATION')
    expect(JSON.stringify(result)).not.toContain('mel@example.fr')
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
