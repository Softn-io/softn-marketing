import { z } from 'zod'

/**
 * Treats an empty or whitespace-only value as unset, so a copied `.env.example` with empty
 * placeholders does not fail validation.
 */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalString = z.preprocess(blankToUndefined, z.string().min(1).optional())

/** Baserow Cloud endpoint, hosted in the EU, used when `BASEROW_API_URL` is not set. */
const DEFAULT_BASEROW_API_URL = 'https://api.baserow.io'

/**
 * Baserow base URL. Only https is accepted because the database token travels to that host, and
 * the value is normalised (canonical URL, no trailing slash) so the helper can append its path.
 * It comes from the server environment only: no request or form value ever feeds it.
 */
const baserowApiUrl = z.preprocess(
  blankToUndefined,
  z
    .url({ protocol: /^https$/, normalize: true, error: 'BASEROW_API_URL must be an https URL' })
    .transform((value) => value.replace(/\/+$/, ''))
    .default(DEFAULT_BASEROW_API_URL),
)

/**
 * Upstash Redis REST base URL, the durable store of the assistant rate limit. Only https is
 * accepted because the token travels to that host, and the value is normalised (canonical URL, no
 * trailing slash) so the helper can append its path. Unset by default: development and test then
 * use the in-memory window, production fails closed. It comes from the server environment only.
 */
const upstashRedisRestUrl = z.preprocess(
  blankToUndefined,
  z
    .url({ protocol: /^https$/, normalize: true, error: 'UPSTASH_REDIS_REST_URL must be an https URL' })
    .transform((value) => value.replace(/\/+$/, ''))
    .optional(),
)

/**
 * Google service-account address used for the Calendar API. Optional: unset, the booking fails
 * closed with the generic copy instead of calling Google. Server-side only, never `NEXT_PUBLIC_`.
 */
const googleServiceAccountEmail = z.preprocess(blankToUndefined, z.email().optional())

/** Project number of the workload identity pool provider. Optional: unset, the booking fails closed. */
const gcpProjectNumber = z.preprocess(blankToUndefined, z.string().regex(/^\d+$/).optional())

/** Workload identity pool that trusts the Vercel OIDC issuer. Optional: unset, the booking fails closed. */
const gcpWorkloadIdentityPoolId = z.preprocess(blankToUndefined, optionalString)

/** Provider of that pool. Optional: unset, the booking fails closed. */
const gcpWorkloadIdentityPoolProviderId = z.preprocess(blankToUndefined, optionalString)

/**
 * OIDC token of the running deployment, used as the subject token of the federation.
 *
 * Vercel sets it as the `x-vercel-oidc-token` request header, which the Route Handlers read first;
 * this variable is the development fallback (`vercel env pull` writes it). It is a short-lived
 * credential, server-side only, never `NEXT_PUBLIC_` and never logged.
 */
const vercelOidcToken = z.preprocess(blankToUndefined, optionalString)

/**
 * Workspace user the service account impersonates through domain-wide delegation. This is the `sub`
 * claim of the signed assertion, and the identity the access token is issued for: never the calendar
 * the events go to. Optional: unset, the booking fails closed without any network call.
 */
const googleCalendarOwner = z.preprocess(blankToUndefined, z.email().optional())

/**
 * Calendar the booking writes to: its events, its daily call count, and the free/busy of its own
 * schedule. An address rather than a keyword, so a secondary calendar
 * (`abc123@group.calendar.google.com`) is accepted like the owner's primary one. Optional: unset,
 * the booking fails closed.
 */
const googleCalendarId = z.preprocess(blankToUndefined, z.email().optional())

/**
 * Mel's personal calendar, shared with the Workspace owner as "See only free/busy" and read for its
 * busy times only: no event detail is ever fetched, returned or logged. An address rather than a
 * keyword, like the booking calendar. Optional: unset, the free/busy query asks about the booking
 * and owner calendars only, unchanged. Server-side only, never `NEXT_PUBLIC_`.
 */
const googlePersonalCalendarId = z.preprocess(blankToUndefined, z.email().optional())

/**
 * Secret that signs the manage link of a booking, at least 32 characters (a keyed digest of a short
 * payload, so the strength is in the secret itself). Optional: unset, a booking still succeeds but
 * carries no manage line, and every manage link is refused. Server-side only, never `NEXT_PUBLIC_`.
 */
const bookingLinkSecret = z.preprocess(blankToUndefined, z.string().min(32).optional())

/**
 * Deployment environment Vercel sets on every build (`production`, `preview`, `development`).
 * Optional because nobody configures it by hand, and because local runs have no such variable:
 * only the exact value `production` pins the manage link to the canonical site origin. Server-side
 * only, never `NEXT_PUBLIC_`.
 */
const vercelEnv = z.preprocess(blankToUndefined, optionalString)

/**
 * Server-side environment schema, validated at every `readEnv` call. Every
 * consumer goes through this module — never `process.env` directly.
 *
 * The Baserow keys are optional: the build, the tests and the preview route
 * must work without them, and the Baserow helper reports a server error when
 * they are unset. They stay server-side and must never be prefixed with
 * `NEXT_PUBLIC_`.
 *
 * `MISTRAL_API_KEY` is optional for the same reason: without it the assistant
 * route answers with its generic error instead of calling Mistral AI. It is a
 * server-only secret and must never be prefixed with `NEXT_PUBLIC_`.
 *
 * `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are the shared
 * rate-limit store of the assistant route. Both optional: unset, development
 * and test keep the in-memory window while production fails closed. The token
 * doubles as the HMAC key of the stored client IP. Both stay server-side and
 * must never be prefixed with `NEXT_PUBLIC_`.
 *
 * The booking variables are optional too, and the booking endpoints fail
 * closed without them: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_CALENDAR_OWNER`,
 * `GOOGLE_CALENDAR_ID`, `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`
 * and `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` let the server reach the
 * calendar through Workload Identity Federation, and `BASEROW_LEADS_TABLE_ID`
 * says where the lead is stored. The owner is the user the service account
 * impersonates; the calendar id says where the events are written, so a
 * dedicated secondary calendar can hold the bookings. `GOOGLE_PERSONAL_CALENDAR_ID`
 * is Mel's personal calendar, shared with the Workspace owner as "See only
 * free/busy": the free/busy query reads its busy times only, never an event
 * detail, and limits them to the booking weekdays. No service-account key is stored: the subject
 * token is Vercel's OIDC token, read from the request header (or, in
 * development, from `VERCEL_OIDC_TOKEN`). `BOOKING_LINK_SECRET` is the
 * optional signing secret of the manage link: unset, a booking carries no
 * manage line and every manage token is refused. `VERCEL_ENV` is set by the
 * platform on every deployment, never by hand: it is read to pin the manage
 * link's origin to the canonical site in production. All of them stay
 * server-side and must never be prefixed with `NEXT_PUBLIC_`.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ENABLE_PREVIEW_ROUTE: z.enum(['true', 'false']).default('false'),
  BASEROW_API_URL: baserowApiUrl,
  BASEROW_TOKEN: optionalString,
  BASEROW_WAITLIST_TABLE_ID: optionalString,
  BASEROW_LEADS_TABLE_ID: optionalString,
  MISTRAL_API_KEY: optionalString,
  UPSTASH_REDIS_REST_URL: upstashRedisRestUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: googleServiceAccountEmail,
  GOOGLE_CALENDAR_OWNER: googleCalendarOwner,
  GOOGLE_CALENDAR_ID: googleCalendarId,
  GOOGLE_PERSONAL_CALENDAR_ID: googlePersonalCalendarId,
  GCP_PROJECT_NUMBER: gcpProjectNumber,
  GCP_WORKLOAD_IDENTITY_POOL_ID: gcpWorkloadIdentityPoolId,
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: gcpWorkloadIdentityPoolProviderId,
  VERCEL_OIDC_TOKEN: vercelOidcToken,
  BOOKING_LINK_SECRET: bookingLinkSecret,
  VERCEL_ENV: vercelEnv,
})

export type Env = z.infer<typeof EnvSchema>

/**
 * Validates the current process environment and returns the parsed values.
 *
 * Request-time decisions must call this instead of {@link env} so the running
 * server evaluates its own environment, not the one captured when the module
 * was first imported.
 *
 * @throws If a variable is missing or malformed.
 */
export const readEnv = (): Env => {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(`Invalid environment variables: ${result.error.message}`)
  }
  return result.data
}

/** Startup snapshot for consumers that read the environment once at import time. */
export const env = readEnv()
