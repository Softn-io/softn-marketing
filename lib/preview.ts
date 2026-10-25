import { readEnv, type Env } from '@/lib/env'

/** The two environment fields the preview gate reads. */
type PreviewEnvironment = Pick<Env, 'NODE_ENV' | 'ENABLE_PREVIEW_ROUTE'>

/**
 * Whether the preview route is served: always in development, and elsewhere only when
 * `ENABLE_PREVIEW_ROUTE` is explicitly `'true'`.
 *
 * Takes an environment snapshot so the rule stays pure and testable; production callers rely on
 * the default, which `lib/env.ts` validates on every call so the decision reflects the environment
 * of the running server.
 */
export const isPreviewRouteEnabled = (environment: PreviewEnvironment = readEnv()): boolean =>
  environment.NODE_ENV === 'development' || environment.ENABLE_PREVIEW_ROUTE === 'true'
