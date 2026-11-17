// @vitest-environment jsdom
/*
 * Submission state of the contact form: the failure the hook shows and the outcome it hands back
 * for an answer of the Route Handler whose body cannot be read. The form around the hook is covered
 * by `ContactForm.test.tsx`.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useContactSubmission, type ContactSubmissionOutcome } from '../hooks/useContactSubmission'

const fetchMock = vi.fn<typeof fetch>()

/** Answer whose body is not JSON, like a proxy error page or a truncated response. */
const unreadableResponse = (status: number): Response =>
  new Response('<html>Bad Gateway</html>', { status, headers: { 'Content-Type': 'text/html' } })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useContactSubmission', () => {
  it('shows the generic incident and returns the aligned outcome when the error body cannot be read', async () => {
    fetchMock.mockResolvedValue(unreadableResponse(502))
    const { result } = renderHook(() => useContactSubmission())

    let outcome: ContactSubmissionOutcome | undefined
    await act(async () => {
      outcome = await result.current.send({})
    })

    expect(outcome).toEqual({ ok: false, error: 'invalid' })
    expect(result.current.error).toBe('generic')
    expect(result.current.status).toBe('idle')
  })
})
