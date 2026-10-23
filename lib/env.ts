import { z } from 'zod'

/**
 * Server-side environment schema, validated at every `readEnv` call. Every
 * consumer goes through this module — never `process.env` directly.
 * Feature-specific keys (Airtable, Fillout, Umami…) extend this schema in
 * their own issue rather than being anticipated here.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ENABLE_PREVIEW_ROUTE: z.enum(['true', 'false']).default('false'),
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
