# 0004 — `script-src-attr 'none'` everywhere, nonce CSP on the already-dynamic routes

- **Status:** Accepted
- **Date:** 2026-11-09
- **Issue:** #135 (spike — `script-src-attr 'none'` and a nonce CSP scoped to the already-dynamic routes)

## Context

[0003](0003-keep-unsafe-inline-script-src.md) kept `script-src 'self' 'unsafe-inline'` in the
static CSP: Next.js 16.4.2 emits the RSC payload and the Turbopack bootstrap as inline scripts
that SRI does not hash, so a static policy cannot drop `'unsafe-inline'` while every page stays
static. Issue #135 tested two narrower hardenings that keep every static page static:

- **Option 1 — `script-src-attr 'none'`:** blocks the inline event-handler attributes (`on*=`)
  that `'unsafe-inline'` currently allows, on every route.
- **Option 2 — nonce CSP scoped to the already-dynamic routes:** a root `proxy.ts` whose matcher
  is limited to `/preview` and `/rendez-vous/:token` generates a per-request nonce and serves
  `script-src 'self' 'nonce-…' 'strict-dynamic'` there; `/` and every other static route keep the
  static policy.

Two known caveats had to be settled with evidence: the theme init script is rendered inline by the
shared root layout and cannot carry a nonce without making `/` dynamic; and the static CSP of
`next.config.ts` also targets the nonce routes, where it must not end up widening the policy the
browser applies.

## What was tried

### Option 1

`lib/securityHeaders.ts` adds `script-src-attr 'none'` to the static policy, in development and
production alike. Justification for both environments: the codebase carries no `on*=` attribute
(re-verified by grep over `app/`, `components/` and `lib/`), the directive does not interact with
`'unsafe-eval'` or React Refresh (React attaches listeners through the DOM, never as attributes),
and the HTML the dev server serves contains no inline handler attribute either — keeping the two
policies aligned catches a regression at development time. Unit tests assert the directive in both
environments.

### Option 2

- **`proxy.ts`** (root, never `middleware.ts`) computes a fresh
  `Buffer.from(randomUUID()).toString('base64')` nonce per request and sets the nonce policy on
  the request headers — `NextResponse.next({ request: { headers } })`, the pattern of the
  version-matched guide — and on the response headers the browser enforces. The renderer reads
  the nonce from the `Content-Security-Policy` request header
  (`server/route-modules/app-page/parse-request-headers.js`) and attaches it to every script it
  renders. The matcher covers `/preview` and `/rendez-vous/:token` — the routes that are already
  `ƒ` — and skips prefetch requests (`next-router-prefetch`, `purpose: prefetch`), as the
  version-matched CSP guide recommends: a flight payload is not a document, and its nonce is not
  checked against the page that later renders it. Document loads and RSC navigations keep the
  nonce policy.
- **The static CSP stays on the global `/:path*` rule.** On the self-hosted server (`next start`)
  the two headers end up under two differently-cased keys in `resHeaders` — the config one spelled
  `Content-Security-Policy`, the proxy one lowercased by `toNodeOutgoingHttpHeaders` — and
  `router-server.js` applies them in insertion order with Node's case-insensitive `setHeader`, so
  the later nonce policy wins and exactly one `Content-Security-Policy` reaches the browser
  (`server/lib/router-utils/resolve-routes.js`, `server/lib/router-server.js`). That routing block
  is skipped in minimal mode (the Vercel deployment path), where the platform does the routing: if
  it sends both headers, browsers enforce the intersection, and the static policy admits
  everything the nonce policy admits (nonce scripts are inline, allowed by `'unsafe-inline'`;
  chunks are same-origin, allowed by `'self'`; the theme script by `'unsafe-inline'`), so the
  effective policy is the nonce one either way. A Vercel preview check is pending, to be run after
  the branch is pushed. Every other path keeps the static policy alone, and every other security
  header (HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options) stays on `/:path*`,
  with the `no-referrer` override of `/rendez-vous/:path*` and the `X-Robots-Tag` noindex of
  `/preview` untouched.
  - An earlier revision of this change excluded the two routes from the static CSP rule with the
    hand-synced source `/((?!preview$|rendez-vous/[^/]+$).*)`. It was dropped: `headers()`
    sources are compiled case-insensitively (`experimental.caseSensitiveRoutes` defaults to
    `false` in 16.4.2) while the proxy matcher regex is case-sensitive, so `/PREVIEW` or
    `/RENDEZ-VOUS/abc` matched neither rule and answered the not-found page with **no** CSP at
    all. `experimental.caseSensitiveRoutes` was not adopted: it is experimental and absent from
    the bundled docs. The global rule has no such gap and removes the hand-synced pattern.
- **Caveat A — the theme init script:** on the nonce routes Next.js applies the request nonce to
  every script it renders (framework scripts, page bundles, the `_R_` Turbopack bootstrap, the
  inline RSC payload), but **not** to the raw inline `<script>` of `app/layout.tsx` — verified on
  the production build (`curl /preview`: all Next script tags carry `nonce=…`, the theme script
  does not). Reading `headers()` in the shared layout would make every route dynamic, so the
  policy instead allows the script's exact content by hash, built by `cspHashSourceOf`
  (`lib/securityHeaders.ts`) from the single source `themeInitScript` (`lib/theme.ts`). The script
  stays inline, no route turns dynamic, and the theme still applies before first paint on every
  route.
  - The `app/theme-init.js` route validated in #110 was **not** adopted here: under
    `'strict-dynamic'` a parser-inserted same-origin `<script src>` without a nonce is blocked
    (host allowlists including `'self'` are ignored), so the moved tag would still need a nonce
    the layout cannot have. Dropping `'strict-dynamic'` to keep `'self'` would deviate from the
    documented policy shape; the hash avoids both.

### Evidence

Production build (`node_modules/.bin/next build` then `next start`), Chromium through Playwright
(`e2e/securityHeaders.spec.ts`, 14 tests) plus a dev-server smoke run:

- Static routes (`/`, `/robots.txt`, `/sitemap.xml`, the not-found page, `/rendez-vous/a/b`,
  `/PREVIEW`): exactly one CSP header, `script-src 'self' 'unsafe-inline'`,
  `script-src-attr 'none'`, no nonce source; zero `securitypolicyviolation` on `/`, on
  `/robots.txt`, on `/sitemap.xml` and on the not-found page.
- Nonce routes (`/preview`, `/rendez-vous/not-a-signed-token`): on the self-hosted `next start`
  server the suite runs, exactly one CSP header — the nonce policy,
  `script-src 'self' 'nonce-…' 'strict-dynamic' 'sha256-…'` (with `'unsafe-eval'` in dev) and
  `script-src-attr 'none'`, applied over the static one — a fresh nonce per request, and every
  other security header unchanged. Where a platform sends both headers, browsers enforce the
  intersection and the effective policy is still the nonce one (see Option 2).
- A prefetch request to `/preview` (`next-router-prefetch`) carries the static policy alone.
- Trailing-slash forms (`/preview/`, `/rendez-vous/abc/`): the header rules run first, the 308
  redirect response drops their headers, and the proxy never runs; the redirect carries no CSP at
  all (pre-existing behaviour of the router, not a property of this change), and its target path
  is covered by the tests above.
- Zero `securitypolicyviolation`, zero CSP console messages and no page error on `/preview` and
  on `/rendez-vous/not-a-signed-token`; hydration proven by clicking the theme toggle on both and
  asserting the explicit theme switched.
- Theme before first paint, explicit stored choice and system preference, on `/`, `/preview` and
  `/rendez-vous/not-a-signed-token` (the stored `light` is already on `<html>` before `<body>`
  exists; the system case stays CSS-only with no `data-theme`).
- Dev server: same policies, zero violations on both nonce routes, no `on*=` attribute in the
  served HTML.
- Route markers identical to `develop` (`next build`): `/` and every other static route stay `○`,
  `/preview` and `/rendez-vous/[token]` stay `ƒ`; the build adds only `ƒ Proxy (Middleware)`.

## Decision

Both options **ship**.

- `script-src-attr 'none'` is part of both policies: the static one and the nonce one.
- `proxy.ts` adds the per-request nonce policy on `/preview` and `/rendez-vous/:token`, where it
  is the policy the browser applies; every other path carries the static policy alone.
- The theme init script stays inline in the shared layout and is allowed by hash in the nonce
  policy; no static route turns dynamic.
- `'unsafe-inline'` stays in `script-src` on the static routes (0003 still applies there), and
  `style-src` keeps `'unsafe-inline'` everywhere: only `script-src` is tightened on the two
  dynamic routes.

## Consequences and guard rails

- The nonce routes are not CDN-cacheable with a shared policy — they already were dynamic
  (`/preview` through `connection()`, `/rendez-vous/[token]` through `force-dynamic`), so nothing
  regresses; `/` and the static routes keep their static, cacheable policy.
- On the self-hosted server a nonce route carries exactly one CSP header: the proxy response
  header wins by insertion order over the `next.config.ts` one (Node's `setHeader` is
  case-insensitive). The e2e suite pins that self-hosted behaviour, so a Next upgrade that changes
  the routing block fails the suite instead of silently leaving the looser static policy in place.
  Where a platform sends both headers, the intersection keeps the effective policy on the nonce
  one; a Vercel preview check is pending, after the branch is pushed.
- The theme hash is built by `cspHashSourceOf` from `themeInitScript`, so a change to the script
  cannot silently break the nonce routes: the hash follows the constant. `proxy.test.ts` asserts
  the served policy carries exactly that source, and `cspHashSourceOf` is pinned by a fixed
  known vector.
- `e2e/securityHeaders.spec.ts` covers the routing table the change depends on: one CSP header on
  `/`, `/robots.txt`, `/sitemap.xml`, the not-found page, a nested `/rendez-vous/a/b` and the
  case variant `/PREVIEW`, all equal to the static policy; the nonce policy alone on the two nonce
  routes (self-hosted server); the static policy alone on a prefetch; the header-less 308
  on the trailing-slash forms; freshness of the nonce; zero violations with a working theme toggle
  on both nonce routes.
- Revisit if a route stops being dynamic (it would need to leave the matcher and keep the static
  policy alone) or if Next.js documents a static way to nonce or hash the inline RSC payload.
