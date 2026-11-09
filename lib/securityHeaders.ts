import { createHash } from 'node:crypto'

/** One HTTP response header, in the shape expected by `headers()` in `next.config.ts`. */
export type HttpHeader = { key: string; value: string }

/** Route rule in the shape returned by `headers()` in `next.config.ts`. */
export type HeaderRule = { source: string; headers: HttpHeader[] }

/** Options for {@link buildStaticContentSecurityPolicy}. */
export type ContentSecurityPolicyOptions = {
  /** Development server: React needs `'unsafe-eval'` to rebuild server stacks in the browser. */
  isDev: boolean
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
 * emit.
 */
const buildPolicy = ({ scriptSources, isDev }: { scriptSources: string[]; isDev: boolean }): string =>
  [
    "default-src 'self'",
    ['script-src', ...scriptSources, ...(isDev ? ["'unsafe-eval'"] : [])].join(' '),
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

/**
 * Builds the static Content-Security-Policy header value, served on every path.
 *
 * No third-party origin is allowed: Umami widens the policy in its own
 * change, once it is wired and consent-gated.
 *
 * Limitation: the policy is static (no nonce, so the pages stay CDN-cacheable).
 * Inline scripts are therefore allowed with `'unsafe-inline'`, which makes
 * `script-src` a weaker XSS barrier than a nonce or hash policy. The dynamic routes also receive
 * the stricter policy of {@link buildNonceContentSecurityPolicy}: the self-hosted server applies
 * the later nonce header over this one, and where a platform sends both, browsers enforce the
 * intersection, so the nonce policy decides either way.
 */
export const buildStaticContentSecurityPolicy = ({ isDev }: ContentSecurityPolicyOptions): string => {
  return buildPolicy({ scriptSources: ["'self'", "'unsafe-inline'"], isDev })
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
  })
}

/**
 * Builds the security header rules: one applied to every path, static assets included, a
 * `no-referrer` rule for the booking manage page, and a preview-only rule that marks the gated
 * page `noindex`.
 *
 * The global rule carries the static CSP; the routes `proxy.ts` covers also receive the nonce
 * policy, which decides there. `Strict-Transport-Security` omits `preload` on purpose:
 * preloading is a hard-to-reverse commitment for the whole domain. `X-Robots-Tag` stays out of
 * the global rule so no public page carries it. The manage page's token lives in its URL, so a
 * referrer never leaves it: its rule overrides the global policy for that path alone.
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
      source: '/rendez-vous/:path*',
      headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
    },
    {
      source: '/preview',
      headers: [PREVIEW_NOINDEX_HEADER],
    },
  ]
}
