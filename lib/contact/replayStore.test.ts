import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTACT_ALTCHA_TTL_SECONDS } from '@/schemas/contactLimits'
import { contactReplayStore, CONTACT_REPLAY_STORE_UNAVAILABLE } from './replayStore'

const REST_URL = 'https://eu1-example.upstash.io'
const TOKEN = 'test-store-token'

const fetchMock = vi.fn<typeof fetch>()

const storeAnswer = (result: string | null): Response =>
  new Response(JSON.stringify([{ result }]), { status: 200, headers: { 'Content-Type': 'application/json' } })

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

describe('contactReplayStore with the shared store', () => {
  it('claims one challenge with SET … NX, under its own prefix and its own lifetime', async () => {
    fetchMock.mockResolvedValue(storeAnswer('OK'))

    const claimed = await contactReplayStore.setIfAbsent?.('challenge-1', true)

    expect(claimed).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${REST_URL}/pipeline`)
    expect(JSON.parse(String(init?.body))).toEqual([
      ['SET', 'contact:altcha:challenge-1', '1', 'EX', CONTACT_ALTCHA_TTL_SECONDS, 'NX'],
    ])
  })

  it('refuses a challenge that was already claimed', async () => {
    fetchMock.mockResolvedValue(storeAnswer(null))

    expect(await contactReplayStore.setIfAbsent?.('challenge-1', true)).toBe(false)
  })

  it('fails closed when the store answers an error status, a timeout or an unexpected body', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }))
    await expect(contactReplayStore.setIfAbsent?.('challenge-1', true)).rejects.toThrow(
      CONTACT_REPLAY_STORE_UNAVAILABLE,
    )

    const timeout = new Error('The operation timed out.')
    timeout.name = 'TimeoutError'
    fetchMock.mockRejectedValue(timeout)
    await expect(contactReplayStore.setIfAbsent?.('challenge-1', true)).rejects.toThrow(
      CONTACT_REPLAY_STORE_UNAVAILABLE,
    )

    fetchMock.mockResolvedValue(new Response('not-json', { status: 200 }))
    await expect(contactReplayStore.setIfAbsent?.('challenge-1', true)).rejects.toThrow(
      CONTACT_REPLAY_STORE_UNAVAILABLE,
    )

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ error: 'ERR wrong number of arguments' }]), { status: 200 }),
    )
    await expect(contactReplayStore.setIfAbsent?.('challenge-1', true)).rejects.toThrow(
      CONTACT_REPLAY_STORE_UNAVAILABLE,
    )
  })

  it('reads and writes a claim through the store when the plugin asks for them', async () => {
    fetchMock.mockResolvedValue(storeAnswer('1'))
    expect(await contactReplayStore.get('challenge-1')).toBe(true)

    fetchMock.mockResolvedValue(storeAnswer(null))
    expect(await contactReplayStore.get('challenge-1')).toBeNull()

    fetchMock.mockResolvedValue(storeAnswer('OK'))
    await contactReplayStore.set('challenge-1', false)
    const [, init] = fetchMock.mock.calls[2] ?? []
    expect(JSON.parse(String(init?.body))).toEqual([['SET', 'contact:altcha:challenge-1', '0', 'EX', 600]])
  })

  it('never stores a personal value: the key is the challenge id and the value a constant', async () => {
    fetchMock.mockResolvedValue(storeAnswer('OK'))

    await contactReplayStore.setIfAbsent?.('challenge-1', true)

    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(String(init?.body)).not.toContain('@')
    expect(String(init?.body)).not.toContain('camille')
  })
})

describe('contactReplayStore without a shared store', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  })

  it('fails closed in production', async () => {
    await expect(contactReplayStore.setIfAbsent?.('challenge-2', true)).rejects.toThrow(
      CONTACT_REPLAY_STORE_UNAVAILABLE,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('claims once in memory outside production, and refuses the second use', async () => {
    vi.stubEnv('NODE_ENV', 'test')

    expect(await contactReplayStore.setIfAbsent?.('challenge-3', true)).toBe(true)
    expect(await contactReplayStore.setIfAbsent?.('challenge-3', true)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
