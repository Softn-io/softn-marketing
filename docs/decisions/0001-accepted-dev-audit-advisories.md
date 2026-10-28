# 0001 — Dev-only audit advisories: overrides and accepted risk

- **Status:** Accepted
- **Date:** 2026-10-27
- **Issue:** #48 (bump the Vercel CLI and resolve the dev-only pnpm audit advisories)
- **Scope:** devDependencies only. `pnpm audit --prod` was and stays clean.

## Context

`pnpm audit` reported 68 advisories on the dependency tree: 6 low, 31 moderate,
31 high, 0 critical. None of them reach production code: every affected package
sits in a dev dependency chain, used by tooling that runs on a developer machine
or in a GitHub Actions job.

Two families own most of the findings:

- `vercel@62.5.0`, the CLI used by the `deploy` job in
  `.github/workflows/ci.yml`. Its builder packages pin old transitive versions
  (`undici@5.28.4`, `zod@3.22.4`, `ajv@8.6.3`, `js-yaml@4.1.1`,
  `minimatch@10.1.1`, `smol-toml@1.5.2`, `path-to-regexp@6.1.0` / `8.3.0`).
- `@lhci/cli@0.15.1`, the Lighthouse CI runner used by `pnpm lighthouse`. It is
  already the latest published version (it is also the `next` dist-tag), and it
  pins `lighthouse@12.6.1`, which pins `puppeteer-core`, which pulls the proxy,
  zip and temp-file helpers below.

Bumping `vercel` to the latest (`65.4.0`) does not clear its advisories on its
own: that release still pins `undici@5.28.4` and `5.29.0`, `zod@3.22.4`,
`ajv@8.6.3`, `js-yaml@4.1.1`, `minimatch@10.1.1`, `smol-toml@1.5.2` and
`path-to-regexp@6.1.0` / `8.3.0`. Two direct bumps do help:

- `vitest` 5.0.3 → 5.0.5 (patch).
- `jsdom` 30.1.2 → 30.1.3, whose `undici` range becomes `^8.12.1`, so
  `undici@8.11.2` re-resolves to `8.12.3` without an override.

The rest is handled with `pnpm.overrides` in `pnpm-workspace.yaml`, following
the existing `tar` / `source-map-js` pattern. Selectors are ranges, not exact
versions: an exact selector would silently stop matching at the next lockfile
refresh.

## Decision

Bump `vercel` to `65.4.0`, `vitest` to `5.0.5` and `jsdom` to `30.1.3`, and force
the transitive versions listed below. `pnpm audit` is expected to go from 68
advisories to 2, both `extract-zip`, which are accepted in the next section.

### Overrides

"Outside pin" means the forced version is outside the exact version the parent
declares, while remaining on the same major. "Crosses major" means the forced
version changes major (or leaves a 0.x range) and needs the mitigation noted.

| Package selector | Forced | Parent and declared range | Inside declared range? |
| --- | --- | --- | --- |
| `undici@>=6.0.0 <6.29.1` | `^6.29.1` | `@vercel/blob@2.8.0` → `^6.23.0` | Yes |
| `undici@>=7.0.0 <7.30.1` | `^7.30.1` | `@vercel/sandbox@3.3.0` → `^7.27.1` | Yes |
| `path-to-regexp@>=6.0.0 <6.3.0` | `^6.3.0` | `@vercel/node@28.0.0`, `@vercel/remix-builder@28.0.0` → `6.1.0` | Outside pin, same major |
| `path-to-regexp@>=8.0.0 <8.4.0` | `^8.4.2` | `@vercel/express@23.0.0`, `@vercel/hono@23.0.0`, `@vercel/backends@23.0.0` → `8.3.0` | Outside pin, same major |
| `ajv@>=8.0.0 <8.18.0` | `^8.20.0` | `@vercel/static-config@3.4.4` → `8.6.3` | Outside pin, same major |
| `js-yaml@>=4.0.0 <4.3.2` | `^4.3.2` | `@vercel/python-analysis@0.15.2` → `4.1.1` | Outside pin, same major |
| `minimatch@>=10.0.0 <10.2.3` | `^10.2.6` | `@vercel/python-analysis@0.15.2` → `10.1.1` | Outside pin, same major |
| `smol-toml@<1.9.0` | `^1.9.1` | `vercel@65.4.0`, `@vercel/container`, `@vercel/rust`, `@vercel/python-analysis` → `1.5.2` | Outside pin, same major |
| `body-parser@<1.20.9` | `~1.20.9` | `express@4.22.3` → `~1.20.5` | Yes |
| `qs@<6.16.1` | `~6.16.1` | `express@4.22.3` → `~6.16.0` | Yes |
| `ip-address@<10.7.4` | `^10.7.5` | `socks@2.8.10` → `^10.1.1` | Yes |
| `vite@>=8.0.0 <8.3.3` | `^8.3.5` | `vitest@5.0.5` / `@vitest/mocker@5.0.5` peer range `^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0` (auto-installed peer) | Yes |

### Cross-major overrides

These five force a version outside the parent's declared range and outside its
major (or its 0.x line). Each one is listed with the evidence that bounds its
risk and the residual risk that remains.

| Package selector | Forced | Parent and declared range | Evidence | Residual risk |
| --- | --- | --- | --- | --- |
| `undici@>=5.0.0 <6.0.0` | `^6.29.1` | `@vercel/node@28.0.0` → `5.28.4`; `vercel@65.4.0` → `5.29.0` | `@vercel/node` imports `undici` only in `dist/dev-server.mjs` (the `vercel dev` server this project never runs). The only other external import in the CLI is `fetch-proxy`, which uses `Agent` and `ProxyAgent`; both exist with the same options in 6.29.1. `undici@6` has no dependencies, so `@fastify/busboy@2.1.1` disappears with it. | A future Vercel release could start using an undici 5-only API. `vercel pull`, `build` and `deploy` are exercised in CI, not locally. |
| `undici@>=6.0.0 <6.29.1` | `^6.29.1` | `@vercel/blob@2.8.0` → `^6.23.0` | Same package, same major, inside the declared range. | None beyond a normal patch/minor update. |
| `zod@<4.6.6` | `^4.6.7` | `@vercel/python-analysis`, `@vercel/express`, `@vercel/hono`, `@vercel/backends`, `@vercel/cervel` → `3.22.4`; `@vercel/cli-config@0.3.4` → `4.1.11`; `chromium-bidi@14.0.0` → `^3.24.1` | The CLI itself already ships and runs zod 4 (`@vercel/cli-config`), and the application already runs `zod@4.6.6` in production, untouched by this selector. The zod-3 copies live in builders for Python, Express, Hono and generic backends, none of which a Next.js project builds local or in CI. | zod 4 changed a few APIs (`z.record` requires two arguments, some error-shape helpers moved). A zod-3-only schema in one of those builders would throw at import time. `chromium-bidi` is reached only through the BiDi protocol, which Lighthouse does not use. |
| `tmp@<0.2.6` | `^0.2.7` | `@lhci/cli@0.15.1` → `^0.1.0`; `external-editor@3.1.0` → `^0.0.33` | Leaving the 0.x range. Lighthouse CI calls `tmp.fileSync({ postfix })` only (`src/open/open.js`); that API is unchanged in 0.2.x. | A 0.x caret range is not a compatibility promise. Only `pnpm lighthouse` exercises it. |
| `uuid@<11.1.1` | `^11.1.1` | `@lhci/cli@0.15.1` → `^8.3.1` | Leaving major 8. Lighthouse CI calls `uuid.v4()` only (`src/collect/node-runner.js`); `uuid@11` still exports `v4` from CommonJS. | A future `uuid` major would need a new override, and the CLI parsing stays untested locally until `pnpm lighthouse` runs. |
| `basic-ftp@<6.2.1` | `^6.2.3` | `get-uri@6.0.5` → `^5.0.2` | Leaving major 5. The single breaking change in `basic-ftp` 6.0.0 is that separate transfer hosts are disabled by default (FTP bounce protection). `get-uri` calls `Client.access`, `lastMod`, `list` and `downloadTo` only, and the `ftp://` path is reached only when an `ftp://` proxy URI is configured, which this project never does. | An FTP proxy configuration would now need `allowSeparateTransferHost: true`. Not applicable here. |

## Accepted advisories

| GHSA | Package | Severity | Path | Why it is not exploitable here | Revisit when |
| --- | --- | --- | --- | --- | --- |
| [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) | `extract-zip@2.0.1` | High | `. > @lhci/cli > lighthouse > puppeteer-core > @puppeteer/browsers > extract-zip` | `extract-zip` runs only when Lighthouse downloads and unpacks a Chrome for Testing build during `pnpm lighthouse`, on a developer machine or in the `lighthouse` CI job. The archive comes from the Chrome for Testing endpoint over HTTPS, not from user input, so the attacker-controlled-symlink precondition of the advisory is not reachable. Dev-only, never deployed. | `@puppeteer/browsers` 3.x lands under Lighthouse (it drops `extract-zip` for `modern-tar`), or `extract-zip` publishes a patched release, or a browser archive starts coming from an untrusted source. |
| [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | `extract-zip@2.0.1` | High | `. > @lhci/cli > lighthouse > puppeteer-core > @puppeteer/browsers > extract-zip` | Same path, same execution point. Arbitrary writes require a symlink entry inside a hostile archive; the archive is the official Chrome for Testing build fetched over HTTPS. Dev-only, never deployed. | Same triggers as above. |

`extract-zip@2.0.1` is the latest published version, and no advisory-free
version exists. Fixing it would mean forcing `@puppeteer/browsers` 3.x under
`lighthouse@12.6.1`, a major change to a tool this project only uses for its
Lighthouse budget. That change is out of scope for #48.

### Remaining advisories after this decision

68 before, 2 after (the two `extract-zip` entries above). No high or critical
advisory is expected to remain outside this table.

## Consequences

- `pnpm audit` must report 2 advisories, both in this table. A new advisory on a
  new package is not covered by this decision and needs a new record.
- `pnpm audit --prod` must stay clean.
- Overrides are global to the workspace. A staged upgrade that introduces a
  newer major of an overridden package will need this file updated.
- A real `vercel pull`, `build` and `deploy` cannot be verified locally (they
  need Vercel credentials). The `deploy` job can only be verified on `develop`
  after this lands and merges: watch the first `deploy` run of the branch.
  `pnpm lighthouse` needs a built server and Chrome, so `extract-zip` and the
  Lighthouse chain are verified by the `lighthouse` job on the same push.
- Local verification covers: `pnpm audit`, `pnpm exec vercel --version` and the
  `--help` output of `pull`, `build` and `deploy`, `pnpm lint`,
  `pnpm lint:tailwind`, `pnpm typecheck`, `pnpm test`, `pnpm build` and
  `prettier --check .`.

## Release-age exception

`vercel@65.4.0` was published the day it was installed, so `pnpm add` recorded
it and its `@vercel/*` dependencies in the `minimumReleaseAgeExclude` block of
`pnpm-workspace.yaml`. That block is temporary: Mel removes it before the pull
request is merged, once `65.4.0` is past the repository's minimum release age
window. Until then, `pnpm install` accepts those versions without waiting.
Removing the block does not change the resolved versions.
