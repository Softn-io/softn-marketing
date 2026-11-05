import { describe, expect, it, vi } from 'vitest'
import { isRetryableMarkFailure, retryMarkPatch, type RetrySleep } from './markRetry'

/** One answer of a mark patch, as the calendar client produces it. */
type MarkResult =
  | { readonly ok: true; readonly data: true }
  | { readonly ok: false; readonly error: 'request-failed'; readonly status?: number; readonly reason?: string }

const SUCCESS: MarkResult = { ok: true, data: true }

const failure = (status: number, reason?: string): MarkResult => ({
  ok: false,
  error: 'request-failed',
  status,
  ...(reason === undefined ? {} : { reason }),
})

/** Records the delays instead of waiting, and hands the record back to the assertions. */
const recordingSleep = (): { readonly sleep: RetrySleep; readonly delays: readonly number[] } => {
  const delays: number[] = []
  return {
    sleep: async (milliseconds) => {
      delays.push(milliseconds)
    },
    delays,
  }
}

describe('isRetryableMarkFailure', () => {
  it('accepts a 429, whatever its reason says', () => {
    expect(isRetryableMarkFailure({ status: 429 })).toBe(true)
    expect(isRetryableMarkFailure({ status: 429, reason: 'rateLimitExceeded' })).toBe(true)
  })

  it('accepts the two documented rate-limit reasons of a 403', () => {
    expect(isRetryableMarkFailure({ status: 403, reason: 'rateLimitExceeded' })).toBe(true)
    expect(isRetryableMarkFailure({ status: 403, reason: 'userRateLimitExceeded' })).toBe(true)
  })

  it('refuses every other answer', () => {
    expect(isRetryableMarkFailure({ status: 403, reason: 'forbiddenForNonOrganizer' })).toBe(false)
    expect(isRetryableMarkFailure({ status: 403, reason: 'quotaExceeded' })).toBe(false)
    // A 403 without a machine-readable reason is a refusal, not a rate limit.
    expect(isRetryableMarkFailure({ status: 403 })).toBe(false)
    expect(isRetryableMarkFailure({ status: 401, reason: 'unauthorized' })).toBe(false)
    expect(isRetryableMarkFailure({ status: 500 })).toBe(false)
    // No status at all: a timeout, a network failure, a broken response.
    expect(isRetryableMarkFailure({})).toBe(false)
  })
})

describe('retryMarkPatch', () => {
  it('answers a first success at once, without waiting', async () => {
    const { sleep, delays } = recordingSleep()
    let attempts = 0

    const result = await retryMarkPatch(
      async () => {
        attempts += 1
        return SUCCESS
      },
      { sleep, random: () => 0.5 },
    )

    expect(result).toEqual(SUCCESS)
    expect(attempts).toBe(1)
    expect(delays).toEqual([])
  })

  it('retries a 429 once, after about 500 ms, and answers the second attempt', async () => {
    const { sleep, delays } = recordingSleep()
    const answers: MarkResult[] = [failure(429, 'rateLimitExceeded'), SUCCESS]
    let attempts = 0

    const result = await retryMarkPatch(
      async () => {
        attempts += 1
        return answers.shift() ?? SUCCESS
      },
      { sleep, random: () => 0.5 },
    )

    expect(result).toEqual(SUCCESS)
    expect(attempts).toBe(2)
    expect(delays).toEqual([500])
  })

  it.each(['rateLimitExceeded', 'userRateLimitExceeded'])('retries a 403 answered %s', async (reason) => {
    const { sleep, delays } = recordingSleep()
    const answers: MarkResult[] = [failure(403, reason), SUCCESS]

    const result = await retryMarkPatch(async () => answers.shift() ?? SUCCESS, { sleep, random: () => 0.5 })

    expect(result).toEqual(SUCCESS)
    expect(delays).toEqual([500])
  })

  it('waits about 500 ms then about 1500 ms, jittered but bounded under 2.5 s', async () => {
    const low = recordingSleep()
    const high = recordingSleep()
    const alwaysRetryable = async (): Promise<MarkResult> => failure(429)

    await retryMarkPatch(alwaysRetryable, { sleep: low.sleep, random: () => 0 })
    await retryMarkPatch(alwaysRetryable, { sleep: high.sleep, random: () => 1 })

    expect(low.delays).toEqual([400, 1200])
    expect(high.delays).toEqual([600, 1800])
    expect(high.delays.reduce((total, delay) => total + delay, 0)).toBeLessThan(2500)
  })

  it('stops after two retries and answers the last failure, its reason kept', async () => {
    const { sleep, delays } = recordingSleep()
    const answers: MarkResult[] = [
      failure(403, 'rateLimitExceeded'),
      failure(429, 'rateLimitExceeded'),
      failure(403, 'userRateLimitExceeded'),
    ]
    let attempts = 0

    const result = await retryMarkPatch(
      async () => {
        attempts += 1
        return answers.shift() ?? SUCCESS
      },
      { sleep, random: () => 0.5 },
    )

    expect(result).toEqual(failure(403, 'userRateLimitExceeded'))
    expect(attempts).toBe(3)
    expect(delays).toEqual([500, 1500])
  })

  it.each([
    ['forbiddenForNonOrganizer', 403],
    ['quotaExceeded', 403],
    ['unauthorized', 401],
    ['request-failed', 500],
  ] as const)('never retries a %s answer at status %i', async (reason, status) => {
    const { sleep, delays } = recordingSleep()
    let attempts = 0
    const answer: MarkResult = { ok: false, error: 'request-failed', status, reason }

    const result = await retryMarkPatch(
      async () => {
        attempts += 1
        return answer
      },
      { sleep, random: () => 0.5 },
    )

    expect(result).toEqual(answer)
    expect(attempts).toBe(1)
    expect(delays).toEqual([])
  })

  it('waits for real by default, so a route injects nothing', async () => {
    vi.useFakeTimers()
    try {
      let attempts = 0
      const promise = retryMarkPatch(async () => {
        attempts += 1
        return attempts === 1 ? failure(429) : SUCCESS
      })

      await vi.advanceTimersByTimeAsync(1000)

      await expect(promise).resolves.toEqual(SUCCESS)
      expect(attempts).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
