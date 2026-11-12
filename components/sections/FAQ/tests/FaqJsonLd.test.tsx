// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { faq } from '@/locales/fr/faq'
import { serializeJsonLd } from '@/lib/seo/serializeJsonLd'
import { FaqJsonLd } from '../FaqJsonLd'

/**
 * Renders the block under test and returns it with its container, failing the test rather than the
 * type checker when the script tag is missing.
 */
const renderBlock = (items = faq.items) => {
  const { container } = render(<FaqJsonLd items={items} />)
  const script = container.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')
  if (script === null) throw new Error('the JSON-LD script tag is missing')
  return { container, script }
}

afterEach(cleanup)

describe('FaqJsonLd', () => {
  it('renders exactly one application/ld+json script', () => {
    const { container } = renderBlock()

    expect(container.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1)
  })

  it('declares a schema.org FAQPage and no other keyword', () => {
    const { script } = renderBlock()
    const data = JSON.parse(script.textContent ?? '')

    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('FAQPage')
    expect(Object.keys(data).sort()).toEqual(['@context', '@type', 'mainEntity'])
  })

  it('writes one Question per locale item, with the very text the page shows', () => {
    const { script } = renderBlock()
    const data = JSON.parse(script.textContent ?? '')

    expect(data.mainEntity).toHaveLength(faq.items.length)
    expect(data.mainEntity).toEqual(
      faq.items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    )
  })

  it('serializes through serializeJsonLd, so the shared escaping rule holds here too', () => {
    const { script } = renderBlock()
    const data = JSON.parse(script.textContent ?? '')

    expect(script.innerHTML).toBe(serializeJsonLd(data))
  })
})
