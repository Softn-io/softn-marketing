/**
 * First-party routes of the Umami proxy, and the rewrites that map them to the Umami origin.
 *
 * This module is the single source the rewrites in `next.config.ts`, the home-page
 * `frame-ancestors` of `lib/securityHeaders.ts` and the loader of `lib/analytics/umami.ts` build
 * from, so a path change cannot leave the proxy and the injected `src` out of step.
 *
 * It imports nothing: `next.config.ts` (Node) and the loader (browser) both import it, so it must
 * pull neither React nor a Node-only module.
 */

/** Public origin of the self-hosted Umami instance. */
export const UMAMI_ORIGIN = 'https://umami.softn.io'

/** First-party path prefix the rewrites map to the Umami origin. */
export const UMAMI_PROXY_PREFIX = '/m'

/** First-party path of the tracker, rewritten to the Umami `script.js`. */
export const UMAMI_TRACKER_SRC = `${UMAMI_PROXY_PREFIX}/tr.js`

/** First-party path of the recorder, rewritten to the Umami `recorder.js`. */
export const UMAMI_RECORDER_SRC = `${UMAMI_PROXY_PREFIX}/rc.js`

/** Host URL given to both scripts: their data goes through the first-party proxy too. */
export const UMAMI_HOST_URL = UMAMI_PROXY_PREFIX

/** First-party prefix of the Umami API, rewritten to the Umami origin. */
export const UMAMI_API_PREFIX = `${UMAMI_PROXY_PREFIX}/api`

/** One rewrite rule, in the shape `rewrites()` in `next.config.ts` expects. */
export type UmamiRewrite = { readonly source: string; readonly destination: string }

/**
 * The rewrites that map the first-party routes to the Umami origin.
 *
 * The API rewrites name exactly the endpoints the two scripts call — the tracker posts to
 * `/api/send`, the recorder posts to `/api/record` and reads its public config from
 * `/api/websites/:id/recorder` — so the Umami login and admin surface is not exposed under the
 * site's own origin. `:id` is the website id the scripts carry; it stays a parameter so this
 * module keeps importing nothing.
 */
export const UMAMI_REWRITES: readonly UmamiRewrite[] = [
  { source: UMAMI_TRACKER_SRC, destination: `${UMAMI_ORIGIN}/script.js` },
  { source: UMAMI_RECORDER_SRC, destination: `${UMAMI_ORIGIN}/recorder.js` },
  { source: `${UMAMI_API_PREFIX}/send`, destination: `${UMAMI_ORIGIN}/api/send` },
  { source: `${UMAMI_API_PREFIX}/record`, destination: `${UMAMI_ORIGIN}/api/record` },
  {
    source: `${UMAMI_API_PREFIX}/websites/:id/recorder`,
    destination: `${UMAMI_ORIGIN}/api/websites/:id/recorder`,
  },
]
