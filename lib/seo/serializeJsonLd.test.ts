import { describe, expect, it } from 'vitest'
import { serializeJsonLd } from './serializeJsonLd'

describe('serializeJsonLd', () => {
  it('escapes every < so a value can never close the script tag', () => {
    const serialized = serializeJsonLd({ answer: 'Réponse </script><script>alert(1)</script>' })

    expect(serialized).not.toContain('<')
    expect(serialized).toContain('\\u003c')
  })

  it('parses back to the input, escapes included', () => {
    const data = {
      '@type': 'FAQPage',
      name: 'Question < ouvrable ?',
      nested: { answer: '</script>', count: 2, flag: false, none: null },
    }

    expect(JSON.parse(serializeJsonLd(data))).toEqual(data)
  })
})
