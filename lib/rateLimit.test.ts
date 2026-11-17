import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ASSISTANT_RATE_LIMIT_MAX_REQUESTS,
  ASSISTANT_RATE_LIMIT_POLICY,
  ASSISTANT_RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
  trustedClientIp,
} from './rateLimit'

const REST_URL = 'https://eu1-example.upstash.io'
const TOKEN = 'test-store-token'
const CLIENT_IP = '203.0.113.10'

const fetchMock = vi.fn<typeof fetch>()

const storedKey = (clientIp: string): string =>
  `assistant:rl:${createHmac('sha256', TOKEN).update(clientIp).digest('hex')}`

const pipeline = (count: number, expiry: number = count === 1 ? 1 : 0): Response =>
  new Response(JSON.stringify([{ result: count }, { result: expiry }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const timeoutError = (): Error => {
  const error = new Error('The operation timed out.')
  error.name = 'TimeoutError'
  return error
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', REST_URL)
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('checkRateLimit', () => {
  it('keeps the assistant 60 s window and its 10 question cap', () => {
    expect(ASSISTANT_RATE_LIMIT_WINDOW_MS).toBe(60_000)
    expect(ASSISTANT_RATE_LIMIT_MAX_REQUESTS).toBe(10)
  })

  it('counts one pipeline request under an HMAC of the IP, never the raw IP', async () => {
    fetchMock.mockResolvedValue(pipeline(1))

    const result = await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)

    expect(result).toEqual({ ok: true, data: 'allowed' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${REST_URL}/pipeline`)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    })

    const body = String(init?.body)
    expect(JSON.parse(body)).toEqual([
      ['INCR', storedKey(CLIENT_IP)],
      ['EXPIRE', storedKey(CLIENT_IP), 60, 'NX'],
    ])
    expect(body).not.toContain(CLIENT_IP)
  })

  it('shares one counter through the store, whatever the module instance', async () => {
    let storedCount = 0
    fetchMock.mockImplementation(async () => {
      storedCount += 1
      return pipeline(storedCount)
    })

    for (let index = 0; index < ASSISTANT_RATE_LIMIT_MAX_REQUESTS; index += 1) {
      expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({ ok: true, data: 'allowed' })
    }

    vi.resetModules()
    const freshModule = await import('./rateLimit')

    expect(await freshModule.checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: true,
      data: 'limited',
    })
  })

  it('limits on the returned count instead of a local counter', async () => {
    fetchMock.mockResolvedValue(pipeline(ASSISTANT_RATE_LIMIT_MAX_REQUESTS + 1))

    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({ ok: true, data: 'limited' })
  })

  it('counts another surface under its own prefix, window and cap when a policy is given', async () => {
    fetchMock.mockResolvedValue(pipeline(6))

    const policy = { keyPrefix: 'contact:rl:', windowMs: 600_000, maxRequests: 5 }
    const result = await checkRateLimit(CLIENT_IP, policy)

    expect(result).toEqual({ ok: true, data: 'limited' })

    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toEqual([
      ['INCR', `contact:rl:${createHmac('sha256', TOKEN).update(CLIENT_IP).digest('hex')}`],
      ['EXPIRE', `contact:rl:${createHmac('sha256', TOKEN).update(CLIENT_IP).digest('hex')}`, 600, 'NX'],
    ])
  })

  it('keeps the assistant counters apart from another surface, in the in-memory window', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const clientIp = '198.51.100.8'
    const policy = { keyPrefix: 'contact:rl:', windowMs: 600_000, maxRequests: 1 }

    expect(await checkRateLimit(clientIp, policy)).toEqual({ ok: true, data: 'allowed' })
    expect(await checkRateLimit(clientIp, policy)).toEqual({ ok: true, data: 'limited' })
    // The assistant's own window is untouched by the contact surface's counter.
    expect(await checkRateLimit(clientIp, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({ ok: true, data: 'allowed' })
  })

  it('fails closed on a non-2xx store response and keeps its status', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'ERR max requests limit exceeded' }), { status: 500 }),
    )

    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-unavailable',
      status: 500,
    })
  })

  it('fails closed when Redis rejects a command', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ error: "ERR wrong number of arguments for 'incr' command" }, { result: 0 }]), {
        status: 200,
      }),
    )

    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-unavailable',
    })
  })

  it('fails closed when the lifetime could not be set', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ result: 1 }, { error: 'ERR invalid expire' }]), { status: 200 }),
    )

    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-unavailable',
    })
  })

  it('fails closed on a malformed store response', async () => {
    fetchMock.mockResolvedValue(new Response('not-json', { status: 200 }))
    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-invalid-response',
    })

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: 1 }), { status: 200 }))
    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-invalid-response',
    })

    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ result: 'many' }, { result: 1 }]), { status: 200 }))
    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-invalid-response',
    })
  })

  it('fails closed on a timeout and on a network error', async () => {
    fetchMock.mockRejectedValue(timeoutError())
    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({ ok: false, error: 'store-timeout' })

    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-unavailable',
    })
  })

  it('fails closed in production when the store is not configured', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-unconfigured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed in production when only one store variable is set', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-unconfigured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the in-memory window outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const clientIp = '198.51.100.7'

    for (let index = 0; index < ASSISTANT_RATE_LIMIT_MAX_REQUESTS; index += 1) {
      expect(await checkRateLimit(clientIp, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({ ok: true, data: 'allowed' })
    }

    expect(await checkRateLimit(clientIp, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({ ok: true, data: 'limited' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the in-memory window outside production when only one store variable is set', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({ ok: true, data: 'allowed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the environment itself is invalid, in any environment', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://not-https.example')

    expect(await checkRateLimit(CLIENT_IP, ASSISTANT_RATE_LIMIT_POLICY)).toEqual({
      ok: false,
      error: 'store-unconfigured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('trustedClientIp', () => {
  const request = (headers: Readonly<Record<string, string>>): Request =>
    new Request('http://localhost/api/assistant', { headers })

  it('reads the platform header and ignores a spoofed x-forwarded-for', () => {
    expect(
      trustedClientIp(
        request({ 'x-forwarded-for': '198.51.100.9', 'x-vercel-forwarded-for': '203.0.113.10, 10.0.0.1' }),
      ),
    ).toBe('203.0.113.10')
  })

  it('ignores a spoofed x-forwarded-for when no platform header is present', () => {
    expect(trustedClientIp(request({ 'x-forwarded-for': '198.51.100.9' }))).toBe('unknown')
  })

  it('falls back to x-real-ip', () => {
    expect(trustedClientIp(request({ 'x-real-ip': '203.0.113.11' }))).toBe('203.0.113.11')
  })

  it('uses one shared unknown bucket without a trusted header', () => {
    expect(trustedClientIp(request({}))).toBe('unknown')
    expect(trustedClientIp(request({ 'x-vercel-forwarded-for': '  ' }))).toBe('unknown')
  })
})
