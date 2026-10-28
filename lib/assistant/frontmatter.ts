import type { Result } from './result'

/** A frontmatter value: a scalar, an ordered list, or a mapping. Scalars stay strings. */
export type YamlValue = string | readonly YamlValue[] | YamlMap

/** A parsed frontmatter mapping. */
export type YamlMap = { readonly [key: string]: YamlValue }

/** Frontmatter fields of one OKF document. */
export type Frontmatter = YamlMap

/**
 * Why a document cannot be read as OKF frontmatter.
 *
 * `missing-frontmatter` means no `---` block at the top of the file;
 * `invalid-frontmatter` means the block exists but is outside the YAML subset the loader accepts.
 */
export type FrontmatterError = 'missing-frontmatter' | 'invalid-frontmatter'

/** A markdown document split into its frontmatter and its body. */
export type MarkdownDocument = { readonly frontmatter: Frontmatter; readonly body: string }

/** One non-empty, non-comment line of a frontmatter block, with its indentation. */
type BlockLine = { readonly indent: number; readonly text: string }

/** Read position over the block lines of one document. */
type BlockCursor = { readonly lines: readonly BlockLine[]; index: number }

/** Read position over one inline (flow) value. */
type InlineCursor = { readonly source: string; index: number }

const invalid = (): { ok: false; error: FrontmatterError } => ({ ok: false, error: 'invalid-frontmatter' })

/** Reads a plain scalar, stopping at the first character the caller reserves. */
const readPlainScalar = (
  cursor: InlineCursor,
  isStop: (character: string) => boolean,
): Result<string, FrontmatterError> => {
  const start = cursor.index
  while (cursor.index < cursor.source.length) {
    const character = cursor.source[cursor.index]
    if (character === undefined || isStop(character)) break
    cursor.index += 1
  }
  const value = cursor.source.slice(start, cursor.index).trim()
  // A plain scalar may not contain ": " nor start a comment: both are YAML structure markers.
  if (value === '' || value.includes(': ') || value.includes(' #')) return invalid()
  return { ok: true, data: value }
}

/** Reads a double-quoted scalar, with the escape sequences the bundle uses. */
const readDoubleQuotedScalar = (cursor: InlineCursor): Result<string, FrontmatterError> => {
  cursor.index += 1

  // The bundle never uses these escapes; accepting an unknown one would silently change text.
  const escapes: Readonly<Record<string, string>> = { '"': '"', '\\': '\\', n: '\n', t: '\t' }
  let value = ''

  while (cursor.index < cursor.source.length) {
    const character = cursor.source[cursor.index]
    cursor.index += 1
    if (character === undefined) return invalid()
    if (character === '"') return { ok: true, data: value }
    if (character !== '\\') {
      value += character
      continue
    }

    const escaped = cursor.source[cursor.index]
    cursor.index += 1
    const replacement = escaped === undefined ? undefined : escapes[escaped]
    if (replacement === undefined) return invalid()
    value += replacement
  }

  return invalid()
}

/** Reads a single-quoted scalar, where `''` is the only escape. */
const readSingleQuotedScalar = (cursor: InlineCursor): Result<string, FrontmatterError> => {
  cursor.index += 1
  let value = ''

  while (cursor.index < cursor.source.length) {
    const character = cursor.source[cursor.index]
    if (character === undefined) return invalid()
    cursor.index += 1
    if (character !== "'") {
      value += character
      continue
    }
    if (cursor.source[cursor.index] === "'") {
      value += "'"
      cursor.index += 1
      continue
    }
    return { ok: true, data: value }
  }

  return invalid()
}

const skipSpaces = (cursor: InlineCursor): void => {
  while (cursor.source[cursor.index] === ' ') cursor.index += 1
}

const readQuotedScalar = (cursor: InlineCursor): Result<string, FrontmatterError> => {
  const quote = cursor.source[cursor.index]
  return quote === "'" ? readSingleQuotedScalar(cursor) : readDoubleQuotedScalar(cursor)
}

/**
 * Reads one flow sequence, for example `[assistant, IA]` or `[{ by: human:mel, at: … }]`.
 *
 * A nested flow mapping starts with `{`, so `[{ … }]` is read as a one-element list.
 */
const readFlowSequence = (cursor: InlineCursor): Result<readonly YamlValue[], FrontmatterError> => {
  cursor.index += 1
  const items: YamlValue[] = []
  skipSpaces(cursor)
  if (cursor.source[cursor.index] === ']') {
    cursor.index += 1
    return { ok: true, data: items }
  }

  while (cursor.index < cursor.source.length) {
    const item = readInlineValue(cursor)
    if (!item.ok) return item
    items.push(item.data)
    skipSpaces(cursor)
    const separator = cursor.source[cursor.index]
    if (separator === ']') {
      cursor.index += 1
      return { ok: true, data: items }
    }
    if (separator !== ',') return invalid()
    cursor.index += 1
    skipSpaces(cursor)
    if (cursor.source[cursor.index] === ']') {
      cursor.index += 1
      return { ok: true, data: items }
    }
  }

  return invalid()
}

/** Reads one flow mapping, for example `{ id: chatbot, resource: ../chatbot.ts }`. */
const readFlowMapping = (cursor: InlineCursor): Result<YamlMap, FrontmatterError> => {
  cursor.index += 1
  const entries: Record<string, YamlValue> = {}
  skipSpaces(cursor)
  if (cursor.source[cursor.index] === '}') {
    cursor.index += 1
    return { ok: true, data: entries }
  }

  while (cursor.index < cursor.source.length) {
    skipSpaces(cursor)
    const key =
      cursor.source[cursor.index] === '"' || cursor.source[cursor.index] === "'"
        ? readQuotedScalar(cursor)
        : readPlainScalar(cursor, (character) => character === ':')
    if (!key.ok) return key
    skipSpaces(cursor)
    if (cursor.source[cursor.index] !== ':') return invalid()
    cursor.index += 1
    skipSpaces(cursor)

    const value = readInlineValue(cursor)
    if (!value.ok) return value
    if (Object.hasOwn(entries, key.data)) return invalid()
    entries[key.data] = value.data

    skipSpaces(cursor)
    const separator = cursor.source[cursor.index]
    if (separator === '}') {
      cursor.index += 1
      return { ok: true, data: entries }
    }
    if (separator !== ',') return invalid()
    cursor.index += 1
    skipSpaces(cursor)
    if (cursor.source[cursor.index] === '}') {
      cursor.index += 1
      return { ok: true, data: entries }
    }
  }

  return invalid()
}

/** Reads one inline value: flow sequence, flow mapping, quoted scalar or plain scalar. */
const readInlineValue = (cursor: InlineCursor): Result<YamlValue, FrontmatterError> => {
  skipSpaces(cursor)
  const character = cursor.source[cursor.index]

  if (character === '[') return readFlowSequence(cursor)
  if (character === '{') return readFlowMapping(cursor)
  if (character === '"' || character === "'") return readQuotedScalar(cursor)
  return readPlainScalar(cursor, (value) => value === ',' || value === ']' || value === '}')
}

/** Parses one inline value and requires the whole input to be consumed. */
const parseInlineValue = (source: string): Result<YamlValue, FrontmatterError> => {
  const cursor: InlineCursor = { source, index: 0 }
  const value = readInlineValue(cursor)
  if (!value.ok) return value
  skipSpaces(cursor)
  if (cursor.index !== source.length) return invalid()
  return value
}

/**
 * Parses one block value: the text after `key:` or after `- `.
 *
 * Block context has no comma, bracket or brace delimiter, so a plain scalar runs to the end of the
 * line even when it contains commas (the descriptions of the bundle do). Quoted and flow values
 * reuse the inline parser.
 */
const parseBlockValue = (source: string): Result<YamlValue, FrontmatterError> => {
  const cursor: InlineCursor = { source, index: 0 }
  skipSpaces(cursor)
  const character = cursor.source[cursor.index]

  if (character === '[' || character === '{' || character === '"' || character === "'") {
    return parseInlineValue(source)
  }

  const value = readPlainScalar(cursor, () => false)
  if (!value.ok) return value
  cursor.index = cursor.source.length
  return value
}

/** Finds the `:` separating a block mapping key from its value. */
const findKeySeparator = (text: string): number => {
  const separator = text.indexOf(':')
  if (separator <= 0) return -1
  const after = text[separator + 1]
  if (after !== undefined && after !== ' ') return -1
  return separator
}

const readNestedBlock = (cursor: BlockCursor, indent: number): Result<YamlValue, FrontmatterError> => {
  const line = cursor.lines[cursor.index]
  if (line === undefined || line.indent !== indent) return invalid()
  if (line.text === '-' || line.text.startsWith('- ')) return readBlockSequence(cursor, indent)
  return readBlockMapping(cursor, indent)
}

const readBlockSequence = (cursor: BlockCursor, indent: number): Result<readonly YamlValue[], FrontmatterError> => {
  const items: YamlValue[] = []

  while (cursor.index < cursor.lines.length) {
    const line = cursor.lines[cursor.index]
    if (line === undefined || line.indent < indent) break
    if (line.indent > indent) return invalid()
    if (line.text !== '-' && !line.text.startsWith('- ')) break

    const rest = line.text === '-' ? '' : line.text.slice(2).trim()
    cursor.index += 1

    if (rest !== '') {
      const value = parseBlockValue(rest)
      if (!value.ok) return value
      items.push(value.data)
      continue
    }

    const next = cursor.lines[cursor.index]
    if (next === undefined || next.indent <= indent) {
      items.push('')
      continue
    }
    const value = readNestedBlock(cursor, next.indent)
    if (!value.ok) return value
    items.push(value.data)
  }

  return { ok: true, data: items }
}

const readBlockMapping = (cursor: BlockCursor, indent: number): Result<YamlMap, FrontmatterError> => {
  const entries: Record<string, YamlValue> = {}

  while (cursor.index < cursor.lines.length) {
    const line = cursor.lines[cursor.index]
    if (line === undefined || line.indent < indent) break
    if (line.indent > indent) return invalid()
    if (line.text === '-' || line.text.startsWith('- ')) break

    const separator = findKeySeparator(line.text)
    if (separator === -1) return invalid()
    const key = line.text.slice(0, separator).trim()
    if (!/^[A-Za-z0-9_-]+$/.test(key) || Object.hasOwn(entries, key)) return invalid()
    const rest = line.text.slice(separator + 1).trim()
    cursor.index += 1

    if (rest !== '') {
      const value = parseBlockValue(rest)
      if (!value.ok) return value
      entries[key] = value.data
      continue
    }

    const next = cursor.lines[cursor.index]
    if (next === undefined || next.indent <= indent) {
      entries[key] = ''
      continue
    }
    const value = readNestedBlock(cursor, next.indent)
    if (!value.ok) return value
    entries[key] = value.data
  }

  return { ok: true, data: entries }
}

/** Splits a document at its opening and closing `---` delimiters. */
const splitDocument = (source: string): Result<{ readonly block: string; readonly body: string }, FrontmatterError> => {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { ok: false, error: 'missing-frontmatter' }

  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (closing === -1) return { ok: false, error: 'missing-frontmatter' }

  return {
    ok: true,
    data: {
      block: lines.slice(1, closing).join('\n'),
      body: lines.slice(closing + 1).join('\n'),
    },
  }
}

/** Turns a frontmatter block into indented lines, dropping blank and comment lines. */
const toBlockLines = (block: string): Result<readonly BlockLine[], FrontmatterError> => {
  const lines: BlockLine[] = []

  for (const raw of block.split('\n')) {
    if (raw.trim() === '') continue
    if (raw.trimStart().startsWith('#')) continue
    if (raw.includes('\t')) return invalid()
    const indent = raw.length - raw.trimStart().length
    lines.push({ indent, text: raw.trimStart() })
  }

  return { ok: true, data: lines }
}

/**
 * Parses the YAML subset used by OKF frontmatter into a plain object.
 *
 * The supported subset is exactly what the Softn.io bundle uses: a top-level mapping of
 * `key: scalar`, `key: [flow, sequence]`, `key: { flow: mapping }` and `key:` followed by a block
 * sequence of inline mappings. Scalars may be plain, double-quoted or single-quoted. Numbers and
 * booleans stay strings: the loader only reads text fields. Anything outside the subset is
 * rejected, so a malformed bundle fails closed instead of being half understood.
 *
 * @param block Frontmatter block, delimiters excluded.
 * @returns The parsed mapping, or `invalid-frontmatter` when the block is outside the subset.
 */
export const parseFrontmatterBlock = (block: string): Result<Frontmatter, FrontmatterError> => {
  const lines = toBlockLines(block)
  if (!lines.ok) return lines
  const first = lines.data[0]
  if (first === undefined) return { ok: true, data: {} }
  if (first.indent !== 0) return invalid()

  const cursor: BlockCursor = { lines: lines.data, index: 0 }
  const mapping = readBlockMapping(cursor, 0)
  if (!mapping.ok) return mapping
  if (cursor.index !== lines.data.length) return invalid()
  return mapping
}

/**
 * Splits a markdown document into its YAML frontmatter and its body.
 *
 * A document without a frontmatter block is rejected (`missing-frontmatter`): OKF requires one on
 * every concept. Reserved `index.md` and `log.md` files are handled by the bundle loader before
 * this parser, because `log.md` carries no frontmatter by design.
 *
 * @param source Raw UTF-8 content of one markdown file.
 * @returns The parsed frontmatter and the untouched body.
 */
export const parseMarkdownDocument = (source: string): Result<MarkdownDocument, FrontmatterError> => {
  const document = splitDocument(source)
  if (!document.ok) return document

  const frontmatter = parseFrontmatterBlock(document.data.block)
  if (!frontmatter.ok) return frontmatter

  return { ok: true, data: { frontmatter: frontmatter.data, body: document.data.body } }
}
