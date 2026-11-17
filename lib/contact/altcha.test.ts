import { solveChallenge, type Challenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTACT_ALTCHA_TTL_SECONDS } from '@/schemas/contactLimits'
import {
  CONTACT_CHALLENGE_ALGORITHM,
  CONTACT_CHALLENGE_COST,
  CONTACT_CHALLENGE_KEY_PREFIX,
  readContactAltcha,
  verifyContactAltchaPayload,
} from './altcha'

const SECRET = 's'.repeat(48)

const challengeRequest = (): Request =>
  new Request('http://localhost/api/contact/challenge', {
    method: 'GET',
    headers: { origin: 'http://localhost' },
  })

/** Payload the widget would post back, for a challenge solved by the library's own solver. */
const solvedPayload = async (challenge: Challenge): Promise<string> => {
  const solution = await solveChallenge({ challenge, deriveKey })
  if (solution === null) throw new Error('the challenge could not be solved')

  return Buffer.from(JSON.stringify({ challenge, solution }), 'utf8').toString('base64')
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('ALTCHA_HMAC_KEY', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('readContactAltcha', () => {
  it('fails closed without a signing secret', async () => {
    vi.stubEnv('ALTCHA_HMAC_KEY', '')

    expect(await readContactAltcha()).toBeNull()
  })

  it('signs a challenge whose parameters are the ones the contact form needs', async () => {
    const altcha = await readContactAltcha()
    if (altcha === null) throw new Error('the instance should exist')

    const response = await altcha.plugin.challengeHandler(challengeRequest())
    const challenge = (await response.json()) as Challenge

    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(challenge.parameters.algorithm).toBe(CONTACT_CHALLENGE_ALGORITHM)
    expect(challenge.parameters.cost).toBe(CONTACT_CHALLENGE_COST)
    expect(challenge.parameters.keyPrefix).toBe(CONTACT_CHALLENGE_KEY_PREFIX)
    expect(challenge.signature).toMatch(/^[0-9a-f]{64}$/)
    expect(challenge.parameters.nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(challenge.parameters.expiresAt).toBeGreaterThan(Date.now() / 1000)
    expect(challenge.parameters.expiresAt).toBeLessThanOrEqual(Date.now() / 1000 + CONTACT_ALTCHA_TTL_SECONDS)
  })
})

describe('Altcha verification of the contact route', () => {
  const verify = async (payload: string): Promise<{ error: string | null }> => {
    const altcha = await readContactAltcha()
    if (altcha === null) throw new Error('the instance should exist')

    return verifyContactAltchaPayload(altcha, payload)
  }

  const newChallenge = async (): Promise<Challenge> => {
    const altcha = await readContactAltcha()
    if (altcha === null) throw new Error('the instance should exist')

    return (await (await altcha.plugin.challengeHandler(challengeRequest())).json()) as Challenge
  }

  it('accepts a solved challenge, then refuses the same payload as a replay', async () => {
    const challenge = await newChallenge()
    const payload = await solvedPayload(challenge)

    expect((await verify(payload))?.error).toBeNull()
    expect((await verify(payload))?.error).toBe('ALTCHA payload has been already used.')
  })

  it('refuses a missing payload and a payload that was never a challenge', async () => {
    expect((await verify(''))?.error).not.toBeNull()
    expect((await verify(Buffer.from('{"challenge":{},"solution":{}}').toString('base64')))?.error).not.toBeNull()
  })

  it('refuses a challenge whose signed parameters were changed', async () => {
    const challenge = await newChallenge()
    const payload = await solvedPayload(challenge)
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {
      challenge: { parameters: { cost: number } }
    }
    decoded.challenge.parameters.cost = 1

    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')
    expect((await verify(tampered))?.error).not.toBeNull()
  })

  it('fails closed when the replay store cannot answer', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

    const challenge = await newChallenge()
    const payload = await solvedPayload(challenge)

    expect((await verify(payload))?.error).toBe('contact replay store unavailable')
  })
})
