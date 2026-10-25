import { describe, expect, it } from 'vitest'
import { interpolateSegments } from './interpolateSegments'

describe('interpolateSegments', () => {
  it('splits the template around a placeholder and resolves its value', () => {
    expect(interpolateSegments('Je vous écrirai à {email} lors du lancement.', { email: 'mel@example.fr' })).toEqual([
      { kind: 'text', value: 'Je vous écrirai à ' },
      { kind: 'placeholder', name: 'email', value: 'mel@example.fr' },
      { kind: 'text', value: ' lors du lancement.' },
    ])
  })

  it('omits empty text pieces when a placeholder starts or ends the template', () => {
    expect(interpolateSegments('{a}-{b}', { a: 'x', b: 'y' })).toEqual([
      { kind: 'placeholder', name: 'a', value: 'x' },
      { kind: 'text', value: '-' },
      { kind: 'placeholder', name: 'b', value: 'y' },
    ])
  })

  it('returns a single text segment when the template has no placeholder', () => {
    expect(interpolateSegments('Bonjour', {})).toEqual([{ kind: 'text', value: 'Bonjour' }])
  })

  it('resolves every occurrence of a repeated placeholder', () => {
    expect(interpolateSegments('{a} et {a}', { a: 'x' })).toEqual([
      { kind: 'placeholder', name: 'a', value: 'x' },
      { kind: 'text', value: ' et ' },
      { kind: 'placeholder', name: 'a', value: 'x' },
    ])
  })

  it('throws when a placeholder has no value', () => {
    expect(() => interpolateSegments('Bonjour {email}', {})).toThrow(/email/)
  })
})
