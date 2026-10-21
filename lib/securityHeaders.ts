/** One HTTP response header, in the shape expected by `headers()` in `next.config.ts`. */
export type HttpHeader = { key: string; value: string }

/** Route rule in the shape returned by `headers()` in `next.config.ts`. */
export type HeaderRule = { source: string; headers: HttpHeader[] }

/** Options for {@link buildContentSecurityPolicy}. */
export type ContentSecurityPolicyOptions = {
  /** Development server: React needs `'unsafe-eval'` to rebuild server stacks in the browser. */
  isDev: boolean
}

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
 * Builds the Content-Security-Policy header value.
 *
 * No third-party origin is allowed: Umami and the Fillout embed widen the
 * policy in their own changes, once they are wired and consent-gated.
 *
 * Limitation: the policy is static (no nonce, so the pages stay CDN-cacheable).
 * Inline scripts are therefore allowed with `'unsafe-inline'`, which makes
 * `script-src` a weaker XSS barrier than a nonce or hash policy. `style-src`
 * needs `'unsafe-inline'` too, for the inline style attributes and `<style>`
 * tags that React and Next.js emit.
 */
export const buildContentSecurityPolicy = ({ isDev }: ContentSecurityPolicyOptions): string => {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ]
  return directives.join('; ')
}

/**
 * Builds the security header rules applied to every path, static assets included.
 *
 * `Strict-Transport-Security` omits `preload` on purpose: preloading is a
 * hard-to-reverse commitment for the whole domain.
 */
export const buildSecurityHeaders = ({ isDev }: ContentSecurityPolicyOptions): HeaderRule[] => {
  return [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: buildContentSecurityPolicy({ isDev }),
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
  ]
}
