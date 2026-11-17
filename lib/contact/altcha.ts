/*
 * Anti-bot proof of work of the contact form, through the Altcha Next.js plugin.
 *
 * The plugin owns both halves of the check. `challengeHandler` serves one signed challenge, whose
 * cost, prefix and lifetime are all signed, so a client cannot choose its own difficulty; the
 * plugin's `verify` — called from the contact route, not through `withMiddleware`, which in this
 * version never reaches the handler it wraps — checks the expiry, the signature and the derived key,
 * then claims the challenge once in the shared store, so a captured payload cannot be replayed. The
 * widget solves the challenge in the browser, in Web Workers, and nothing leaves this site.
 *
 * The visitor's browser brute-forces counters until the derived key starts with the signed prefix
 * (one byte, so around 256 derivations, a fraction of a second), while the server re-derives one key
 * to verify. No counter is handed out: the installed widget always searches from zero, so a
 * deterministic challenge would never be solved.
 *
 * The instance cannot be built at import time: its secret comes from the validated environment, which
 * a build must not require. It is built on the first request that needs it, and kept for the secret
 * it was built with.
 */

import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { create, deriveHmacKeySecret } from 'altcha-lib/frameworks/nextjs'
import { readEnv } from '@/lib/env'
import { CONTACT_ALTCHA_TTL_SECONDS, CONTACT_FIELDS } from '@/schemas/contactLimits'
import { contactReplayStore } from './replayStore'

/** Key derivation the widget bundles and solves in the browser; `node:crypto` derives it here. */
export const CONTACT_CHALLENGE_ALGORITHM = 'PBKDF2/SHA-256'

/** Iterations of the key derivation: a fraction of a second in the browser, one key to verify here. */
export const CONTACT_CHALLENGE_COST = 5000

/**
 * Hex prefix the derived key must start with. One byte keeps the search around 256 derivations; a
 * longer prefix would multiply the visitor's wait without changing what the server does.
 */
export const CONTACT_CHALLENGE_KEY_PREFIX = '00'

/** The plugin instance and the secrets it was built with. */
export type ContactAltcha = {
  /** The plugin instance, which serves the signed challenges. */
  readonly plugin: ReturnType<typeof create>
  /** Secret the challenges are signed with, from the validated environment. */
  readonly hmacSignatureSecret: string
  /** Secret the derived keys would be signed with, derived from the master secret. */
  readonly hmacKeySignatureSecret: string
}

/**
 * Instance of the plugin, kept for the secret it was built with.
 *
 * A module-level singleton on purpose: deriving the key-signature secret is asynchronous, so the
 * instance cannot be built at import time, and rebuilding it per request would derive that key on
 * every call. It is rebuilt when the secret changes, which only happens in a test.
 */
let instance: ContactAltcha | null = null

/**
 * Reads the signing secret of the challenges.
 *
 * Read at call time rather than at import time, so a deployment without the variable answers its
 * generic error instead of failing at build.
 */
const contactAltchaSecret = (): string | undefined => {
  try {
    return readEnv().ALTCHA_HMAC_KEY
  } catch {
    return undefined
  }
}

/** What the challenge route hands to `createChallenge`: algorithm, cost, prefix and lifetime. */
type ContactChallengeParameters = {
  readonly algorithm: string
  readonly cost: number
  readonly keyPrefix: string
  readonly expiresAt: Date
}

/**
 * Parameters of every challenge this route serves.
 *
 * They are rebuilt per challenge so the lifetime starts at that instant. The prefix is the required
 * one and no counter is set: the widget searches from zero, and a signed starting counter would leave
 * it with a prefix it can never match.
 */
const contactChallengeParameters = (): ContactChallengeParameters => ({
  algorithm: CONTACT_CHALLENGE_ALGORITHM,
  cost: CONTACT_CHALLENGE_COST,
  keyPrefix: CONTACT_CHALLENGE_KEY_PREFIX,
  expiresAt: new Date(Date.now() + CONTACT_ALTCHA_TTL_SECONDS * 1000),
})

/**
 * Reads the Altcha instance of this deployment, or `null` when it has no signing secret.
 *
 * The challenge route and the contact route both go through it, so the fail-closed behavior is
 * decided in one place: without a secret, no challenge can be served and no payload can be verified.
 *
 * @returns The plugin instance and its secrets, or `null` when `ALTCHA_HMAC_KEY` is unset.
 */
export const readContactAltcha = async (): Promise<ContactAltcha | null> => {
  const secret = contactAltchaSecret()
  if (secret === undefined) return null
  if (instance !== null && instance.hmacSignatureSecret === secret) return instance

  const hmacKeySignatureSecret = await deriveHmacKeySecret(secret)
  instance = {
    plugin: create({
      hmacSignatureSecret: secret,
      hmacKeySignatureSecret,
      deriveKey,
      store: contactReplayStore,
      fieldName: CONTACT_FIELDS.altcha,
      createChallengeParameters: contactChallengeParameters,
    }),
    hmacSignatureSecret: secret,
    hmacKeySignatureSecret,
  }

  return instance
}

/** Outcome of one verification: what failed, or `null` when the payload passed and was claimed. */
export type ContactAltchaVerification = {
  /** Message of the plugin's own failure, or `null` once the payload is verified and claimed. */
  readonly error: string | null
}

/**
 * Verifies one submitted payload and claims its challenge once.
 *
 * This is the plugin's own verification, called with the deriveKey, the secrets and the replay store
 * the instance was built with: the expiry, the challenge signature and the derived key are all
 * checked, then the challenge is claimed in the shared store, which is what refuses a replay. The
 * plugin's `withMiddleware` cannot be used here: in altcha-lib 2.8.0 it answers the middleware's own
 * Response and never calls the handler it wraps, because `middleware` builds that Response
 * unconditionally and its `result instanceof Response` check therefore always matches. Calling
 * `verify` keeps the whole order of the Route Handler in its own hands.
 *
 * The caller reads the instance once, before it parses the body, so a deployment without a signing
 * secret is refused there and this function never has to answer for it.
 *
 * @param altcha Instance the caller read with {@link readContactAltcha}.
 * @param payload Payload as the widget wrote it, still base64-encoded.
 * @returns The verification: `error` is null once the payload passed and its challenge was claimed.
 */
export const verifyContactAltchaPayload = async (
  altcha: ContactAltcha,
  payload: string,
): Promise<ContactAltchaVerification> => {
  const { error } = await altcha.plugin.verify(
    payload,
    deriveKey,
    altcha.hmacSignatureSecret,
    altcha.hmacKeySignatureSecret,
    contactReplayStore,
  )

  return { error }
}
