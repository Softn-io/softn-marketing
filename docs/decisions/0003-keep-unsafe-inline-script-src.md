# 0003 — Keep `'unsafe-inline'` in `script-src`: the Next.js inline RSC payload cannot be hashed statically

- **Status:** Accepted
- **Date:** 2026-11-09
- **Issue:** #110 (spike — strict `script-src` without `'unsafe-inline'`)

## Context

`lib/securityHeaders.ts` ships a static CSP with `script-src 'self' 'unsafe-inline'`
(`'unsafe-eval'` in development only). Three inline sources need the keyword today:

- the theme init script, rendered inline in `<head>` by `app/layout.tsx` from
  `themeInitScript` (`lib/theme.ts`), so a stored explicit choice is applied before first
  paint;
- the scripts Next.js emits for the RSC payload (`self.__next_f.push(...)`), which the client
  reads to hydrate the page;
- the Turbopack bootstrap script Next.js emits inline on each route (the `_R_` chunk loader),
  which the client runs before the payload scripts.

Issue #110 asked whether the production policy can drop `'unsafe-inline'` while the static pages
stay statically rendered and no page turns dynamic. Three alternatives were already rejected
before the spike: a nonce generated in `proxy.ts` (forces dynamic rendering on every page,
incompatible with PPR), reading the theme cookie in the layout (same), and a hash next to
`'unsafe-inline'` (browsers then ignore `'unsafe-inline'`, so the payload scripts would be
blocked).

The spike enabled `experimental.sri` (`algorithm: 'sha256'`), moved the theme init script to a
statically prerendered Route Handler (`app/theme-init.js/route.ts`, loaded synchronously in
`<head>`), and set production `script-src 'self'`. It ran on a production build with Playwright
on `/`, `/preview` and `/rendez-vous/not-a-signed-token`. The key evidence is summarized in this
ADR; the full verdict is recorded on issue #110.

## Decision

Keep the current policy: `script-src 'self' 'unsafe-inline'` in production, the theme init
script inline in the layout, and `experimental.sri` disabled. The spike is **blocked**, not
merely expensive:

- With `script-src 'self'`, the browser blocks every inline Next.js script (the RSC payload
  chunks and the Turbopack bootstrap; `script-src-elem`, `blockedURI: "inline"`) on every route
  tested — 10 violations on `/`, 13 on `/preview`, 8 on `/rendez-vous/not-a-signed-token` — and
  hydration never runs: the theme toggle does not respond, the waitlist client validation does
  not fire.
- `experimental.sri` does not change that. In Next.js 16.4.2 it hashes **emitted asset files**
  only (the build writes `server/subresource-integrity-manifest.json`; every entry is a
  `static/chunks/*.js` or `.css` file) and puts those hashes in `integrity` attributes. The
  inline payload wrapper only ever carries a `nonce` when one is supplied
  (`server/app-render/use-flight-response.js`), never a hash, and the CSP header is not
  rewritten. The Next.js docs' own SRI section claims a static policy can drop the inline
  allowance, but its example (`script-src 'self'`) does not hydrate this app; the docs do list
  the matching limitation, "Build-time only: Cannot handle dynamically generated scripts".
- Hashes cannot replace the mechanism in a static header either: the payload differs per route
  and, on `/preview` and `/rendez-vous/[token]`, per request. Listing the hashes Chrome suggests
  for a blocked script would mean generating the CSP per response — the nonce path already
  rejected, and incompatible with CDN-cacheable static pages.
- The rest of the spike did work and stays available if the payload problem is solved later:
  `/theme-init.js` is prerendered (`○`), served `text/javascript; charset=utf-8` with
  `s-maxage=31536000`, and applies a stored `light` before first paint with no flash. No existing
  route turned dynamic (identical route markers before and after; the new route is `○`).

`experimental.sri` as a tamper-protection improvement (integrity on the client chunks) is a
separate question from this policy: it does not remove `'unsafe-inline'`, and it is marked
experimental ("feature may change or be removed"). It is not adopted by this decision.

## Consequences and guard rails

- The e2e specs keep asserting the current behaviour: `e2e/securityHeaders.spec.ts` asserts zero
  CSP violations under the shipped policy — `securitypolicyviolation` events on `/`, CSP console
  messages on `/preview` (after a theme-toggle click). If a future change drops `'unsafe-inline'`
  while the payload scripts stay inline, those specs fail instead of a silent hydration break
  reaching production.
- The JSDoc of `buildContentSecurityPolicy` already names the limitation (static policy, no
  nonce); this ADR records why no hash policy is possible either, so the weaker barrier is not
  mistaken for an oversight.
- The inline theme script stays the single source (`themeInitScript` in `lib/theme.ts`); the
  `app/theme-init.js` route is not added.
- Revisit when Next.js documents a way to hash the inline RSC payload and the Turbopack bootstrap
  for static pages without per-request work (build-time hashes in the CSP header), when it stops
  emitting them inline, or when the site can accept dynamic rendering for a strict policy.

### Follow-up

Neither option below was tested in this spike; both are tracked in the follow-up spike issue #135.

- `script-src-attr 'none'` first: one directive in the static policy (`lib/securityHeaders.ts`),
  cheap and global. It blocks the inline event-handler attributes (`on*=`) that `'unsafe-inline'`
  currently allows, on every route including `/`. The codebase has no `on*=` attribute today, so
  the breakage risk is nil.
- a nonce CSP set by `proxy.ts`, with the matcher limited to the routes already dynamic on
  `develop` (`/preview`, `/rendez-vous/[token]`), while `/` keeps the current policy. Two caveats:
  the theme init script is rendered raw in the shared root layout (`app/layout.tsx`) and cannot
  carry a nonce without making `/` dynamic, so on the nonce routes it would need the nonce applied
  to it (reading `headers()` in the shared layout) or a move to a same-origin static route (the
  `/theme-init.js` route this spike validated); and the static `/:path*` CSP from `next.config.ts`
  would still be sent on those routes, so the two policies combine and both must pass.
