import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { requestChatCompletion } from '@/lib/assistant/mistral'
import { POST } from './route'

const bundleError = vi.hoisted(() => ({ code: 'unsupported-version', file: 'index.md' }))

vi.mock('@/lib/assistant/okf', () => ({
  getOkfBundle: () => ({ ok: false, error: bundleError }),
}))

vi.mock('@/lib/assistant/mistral', () => ({ requestChatCompletion: vi.fn() }))

const completionMock = vi.mocked(requestChatCompletion)

let errorSpy: MockInstance

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/assistant with a non-conformant bundle', () => {
  it('fails closed with the generic error and never calls Mistral', async () => {
    const response = await POST(
      new Request('http://localhost/api/assistant', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'Une question', history: [] }),
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(completionMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]).toEqual(['[assistant] unavailable: bundle unsupported-version index.md'])
  })
})
