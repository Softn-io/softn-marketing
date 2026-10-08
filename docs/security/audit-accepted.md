# Accepted `pnpm audit` findings

Snapshot: 2026-10-07 (issue #37). `pnpm audit`: 39 findings (5 low, 16 moderate, 18 high, 0 critical). `pnpm audit --prod`: 0 findings.

## Fixed

| Package | Fix |
|---|---|
| `tar` (critical + highs, via `vercel > @vercel/container`) | `overrides` in `pnpm-workspace.yaml`: `tar@<7.5.21` -> `>=7.5.21` (resolves 7.5.22) |
| `source-map-js` (high, prod, via `next > postcss` and `@tailwindcss/postcss`) | `overrides`: `source-map-js@<1.2.2` -> `>=1.2.2` (resolves 1.2.2) |

Remove each override once the upstream parent (`vercel`, `next`) ships a patched range.
`next` 16.4.0 (latest) still resolves the same `postcss` 8.5.23, so a bump would not fix anything.

## Accepted (remaining)

All remaining findings are dev-only (`devDependencies`: `vercel`, `@lhci/cli`, `eslint-config-next`). None ships in the production bundle.

| Package | Severity | Path (root) | Reason accepted |
|---|---|---|---|
| `undici` | low-high | `vercel > @vercel/{node,fastify,h3,hono,express,koa,nestjs,elysia,remix-builder,...} > undici` | Pinned by Vercel builders; no override (needs a Mel-approved dependency request). |
| `@fastify/busboy` | moderate-high | `vercel > @vercel/*` | Same. Multipart parser, not used by our static build. |
| `smol-toml` | moderate-high | `vercel > smol-toml`, `@vercel/python*` | Parses TOML; inputs are Vercel-controlled project files, no untrusted TOML. |
| `path-to-regexp` | moderate-high | `vercel > @vercel/*` | Route matching for Vercel runtimes; not used by the Next.js static build. |
| `js-yaml`, `minimatch`, `ajv`, `basic-ftp`, `sprintf-js` | moderate-high | `vercel > ...`, `@lhci/cli > ...` | Transitive build/CLI tooling, no untrusted input. |
| `tmp`, `uuid`, `inquirer`, `proxy-agent`, `lighthouse` sub-deps | low-moderate/high | `@lhci/cli > ...` | Lighthouse CI runs only against our own pages in CI. |
| `extract-zip`, `braces`, `sprintf-js` | high/moderate | `@lhci/cli`, `vercel` | No patched version exists upstream. |
| `@next/eslint-plugin-next` sub-dep | see `pnpm audit` | `eslint-config-next > ...` | Lint-time only. |

## Reachability in the CI deploy job

The deploy job (`.github/workflows/ci.yml`) runs `vercel pull`, `vercel build`, `vercel deploy --prebuilt` on a Next.js project with Vercel secrets only.

- `@vercel/container` (and its `tar` use): [VERIFIED] it calls `tar.extract` on archives (`dist/index.js` lines 1753, 1774, 1804). It is a builder for container projects; this project is Next.js (builder `@vercel/next`), so the code path is [UNVERIFIED but not expected to be loaded] in our job. The `tar` override fixes it regardless.
- Other `@vercel/*` builders: same reasoning, [UNVERIFIED] that they are never loaded for a Next.js project; the CLI builds only the detected framework.
- `@lhci/cli`: runs in the Lighthouse CI job against our own served build, no external input.
- Per-finding exploit paths were not individually traced.

Re-run `pnpm audit` periodically and when `vercel` or `@lhci/cli` publish new versions.
