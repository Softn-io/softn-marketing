import { z } from "zod";

/**
 * Server-side environment schema, validated once at import time. Every
 * consumer imports `env` from this module — never `process.env` directly.
 * Feature-specific keys (Airtable, Fillout, Umami…) extend this schema in
 * their own issue rather than being anticipated here.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

/** Throws at startup, not at first use, if a required variable is missing or malformed. */
function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment variables: ${result.error.message}`);
  }
  return result.data;
}

export const env = loadEnv();
