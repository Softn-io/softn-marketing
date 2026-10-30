import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { parseMarkdownDocument, type Frontmatter, type YamlMap, type YamlValue } from './frontmatter'
import { loadOkfBundle, OKF_BUNDLE_DIRECTORY } from './okf'
import type { Result } from './result'

/** Committed manifest that pins the reviewed sha256 of every `locales/fr/*.ts` file the bundle cites. */
export const OKF_SOURCE_MANIFEST_PATH = join(process.cwd(), 'locales', 'fr', 'okf-sources.json')

/** An ISO-8601 instant with an explicit offset, as `verified[].at` and `reviewedAt` use. */
const ISO_INSTANT_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

const ReviewedAtSchema = z
  .string()
  .regex(ISO_INSTANT_WITH_OFFSET, { error: 'expected an ISO-8601 instant with an explicit offset' })
  .refine((value) => !Number.isNaN(Date.parse(value)), { error: 'expected a parseable instant' })

/** One reviewed source file: the hash of the bytes and the review that covered that version. */
const OkfSourceManifestEntrySchema = z.strictObject({
  sha256: z.string().regex(/^[0-9a-f]{64}$/, { error: 'expected a lowercase hex sha256' }),
  reviewedAt: ReviewedAtSchema,
})

/**
 * Committed source manifest, validated at read time because the JSON file is an I/O boundary.
 *
 * Sources are keyed by their path relative to `locales/fr/`, so `../chatbot.ts` (the bundle's
 * resource form) is keyed `chatbot.ts`. {@link readOkfSourceManifest} rejects a key that could
 * resolve outside `locales/fr/` as `manifest-invalid`. The file lives outside `locales/fr/okf/`,
 * which the bundle loader reads for `*.md` files only: it does not change the grounding content.
 */
export const OkfSourceManifestSchema = z.strictObject({
  sources: z.record(z.string(), OkfSourceManifestEntrySchema),
})

/** Committed source manifest, as validated by {@link OkfSourceManifestSchema}. */
export type OkfSourceManifest = z.infer<typeof OkfSourceManifestSchema>

/** One entry of {@link OkfSourceManifest}. */
export type OkfSourceManifestEntry = z.infer<typeof OkfSourceManifestEntrySchema>

/** The verification state of one concept, as read from its `verified` frontmatter entries. */
export type OkfConceptVerification =
  | {
      /** A `verified[].at` parsed: the most recent one, always a parseable instant. */
      readonly kind: 'verified'
      readonly at: string
    }
  | {
      /** The frontmatter carries no usable `verified` list: nothing proves a review. */
      readonly kind: 'missing'
    }
  | {
      /** A `verified` entry whose `at` is absent or not a parseable instant. */
      readonly kind: 'invalid'
      /** The offending `at` value when it is a string; `null` when the entry has none. */
      readonly at: string | null
    }

/** The source references and the verification state of one concept, as parsed from its frontmatter. */
export type OkfConceptSources = {
  /** Concept id: the bundle file name without its `.md` suffix. */
  readonly conceptId: string
  /** `sources[].resource` values, as written in the frontmatter (e.g. `../chatbot.ts`). */
  readonly resources: readonly string[]
  /**
   * Review state of the concept. Only a parseable instant lets the check compare review times:
   * `missing` and `invalid` become issues of their own instead of skipping that comparison.
   */
  readonly verification: OkfConceptVerification
}

/** A concept cites a source whose current bytes no longer match the reviewed hash. */
export type OkfSourceHashMismatchIssue = {
  readonly kind: 'hash-mismatch'
  /** Manifest key: path relative to `locales/fr/`. */
  readonly source: string
  /** Concept ids citing that source, sorted. */
  readonly concepts: readonly string[]
  readonly manifestSha256: string
  readonly currentSha256: string
}

/** A concept cites a source the manifest does not record. */
export type OkfMissingManifestEntryIssue = {
  readonly kind: 'missing-manifest-entry'
  readonly source: string
  readonly concepts: readonly string[]
}

/** The manifest records a source no concept cites anymore. */
export type OkfStaleManifestEntryIssue = {
  readonly kind: 'stale-manifest-entry'
  readonly source: string
}

/** A recorded source file cannot be read, so its hash cannot be compared. */
export type OkfSourceUnreadableIssue = {
  readonly kind: 'source-unreadable'
  readonly source: string
  readonly concepts: readonly string[]
}

/** A concept cites a resource that does not resolve below `locales/fr/`. */
export type OkfInvalidSourceReferenceIssue = {
  readonly kind: 'invalid-source-reference'
  readonly concept: string
  readonly resource: string
}

/** A source was reviewed after the concept that cites it was verified. */
export type OkfReviewedAfterVerificationIssue = {
  readonly kind: 'reviewed-after-verification'
  readonly concept: string
  readonly source: string
  readonly reviewedAt: string
  readonly verifiedAt: string
}

/** A concept carries no usable `verified` entry, so its review instant cannot be compared. */
export type OkfMissingVerificationIssue = {
  readonly kind: 'missing-verification'
  readonly concept: string
}

/** A concept's `verified` entry has no parseable `at`, so its review instant cannot be compared. */
export type OkfInvalidVerificationIssue = {
  readonly kind: 'invalid-verification'
  readonly concept: string
  /** The offending value when it is a string; `null` when the entry has no `at` string at all. */
  readonly at: string | null
}

/** One reason the bundle and the committed manifest disagree. */
export type OkfSourceIssue =
  | OkfSourceHashMismatchIssue
  | OkfMissingManifestEntryIssue
  | OkfStaleManifestEntryIssue
  | OkfSourceUnreadableIssue
  | OkfInvalidSourceReferenceIssue
  | OkfReviewedAfterVerificationIssue
  | OkfMissingVerificationIssue
  | OkfInvalidVerificationIssue

/** Everything {@link findOkfSourceIssues} compares. */
export type OkfSourceCheckInput = {
  readonly concepts: readonly OkfConceptSources[]
  readonly manifest: OkfSourceManifest
  /**
   * Current sha256 per manifest key. A key absent from the record means the file could not be
   * read: the check reports it as unreadable instead of comparing a guessed hash.
   */
  readonly currentHashes: Readonly<Record<string, string | undefined>>
}

/** Why the source check cannot run; carries file names and validation details, never file content. */
export type OkfSourceCheckError = {
  readonly code: 'manifest-unreadable' | 'manifest-invalid' | 'bundle-unconformant' | 'sources-invalid'
  readonly detail: string
}

const isYamlMap = (value: YamlValue): value is YamlMap =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isYamlList = (value: YamlValue | undefined): value is readonly YamlValue[] => Array.isArray(value)

/**
 * Checks that a path relative to `locales/fr/` cannot resolve outside it.
 *
 * Shared by {@link sourceFileKey} for bundle resources and by {@link readOkfSourceManifest} for
 * committed keys: an absolute path, or one with an empty, `.` or `..` segment, is what makes a
 * join with `locales/fr/` name a file elsewhere.
 *
 * @param key Candidate path relative to `locales/fr/`, e.g. `chatbot.ts` or `nested/file.ts`.
 * @returns `true` when the key can only ever resolve below `locales/fr/`.
 */
const isSafeSourceKey = (key: string): boolean =>
  key !== '' &&
  !key.startsWith('/') &&
  !key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')

/**
 * Derives the manifest key of a frontmatter source resource.
 *
 * Resources are written relative to the bundle directory (`locales/fr/okf/`) while the manifest
 * is relative to `locales/fr/`, so exactly one leading `../` segment is expected. Anything else
 * (a same-directory path, a resource escaping `locales/fr/`) cannot be hashed soundly and is
 * reported as an invalid reference instead.
 *
 * @param resource `sources[].resource` value, e.g. `../chatbot.ts`.
 * @returns The manifest key, e.g. `chatbot.ts`, or `null` when the resource is not a locale file.
 */
export const sourceFileKey = (resource: string): string | null => {
  if (!resource.startsWith('../')) return null
  const key = resource.slice('../'.length)
  return isSafeSourceKey(key) ? key : null
}

/** Reads the `sources[].resource` list; `null` when the frontmatter sources are outside the shape. */
const readSourceResources = (frontmatter: Frontmatter): readonly string[] | null => {
  const value = frontmatter['sources']
  if (value === undefined || value === '') return []
  if (!isYamlList(value)) return null

  const resources: string[] = []
  for (const item of value) {
    if (!isYamlMap(item)) return null
    const resource = item['resource']
    if (typeof resource !== 'string' || resource.trim() === '') return null
    resources.push(resource)
  }
  return resources
}

/**
 * Reads a concept's verification state from its `verified` frontmatter.
 *
 * `verified` entries are `{ by, at }` mappings whose `at` is the human review instant. Anything
 * unusable fails closed instead of being skipped: a missing, empty or non-list `verified` is
 * `missing`, and a list where any entry has no parseable `at` is `invalid`.
 *
 * @param frontmatter Frontmatter of one concept.
 * @returns The review state, with the newest parseable instant when the list carries one.
 */
const readConceptVerification = (frontmatter: Frontmatter): OkfConceptVerification => {
  const value = frontmatter['verified']
  if (!isYamlList(value) || value.length === 0) return { kind: 'missing' }

  let latest: string | null = null
  let latestInstant = Number.NEGATIVE_INFINITY
  for (const item of value) {
    const at = isYamlMap(item) ? item['at'] : undefined
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
      return { kind: 'invalid', at: typeof at === 'string' ? at : null }
    }
    const instant = Date.parse(at)
    if (instant >= latestInstant) {
      latestInstant = instant
      latest = at
    }
  }
  return latest === null ? { kind: 'missing' } : { kind: 'verified', at: latest }
}

/** Extracts the source references and the verification state of one concept's frontmatter. */
const extractConceptSources = (
  conceptId: string,
  frontmatter: Frontmatter,
): Result<OkfConceptSources, OkfSourceCheckError> => {
  const resources = readSourceResources(frontmatter)
  if (resources === null) {
    return { ok: false, error: { code: 'sources-invalid', detail: `${conceptId}.md` } }
  }
  return { ok: true, data: { conceptId, resources, verification: readConceptVerification(frontmatter) } }
}

/**
 * Compares the parsed concepts, the committed manifest and the current hashes.
 *
 * Pure: no disk access. Returns every disagreement in a stable order, so the rendered message
 * does not change between runs. Instants are compared by parsing them, never as strings: two
 * timestamps written with different offsets but the same instant are treated as equal. A concept
 * whose review state cannot be compared (`missing` or `invalid`) is reported instead of skipped.
 *
 * @param input Concepts, manifest and current hashes to compare.
 * @returns The issues found, empty when the bundle and the manifest agree.
 */
export const findOkfSourceIssues = ({
  concepts,
  manifest,
  currentHashes,
}: OkfSourceCheckInput): readonly OkfSourceIssue[] => {
  const issues: OkfSourceIssue[] = []
  const citedBy = new Map<string, Set<string>>()
  const sortedConcepts = [...concepts].sort((left, right) => left.conceptId.localeCompare(right.conceptId))

  for (const concept of sortedConcepts) {
    for (const resource of new Set(concept.resources)) {
      const key = sourceFileKey(resource)
      if (key === null) {
        issues.push({ kind: 'invalid-source-reference', concept: concept.conceptId, resource })
        continue
      }
      const ids = citedBy.get(key) ?? new Set<string>()
      ids.add(concept.conceptId)
      citedBy.set(key, ids)
    }
  }

  for (const source of [...citedBy.keys()].sort()) {
    const conceptsForSource = [...(citedBy.get(source) ?? [])].sort()
    const entry = manifest.sources[source]
    if (entry === undefined) {
      issues.push({ kind: 'missing-manifest-entry', source, concepts: conceptsForSource })
      continue
    }
    const current = currentHashes[source]
    if (current === undefined) {
      issues.push({ kind: 'source-unreadable', source, concepts: conceptsForSource })
      continue
    }
    if (current !== entry.sha256) {
      issues.push({
        kind: 'hash-mismatch',
        source,
        concepts: conceptsForSource,
        manifestSha256: entry.sha256,
        currentSha256: current,
      })
    }
  }

  for (const source of Object.keys(manifest.sources).sort()) {
    if (!citedBy.has(source)) issues.push({ kind: 'stale-manifest-entry', source })
  }

  for (const concept of sortedConcepts) {
    if (concept.verification.kind === 'missing') {
      issues.push({ kind: 'missing-verification', concept: concept.conceptId })
      continue
    }
    if (concept.verification.kind === 'invalid') {
      issues.push({ kind: 'invalid-verification', concept: concept.conceptId, at: concept.verification.at })
      continue
    }

    const verified = Date.parse(concept.verification.at)
    for (const resource of new Set(concept.resources)) {
      const source = sourceFileKey(resource)
      if (source === null) continue
      const entry = manifest.sources[source]
      if (entry === undefined) continue
      const reviewed = Date.parse(entry.reviewedAt)
      if (Number.isNaN(reviewed) || reviewed <= verified) continue
      issues.push({
        kind: 'reviewed-after-verification',
        concept: concept.conceptId,
        source,
        reviewedAt: entry.reviewedAt,
        verifiedAt: concept.verification.at,
      })
    }
  }

  return issues
}

/** Renders one issue as an actionable message block. */
const formatIssue = (issue: OkfSourceIssue): string => {
  switch (issue.kind) {
    case 'hash-mismatch':
      return [
        `- locales/fr/${issue.source} changed since locales/fr/okf-sources.json recorded sha256 ${issue.manifestSha256}.`,
        `  Concepts that cite it: ${issue.concepts.join(', ')}. Review them, then add a \`verified\` entry to each one,`,
        `  add a dated entry to locales/fr/okf/log.md, and update the manifest entry with sha256 ${issue.currentSha256}`,
        `  and a fresh \`reviewedAt\`.`,
      ].join('\n')
    case 'missing-manifest-entry':
      return [
        `- locales/fr/${issue.source} is cited by concepts (${issue.concepts.join(', ')}) but missing from`,
        `  locales/fr/okf-sources.json. Review those concepts, then add the file's sha256 and \`reviewedAt\` to the manifest,`,
        `  with a dated entry in locales/fr/okf/log.md.`,
      ].join('\n')
    case 'stale-manifest-entry':
      return [
        `- locales/fr/okf-sources.json records locales/fr/${issue.source}, which no concept cites anymore.`,
        `  Review the concepts that cited it, then remove the entry or restore the reference.`,
      ].join('\n')
    case 'source-unreadable':
      return [
        `- locales/fr/${issue.source} is recorded in the manifest but cannot be read.`,
        `  Restore the file, or remove its entry after checking the concepts that cite it (${issue.concepts.join(', ')}).`,
      ].join('\n')
    case 'invalid-source-reference':
      return [
        `- concept ${issue.concept} has a \`sources[].resource\` that does not resolve below locales/fr: ${issue.resource}.`,
        `  Point it to a path like \`../file.ts\`, relative to locales/fr/okf/.`,
      ].join('\n')
    case 'reviewed-after-verification':
      return [
        `- concept ${issue.concept} cites ${issue.source}, reviewed at ${issue.reviewedAt}, later than its most recent`,
        `  \`verified\` entry (${issue.verifiedAt}). Add a \`verified\` entry at or after that review, then a dated`,
        `  entry in locales/fr/okf/log.md.`,
      ].join('\n')
    case 'missing-verification':
      return [
        `- concept ${issue.concept} has no usable \`verified\` entry, so the check cannot prove its cited sources`,
        `  were reviewed. Add a \`verified\` entry with the review instant, then a dated entry in locales/fr/okf/log.md.`,
      ].join('\n')
    case 'invalid-verification': {
      const cause =
        issue.at === null
          ? 'a `verified` entry whose `at` is missing or not a string'
          : `a \`verified[].at\` that is not a parseable instant: ${issue.at}`
      return [
        `- concept ${issue.concept} has ${cause}, so the check cannot compare its review instant.`,
        `  Fix the entry, then add a dated entry in locales/fr/okf/log.md.`,
      ].join('\n')
    }
  }
}

/**
 * Renders the issues as one actionable message, ready for a test failure or a CLI report.
 *
 * @param issues Issues returned by {@link findOkfSourceIssues}.
 * @returns A stable multi-line message; a single in-sync line when there is no issue.
 */
export const formatOkfSourceIssues = (issues: readonly OkfSourceIssue[]): string =>
  issues.length === 0 ? 'OKF sources are in sync with locales/fr/okf-sources.json.' : issues.map(formatIssue).join('\n')

const errorDetail = (error: unknown): string => (error instanceof Error ? error.message : 'unknown error')

/**
 * Reads and validates the committed manifest.
 *
 * The JSON file is an I/O boundary: its shape is validated with the schema instead of being cast,
 * and every key must be a safe path relative to `locales/fr/`. A key that could resolve outside
 * that directory fails the read, so the check can only ever hash files below it.
 *
 * @param path Manifest path. Defaults to {@link OKF_SOURCE_MANIFEST_PATH}.
 * @returns The parsed manifest, or the read or validation failure.
 */
export const readOkfSourceManifest = (
  path: string = OKF_SOURCE_MANIFEST_PATH,
): Result<OkfSourceManifest, OkfSourceCheckError> => {
  let source: string
  try {
    source = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
  } catch (error) {
    return { ok: false, error: { code: 'manifest-unreadable', detail: errorDetail(error) } }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    return { ok: false, error: { code: 'manifest-invalid', detail: `not valid JSON: ${errorDetail(error)}` } }
  }

  const result = OkfSourceManifestSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
      .join('; ')
    return { ok: false, error: { code: 'manifest-invalid', detail: issues } }
  }

  const unsafeKey = Object.keys(result.data.sources).find((key) => !isSafeSourceKey(key))
  if (unsafeKey !== undefined) {
    return {
      ok: false,
      error: {
        code: 'manifest-invalid',
        detail: `unsafe source key "${unsafeKey}": expected a path relative to locales/fr/ without empty, "." or ".." segments`,
      },
    }
  }
  return { ok: true, data: result.data }
}

/**
 * Reads every concept's source references and verification state from a bundle.
 *
 * The concepts are enumerated and checked by {@link loadOkfBundle} (version, reserved files,
 * required frontmatter), then each concept file is parsed again with the same frontmatter parser:
 * the loader keeps only id, title and body, and duplicating its parser would let the two drift.
 *
 * @param directory Bundle directory. Defaults to {@link OKF_BUNDLE_DIRECTORY}.
 * @returns The parsed concepts, or the first conformance or shape failure.
 */
export const readOkfConceptSources = (
  directory: string = OKF_BUNDLE_DIRECTORY,
): Result<readonly OkfConceptSources[], OkfSourceCheckError> => {
  const bundle = loadOkfBundle(directory)
  if (!bundle.ok) {
    return { ok: false, error: { code: 'bundle-unconformant', detail: `${bundle.error.code}: ${bundle.error.file}` } }
  }

  const concepts: OkfConceptSources[] = []
  for (const concept of bundle.data.concepts) {
    const filename = `${concept.id}.md`
    let source: string
    try {
      source = readFileSync(/* turbopackIgnore: true */ join(directory, filename), 'utf8')
    } catch {
      return { ok: false, error: { code: 'sources-invalid', detail: filename } }
    }

    const document = parseMarkdownDocument(source)
    if (!document.ok) return { ok: false, error: { code: 'sources-invalid', detail: filename } }

    const extracted = extractConceptSources(concept.id, document.data.frontmatter)
    if (!extracted.ok) return extracted
    concepts.push(extracted.data)
  }
  return { ok: true, data: concepts }
}

/**
 * Hashes the given manifest keys over their raw bytes.
 *
 * @param keys Manifest keys: paths relative to `localesDirectory`.
 * @param localesDirectory Directory holding the source files, normally `locales/fr`.
 * @returns Current sha256 per key. A key whose file cannot be read is absent from the result.
 */
export const collectSourceHashes = (
  keys: readonly string[],
  localesDirectory: string,
): Readonly<Record<string, string>> => {
  const hashes: Record<string, string> = {}
  for (const key of new Set(keys)) {
    try {
      const bytes = readFileSync(/* turbopackIgnore: true */ join(localesDirectory, key))
      hashes[key] = createHash('sha256').update(bytes).digest('hex')
    } catch {
      // Unreadable: left out so the check reports `source-unreadable` instead of hashing nothing.
    }
  }
  return hashes
}

/**
 * Runs the whole source check against the matching bundle, manifest and source files on disk.
 *
 * The hashed directory is the manifest's own directory (`locales/fr/`), which keeps a fixture
 * manifest next to its fixture sources: manifest keys and source files resolve against the same
 * root.
 *
 * @param manifestPath Manifest path. Defaults to {@link OKF_SOURCE_MANIFEST_PATH}.
 * @param bundleDirectory Bundle directory. Defaults to {@link OKF_BUNDLE_DIRECTORY}.
 * @returns The issues found, empty when everything is in sync, or the failure that prevented the check.
 */
export const checkOkfSourceManifest = (
  manifestPath: string = OKF_SOURCE_MANIFEST_PATH,
  bundleDirectory: string = OKF_BUNDLE_DIRECTORY,
): Result<readonly OkfSourceIssue[], OkfSourceCheckError> => {
  const manifest = readOkfSourceManifest(manifestPath)
  if (!manifest.ok) return { ok: false, error: manifest.error }

  const concepts = readOkfConceptSources(bundleDirectory)
  if (!concepts.ok) return { ok: false, error: concepts.error }

  const keys = new Set(Object.keys(manifest.data.sources))
  for (const concept of concepts.data) {
    for (const resource of concept.resources) {
      const key = sourceFileKey(resource)
      if (key !== null) keys.add(key)
    }
  }

  const currentHashes = collectSourceHashes([...keys], dirname(manifestPath))
  return { ok: true, data: findOkfSourceIssues({ concepts: concepts.data, manifest: manifest.data, currentHashes }) }
}
