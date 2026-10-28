import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { maxDuration } from '@/app/api/assistant/route'
import { MISTRAL_CHAT_COMPLETIONS_URL, MISTRAL_MODEL, MISTRAL_TOTAL_BUDGET_MS, requestChatCompletion } from './mistral'

const fetchMock = vi.fn<typeof fetch>()

const completion = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const request = {
  systemPrompt: 'Règles.',
  messages: [{ role: 'user' as const, content: 'Une question' }],
  retryDelayMs: 0,
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('MISTRAL_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('requestChatCompletion', () => {
  it('calls the pinned model with the system prompt and the bounded turns', async () => {
    fetchMock.mockResolvedValue(completion('  Une réponse.  '))

    const result = await requestChatCompletion(request)

    expect(result).toEqual({ ok: true, data: 'Une réponse.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(MISTRAL_CHAT_COMPLETIONS_URL)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: 'Règles.' },
        { role: 'user', content: 'Une question' },
      ],
      temperature: 0.2,
      max_tokens: 600,
    })
  })

  it('pins Mistral Small 4 v26.03 and not the moving alias', () => {
    expect(MISTRAL_MODEL).toBe('mistral-small-2603')
    expect(MISTRAL_MODEL).not.toContain('latest')
  })

  it('answers not-configured without a network call when the key is unset', async () => {
    vi.stubEnv('MISTRAL_API_KEY', '')

    const result = await requestChatCompletion(request)

    expect(result).toEqual({ ok: false, error: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries once on a 5xx and returns the second answer', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('upstream', { status: 503 }))
      .mockResolvedValueOnce(completion('Après reprise.'))

    const result = await requestChatCompletion(request)

    expect(result).toEqual({ ok: true, data: 'Après reprise.' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('maps an upstream rate limit to unavailable after the single retry', async () => {
    fetchMock.mockResolvedValue(new Response('slow down', { status: 429 }))

    const result = await requestChatCompletion(request)

    expect(result).toEqual({ ok: false, error: 'rate-limited' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 4xx other than 429', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))

    const result = await requestChatCompletion(request)

    expect(result).toEqual({ ok: false, error: 'upstream' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a timeout', async () => {
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    fetchMock.mockRejectedValue(timeout)

    const result = await requestChatCompletion(request)

    expect(result).toEqual({ ok: false, error: 'timeout' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a payload without a usable answer, without retrying', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await requestChatCompletion(request)

    expect(result).toEqual({ ok: false, error: 'invalid-response' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the worst case below the route max duration', () => {
    expect(MISTRAL_TOTAL_BUDGET_MS).toBeLessThan(maxDuration * 1000)
  })

  it('bounds a hanging attempt by the overall budget, without retrying it', async () => {
    vi.useFakeTimers()
    const hanging = new AbortController()
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      setTimeout(() => hanging.abort(), milliseconds)
      return hanging.signal
    })
    try {
      fetchMock.mockImplementation(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const error = new Error('aborted')
              error.name = 'AbortError'
              reject(error)
            })
          }),
      )

      const pending = requestChatCompletion({
        ...request,
        timeoutMs: 5_000,
        retryDelayMs: 400,
        totalBudgetMs: 40,
      })
      // The per-attempt timeout is clamped to the remaining budget: the abort is due at the
      // overall deadline, not at the asked 5 s.
      expect(timeoutSpy).toHaveBeenCalledWith(40)
      await vi.advanceTimersByTimeAsync(40)
      const result = await pending

      expect(result).toEqual({ ok: false, error: 'timeout' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      timeoutSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('answers timeout without any call when the overall budget is already spent', async () => {
    const result = await requestChatCompletion({ ...request, totalBudgetMs: 0 })

    expect(result).toEqual({ ok: false, error: 'timeout' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shortens the retry delay to the remaining budget instead of overshooting it', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockResolvedValue(new Response('upstream', { status: 503 }))

      const pending = requestChatCompletion({
        ...request,
        timeoutMs: 5_000,
        retryDelayMs: 400,
        totalBudgetMs: 40,
      })
      // The 503 is retryable, so exactly one backoff timer is scheduled, clamped to the
      // remaining budget instead of the asked 400 ms.
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)

      // The clamped backoff is due exactly at the overall deadline: advancing the full budget
      // completes the flow, and no time is left for a second attempt.
      await vi.advanceTimersByTimeAsync(40)
      const result = await pending

      expect(result).toEqual({ ok: false, error: 'timeout' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not start a retry once the overall budget is spent', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockResolvedValue(new Response('upstream', { status: 503 }))

      const pending = requestChatCompletion({
        ...request,
        timeoutMs: 5_000,
        retryDelayMs: 1_000,
        totalBudgetMs: 40,
      })
      await vi.advanceTimersByTimeAsync(40)
      const result = await pending

      expect(result).toEqual({ ok: false, error: 'timeout' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
