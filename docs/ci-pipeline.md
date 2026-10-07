# CI pipeline

Workflow: `.github/workflows/ci.yml`. Every job calls only a `pnpm` script from `package.json`.

## Triggers

- `pull_request` (any target branch): the six checks run. No deploy, no secrets (fork PRs get none).
- `push` on `develop`, `staging`, `main`: the six checks run, then the deploy job.
- `workflow_dispatch`: manual run; deploys only if the selected ref is `develop`, `staging` or `main`.

A new run on the same PR or ref cancels the previous one (`concurrency`). Deploy runs are serialized per branch and never cancelled mid-flight.

## Jobs

| Job | Script | Notes |
|---|---|---|
| `lint` | `pnpm lint` | ESLint |
| `lint-tailwind` | `pnpm lint:tailwind` | Fails on Tailwind default classes that the tokens package resets |
| `typecheck` | `pnpm typecheck` | `tsc --noEmit`, strict |
| `test` | `pnpm test` | `vitest run --passWithNoTests` |
| `build` | `pnpm build` | Next.js production build |
| `lighthouse` | `pnpm lighthouse` | Builds, then `lhci autorun` (config: `lighthouserc.json`); report uploaded as the `lighthouse-report` artifact (14 days). **Temporarily non-blocking** (`continue-on-error: true` on the `pnpm lighthouse` step), see below |
| `deploy` | Vercel CLI | Needs the six jobs above; see below |

The six checks run in parallel. Each job: checkout, pnpm (version from `packageManager`), Node (version from `.nvmrc`), `pnpm install --frozen-lockfile`.

## Caching

`actions/setup-node` with `cache: pnpm` caches the pnpm store, keyed on `pnpm-lock.yaml`. The `.next/cache` directory is not cached yet.

## Lighthouse budgets

Assertions in `lighthouserc.json`, level `error`: Performance, Accessibility, Best Practices, SEO each >= 0.9, median of 3 runs on `/`. Results are written to `.lighthouseci/` (git-ignored) with the `filesystem` upload target: nothing is published to a public storage.

**Temporary gate:** the `pnpm lighthouse` step of the `lighthouse` job has `continue-on-error: true` because the page renders no content yet, so the budgets cannot be met. The flag is on the step, not the job: a job-level flag keeps the workflow green but still reports a failed `lighthouse` check (red) on the PR. With the step-level flag the check is green, so a real Lighthouse failure is hidden until the flag is removed; the report artifact is still uploaded. Remove the two lines once the first content section lands, to make the budgets blocking again.

## Deploy

| Branch | Vercel environment | Command flags |
|---|---|---|
| `develop` | Preview | none |
| `staging` | Preview | none |
| `main` | Production | `--prod` |

Steps: `vercel pull`, `vercel build`, `vercel deploy --prebuilt`, with the CLI run through `pnpm exec vercel` (devDependency, version pinned by the lockfile; the job runs `pnpm install --frozen-lockfile`). The Vercel credentials are set as env only on these three steps, not on the whole job. The job never runs on `pull_request`, so fork code never reaches a secret or a deployment.

`develop` deploys as Preview because Vercel's built-in Development environment is for `vercel dev` and cannot be a deploy target: `--target=development` is looked up as a custom environment and fails with "Project not found". `develop` and `staging` therefore share the Vercel Preview environment variables.

The job targets a GitHub environment derived from the branch: `main` -> `production`, `staging` -> `preview`, `develop` -> `development`.

Manual setup in GitHub (Settings > Environments), to do by Mel:

1. Create the three environments `production`, `preview`, `development`.
2. Move `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` from repository secrets into each environment's secrets (values per environment as needed), then delete the repository-level copies.
3. Add required reviewers (at least on `production`): the deploy job pauses until approval.

Secrets required in each environment: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Environment variables the app needs are configured in the Vercel project, per environment (currently none beyond `NODE_ENV`, set by Vercel).

## Expected duration

Not measured yet: the workflow has not run on GitHub. Fill this table after the first runs.

| Job | Measured | Estimate |
|---|---|---|
| lint, lint-tailwind, typecheck, test | pending | none (not guessed) |
| build | pending | none |
| lighthouse | pending | none |
| deploy | pending | none |
