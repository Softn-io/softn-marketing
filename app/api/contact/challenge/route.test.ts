import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { GET } from './route'

const altchaMock = vi.hoisted(() => ({ readContactAltcha: vi.fn() }))

const rateLimitMock = vi.hoisted(() => ({ checkRateLimit: vi.fn(), trustedClientIp: vi.fn() }))

vi.mock('@/lib/contact/altcha', () => ({
  readContactAltcha: altchaMock.readContactAltcha,
}))
vi.mock('@/lib/rateLimit', () => rateLimitMock)

let errorSpy: MockInstance

const request = (headers: Readonly<Record<string, string>> = { origin: 'http://localhost' }): Request =>
  new Request('http://localhost/api/contact/challenge', { method: 'GET', headers })

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  altchaMock.readContactAltcha.mockReset()
  rateLimitMock.checkRateLimit.mockReset()
  rateLimitMock.trustedClientIp.mockReset()
  rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'allowed' })
  rateLimitMock.trustedClientIp.mockReturnValue('test-client')
  altchaMock.readContactAltcha.mockResolvedValue({
    plugin: {
      challengeHandler: () =>
        Response.json({ parameters: { algorithm: 'PBKDF2/SHA-256' } }, { headers: { 'Cache-Control': 'no-store' } }),
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/contact/challenge', () => {
  it('refuses a request that does not come from a page of the site', async () => {
    const response = await GET(request({}))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
  })

  it('serves the signed challenge of the plugin, never cached', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ parameters: { algorithm: 'PBKDF2/SHA-256' } })
  })

  it('counts the request in its own window before serving a challenge', async () => {
    await GET(request())

    const [clientIp, policy] = rateLimitMock.checkRateLimit.mock.calls[0] ?? []
    expect(clientIp).toBe('test-client')
    expect(policy).toMatchObject({ keyPrefix: 'contact:challenge:' })
  })

  it('answers the rate-limit code once the window is full', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'limited' })

    const response = await GET(request())

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate-limited' })
    expect(altchaMock.readContactAltcha).not.toHaveBeenCalled()
  })

  it('fails closed when the store cannot answer', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: false, error: 'store-timeout' })

    const response = await GET(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('rate-limit'))
  })

  it('fails closed, without calling the plugin, when the deployment has no signing secret', async () => {
    altchaMock.readContactAltcha.mockResolvedValue(null)

    const response = await GET(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('key-unset'))
  })
})
