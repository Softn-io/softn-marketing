import { afterEach, describe, expect, it, vi } from 'vitest'
import { readEnv } from './env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('readEnv', () => {
  it('keeps an https Upstash URL and strips its trailing slash', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://eu1-example.upstash.io/')

    expect(readEnv().UPSTASH_REDIS_REST_URL).toBe('https://eu1-example.upstash.io')
  })

  it('rejects a non-https Upstash URL', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://eu1-example.upstash.io')

    expect(() => readEnv()).toThrow('UPSTASH_REDIS_REST_URL must be an https URL')
  })

  it('treats a blank Upstash variable as unset', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '   ')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

    const environment = readEnv()

    expect(environment.UPSTASH_REDIS_REST_URL).toBeUndefined()
    expect(environment.UPSTASH_REDIS_REST_TOKEN).toBeUndefined()
  })

  it('rejects a non-https Baserow URL', () => {
    vi.stubEnv('BASEROW_API_URL', 'http://api.baserow.io')

    expect(() => readEnv()).toThrow('BASEROW_API_URL must be an https URL')
  })
})
