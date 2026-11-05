/*
 * Retry policy of the private-property mark patches.
 *
 * The marks this module serves are internal best-effort writes — the lead row id, the "lead not
 * stored" flag, the failed-email mark, the reminder flag, the sent instant — and nothing a visitor
 * reads. A rate limit on one of them loses a bookkeeping fact, not a booking: the calendar call
 * already answered `ok`, and the mark is what a later request reads back. That is why these calls,
 * and only these, may wait and try again.
 *
 * Google's documented guidance for `rateLimitExceeded` and `userRateLimitExceeded` is exponential
 * backoff (`https://developers.google.com/workspace/calendar/api/guides/errors`,
 * `https://developers.google.com/workspace/calendar/api/guides/quota`): a 429, or a 403 carrying one
 * of those two reasons, is the transient answer worth retrying, at most twice, with a short
 * jittered wait. Any other answer — another reason such as `forbiddenForNonOrganizer` or
 * `quotaExceeded`, another status, a timeout, a broken response — is a real result the caller must
 * see, and is returned as it is on the first attempt.
 *
 * Nothing else of the booking uses this module: the insert, the reschedule patch, the deletion and
 * the Gmail send have side effects a retry could duplicate, and they are never retried.
 */

/** Waits one backoff delay. The default waits for real; a test injects its own. */
export type RetrySleep = (milliseconds: number) => Promise<void>

/** Waits one delay through a timer, the production behaviour. */
const realSleep: RetrySleep = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

/**
 * Injection points of the backoff.
 *
 * Both default to production behaviour, and both are optional so a caller that has nothing to inject
 * — every route — passes nothing: `sleep` is a real timer, `random` is `Math.random`. A test injects
 * a sleep that records its delay instead of waiting, and a fixed random to make the jittered delay
 * predictable.
 */
export type MarkRetryOptions = {
  /** Waits one delay; the tests pass a recorder instead of a timer. */
  readonly sleep?: RetrySleep
  /** Source of the jitter, in `[0, 1)`; `Math.random` by default. */
  readonly random?: () => number
}

/**
 * Backoff delays of the two retries, in order.
 *
 * The first retry waits about half a second, the second about a second and a half: enough for a
 * per-second burst limit to pass, short enough that the whole extra wait stays under 2.5 s.
 */
const RETRY_DELAYS_MS = [500, 1500] as const

/** Bounds of the jitter applied to a delay: at least 80 %, at most 120 % of it. */
const JITTER_MIN = 0.8
const JITTER_SPAN = 0.4

/** Reasons of a 403 that mean "slow down", the two Google documents for a rate limit. */
const RETRYABLE_REASONS: ReadonlySet<string> = new Set(['rateLimitExceeded', 'userRateLimitExceeded'])

/** Failure fields the retry decision reads; the rest of a failure travels untouched. */
type RetryableFailure = {
  readonly status?: number
  readonly reason?: string
}

/**
 * True when a failed mark patch is worth another attempt.
 *
 * A 429 always is: Google answers it for a rate limit, whatever the reason field says. A 403 is only
 * retried when its machine-readable reason is one of the two rate-limit tokens, so a refusal that
 * means something else is never retried. Everything else — 401, 500, a timeout, an unreadable
 * answer — is a real result.
 *
 * @param failure Failure of a mark patch, as the calendar client returns it.
 * @returns True when the caller should wait and try the patch again.
 */
export const isRetryableMarkFailure = (failure: RetryableFailure): boolean => {
  if (failure.status === 429) return true

  return failure.status === 403 && failure.reason !== undefined && RETRYABLE_REASONS.has(failure.reason)
}

/** One delay with its jitter applied, rounded to a whole millisecond. */
const jitteredDelay = (baseMs: number, random: () => number): number =>
  Math.round(baseMs * (JITTER_MIN + random() * JITTER_SPAN))

/**
 * Runs one mark patch, retrying a rate-limited answer with jittered exponential backoff.
 *
 * The patch is attempted once, then at most twice more: after each of the first two retryable
 * failures the helper waits, then calls the patch again. A success ends the walk at once, and a
 * failure that is not retryable — or the failure of the last attempt — is returned exactly as the
 * patch produced it, reason included, so the caller logs and decides as it always did. The waits are
 * bounded: about 500 ms then about 1500 ms, jittered at most ±20 %, so the extra wait of one call
 * stays under 2.5 s.
 *
 * @param patch One attempt of the patch, called again on a retryable failure.
 * @param options Injected sleep and randomness; production passes nothing.
 * @returns The answer of the first successful attempt, or the last failure.
 */
export const retryMarkPatch = async <T extends { readonly ok: boolean } & RetryableFailure>(
  patch: () => Promise<T>,
  { sleep = realSleep, random = Math.random }: MarkRetryOptions = {},
): Promise<T> => {
  let result = await patch()

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (result.ok || !isRetryableMarkFailure(result)) return result

    const delay = RETRY_DELAYS_MS[attempt]
    if (delay === undefined) return result

    await sleep(jitteredDelay(delay, random))
    result = await patch()
  }

  return result
}
