import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { buildNonceContentSecurityPolicy, cspHashSourceOf } from './lib/securityHeaders'
import { themeInitScript } from './lib/theme'

/**
 * CSP source of the theme init script: the shared root layout renders it inline so `/` stays
 * static, which means it cannot carry the request nonce. Allowing its exact content by hash keeps
 * the script running under the nonce policy without making any page dynamic.
 */
const THEME_SCRIPT_HASH = cspHashSourceOf(themeInitScript)

/**
 * Sets a per-request nonce Content-Security-Policy on the routes that are dynamically rendered:
 * on the request headers, where the renderer reads the nonce it attaches to every script it
 * renders, and on the response headers the browser enforces. On the self-hosted server the
 * response header wins over the static one of `next.config.ts`; where a platform sends both,
 * browsers enforce the intersection, and the nonce policy is the one that decides.
 */
export const proxy = (request: NextRequest): NextResponse => {
  const nonce = Buffer.from(randomUUID()).toString('base64')
  // Read directly rather than through `lib/env`, which parses the whole environment eagerly and
  // would make the proxy fail on an unrelated env error; `next.config.ts` does the same.
  const isDev = process.env.NODE_ENV === 'development'
  const contentSecurityPolicy = buildNonceContentSecurityPolicy({
    nonce,
    isDev,
    themeScriptHash: THEME_SCRIPT_HASH,
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)
  return response
}

/**
 * Routes that are dynamically rendered, and only those. Prefetch requests are skipped, as the
 * CSP guide recommends: a flight payload is not a document, and its nonce is not checked against
 * the page that later renders it.
 */
export const config = {
  matcher: [
    {
      source: '/preview',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    {
      source: '/rendez-vous/:token',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
