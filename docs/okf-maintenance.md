# OKF bundle maintenance

The chatbot answers only from the validated OKF v0.2 bundle in `locales/fr/okf/`. Each concept cites
its sources in `locales/fr/*.ts` through `sources[].resource`, and the committed manifest
`locales/fr/okf-sources.json` pins the sha256 of every cited source with the `reviewedAt` time of
the human review that covered that version. The Vitest test `lib/assistant/okfSources.test.ts`
compares the manifest, the concepts and the current files, so a copy change cannot silently
diverge from the grounding text.

## Update flow

1. Propose the copy change in `docs/content-proposals/`.
2. Mel validates it.
3. Apply the change to the matching `locales/fr/*.ts` file.
4. The test fails and lists every concept affected by the changed source.
5. Update those concepts in `locales/fr/okf/`.
6. Add a `verified` entry to each reviewed concept (`human:mel`, timestamp of the review).
7. Add a dated entry to `locales/fr/okf/log.md`.
8. Refresh the source's `sha256` and `reviewedAt` in `locales/fr/okf-sources.json`.
9. The test passes again.

## What the check compares

The check is per source file, so one change to `chatbot.ts` flags every concept that cites it. It
fails when:

- a cited source's current sha256 differs from the manifest: the failure message names the file,
  lists the ids of the concepts whose `sources` point to it, and prints the new hash to record;
- a concept cites a source missing from the manifest, or the manifest records a source no concept
  cites anymore (stale entry);
- a concept has no usable `verified` entry (missing, empty, or an `at` that is not a parseable
  instant): the check reports the concept instead of skipping the review-time comparison;
- a source's `reviewedAt` is later than the citing concept's most recent `verified[].at`, which
  forces a fresh human verification whenever a hash refresh records a new review;
- the manifest records a key that could resolve outside `locales/fr/` (absolute, or with an empty,
  `.` or `..` segment): the read fails as `manifest-invalid`, so no file outside the directory is
  ever hashed.

Timestamps are compared as instants, not as strings: two offsets of the same moment are equal.

## Commands

```sh
pnpm test                                                        # full suite, as CI runs it
node_modules/.bin/vitest run lib/assistant/okfSources.test.ts    # the source check alone
```

CI (`.github/workflows/ci.yml`) runs `pnpm test` on any change under `locales/**` or `lib/**`, so a
stale manifest blocks the pull request before review.

## Notes

- The manifest is not read by the bundle loader: only `*.md` files in `locales/fr/okf/` ground the
  answers, and `locales/fr/okf-sources.json` stays outside that directory.
- The pure comparison is `findOkfSourceIssues`; `checkOkfSourceManifest` adds the disk access
  (bundle listing through the OKF loader, sha256 over the raw file bytes).
- The baseline blessed the current state: every `reviewedAt` is the bundle's verification timestamp
  `2026-10-28T01:42:38+01:00`, and the review of `legal.ts`, `agent.ts` and `chatbot.ts` (changed on
  2026-10-28 after verification) covers those current bytes.
