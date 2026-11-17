/*
 * One-time-use store of the Altcha challenges the contact form accepts.
 *
 * The Altcha plugin calls this store once a payload is verified: the challenge identifier must be
 * claimed exactly once, and a second use of the same payload is refused. The claim is written with
 * `SET … NX`, which is atomic, so two concurrent submissions cannot both pass; it expires with the
 * challenge, so nothing outlives the payload it belongs to.
 *
 * The claims live in the same Upstash database as the rate limiter, under their own key prefix.
 * Failures fail closed: a store that cannot answer throws {@link CONTACT_REPLAY_STORE_UNAVAILABLE},
 * the plugin turns that into a verification failure, and the Route Handler answers its generic error
 * instead of letting an unclaimed payload through. Outside production an in-memory claim keeps the
 * form usable without a store; it only protects the instance that serves the request. Nothing
 * personal is stored: the key is the random challenge identifier and the value is a constant.
 */

import { z } from 'zod'
import type { Store } from 'altcha-lib/frameworks/types'
import { readEnv, type Env } from '@/lib/env'
import { CONTACT_ALTCHA_TTL_SECONDS } from '@/schemas/contactLimits'

/** Namespace of the challenge keys inside the shared Redis database. */
const STORE_KEY_PREFIX = 'contact:altcha:'

/** Upper bound on one store call: a slow store must not eat the route's time budget. */
const STORE_TIMEOUT_MS = 1500

/**
 * Message the store throws when it cannot answer.
 *
 * The Altcha plugin catches what a store throws and keeps the message as the verification error, so
 * the Route Handler reads this exact code to tell an unavailable store from a refused payload. It
 * carries no key, no identifier and no submitted value.
 */
export const CONTACT_REPLAY_STORE_UNAVAILABLE = 'contact replay store unavailable'

/** Answer of one store command: the Redis result, or the error Redis rejected it with. */
const StoreCommandResponseSchema = z.tuple([
  z.union([z.object({ result: z.string().nullable() }), z.object({ error: z.string() })]),
])

/**
 * Best-effort in-memory claims, used outside production when the shared store is not configured.
 *
 * It only protects the instance that serves the request: a second serverless instance keeps its own
 * map and a restart forgets every claim. The entries expire with the challenge they claim.
 */
const memoryClaims = new Map<string, number>()

/** Namespaced key of one challenge inside the store. */
const storeKeyOf = (key: string): string => `${STORE_KEY_PREFIX}${key}`

/** Drops the in-memory claims that have expired. */
const pruneMemoryClaims = (now: number): void => {
  for (const [key, expiresAt] of memoryClaims) {
    if (expiresAt <= now) memoryClaims.delete(key)
  }
}

/** Reads the store configuration, or `null` when this deployment has none. */
const storeConfigurationOf = (): { url: string; token: string } | null => {
  let environment: Env
  try {
    environment = readEnv()
  } catch {
    throw new Error(CONTACT_REPLAY_STORE_UNAVAILABLE)
  }

  const url = environment.UPSTASH_REDIS_REST_URL
  const token = environment.UPSTASH_REDIS_REST_TOKEN
  if (url === undefined || token === undefined) {
    // A per-instance claim cannot prevent a replay across instances: production fails closed.
    if (environment.NODE_ENV === 'production') throw new Error(CONTACT_REPLAY_STORE_UNAVAILABLE)
    return null
  }

  return { url, token }
}

/**
 * Runs one command against the shared store and returns its result.
 *
 * Any failure — a timeout, a network error, a non-2xx answer, an unexpected body, a rejected command
 * — throws {@link CONTACT_REPLAY_STORE_UNAVAILABLE}: the caller then refuses the submission rather
 * than accepting a payload whose claim was never written.
 */
const runStoreCommand = async (command: readonly (string | number)[]): Promise<string | null> => {
  const configuration = storeConfigurationOf()
  if (configuration === null) throw new Error(CONTACT_REPLAY_STORE_UNAVAILABLE)

  try {
    const response = await fetch(`${configuration.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${configuration.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([command]),
      cache: 'no-store',
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    })

    if (!response.ok) throw new Error(CONTACT_REPLAY_STORE_UNAVAILABLE)

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error(CONTACT_REPLAY_STORE_UNAVAILABLE)
    }

    const parsed = StoreCommandResponseSchema.safeParse(payload)
    if (!parsed.success) throw new Error(CONTACT_REPLAY_STORE_UNAVAILABLE)

    const [answer] = parsed.data
    if ('error' in answer) throw new Error(CONTACT_REPLAY_STORE_UNAVAILABLE)

    return answer.result
  } catch {
    throw new Error(CONTACT_REPLAY_STORE_UNAVAILABLE)
  }
}

/**
 * True when this deployment has a shared store, so the claims must live in it.
 *
 * A production deployment without one is not an in-memory fallback: the throw of
 * {@link storeConfigurationOf} reaches the plugin, and the submission is refused.
 */
const hasSharedStore = (): boolean => storeConfigurationOf() !== null

/**
 * Reads one claim from the store: the boolean that was written, or `null` when there is none.
 *
 * The plugin only calls this when the store has no atomic claim, which is never the case here; it
 * stays a complete implementation of the interface so the store is usable on its own.
 */
const readClaim = async (key: string): Promise<boolean | null> => {
  if (!hasSharedStore()) {
    pruneMemoryClaims(Date.now())
    return memoryClaims.has(key) ? true : null
  }

  const result = await runStoreCommand(['GET', storeKeyOf(key)])
  return result === null ? null : result === '1'
}

/** Writes one claim without an expiry decision: the lifetime is the challenge's own. */
const writeClaim = async (key: string, value: boolean): Promise<void> => {
  if (!hasSharedStore()) {
    if (value) memoryClaims.set(key, Date.now() + CONTACT_ALTCHA_TTL_SECONDS * 1000)
    else memoryClaims.delete(key)
    return
  }

  await runStoreCommand(['SET', storeKeyOf(key), value ? '1' : '0', 'EX', CONTACT_ALTCHA_TTL_SECONDS])
}

/**
 * Claims one challenge for a single submission.
 *
 * `SET … NX` is atomic and answers `OK` only when the key was free: the first submission gets the
 * claim, every later one is refused. The key expires with the challenge, so a solved payload cannot
 * be kept for a second use.
 *
 * @param key Challenge identifier the plugin verified.
 * @returns True when this call was the first one, false when the payload was already used.
 */
const claimOnce = async (key: string): Promise<boolean> => {
  if (!hasSharedStore()) {
    pruneMemoryClaims(Date.now())
    if (memoryClaims.has(key)) return false

    memoryClaims.set(key, Date.now() + CONTACT_ALTCHA_TTL_SECONDS * 1000)
    return true
  }

  const result = await runStoreCommand(['SET', storeKeyOf(key), '1', 'EX', CONTACT_ALTCHA_TTL_SECONDS, 'NX'])
  return result !== null
}

/** Replay store of the contact form, as the Altcha plugin takes it. */
export const contactReplayStore: Store = {
  get: readClaim,
  set: writeClaim,
  setIfAbsent: claimOnce,
}
