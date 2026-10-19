import { describe, expect, it } from 'vitest'
import { interpolate } from './interpolate'

describe('interpolate', () => {
  it('replaces a placeholder with its value', () => {
    expect(interpolate("{assistantName}, l'assistant", { assistantName: 'Flo' })).toBe("Flo, l'assistant")
  })

  it('replaces every occurrence and several placeholders', () => {
    expect(interpolate('{a} et {b} puis {a}', { a: 'x', b: 'y' })).toBe('x et y puis x')
  })

  it('returns a string without placeholder unchanged', () => {
    expect(interpolate('Bonjour', {})).toBe('Bonjour')
  })

  it('throws when a placeholder has no value', () => {
    expect(() => interpolate('Bonjour {firstName}', {})).toThrow(/firstName/)
  })
})
