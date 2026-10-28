import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestChatCompletion } from '@/lib/assistant/mistral'
import { POST } from './route'

vi.mock('@/lib/assistant/mistral', () => ({ requestChatCompletion: vi.fn() }))

const completionMock = vi.mocked(requestChatCompletion)

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
  completionMock.mockReset()
  completionMock.mockResolvedValue({ ok: true, data: 'Une réponse ancrée.' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/assistant', () => {
  it('refuses a request without a browser origin', async () => {
    const response = await POST(request(validBody, { 'content-type': 'application/json' }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(completionMock).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request', async () => {
    const response = await POST(
      request(validBody, { origin: 'https://evil.example', 'content-type': 'application/json' }),
    )
    expect(response.status).toBe(403)
    expect(completionMock).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON', async () => {
    const response = await POST(request('question=test', { origin: 'http://localhost', 'content-type': 'text/plain' }))
    expect(response.status).toBe(415)
    expect(completionMock).not.toHaveBeenCalled()
  })

  it('refuses malformed JSON and an invalid body without calling Mistral', async () => {
    const headers = { origin: 'http://localhost', 'content-type': 'application/json' }

    expect((await POST(request('{', headers))).status).toBe(400)
    expect((await POST(request({ question: '   ' }, headers))).status).toBe(400)
    expect(completionMock).not.toHaveBeenCalled()
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
  })

  it('fails closed with a generic error when Mistral is unavailable', async () => {
    completionMock.mockResolvedValue({ ok: false, error: 'upstream' })

    const response = await POST(request(validBody))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it('rate-limits one IP after ten questions in the window', async () => {
    const headers = {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
    }

    for (let index = 0; index < 10; index += 1) {
      expect((await POST(request(validBody, headers))).status).toBe(200)
    }

    const limited = await POST(request(validBody, headers))
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate-limited' })
    expect(completionMock).toHaveBeenCalledTimes(10)
  })

  it('never echoes the question, the answer or an upstream detail in an error', async () => {
    completionMock.mockResolvedValue({ ok: false, error: 'timeout' })

    const response = await POST(request({ question: 'Donnée sensible', history: [] }))
    const text = await response.text()

    expect(text).toBe('{"error":"unavailable"}')
    expect(text).not.toContain('Donnée sensible')
  })
})
