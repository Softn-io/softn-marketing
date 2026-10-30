import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkOkfSourceManifest,
  findOkfSourceIssues,
  formatOkfSourceIssues,
  OkfSourceManifestSchema,
  readOkfSourceManifest,
  sourceFileKey,
  type OkfConceptSources,
  type OkfSourceManifest,
} from './okfSources'

const FIRST_HASH = 'a'.repeat(64)
const SECOND_HASH = 'b'.repeat(64)
const REVIEWED_AT = '2026-10-28T01:42:38+01:00'
/** Same instant as {@link REVIEWED_AT}, written with another offset: instants are compared, not strings. */
const VERIFIED_AT = '2026-10-28T00:42:38Z'

const directories: string[] = []

/** Writes a fixture tree, creating parents, and returns its root directory. */
const fixture = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), 'okf-sources-'))
  directories.push(root)
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return root
}

const manifest = (sources: OkfSourceManifest['sources']): OkfSourceManifest => ({ sources })

const concept = (conceptId: string, resources: readonly string[], at: string = VERIFIED_AT): OkfConceptSources => ({
  conceptId,
  resources,
  verification: { kind: 'verified', at },
})

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex')

const sha256Bytes = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

const REAL_LOCALES_FR = join(process.cwd(), 'locales', 'fr')

/**
 * Copies the real bundle, the sources the committed manifest records and the manifest itself into
 * a temporary `locales/fr` tree with the same relative layout, so the end-to-end check can be
 * pointed at a mutable copy instead of the repository files.
 */
const copyRealTree = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'okf-sources-real-'))
  directories.push(root)
  const localesFr = join(root, 'locales', 'fr')
  mkdirSync(localesFr, { recursive: true })
  cpSync(join(REAL_LOCALES_FR, 'okf'), join(localesFr, 'okf'), { recursive: true })
  cpSync(join(REAL_LOCALES_FR, 'okf-sources.json'), join(localesFr, 'okf-sources.json'))
  const parsed: unknown = JSON.parse(readFileSync(join(REAL_LOCALES_FR, 'okf-sources.json'), 'utf8'))
  const realManifest = OkfSourceManifestSchema.parse(parsed)
  for (const key of Object.keys(realManifest.sources)) {
    mkdirSync(dirname(join(localesFr, key)), { recursive: true })
    cpSync(join(REAL_LOCALES_FR, key), join(localesFr, key))
  }
  return localesFr
}

/** Concept ids of the bundle whose `sources` cite the manifest key, derived from the frontmatter text. */
const citingConcepts = (bundleDirectory: string, key: string): readonly string[] =>
  readdirSync(bundleDirectory)
    .filter((name) => name.endsWith('.md') && name !== 'index.md')
    .filter((name) => readFileSync(join(bundleDirectory, name), 'utf8').includes(`resource: ../${key}`))
    .map((name) => name.replace(/\.md$/, ''))
    .sort()

/** Asserts the copied tree still passes the whole check, proving the copy mirrors the committed state. */
const expectCopyInSync = (localesFr: string): void => {
  const result = checkOkfSourceManifest(join(localesFr, 'okf-sources.json'), join(localesFr, 'okf'))
  if (!result.ok) throw new Error(`source check could not run: ${result.error.code} (${result.error.detail})`)
  expect(result.data, formatOkfSourceIssues(result.data)).toEqual([])
}

/** Runs the check on a copied tree, failing the test when the check itself cannot run. */
const checkCopy = (localesFr: string) => {
  const result = checkOkfSourceManifest(join(localesFr, 'okf-sources.json'), join(localesFr, 'okf'))
  if (!result.ok) throw new Error(`source check could not run: ${result.error.code} (${result.error.detail})`)
  return result.data
}

/** Parses the copied manifest, to compare the check's numbers against what the copy records. */
const copiedManifest = (localesFr: string) =>
  OkfSourceManifestSchema.parse(JSON.parse(readFileSync(join(localesFr, 'okf-sources.json'), 'utf8')) as unknown)

const indexMarkdown = (): string => '---\nokf_version: "0.2"\n---\n\n# Index\n'

const conceptMarkdown = (
  title: string,
  resources: readonly string[],
  verifiedLine: string | null = 'verified: [{ by: "human:mel", at: "2026-10-28T00:42:38Z" }]',
): string => {
  const lines = ['---', 'type: Service', `title: ${title}`]
  if (verifiedLine !== null) lines.push(verifiedLine)
  lines.push(
    'sources:',
    ...resources.map((resource) => `  - { id: fixture, resource: ${resource}, title: Fixture }`),
    '---',
    '',
    'Corps.',
    '',
  )
  return lines.join('\n')
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('sourceFileKey', () => {
  it('maps a bundle-relative resource to its manifest key', () => {
    expect(sourceFileKey('../chatbot.ts')).toBe('chatbot.ts')
    expect(sourceFileKey('../nested/file.ts')).toBe('nested/file.ts')
    expect(sourceFileKey('chatbot.ts')).toBeNull()
    expect(sourceFileKey('../../chatbot.ts')).toBeNull()
    expect(sourceFileKey('../..')).toBeNull()
  })
})

describe('findOkfSourceIssues', () => {
  it('reports nothing when hashes, references and verification instants agree', () => {
    const issues = findOkfSourceIssues({
      concepts: [concept('assistant', ['../chatbot.ts', '../legal.ts']), concept('contact', ['../legal.ts'])],
      manifest: manifest({
        'chatbot.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT },
        'legal.ts': { sha256: SECOND_HASH, reviewedAt: REVIEWED_AT },
      }),
      currentHashes: { 'chatbot.ts': FIRST_HASH, 'legal.ts': SECOND_HASH },
    })

    expect(issues).toEqual([])
  })

  it('reports a hash mismatch with the concepts that cite the source', () => {
    const issues = findOkfSourceIssues({
      concepts: [concept('softn', ['../hero.ts']), concept('delais', ['../hero.ts'])],
      manifest: manifest({ 'hero.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } }),
      currentHashes: { 'hero.ts': SECOND_HASH },
    })

    expect(issues).toEqual([
      {
        kind: 'hash-mismatch',
        source: 'hero.ts',
        concepts: ['delais', 'softn'],
        manifestSha256: FIRST_HASH,
        currentSha256: SECOND_HASH,
      },
    ])

    const message = formatOkfSourceIssues(issues)
    expect(message).toContain('locales/fr/hero.ts')
    expect(message).toContain('delais, softn')
    expect(message).toContain('`verified`')
    expect(message).toContain('locales/fr/okf/log.md')
    expect(message).toContain('`reviewedAt`')
    expect(message).toContain(SECOND_HASH)
  })

  it('reports a cited source the manifest does not record', () => {
    const issues = findOkfSourceIssues({
      concepts: [concept('contact', ['../contact.ts', '../legal.ts'])],
      manifest: manifest({ 'contact.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } }),
      currentHashes: { 'contact.ts': FIRST_HASH, 'legal.ts': SECOND_HASH },
    })

    expect(issues).toEqual([{ kind: 'missing-manifest-entry', source: 'legal.ts', concepts: ['contact'] }])
    expect(formatOkfSourceIssues(issues)).toContain('locales/fr/legal.ts')
  })

  it('reports a manifest entry no concept cites anymore', () => {
    const issues = findOkfSourceIssues({
      concepts: [concept('assistant', ['../chatbot.ts'])],
      manifest: manifest({
        'chatbot.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT },
        'faq.ts': { sha256: SECOND_HASH, reviewedAt: REVIEWED_AT },
      }),
      currentHashes: { 'chatbot.ts': FIRST_HASH, 'faq.ts': SECOND_HASH },
    })

    expect(issues).toEqual([{ kind: 'stale-manifest-entry', source: 'faq.ts' }])
    expect(formatOkfSourceIssues(issues)).toContain('locales/fr/faq.ts')
  })

  it('reports a recorded source that cannot be read', () => {
    const issues = findOkfSourceIssues({
      concepts: [concept('assistant', ['../chatbot.ts'])],
      manifest: manifest({ 'chatbot.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } }),
      currentHashes: {},
    })

    expect(issues).toEqual([{ kind: 'source-unreadable', source: 'chatbot.ts', concepts: ['assistant'] }])
  })

  it('reports a source reviewed after the concept was verified', () => {
    const reviewedAt = '2026-10-29T09:00:00+01:00'
    const issues = findOkfSourceIssues({
      concepts: [concept('methode', ['../method.ts'])],
      manifest: manifest({ 'method.ts': { sha256: FIRST_HASH, reviewedAt } }),
      currentHashes: { 'method.ts': FIRST_HASH },
    })

    expect(issues).toEqual([
      {
        kind: 'reviewed-after-verification',
        concept: 'methode',
        source: 'method.ts',
        reviewedAt,
        verifiedAt: VERIFIED_AT,
      },
    ])
    expect(formatOkfSourceIssues(issues)).toContain('`verified`')
    expect(formatOkfSourceIssues(issues)).toContain('locales/fr/okf/log.md')
  })

  it('reports a concept whose verified list is missing or empty', () => {
    const issues = findOkfSourceIssues({
      concepts: [
        { conceptId: 'assistant', resources: ['../chatbot.ts'], verification: { kind: 'missing' } },
        { conceptId: 'contact', resources: ['../contact.ts'], verification: { kind: 'missing' } },
      ],
      manifest: manifest({
        'chatbot.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT },
        'contact.ts': { sha256: SECOND_HASH, reviewedAt: REVIEWED_AT },
      }),
      currentHashes: { 'chatbot.ts': FIRST_HASH, 'contact.ts': SECOND_HASH },
    })

    expect(issues).toEqual([
      { kind: 'missing-verification', concept: 'assistant' },
      { kind: 'missing-verification', concept: 'contact' },
    ])

    const message = formatOkfSourceIssues(issues)
    expect(message).toContain('assistant')
    expect(message).toContain('`verified`')
    expect(message).toContain('locales/fr/okf/log.md')
  })

  it('reports an unparseable verified instant instead of skipping the comparison', () => {
    const issues = findOkfSourceIssues({
      concepts: [
        { conceptId: 'assistant', resources: ['../chatbot.ts'], verification: { kind: 'invalid', at: 'yesterday' } },
      ],
      manifest: manifest({ 'chatbot.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } }),
      currentHashes: { 'chatbot.ts': FIRST_HASH },
    })

    expect(issues).toEqual([{ kind: 'invalid-verification', concept: 'assistant', at: 'yesterday' }])

    const message = formatOkfSourceIssues(issues)
    expect(message).toContain('assistant')
    expect(message).toContain('yesterday')
  })

  it('accepts a review instant equal to the concept verification instant', () => {
    const issues = findOkfSourceIssues({
      concepts: [concept('assistant', ['../chatbot.ts'], '2026-10-28T01:42:38+01:00')],
      manifest: manifest({ 'chatbot.ts': { sha256: FIRST_HASH, reviewedAt: '2026-10-28T00:42:38Z' } }),
      currentHashes: { 'chatbot.ts': FIRST_HASH },
    })

    expect(issues).toEqual([])
  })

  it('reports a concept resource that does not resolve below locales/fr', () => {
    const issues = findOkfSourceIssues({
      concepts: [concept('assistant', ['../../chatbot.ts'])],
      manifest: manifest({}),
      currentHashes: {},
    })

    expect(issues).toEqual([{ kind: 'invalid-source-reference', concept: 'assistant', resource: '../../chatbot.ts' }])
  })
})

describe('readOkfSourceManifest', () => {
  it('reads a manifest that matches the schema', () => {
    const root = fixture({
      'okf-sources.json': JSON.stringify({
        sources: { 'chatbot.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } },
      }),
    })

    expect(readOkfSourceManifest(join(root, 'okf-sources.json'))).toEqual({
      ok: true,
      data: { sources: { 'chatbot.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } } },
    })
  })

  it('fails closed on malformed JSON, an invalid shape or an unreadable file', () => {
    const root = fixture({
      'broken.json': '{ "sources": ',
      'invalid.json': JSON.stringify({ sources: { 'chatbot.ts': { sha256: 'nope', reviewedAt: 'yesterday' } } }),
      'extra.json': JSON.stringify({ sources: {}, version: 1 }),
    })

    expect(readOkfSourceManifest(join(root, 'broken.json'))).toMatchObject({
      ok: false,
      error: { code: 'manifest-invalid' },
    })
    expect(readOkfSourceManifest(join(root, 'invalid.json'))).toMatchObject({
      ok: false,
      error: { code: 'manifest-invalid' },
    })
    expect(readOkfSourceManifest(join(root, 'extra.json'))).toMatchObject({
      ok: false,
      error: { code: 'manifest-invalid' },
    })
    expect(readOkfSourceManifest(join(root, 'missing.json'))).toMatchObject({
      ok: false,
      error: { code: 'manifest-unreadable' },
    })
  })

  it('fails closed on a manifest key escaping locales/fr', () => {
    const root = fixture({
      'escaping.json': JSON.stringify({
        sources: { '../../outside.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } },
      }),
    })

    const result = readOkfSourceManifest(join(root, 'escaping.json'))
    if (result.ok) throw new Error('expected the escaping key to fail the read')
    expect(result.error.code).toBe('manifest-invalid')
    expect(result.error.detail).toContain('../../outside.ts')
  })

  it('fails closed on an absolute manifest key', () => {
    const root = fixture({
      'absolute.json': JSON.stringify({
        sources: { '/etc/passwd': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } },
      }),
    })

    const result = readOkfSourceManifest(join(root, 'absolute.json'))
    if (result.ok) throw new Error('expected the absolute key to fail the read')
    expect(result.error.code).toBe('manifest-invalid')
    expect(result.error.detail).toContain('/etc/passwd')
  })
})

describe('checkOkfSourceManifest', () => {
  it('checks a fixture bundle, manifest and sources on disk', () => {
    const heroSource = 'export const hero = 1\n'
    const root = fixture({
      'locales/fr/hero.ts': heroSource,
      'locales/fr/okf-sources.json': JSON.stringify({
        sources: { 'hero.ts': { sha256: sha256(heroSource), reviewedAt: REVIEWED_AT } },
      }),
      'locales/fr/okf/index.md': indexMarkdown(),
      'locales/fr/okf/hero.md': conceptMarkdown('Hero', ['../hero.ts']),
    })

    const result = checkOkfSourceManifest(join(root, 'locales/fr/okf-sources.json'), join(root, 'locales/fr/okf'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data, formatOkfSourceIssues(result.data)).toEqual([])
  })

  it('fails closed before hashing when a manifest key escapes locales/fr', () => {
    const root = fixture({
      'outside.ts': 'export const outside = 1\n',
      'locales/fr/okf-sources.json': JSON.stringify({
        sources: { '../../outside.ts': { sha256: FIRST_HASH, reviewedAt: REVIEWED_AT } },
      }),
      'locales/fr/okf/index.md': indexMarkdown(),
      'locales/fr/okf/hero.md': conceptMarkdown('Hero', ['../hero.ts']),
    })

    const result = checkOkfSourceManifest(join(root, 'locales/fr/okf-sources.json'), join(root, 'locales/fr/okf'))
    expect(result).toMatchObject({ ok: false, error: { code: 'manifest-invalid' } })
  })

  it('fails closed on concepts whose verified entry is missing or empty', () => {
    const heroSource = 'export const hero = 1\n'
    const softnSource = 'export const softn = 1\n'
    const root = fixture({
      'locales/fr/hero.ts': heroSource,
      'locales/fr/softn.ts': softnSource,
      'locales/fr/okf-sources.json': JSON.stringify({
        sources: {
          'hero.ts': { sha256: sha256(heroSource), reviewedAt: REVIEWED_AT },
          'softn.ts': { sha256: sha256(softnSource), reviewedAt: REVIEWED_AT },
        },
      }),
      'locales/fr/okf/index.md': indexMarkdown(),
      'locales/fr/okf/hero.md': conceptMarkdown('Hero', ['../hero.ts'], null),
      'locales/fr/okf/softn.md': conceptMarkdown('Softn', ['../softn.ts'], 'verified: []'),
    })

    const result = checkOkfSourceManifest(join(root, 'locales/fr/okf-sources.json'), join(root, 'locales/fr/okf'))
    if (!result.ok) throw new Error(`source check could not run: ${result.error.code} (${result.error.detail})`)
    expect(result.data).toEqual([
      { kind: 'missing-verification', concept: 'hero' },
      { kind: 'missing-verification', concept: 'softn' },
    ])
  })

  it('fails closed on a verified at that is not a parseable instant', () => {
    const heroSource = 'export const hero = 1\n'
    const root = fixture({
      'locales/fr/hero.ts': heroSource,
      'locales/fr/okf-sources.json': JSON.stringify({
        sources: { 'hero.ts': { sha256: sha256(heroSource), reviewedAt: REVIEWED_AT } },
      }),
      'locales/fr/okf/index.md': indexMarkdown(),
      'locales/fr/okf/hero.md': conceptMarkdown(
        'Hero',
        ['../hero.ts'],
        'verified: [{ by: "human:mel", at: "2026-10-28T00:42:38Z" }, { by: "human:mel", at: "yesterday" }]',
      ),
    })

    const result = checkOkfSourceManifest(join(root, 'locales/fr/okf-sources.json'), join(root, 'locales/fr/okf'))
    if (!result.ok) throw new Error(`source check could not run: ${result.error.code} (${result.error.detail})`)
    expect(result.data).toEqual([{ kind: 'invalid-verification', concept: 'hero', at: 'yesterday' }])
    expect(formatOkfSourceIssues(result.data)).toContain('yesterday')
  })

  it('keeps locales/fr/okf in sync with the committed manifest and the current sources', () => {
    const result = checkOkfSourceManifest()
    if (!result.ok) throw new Error(`source check could not run: ${result.error.code} (${result.error.detail})`)

    expect(result.data, formatOkfSourceIssues(result.data)).toEqual([])
  })
})

describe('checkOkfSourceManifest on a copy of the real tree', () => {
  it('fails naming hero.ts and exactly the concepts that cite it when the copied source changes', () => {
    const localesFr = copyRealTree()
    expectCopyInSync(localesFr)

    appendFileSync(join(localesFr, 'hero.ts'), 'x')
    const issues = checkCopy(localesFr)
    expect(issues).toEqual([
      {
        kind: 'hash-mismatch',
        source: 'hero.ts',
        concepts: ['delais', 'echange-spark', 'softn', 'tarifs'],
        manifestSha256: copiedManifest(localesFr).sources['hero.ts']?.sha256,
        currentSha256: sha256Bytes(readFileSync(join(localesFr, 'hero.ts'))),
      },
    ])

    const message = formatOkfSourceIssues(issues)
    expect(message).toContain('locales/fr/hero.ts')
    expect(message).toContain('delais, echange-spark, softn, tarifs')
    expect(message).toContain('`verified`')
    expect(message).toContain('locales/fr/okf/log.md')
    expect(message).toContain('`reviewedAt`')
  })

  it('fails naming chatbot.ts and every concept that cites it when the copied source changes', () => {
    const localesFr = copyRealTree()
    expectCopyInSync(localesFr)
    const expected = citingConcepts(join(localesFr, 'okf'), 'chatbot.ts')
    expect(expected.length, 'the frontmatter derivation must find the citing concepts').toBeGreaterThan(0)

    appendFileSync(join(localesFr, 'chatbot.ts'), 'x')
    const issues = checkCopy(localesFr)
    expect(issues).toEqual([
      {
        kind: 'hash-mismatch',
        source: 'chatbot.ts',
        concepts: [...expected],
        manifestSha256: copiedManifest(localesFr).sources['chatbot.ts']?.sha256,
        currentSha256: sha256Bytes(readFileSync(join(localesFr, 'chatbot.ts'))),
      },
    ])

    const message = formatOkfSourceIssues(issues)
    expect(message).toContain('locales/fr/chatbot.ts')
    for (const conceptId of expected) expect(message).toContain(conceptId)
  })
})
