import { describe, expect, it } from 'vitest'
import { parseFrontmatterBlock, parseMarkdownDocument } from './frontmatter'

describe('parseFrontmatterBlock', () => {
  it('parses plain, quoted and flow values', () => {
    const result = parseFrontmatterBlock(`type: Assistant
title: "Un titre : avec deux-points"
tags: [assistant, IA, "agents"]
generated: { by: content-seo, at: 2026-10-28T00:53:29+01:00 }`)

    expect(result).toEqual({
      ok: true,
      data: {
        type: 'Assistant',
        title: 'Un titre : avec deux-points',
        tags: ['assistant', 'IA', 'agents'],
        generated: { by: 'content-seo', at: '2026-10-28T00:53:29+01:00' },
      },
    })
  })

  it('parses a block sequence of inline mappings, as the verified field uses it', () => {
    const result = parseFrontmatterBlock(`verified:
  - { by: "human:mel", at: "2026-10-28T01:42:38+01:00" }`)

    expect(result).toEqual({
      ok: true,
      data: { verified: [{ by: 'human:mel', at: '2026-10-28T01:42:38+01:00' }] },
    })
  })

  it('rejects a plain scalar holding a colon-space, which YAML would read as structure', () => {
    expect(parseFrontmatterBlock('description: Un assistant : virtuel')).toEqual({
      ok: false,
      error: 'invalid-frontmatter',
    })
  })

  it('accepts the same text once quoted', () => {
    const result = parseFrontmatterBlock('description: "Un assistant : virtuel"')
    expect(result.ok && result.data.description).toBe('Un assistant : virtuel')
  })

  it('keeps commas inside a block plain scalar', () => {
    const result = parseFrontmatterBlock(
      'description: Un assistant virtuel, pas une personne, qui répond sur les services et la méthode.',
    )
    expect(result.ok && result.data.description).toBe(
      'Un assistant virtuel, pas une personne, qui répond sur les services et la méthode.',
    )
  })

  it('rejects tabs, malformed inline values and duplicate keys', () => {
    expect(parseFrontmatterBlock('type:\tAssistant')).toEqual({ ok: false, error: 'invalid-frontmatter' })
    expect(parseFrontmatterBlock('tags: [a, b')).toEqual({ ok: false, error: 'invalid-frontmatter' })
    expect(parseFrontmatterBlock('type: A\ntype: B')).toEqual({ ok: false, error: 'invalid-frontmatter' })
    expect(parseFrontmatterBlock('type: A\n  extra: B')).toEqual({ ok: false, error: 'invalid-frontmatter' })
  })
})

describe('parseMarkdownDocument', () => {
  it('splits the frontmatter from an untouched body', () => {
    const result = parseMarkdownDocument(`---
type: Concept
---

# Titre

Corps du concept.`)

    expect(result.ok && result.data.frontmatter.type).toBe('Concept')
    expect(result.ok && result.data.body).toBe('\n# Titre\n\nCorps du concept.')
  })

  it('rejects a document without frontmatter or without its closing delimiter', () => {
    expect(parseMarkdownDocument('# Sans frontmatter')).toEqual({ ok: false, error: 'missing-frontmatter' })
    expect(parseMarkdownDocument('---\ntype: Concept\n')).toEqual({ ok: false, error: 'missing-frontmatter' })
  })

  it('accepts a UTF-8 byte-order mark before the opening delimiter', () => {
    const result = parseMarkdownDocument('\uFEFF---\ntype: Concept\n---\nCorps.')
    expect(result.ok && result.data.frontmatter.type).toBe('Concept')
  })
})
