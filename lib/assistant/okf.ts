import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMarkdownDocument, type Frontmatter } from './frontmatter'
import type { Result } from './result'

/** Reserved OKF filenames that are not concepts: an index listing and a changelog (OKF §3.1). */
const RESERVED_FILENAMES = new Set(['index.md', 'log.md'])

/** OKF version this loader understands; a bundle declaring another version fails closed. */
export const OKF_VERSION = '0.2'

/** Bundle-relative name of the index that declares the OKF version. */
const INDEX_FILENAME = 'index.md'

/** Directory of the validated OKF v0.2 bundle, read by the assistant grounded answers. */
export const OKF_BUNDLE_DIRECTORY = join(process.cwd(), 'locales', 'fr', 'okf')

/** One concept of the bundle, ready to be given to the model. */
export type OkfConcept = {
  /** Concept id: the file path inside the bundle without its `.md` suffix. */
  id: string
  /** Display title from the frontmatter, or the id when the title is absent. */
  title: string
  /** Markdown body, footnotes included. */
  body: string
}

/** Parsed, conformant bundle. */
export type OkfBundle = {
  /** Concepts in file-name order, so the grounding text is stable between reads. */
  concepts: readonly OkfConcept[]
  /** Text handed to the model: concept id, title and body of every concept. */
  grounding: string
}

/** Non-personal failure codes of the bundle loader. */
export type OkfErrorCode =
  | 'bundle-unreadable'
  | 'bundle-empty'
  | 'missing-index'
  | 'unsupported-version'
  | 'missing-frontmatter'
  | 'invalid-frontmatter'
  | 'missing-type'

/** Why the bundle cannot ground an answer. `file` is the bundle-relative file name, never its content. */
export type OkfLoadError = { readonly code: OkfErrorCode; readonly file: string }

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/**
 * Checks the bundle's declared OKF version from its reserved `index.md`.
 *
 * The version declaration is the first conformance rule: a bundle written for another version may
 * carry fields this loader would misread, so it is rejected before any concept is parsed.
 */
const checkIndexVersion = (directory: string): OkfLoadError | null => {
  let source: string
  try {
    source = readFileSync(/* turbopackIgnore: true */ join(directory, INDEX_FILENAME), 'utf8')
  } catch {
    return { code: 'missing-index', file: INDEX_FILENAME }
  }

  const document = parseMarkdownDocument(source)
  if (!document.ok) return { code: document.error, file: INDEX_FILENAME }

  const version = document.data.frontmatter.okf_version
  if (version !== OKF_VERSION) return { code: 'unsupported-version', file: INDEX_FILENAME }
  return null
}

/** Reads one concept's frontmatter and body, and checks the OKF v0.2 conformance rules we rely on. */
const readConcept = (directory: string, filename: string): Result<OkfConcept, OkfLoadError> => {
  let source: string
  try {
    source = readFileSync(/* turbopackIgnore: true */ join(directory, filename), 'utf8')
  } catch {
    return { ok: false, error: { code: 'bundle-unreadable', file: filename } }
  }

  const document = parseMarkdownDocument(source)
  if (!document.ok) return { ok: false, error: { code: document.error, file: filename } }

  const frontmatter: Frontmatter = document.data.frontmatter
  const type = frontmatter.type
  if (!nonEmptyString(type)) return { ok: false, error: { code: 'missing-type', file: filename } }

  const id = filename.slice(0, -'.md'.length)
  const title = nonEmptyString(frontmatter.title) ? frontmatter.title.trim() : id
  return { ok: true, data: { id, title, body: document.data.body.trim() } }
}

/**
 * Builds the grounding text from parsed concepts.
 *
 * Every concept keeps its id, its title and its whole body, footnotes included: the footnotes
 * carry the source attribution the model is allowed to rely on. A separator keeps neighbouring
 * concepts from being read as one.
 *
 * @param concepts Concepts in render order.
 * @returns Grounding text for the system prompt.
 */
export const buildGroundingText = (concepts: readonly OkfConcept[]): string =>
  concepts.map((concept) => `## ${concept.title}\n\nConcept : ${concept.id}\n\n${concept.body}`).join('\n\n---\n\n')

/**
 * Loads and checks the whole OKF bundle from a directory.
 *
 * Fail closed: the first non-conformant concept makes the whole load fail, because a partial
 * bundle would let the assistant answer without the content that contradicts it. Reserved
 * `index.md` and `log.md` files are skipped (OKF §3.1, §8, §9).
 *
 * @param directory Bundle directory. Defaults to {@link OKF_BUNDLE_DIRECTORY}; tests pass a fixture.
 * @returns The concepts and their grounding text, or the first conformance failure.
 */
export const loadOkfBundle = (directory: string = OKF_BUNDLE_DIRECTORY): Result<OkfBundle, OkfLoadError> => {
  const versionError = checkIndexVersion(directory)
  if (versionError !== null) return { ok: false, error: versionError }

  let filenames: readonly string[]
  try {
    // Runtime content, not an import: Turbopack must not trace the whole project from this
    // directory listing. `outputFileTracingIncludes` in next.config.ts ships the bundle files.
    filenames = readdirSync(/* turbopackIgnore: true */ directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !RESERVED_FILENAMES.has(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return { ok: false, error: { code: 'bundle-unreadable', file: '.' } }
  }

  if (filenames.length === 0) return { ok: false, error: { code: 'bundle-empty', file: '.' } }

  const concepts: OkfConcept[] = []
  for (const filename of filenames) {
    const concept = readConcept(directory, filename)
    if (!concept.ok) return concept
    concepts.push(concept.data)
  }

  return { ok: true, data: { concepts, grounding: buildGroundingText(concepts) } }
}

/**
 * Creates a per-instance bundle cache around a loader.
 *
 * Only a successful, conformant load is cached: a transient read error or a bundle that is not
 * ready yet must be retried on the next request instead of pinning the failure for the life of the
 * server instance. The bundle is build-time content, so a successful load never goes stale.
 *
 * @param load Loader to memoize. Defaults to {@link loadOkfBundle}; tests pass a fake.
 * @returns A getter returning the cached success, or the failure of the current attempt.
 */
export const createOkfBundleCache = (
  load: () => Result<OkfBundle, OkfLoadError> = loadOkfBundle,
): (() => Result<OkfBundle, OkfLoadError>) => {
  let cached: OkfBundle | undefined

  return () => {
    if (cached !== undefined) return { ok: true, data: cached }

    const result = load()
    if (result.ok) cached = result.data
    return result
  }
}

/** Bundle parsed at most once per server instance, and only when the load succeeded. */
export const getOkfBundle = createOkfBundleCache()
