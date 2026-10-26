// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { metadataContent } from '@/locales/fr/metadata'
import { SITE_URL } from '@/lib/site'
import { JsonLd } from './JsonLd'

afterEach(cleanup)

const { professionalService } = metadataContent.structuredData

const renderJsonLdScript = (): HTMLScriptElement => {
  const { container } = render(<JsonLd />)
  const script = container.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  )
  if (!script) throw new Error('the JSON-LD script tag is missing')
  return script
}

describe('JsonLd', () => {
  it('renders exactly one application/ld+json script', () => {
    const { container } = render(<JsonLd />)

    expect(
      container.querySelectorAll('script[type="application/ld+json"]'),
    ).toHaveLength(1)
  })

  it('carries exactly the approved brand-only ProfessionalService fields', () => {
    const script = renderJsonLdScript()
    const data = JSON.parse(script.textContent ?? '')

    expect(Object.keys(data).sort()).toEqual([
      '@context',
      '@type',
      'areaServed',
      'description',
      'name',
      'serviceType',
      'url',
    ])
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('ProfessionalService')
    expect(data.name).toBe(professionalService.name)
    expect(data.url).toBe(SITE_URL)
    expect(data.description).toBe(professionalService.description)
    expect(data.areaServed).toBe(professionalService.areaServed)
    expect(data.serviceType).toEqual(professionalService.serviceType)
  })

  it('leaks no forbidden personal or promotional field', () => {
    const script = renderJsonLdScript()
    const data = JSON.parse(script.textContent ?? '')

    for (const forbidden of [
      'founder',
      'employee',
      'address',
      'telephone',
      'email',
      'openingHours',
      'knowsAbout',
      'slogan',
      'review',
      'aggregateRating',
    ]) {
      expect(data, forbidden).not.toHaveProperty(forbidden)
      expect(script.textContent, forbidden).not.toContain(`"${forbidden}"`)
    }
  })

  it('escapes < in the serialized output so a value can never close the script tag', () => {
    const script = renderJsonLdScript()
    const data = JSON.parse(script.textContent ?? '')
    const escaped = JSON.stringify(data).replace(/</g, '\\u003c')

    expect(script.innerHTML).toBe(escaped)
  })
})
