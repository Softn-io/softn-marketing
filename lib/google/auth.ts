/*
 * Google authentication of the booking, without any SDK and without a private key.
 *
 * The server never holds a service-account key. It presents the Vercel OIDC token of the running
 * deployment as the subject token, exchanges it at the Security Token Service for a federated access
 * token, asks IAM Credentials to sign a short-lived assertion for the service account, and trades
 * that assertion for the access token the Calendar API accepts. Every step is a documented REST call
 * made with plain `fetch`, each with its own timeout.
 *
 * Docs read for this flow: `https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-
 * other-clouds` (STS exchange, audience without a scheme, `cloud-platform` scope),
 * `.../reference/sts/rest/v1/TopLevel/token` (request fields), `.../reference/credentials/rest/v1/
 * projects.serviceAccounts/signJwt` (`payload`, `iam.serviceAccounts.signJwt`, IAM scope) and
 * `https://vercel.com/docs/oidc/reference` (the `x-vercel-oidc-token` request header first, then
 * `VERCEL_OIDC_TOKEN`; the token is per request and must not be cached at module level).
 */

import { z } from 'zod'
import { readEnv } from '@/lib/env'
import { readGoogleErrorReason } from './errorReason'

/** Security Token Service of Google Cloud, where the subject token is exchanged. */
const STS_ENDPOINT = 'https://sts.googleapis.com/v1/token'

/** IAM Credentials, where a short-lived assertion is signed by the service account's own key. */
const IAM_CREDENTIALS_ENDPOINT = 'https://iamcredentials.googleapis.com/v1'

/** OAuth 2.0 token endpoint, where the signed assertion becomes an access token. */
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/** Grant type of the signed-JWT flow, the one that ends the chain. */
const JWT_BEARER_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer'

/** Grant type of the token exchange that starts the chain. */
const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange'

/** Requested token type of the exchange: a Google access token. */
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'

/** Subject token type of the exchange: the Vercel OIDC token is a JWT. */
const JWT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt'

/**
 * Scope of the federated token, which only has to reach IAM Credentials: the Calendar scopes are
 * carried by the assertion the service account signs, not by this token.
 */
const FEDERATED_TOKEN_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

/** Header Vercel sets on every function request, carrying the OIDC token of that request. */
export const VERCEL_OIDC_HEADER = 'x-vercel-oidc-token'

/**
 * OAuth scopes the booking needs on the calendar, delegated to the service account in the Google
 * Workspace admin console: `calendar.events` covers listing, patching and creating events,
 * `calendar.freebusy` covers the free/busy query. Nothing larger is requested.
 */
export const GOOGLE_BOOKING_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
] as const

/**
 * OAuth scope of the Gmail send call, delegated to the service account in the Workspace admin
 * console beside the two calendar scopes.
 *
 * Requested for the Gmail call alone: the calendar calls keep {@link GOOGLE_BOOKING_SCOPES}, so a
 * token that may send mail is never minted for them. `gmail.send` sends on the impersonated user's
 * behalf and reads nothing.
 */
export const GOOGLE_GMAIL_SEND_SCOPES = ['https://www.googleapis.com/auth/gmail.send'] as const

/** Non-personal failure codes of the Google calls, mapped to locale copy by the caller. */
export type GoogleFailureCode = 'not-configured' | 'unauthorized' | 'request-failed' | 'timeout' | 'invalid-response'

/**
 * Step of the credential chain a failure came from.
 *
 * The codes say what went wrong, not where: an auth failure and a broken Calendar call both answer
 * `request-failed`, so the caller needs the step to log a line a human can act on.
 */
export type GoogleAuthStep = 'sts' | 'signJwt' | 'delegation-token'

/**
 * Failure of a Google call: its code, plus the diagnostic detail its caller logs.
 *
 * `status` is the numeric status of the upstream answer, absent when no answer came back (timeout,
 * network). `step` names the credential step that failed, on the calls that go through the chain.
 * `reason` is Google's machine-readable reason (`error.errors[0].reason`, or `error.status` when the
 * answer carries none), read from the failed body by {@link readGoogleErrorReason} and never a
 * message: an upstream body can echo the request, so only that token leaves the boundary.
 */
export type GoogleFailure = {
  readonly ok: false
  readonly error: GoogleFailureCode
  readonly status?: number
  readonly step?: GoogleAuthStep
  readonly reason?: string
}

/** Outcome of a Google call: its data, or a failure that carries no upstream detail. */
export type GoogleResult<T> = { readonly ok: true; readonly data: T } | GoogleFailure

/** Upper bound on one call to Google: the booking must not hang on a slow upstream. */
export const GOOGLE_REQUEST_TIMEOUT_MS = 5000

/** Token lifetime kept back from the cache, so an expiring token is never sent. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000

/** Validity window of the signed assertion. Google APIs refuse an `exp` more than one hour ahead. */
const ASSERTION_LIFETIME_SECONDS = 3600

const AccessTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
})

const SignedJwtResponseSchema = z.object({
  signedJwt: z.string().min(1),
})

/**
 * Access tokens for the calendar, keyed by the identity they were issued for.
 *
 * This is an explicit process-level cache: a serverless instance reuses its token across requests
 * instead of walking the whole exchange again. It holds no personal data, and it never holds the
 * subject token, which is per request (Vercel's OIDC reference: "Don't cache the returned token").
 */
const accessTokens = new Map<string, { readonly accessToken: string; readonly expiresAtMs: number }>()

/** True when a rejected fetch is a timeout rather than a network or upstream failure. */
export const isGoogleTimeoutError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')

/**
 * Reads the subject token from a header store: the deployment's OIDC token.
 *
 * The header comes first, as Vercel documents (`x-vercel-oidc-token`); the header store may be the
 * one of a Route Handler's Request or the `headers()` of a Server Component. `VERCEL_OIDC_TOKEN`,
 * which `vercel env pull` writes to the local environment, is the development fallback. The token is
 * never logged, never cached and never returned to a caller.
 *
 * @param headerStore Anything exposing `get`, like the Headers of a request or of a Server Component.
 * @returns The subject token, or `undefined` when the environment does not provide one.
 */
export const readSubjectTokenFromHeaderStore = (headerStore: {
  get(name: string): string | null | undefined
}): string | undefined => {
  const header = headerStore.get(VERCEL_OIDC_HEADER)?.trim()
  if (header !== undefined && header !== '') return header

  try {
    return readEnv().VERCEL_OIDC_TOKEN
  } catch {
    return undefined
  }
}

/**
 * Reads the subject token of this request: the deployment's OIDC token.
 *
 * The request header comes first, as Vercel documents (`x-vercel-oidc-token`, read from the Request
 * object, never at module level); `VERCEL_OIDC_TOKEN`, which `vercel env pull` writes to the local
 * environment, is the development fallback. The token is never logged, never cached and never
 * returned to a caller.
 *
 * @param request Incoming request, or `null` outside a request (a build, a script).
 * @returns The subject token, or `undefined` when the environment does not provide one.
 */
export const readSubjectToken = (request: Request | null): string | undefined =>
  readSubjectTokenFromHeaderStore(request?.headers ?? { get: () => null })

/**
 * Configuration the exchange needs, read at call time so a running server sees its own values.
 *
 * `owner` is the user the service account impersonates, and the only identity this chain speaks for:
 * the calendar the events go to is a separate value, read by the calendar client.
 */
type FederatedConfig = {
  readonly projectNumber: string
  readonly poolId: string
  readonly providerId: string
  readonly serviceAccountEmail: string
  readonly owner: string
}

/**
 * Reads the federated configuration, or `null` when any part of it is missing.
 *
 * The owner has no fallback: without `GOOGLE_CALENDAR_OWNER` the chain answers `not-configured`
 * rather than impersonating whatever calendar id happens to be configured.
 */
const readFederatedConfig = (): FederatedConfig | null => {
  let environment: ReturnType<typeof readEnv>
  try {
    environment = readEnv()
  } catch {
    return null
  }

  const { GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID } = environment
  const serviceAccountEmail = environment.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const owner = environment.GOOGLE_CALENDAR_OWNER
  if (
    GCP_PROJECT_NUMBER === undefined ||
    GCP_WORKLOAD_IDENTITY_POOL_ID === undefined ||
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID === undefined ||
    serviceAccountEmail === undefined ||
    owner === undefined
  ) {
    return null
  }

  return {
    projectNumber: GCP_PROJECT_NUMBER,
    poolId: GCP_WORKLOAD_IDENTITY_POOL_ID,
    providerId: GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    serviceAccountEmail,
    owner,
  }
}

/** Reads the JSON body of an answered call, or `null` when there is none to read. */
const readJsonBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** Turns a failed status into its non-personal code; the body is read for its reason alone. */
const failureForStatus = (status: number): GoogleFailureCode =>
  status === 401 || status === 403 ? 'unauthorized' : 'request-failed'

/** One Google call: where, what, and the schema its answer must match. */
type GoogleCallInput<T> = {
  url: string
  body: unknown
  headers: Readonly<Record<string, string>>
  schema: z.ZodType<T>
}

/**
 * Runs one call with its own timeout and validates its answer.
 *
 * A failed status keeps its machine-readable reason ({@link readGoogleErrorReason}) and nothing else
 * of the body: never a message, never a field the caller would have to interpret.
 */
const callGoogle = async <T>({ url, body, headers, schema }: GoogleCallInput<T>): Promise<GoogleResult<T>> => {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, error: isGoogleTimeoutError(error) ? 'timeout' : 'request-failed' }
  }

  if (!response.ok) {
    const reason = await readGoogleErrorReason(response)
    return {
      ok: false,
      error: failureForStatus(response.status),
      status: response.status,
      ...(reason === undefined ? {} : { reason }),
    }
  }

  const parsed = schema.safeParse(await readJsonBody(response))
  if (!parsed.success) return { ok: false, error: 'invalid-response' }

  return { ok: true, data: parsed.data }
}

/** Arguments of {@link exchangeSubjectToken}. */
type ExchangeSubjectTokenInput = {
  /** Full resource name of the workload identity pool provider. */
  audience: string
  /** The deployment's OIDC token. */
  subjectToken: string
}

/**
 * Exchanges the subject token for a federated access token.
 *
 * The audience carries no scheme, as the workload identity documentation requires:
 * `//iam.googleapis.com/projects/<project number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`.
 */
const exchangeSubjectToken = async ({
  audience,
  subjectToken,
}: ExchangeSubjectTokenInput): Promise<GoogleResult<string>> => {
  const exchanged = await callGoogle({
    url: STS_ENDPOINT,
    headers: {},
    schema: AccessTokenResponseSchema,
    body: {
      grantType: TOKEN_EXCHANGE_GRANT_TYPE,
      audience,
      scope: FEDERATED_TOKEN_SCOPE,
      requestedTokenType: ACCESS_TOKEN_TYPE,
      subjectToken,
      subjectTokenType: JWT_TOKEN_TYPE,
    },
  })

  return exchanged.ok ? { ok: true, data: exchanged.data.access_token } : { ...exchanged, step: 'sts' }
}

/** Arguments of {@link signCalendarAssertion}. */
type SignCalendarAssertionInput = {
  /** Service account whose key signs the assertion. */
  serviceAccountEmail: string
  /** User the assertion speaks for: the impersonated owner, never the calendar the events go to. */
  owner: string
  /** Federated access token, which authorizes the signing call. */
  federatedToken: string
  /** Current time, in seconds since the epoch. */
  issuedAt: number
  /**
   * Scopes the assertion asks for, the caller's own. The delegated scopes travel here and
   * nowhere else, so the mail call's token can send mail and cannot read a calendar.
   */
  scopes: readonly string[]
}

/**
 * Has the service account sign the assertion the Calendar API accepts.
 *
 * The payload carries the delegation this booking needs: `iss` is the service account, `sub` is the
 * calendar owner, and `scope` is exactly the scopes the caller asked for. The key never leaves
 * Google: IAM Credentials signs with its system-managed key, which is what makes the flow keyless.
 */
const signCalendarAssertion = async ({
  serviceAccountEmail,
  owner,
  federatedToken,
  issuedAt,
  scopes,
}: SignCalendarAssertionInput): Promise<GoogleResult<string>> => {
  const signed = await callGoogle({
    url: `${IAM_CREDENTIALS_ENDPOINT}/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signJwt`,
    headers: { Authorization: `Bearer ${federatedToken}` },
    schema: SignedJwtResponseSchema,
    body: {
      payload: JSON.stringify({
        iss: serviceAccountEmail,
        sub: owner,
        scope: scopes.join(' '),
        aud: TOKEN_ENDPOINT,
        iat: issuedAt,
        exp: issuedAt + ASSERTION_LIFETIME_SECONDS,
      }),
    },
  })

  return signed.ok ? { ok: true, data: signed.data.signedJwt } : { ...signed, step: 'signJwt' }
}

/**
 * Trades the signed assertion for the access token the Calendar API accepts.
 *
 * The token endpoint takes a form body, not JSON: this is the OAuth 2.0 token endpoint, and its
 * assertion grant is defined that way.
 */
const requestCalendarToken = async (
  signedJwt: string,
): Promise<GoogleResult<z.infer<typeof AccessTokenResponseSchema>>> => {
  const body = new URLSearchParams({ grant_type: JWT_BEARER_GRANT_TYPE, assertion: signedJwt })

  let response: Response
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    return {
      ok: false,
      error: isGoogleTimeoutError(error) ? 'timeout' : 'request-failed',
      step: 'delegation-token',
    }
  }

  if (!response.ok) {
    const reason = await readGoogleErrorReason(response)
    return {
      ok: false,
      error: failureForStatus(response.status),
      status: response.status,
      step: 'delegation-token',
      ...(reason === undefined ? {} : { reason }),
    }
  }

  const parsed = AccessTokenResponseSchema.safeParse(await readJsonBody(response))
  if (!parsed.success) return { ok: false, error: 'invalid-response', step: 'delegation-token' }

  return { ok: true, data: parsed.data }
}

/** Arguments of {@link getAccessToken}. */
export type GetAccessTokenInput = {
  /** Subject token of the current request, from {@link readSubjectToken}. */
  subjectToken: string | undefined
  /**
   * Scopes the returned token may carry. Defaults to {@link GOOGLE_BOOKING_SCOPES}; the mail call
   * passes its own, so the two never share a token.
   */
  scopes?: readonly string[]
}

/**
 * Returns an access token for the impersonated calendar owner, without a service-account key.
 *
 * The environment is read at call time and a missing project, pool, provider, service account,
 * owner or subject token answers `not-configured` without any network call, so a build, a preview or
 * a test without the federation keeps working and fails closed. A token already issued for the same
 * identity and the same scopes is reused until shortly before it expires, and that identity is the
 * owner: the calendar the events go to never enters the key. The subject token itself is never
 * stored. Of an upstream error body, only the machine-readable reason is kept, for the caller's log
 * line. Nothing of this chain is logged from here.
 *
 * @param input Subject token of the request, and optional scopes.
 * @returns The bearer token for the asked scopes, or a non-personal failure code.
 */
export const getAccessToken = async ({
  subjectToken,
  scopes = GOOGLE_BOOKING_SCOPES,
}: GetAccessTokenInput): Promise<GoogleResult<string>> => {
  const config = readFederatedConfig()
  if (config === null || subjectToken === undefined || subjectToken === '') {
    return { ok: false, error: 'not-configured' }
  }

  const cacheKey = `${config.serviceAccountEmail}|${config.owner}|${scopes.join(' ')}`
  const cached = accessTokens.get(cacheKey)
  if (cached !== undefined && cached.expiresAtMs > Date.now()) return { ok: true, data: cached.accessToken }

  const audience = `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.poolId}/providers/${config.providerId}`
  const federated = await exchangeSubjectToken({ audience, subjectToken })
  if (!federated.ok) return federated

  const signed = await signCalendarAssertion({
    serviceAccountEmail: config.serviceAccountEmail,
    owner: config.owner,
    federatedToken: federated.data,
    issuedAt: Math.floor(Date.now() / 1000),
    scopes,
  })
  if (!signed.ok) return signed

  const token = await requestCalendarToken(signed.data)
  if (!token.ok) return token

  accessTokens.set(cacheKey, {
    accessToken: token.data.access_token,
    expiresAtMs: Date.now() + token.data.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
  })

  return { ok: true, data: token.data.access_token }
}
