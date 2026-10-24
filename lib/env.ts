import { z } from 'zod'

/**
 * Treats an empty or whitespace-only value as unset, so a copied `.env.example` with empty
 * placeholders does not fail validation.
 */
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
)

/**
 * Server-side environment schema, validated at every `readEnv` call. Every
 * consumer goes through this module — never `process.env` directly.
 *
 * The Airtable keys are optional: the build, the tests and the preview route
 * must work without them, and the Airtable helper reports a server error when
 * they are unset. They stay server-side and must never be prefixed with
 * `NEXT_PUBLIC_`.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ENABLE_PREVIEW_ROUTE: z.enum(['true', 'false']).default('false'),
  AIRTABLE_TOKEN: optionalString,
  AIRTABLE_BASE_ID: optionalString,
  AIRTABLE_WAITLIST_TABLE_ID: optionalString,
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
