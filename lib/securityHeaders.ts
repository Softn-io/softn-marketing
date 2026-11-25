import { createHash } from 'node:crypto'
import { UMAMI_ORIGIN } from './analytics/umamiRoutes'

/** One HTTP response header, in the shape expected by `headers()` in `next.config.ts`. */
export type HttpHeader = { key: string; value: string }

/** Route rule in the shape returned by `headers()` in `next.config.ts`. */
export type HeaderRule = { source: string; headers: HttpHeader[] }

/** Options for {@link buildStaticContentSecurityPolicy}. */
export type ContentSecurityPolicyOptions = {
  /** Development server: React needs `'unsafe-eval'` to rebuild server stacks in the browser. */
  isDev: boolean
}

/** Options for {@link buildStaticContentSecurityPolicy} only: the static policy alone can widen framing. */
export type StaticContentSecurityPolicyOptions = ContentSecurityPolicyOptions & {
  /**
   * Value of the `frame-ancestors` directive. Defaults to `'none'`; the home page alone widens it
   * to the Umami dashboard so heatmap previews can be framed.
   */
  frameAncestors?: string
}

/** Options for {@link buildNonceContentSecurityPolicy}. */
export type NonceContentSecurityPolicyOptions = ContentSecurityPolicyOptions & {
  /** Per-request nonce Next.js attaches to the scripts it renders. */
  nonce: string
  /** CSP source of the theme init script, built with {@link cspHashSourceOf}. */
  themeScriptHash: string
}

/** Keeps the gated preview out of search indexes, independently of its document metadata. */
const PREVIEW_NOINDEX_HEADER: HttpHeader = { key: 'X-Robots-Tag', value: 'noindex' }

/** Default framing rule: no page may be framed. */
const DEFAULT_FRAME_ANCESTORS = "'none'"

/** Framing rule of the home page alone: the Umami dashboard previews its heatmaps in a frame. */
export const HOME_FRAME_ANCESTORS = `'self' ${UMAMI_ORIGIN}`

/** Browser features the site never uses; an empty allowlist denies them for every origin. */
const DENIED_PERMISSIONS = [
  'accelerometer',
  'autoplay',
  'bluetooth',
  'camera',
  'display-capture',
  'geolocation',
  'gyroscope',
  'hid',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'serial',
  'usb',
  'xr-spatial-tracking',
] as const

/**
 * Builds the CSP source that allows one exact inline script by hash, in the `'sha256-<base64>'`
 * form CSP expects.
 *
 * @param script Exact content of the inline script.
 * @returns The `'sha256-…'` source to list in `script-src`.
 */
export const cspHashSourceOf = (script: string): string =>
  `'sha256-${createHash('sha256').update(script).digest('base64')}'`

/**
 * Joins the directives every policy shares around the script sources of one policy.
 *
 * `script-src-attr 'none'` blocks the inline event-handler attributes (`on*=`) that
 * `'unsafe-inline'` would otherwise allow, in every environment. `style-src` keeps
 * `'unsafe-inline'` for the inline style attributes and `<style>` tags that React and Next.js
 * emit. `worker-src blob:` is what the Altcha widget of the contact form needs: it solves its
 * proof of work in Web Workers built from Blob URLs of its own bundled code. The workers inherit
 * this policy, and the widget uses neither WebAssembly nor `eval`, so no other source is opened.
 */
const buildPolicy = ({
  scriptSources,
  isDev,
  frameAncestors,
}: {
  scriptSources: string[]
  isDev: boolean
  frameAncestors: string
}): string =>
  [
    "default-src 'self'",
    ['script-src', ...scriptSources, ...(isDev ? ["'unsafe-eval'"] : [])].join(' '),
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    'worker-src blob:',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    'upgrade-insecure-requests',
  ].join('; ')

/**
 * Builds the static Content-Security-Policy header value, served on every path; `/` gets a variant
 * with a wider `frame-ancestors`.
 *
 * No third-party origin is allowed: Umami is requested through the site's own proxy prefix, so
 * `'self'` covers both scripts and their data. The home page alone widens `frame-ancestors` to the
 * Umami dashboard (see {@link HOME_FRAME_ANCESTORS}); every other path keeps `'none'`.
 *
 * Limitation: the policy is static (no nonce, so the pages stay CDN-cacheable).
 * Inline scripts are therefore allowed with `'unsafe-inline'`, which makes
 * `script-src` a weaker XSS barrier than a nonce or hash policy. The dynamic routes also receive
 * the stricter policy of {@link buildNonceContentSecurityPolicy}: the self-hosted server applies
 * the later nonce header over this one, and where a platform sends both, browsers enforce the
 * intersection, so the nonce policy decides either way.
 */
export const buildStaticContentSecurityPolicy = ({
  isDev,
  frameAncestors,
}: StaticContentSecurityPolicyOptions): string => {
  return buildPolicy({
    scriptSources: ["'self'", "'unsafe-inline'"],
    isDev,
    frameAncestors: frameAncestors ?? DEFAULT_FRAME_ANCESTORS,
  })
}

/**
 * Builds the per-request nonce Content-Security-Policy header value of the routes served by
 * `proxy.ts`.
 *
 * `'strict-dynamic'` makes browsers ignore the `'self'` allowlist for script elements: the
 * scripts Next.js renders carry the nonce, and the scripts they load inherit its trust. The
 * inline theme init script of the shared root layout cannot carry the nonce (the layout must stay
 * static), so its exact content is allowed by hash instead. `style-src` keeps `'unsafe-inline'`
 * for the style attributes React emits; only `script-src` is tightened here.
 */
export const buildNonceContentSecurityPolicy = ({
  nonce,
  isDev,
  themeScriptHash,
}: NonceContentSecurityPolicyOptions): string => {
  return buildPolicy({
    scriptSources: ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", themeScriptHash],
    isDev,
    frameAncestors: DEFAULT_FRAME_ANCESTORS,
  })
}

/**
 * Builds the security header rules: one applied to every path, static assets included, an exact
 * `/` rule that widens `frame-ancestors` to the Umami dashboard, a `no-referrer` rule for the
 * booking manage page, and a preview-only rule that marks the gated page `noindex`.
 *
 * The global rule carries the static CSP; the routes `proxy.ts` covers also receive the nonce
 * policy, which decides there. The `/` rule comes after the global one, so its CSP overrides the
 * global policy for the home page alone — the source is exact, it matches no other path.
 * `Strict-Transport-Security` omits `preload` on purpose: preloading is a hard-to-reverse
 * commitment for the whole domain. `X-Robots-Tag` stays out of the global rule so no public page
 * carries it. The manage page's token lives in its URL, so a referrer never leaves it: its rule
 * overrides the global policy for that path alone.
 */
export const buildSecurityHeaders = ({ isDev }: ContentSecurityPolicyOptions): HeaderRule[] => {
  return [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: buildStaticContentSecurityPolicy({ isDev }),
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value: DENIED_PERMISSIONS.map((feature) => `${feature}=()`).join(', '),
        },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    },
    {
      source: '/',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: buildStaticContentSecurityPolicy({ isDev, frameAncestors: HOME_FRAME_ANCESTORS }),
        },
      ],
    },
    {
      source: '/rendez-vous/:path*',
      headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
    },
    {
      source: '/preview',
      headers: [PREVIEW_NOINDEX_HEADER],
    },
  ]
}
