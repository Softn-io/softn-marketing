import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildGroundingText, createOkfBundleCache, loadOkfBundle, OKF_VERSION, type OkfBundle } from './okf'

const directories: string[] = []

/** Writes a bundle fixture and returns its directory. */
const bundle = (files: Readonly<Record<string, string>>): string => {
  const directory = mkdtempSync(join(tmpdir(), 'okf-bundle-'))
  directories.push(directory)
  for (const [name, content] of Object.entries(files)) writeFileSync(join(directory, name), content)
  return directory
}

const index = (version: string = OKF_VERSION): string => `---\nokf_version: "${version}"\n---\n\n# Index\n`

const concept = (type: string, title: string, body: string): string =>
  `---\ntype: ${type}\ntitle: ${title}\n---\n\n${body}\n`

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('loadOkfBundle', () => {
  it('loads concepts in file-name order and skips the reserved index and log', () => {
    const directory = bundle({
      'index.md': index(),
      'log.md': '# Journal\n\n- Une entrée.',
      'b.md': concept('Service', 'B', 'Corps B.'),
      'a.md': concept('Service', 'A', 'Corps A.'),
    })

    const result = loadOkfBundle(directory)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.concepts.map((item) => item.id)).toEqual(['a', 'b'])
    expect(result.data.concepts[0]).toEqual({ id: 'a', title: 'A', body: 'Corps A.' })
    expect(result.data.grounding).toContain('## A')
    expect(result.data.grounding).toContain('Concept : a')
    expect(result.data.grounding).toContain('Corps B.')
    expect(result.data.grounding.indexOf('## A')).toBeLessThan(result.data.grounding.indexOf('## B'))
  })

  it('fails closed when the index is missing or declares another version', () => {
    expect(loadOkfBundle(bundle({ 'a.md': concept('Service', 'A', 'Corps.') }))).toEqual({
      ok: false,
      error: { code: 'missing-index', file: 'index.md' },
    })

    expect(loadOkfBundle(bundle({ 'index.md': index('0.1'), 'a.md': concept('Service', 'A', 'Corps.') }))).toEqual({
      ok: false,
      error: { code: 'unsupported-version', file: 'index.md' },
    })
  })

  it('fails closed on the first non-conformant concept', () => {
    expect(loadOkfBundle(bundle({ 'index.md': index(), 'a.md': concept('Service', 'A', 'Corps.') }))).toMatchObject({
      ok: true,
    })

    expect(loadOkfBundle(bundle({ 'index.md': index(), 'a.md': '---\ntitle: Sans type\n---\nCorps.' }))).toEqual({
      ok: false,
      error: { code: 'missing-type', file: 'a.md' },
    })

    expect(loadOkfBundle(bundle({ 'index.md': index(), 'a.md': 'Sans frontmatter.' }))).toEqual({
      ok: false,
      error: { code: 'missing-frontmatter', file: 'a.md' },
    })
  })

  it('fails closed when the bundle has no concept', () => {
    expect(loadOkfBundle(bundle({ 'index.md': index(), 'log.md': '# Journal' }))).toEqual({
      ok: false,
      error: { code: 'bundle-empty', file: '.' },
    })
  })

  it('fails closed when the directory cannot be read', () => {
    expect(loadOkfBundle(join(tmpdir(), 'okf-does-not-exist'))).toEqual({
      ok: false,
      error: { code: 'missing-index', file: 'index.md' },
    })
  })

  it('loads the integrated French bundle with its 13 concepts and its verified frontmatter', () => {
    const result = loadOkfBundle()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.concepts).toHaveLength(13)
    expect(result.data.concepts.map((item) => item.id)).toContain('assistant')
    expect(result.data.grounding).toContain('## Assistant virtuel du site')
    expect(result.data.grounding).toContain('[^chatbot]')
  })
})

describe('buildGroundingText', () => {
  it('separates concepts and keeps their id, title and body', () => {
    const grounding = buildGroundingText([
      { id: 'a', title: 'A', body: 'Corps A.' },
      { id: 'b', title: 'B', body: 'Corps B.' },
    ])

    expect(grounding).toBe('## A\n\nConcept : a\n\nCorps A.\n\n---\n\n## B\n\nConcept : b\n\nCorps B.')
  })
})

describe('createOkfBundleCache', () => {
  const loaded: OkfBundle = {
    concepts: [{ id: 'a', title: 'A', body: 'Corps A.' }],
    grounding: '## A\n\nConcept : a\n\nCorps A.',
  }

  it('caches a successful load and serves it without reading the disk again', () => {
    let loads = 0
    const getBundle = createOkfBundleCache(() => {
      loads += 1
      return { ok: true, data: loaded }
    })

    expect(getBundle()).toEqual({ ok: true, data: loaded })
    expect(getBundle()).toEqual({ ok: true, data: loaded })
    expect(loads).toBe(1)
  })

  it('retries a failed load on the next call instead of caching the failure', () => {
    let loads = 0
    const getBundle = createOkfBundleCache(() => {
      loads += 1
      return loads === 1 ? { ok: false, error: { code: 'bundle-unreadable', file: '.' } } : { ok: true, data: loaded }
    })

    expect(getBundle()).toEqual({ ok: false, error: { code: 'bundle-unreadable', file: '.' } })
    expect(getBundle()).toEqual({ ok: true, data: loaded })
    expect(getBundle()).toEqual({ ok: true, data: loaded })
    expect(loads).toBe(2)
  })
})
