import { describe, expect, it } from 'vitest'
import { legal } from '@/locales/fr/legal'
import { cookiesContent, mentionsContent, privacyContent } from '../data/legalSections'

/** Placeholders the copy may use; anything else would throw at render time (fail closed). */
const KNOWN_PLACEHOLDERS = ['contactPageLink', 'dataRequestSubject'] as const

const CONTENTS = [
  { name: 'mentions', content: mentionsContent, locale: legal.mentions, updatedAt: '30/11/2026' },
  { name: 'privacy', content: privacyContent, locale: legal.privacy, updatedAt: '23/11/2026' },
  { name: 'cookies', content: cookiesContent, locale: legal.cookies, updatedAt: '23/11/2026' },
] as const

describe('legalSections', () => {
  it.each(CONTENTS)(
    '$name: the {date} parameter is filled with $updatedAt, the ISO date written the French way',
    ({ content, updatedAt }) => {
      expect(content.updated).toBe(`Dernière mise à jour : ${updatedAt}`)
    },
  )

  it.each(CONTENTS)('$name: the title and every section come from the locale, in its order', ({ content, locale }) => {
    expect(content.title).toBe(locale.title)
    expect(content.sections.map((section) => section.title)).toEqual(
      Object.values(locale.sections).map((section) => section.title),
    )
    for (const section of content.sections) {
      expect(section.paragraphs.length).toBeGreaterThan(0)
      for (const paragraph of section.paragraphs) {
        expect(paragraph.length).toBeGreaterThan(0)
      }
    }
  })

  it.each(CONTENTS)('$name: every placeholder the copy uses is one the renderer answers', ({ content }) => {
    const texts = [
      ...(content.intro === undefined ? [] : [content.intro]),
      ...content.sections.flatMap((section) => [
        ...(section.intro === undefined ? [] : [section.intro]),
        ...section.paragraphs,
      ]),
    ]
    for (const text of texts) {
      for (const match of text.matchAll(/\{(\w+)\}/g)) {
        const name: string = match[1] ?? ''
        expect(KNOWN_PLACEHOLDERS as readonly string[], `unknown placeholder {${name}}`).toContain(name)
      }
    }
  })
})
