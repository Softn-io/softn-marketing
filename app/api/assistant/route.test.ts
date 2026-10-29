import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { requestChatCompletion } from '@/lib/assistant/mistral'
import { POST } from './route'

vi.mock('@/lib/assistant/mistral', () => ({ requestChatCompletion: vi.fn() }))

const completionMock = vi.mocked(requestChatCompletion)

let errorSpy: MockInstance

const request = (
  body: unknown,
  headers: Readonly<Record<string, string>> = {
    origin: 'http://localhost',
    'content-type': 'application/json',
  },
): Request =>
  new Request('http://localhost/api/assistant', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const validBody = { question: 'Comment se passe un projet ?', history: [] }

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  completionMock.mockReset()
  completionMock.mockResolvedValue({ ok: true, data: 'Une réponse ancrée.' })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('POST /api/assistant', () => {
  it('refuses a request without a browser origin', async () => {
    const response = await POST(request(validBody, { 'content-type': 'application/json' }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(completionMock).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request', async () => {
    const response = await POST(
      request(validBody, { origin: 'https://evil.example', 'content-type': 'application/json' }),
    )
    expect(response.status).toBe(403)
    expect(completionMock).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON', async () => {
    const response = await POST(request('question=test', { origin: 'http://localhost', 'content-type': 'text/plain' }))
    expect(response.status).toBe(415)
    expect(completionMock).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('refuses malformed JSON and an invalid body without calling Mistral', async () => {
    const headers = { origin: 'http://localhost', 'content-type': 'application/json' }

    expect((await POST(request('{', headers))).status).toBe(400)
    expect((await POST(request({ question: '   ' }, headers))).status).toBe(400)
    expect(completionMock).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('answers from the grounded bundle and sends the bounded history plus the question', async () => {
    const response = await POST(
      request({
        question: '  Comment se passe un projet ?  ',
        history: [
          { role: 'user', content: 'Bonjour' },
          { role: 'assistant', content: 'Bonjour, comment aider ?' },
        ],
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ answer: 'Une réponse ancrée.' })

    expect(completionMock).toHaveBeenCalledTimes(1)
    const call = completionMock.mock.calls[0]?.[0]
    expect(call?.messages).toEqual([
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Bonjour, comment aider ?' },
      { role: 'user', content: 'Comment se passe un projet ?' },
    ])
    expect(call?.systemPrompt).toContain('Concept : softn')
    expect(call?.systemPrompt).toContain('[[FALLBACK]]')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('fails closed with a generic error and one log line when Mistral is unavailable', async () => {
    completionMock.mockResolvedValue({ ok: false, error: 'upstream' })

    const response = await POST(request(validBody))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]).toEqual(['[assistant] unavailable: mistral upstream'])
  })

  it('logs the upstream HTTP status of a non-retryable 4xx', async () => {
    completionMock.mockResolvedValue({ ok: false, error: 'upstream', status: 401 })

    const response = await POST(
      request(validBody, {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '198.51.100.21',
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]).toEqual(['[assistant] unavailable: mistral upstream status=401'])
  })

  it('logs one line for a missing API key', async () => {
    completionMock.mockResolvedValue({ ok: false, error: 'not-configured' })

    const response = await POST(
      request(validBody, {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '198.51.100.22',
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]).toEqual(['[assistant] unavailable: mistral not-configured'])
  })

  it('logs the stage and code but never the question, the history, the key or the IP', async () => {
    vi.stubEnv('MISTRAL_API_KEY', 'sk-live-secret-value')
    completionMock.mockResolvedValue({ ok: false, error: 'upstream', status: 401 })

    await POST(
      request(
        {
          question: 'Mon adresse est 12 rue Sensible',
          history: [
            { role: 'user', content: 'Mon historique secret est 99 rue Cachée' },
            { role: 'assistant', content: 'Réponse confidentielle' },
          ],
        },
        {
          origin: 'http://localhost',
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.77',
        },
      ),
    )

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const line = String(errorSpy.mock.calls[0]?.[0])
    expect(line).toContain('mistral upstream status=401')
    expect(line).not.toContain('rue Sensible')
    expect(line).not.toContain('99 rue Cachée')
    expect(line).not.toContain('Réponse confidentielle')
    expect(line).not.toContain('sk-live-secret-value')
    expect(line).not.toContain('203.0.113.77')
  })

  it('rate-limits one IP after ten questions in the window', async () => {
    const headers = {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.10',
    }

    for (let index = 0; index < 10; index += 1) {
      expect((await POST(request(validBody, headers))).status).toBe(200)
    }

    const limited = await POST(request(validBody, headers))
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate-limited' })
    expect(completionMock).toHaveBeenCalledTimes(10)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('fails closed with the generic error and no Mistral call when the shared rate-limit store fails', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://eu1-example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-store-token')
    const storeMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":"ERR"}', { status: 500 }))
    vi.stubGlobal('fetch', storeMock)

    const response = await POST(
      request(
        { question: 'Mon adresse est 12 rue Sensible', history: [] },
        {
          origin: 'http://localhost',
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.50',
        },
      ),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(completionMock).not.toHaveBeenCalled()
    expect(storeMock).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    const line = String(errorSpy.mock.calls[0]?.[0])
    expect(line).toBe('[assistant] unavailable: rate-limit store-unavailable status=500')
    expect(line).not.toContain('203.0.113.50')
    expect(line).not.toContain('rue Sensible')
  })

  it('fails closed on a store timeout with the stage-and-code log line only', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://eu1-example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-store-token')
    const timeout = new Error('The operation timed out.')
    timeout.name = 'TimeoutError'
    const storeMock = vi.fn<typeof fetch>().mockRejectedValue(timeout)
    vi.stubGlobal('fetch', storeMock)

    const response = await POST(
      request(validBody, {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '203.0.113.51',
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(completionMock).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls[0]).toEqual(['[assistant] unavailable: rate-limit store-timeout'])
  })

  it('fails closed on a malformed store response', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://eu1-example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-store-token')
    const storeMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json', { status: 200 }))
    vi.stubGlobal('fetch', storeMock)

    const response = await POST(
      request(validBody, {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '203.0.113.52',
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(completionMock).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls[0]).toEqual(['[assistant] unavailable: rate-limit store-invalid-response'])
  })

  it('fails closed in production when the store is not configured, without touching the network', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const storeMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', storeMock)

    const response = await POST(
      request(validBody, {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '203.0.113.53',
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(completionMock).not.toHaveBeenCalled()
    expect(storeMock).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls[0]).toEqual(['[assistant] unavailable: rate-limit store-unconfigured'])
  })

  it('never echoes the question, the answer or an upstream detail in an error', async () => {
    completionMock.mockResolvedValue({ ok: false, error: 'timeout' })

    const response = await POST(request({ question: 'Donnée sensible', history: [] }))
    const text = await response.text()

    expect(text).toBe('{"error":"unavailable"}')
    expect(text).not.toContain('Donnée sensible')
  })
})
