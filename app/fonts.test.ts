import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as agent from '@/locales/fr/agent'
import * as bookingEmails from '@/locales/fr/bookingEmails'
import * as bookingManage from '@/locales/fr/bookingManage'
import * as chatbot from '@/locales/fr/chatbot'
import * as comingSoon from '@/locales/fr/comingSoon'
import * as contact from '@/locales/fr/contact'
import * as faq from '@/locales/fr/faq'
import * as footer from '@/locales/fr/footer'
import * as hero from '@/locales/fr/hero'
import * as legal from '@/locales/fr/legal'
import * as metadata from '@/locales/fr/metadata'
import * as method from '@/locales/fr/method'
import * as minimalHeader from '@/locales/fr/minimalHeader'
import * as offers from '@/locales/fr/offers'
import * as thisSite from '@/locales/fr/thisSite'

/**
 * Every module of `locales/fr`, keyed by file name. The second test below fails when a module is
 * added to the folder without being imported here, so no copy can escape the glyph coverage check.
 */
const LOCALE_MODULES: Record<string, unknown> = {
  'agent.ts': agent,
  'bookingEmails.ts': bookingEmails,
  'bookingManage.ts': bookingManage,
  'chatbot.ts': chatbot,
  'comingSoon.ts': comingSoon,
  'contact.ts': contact,
  'faq.ts': faq,
  'footer.ts': footer,
  'hero.ts': hero,
  'legal.ts': legal,
  'metadata.ts': metadata,
  'method.ts': method,
  'minimalHeader.ts': minimalHeader,
  'offers.ts': offers,
  'thisSite.ts': thisSite,
}

const LOCALES_DIR = fileURLToPath(new URL('../locales/fr/', import.meta.url))
const OKF_DIR = fileURLToPath(new URL('../locales/fr/okf', import.meta.url))
const UNICODES_FILE = fileURLToPath(new URL('../assets/fonts/unicodes.txt', import.meta.url))

type LocaleString = { readonly text: string; readonly key: string }

/** Whether `value` is a plain object, the shape of every exported locale namespace and copy block. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Collects every string reachable from an exported locale value, tagged with its property path. */
const collectStrings = (value: unknown, key: string, collected: LocaleString[]): void => {
  if (typeof value === 'string') {
    collected.push({ text: value, key })
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${key}[${index}]`, collected))
    return
  }

  if (isPlainObject(value)) {
    for (const [property, child] of Object.entries(value)) {
      collectStrings(child, key === '' ? property : `${key}.${property}`, collected)
    }
  }
}

/** Parses `U+XXXX` and `U+XXXX-U+YYYY` lines, ignoring blank lines and `#` comments. */
const parseUnicodeRanges = (source: string): ReadonlySet<number> => {
  const codePoints = new Set<number>()

  for (const rawLine of source.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (line === '') {
      continue
    }

    const [start = '', end = start] = line.replace(/U\+/gi, '').split('-')
    const first = Number.parseInt(start, 16)
    const last = Number.parseInt(end, 16)
    if (Number.isNaN(first) || Number.isNaN(last)) {
      throw new Error(`Unreadable code point range in unicodes.txt: ${rawLine}`)
    }

    for (let codePoint = first; codePoint <= last; codePoint += 1) {
      codePoints.add(codePoint)
    }
  }

  return codePoints
}

const unicodeCoverage = parseUnicodeRanges(readFileSync(UNICODES_FILE, 'utf8'))
const localeStrings = Object.values(LOCALE_MODULES).flatMap((module) => {
  const collected: LocaleString[] = []
  collectStrings(module, '', collected)
  return collected
})

/**
 * The OKF bundle grounds the chatbot prompt and answers quote it verbatim, so its text reaches the
 * page through the same two faces. Keyed by file name, like the locale modules.
 */
const okfStrings: LocaleString[] = readdirSync(OKF_DIR)
  .filter((file) => file.endsWith('.md'))
  .map((file) => ({ text: readFileSync(`${OKF_DIR}/${file}`, 'utf8'), key: `okf/${file}` }))

const checkedStrings = [...localeStrings, ...okfStrings]

/** Control characters (line feeds in the ICS description) are not glyphs, no font can carry them. */
const isControlCharacter = (codePoint: number): boolean => codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)

const uncoveredCharacters = checkedStrings.flatMap(({ text, key }) =>
  [...text]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? -1
      return !isControlCharacter(codePoint) && !unicodeCoverage.has(codePoint)
    })
    .map(
      (character) =>
        `"${character}" (U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}) in ${key}`,
    ),
)

describe('self-hosted font subsets', () => {
  it('keeps every locales/fr character inside the subset code point list', () => {
    expect(localeStrings.length).toBeGreaterThan(0)
    expect(okfStrings.length).toBeGreaterThan(0)
    expect([...new Set(uncoveredCharacters)]).toEqual([])
  })

  it('imports every locales/fr module', () => {
    const localeFiles = readdirSync(LOCALES_DIR)
      .filter((file) => file.endsWith('.ts'))
      .sort()

    expect(localeFiles).toEqual(Object.keys(LOCALE_MODULES).sort())
  })
})
