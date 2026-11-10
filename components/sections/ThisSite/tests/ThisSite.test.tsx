// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { thisSite } from '@/locales/fr/thisSite'
import { ThisSite } from '../ThisSite'

afterEach(cleanup)

/**
 * Locale text with its non-breaking spaces turned into regular ones. The text matchers normalize
 * only the element's text, never the string expected of it, so any copy holding `\u00A0` is looked
 * up in this normalized form.
 */
const sameText = (value: string): string => value.replaceAll('\u00A0', ' ')

/** Description list that holds `value`, failing the test when the rendered tree lost it. */
const descriptionListOf = (value: string): HTMLElement => {
  const list = screen.getByText(value).closest('dl')
  if (list === null) throw new Error(`no description list around "${value}"`)
  return list
}

describe('ThisSite section', () => {
  it('is anchored where the header navigation points, and named by its single h2', () => {
    render(<ThisSite />)

    const section = screen.getByRole('region', { name: thisSite.title })
    expect(section.id).toBe(SECTION_IDS.thisSite)
    expect(within(section).getAllByRole('heading', { level: 2 })).toHaveLength(1)
    expect(within(section).getByText(thisSite.eyebrow)).toBeTruthy()
  })

  it('carries the interaction hint in its mouse, touch and keyboard wordings', () => {
    render(<ThisSite />)

    expect(screen.getByText(thisSite.intro)).toBeTruthy()
    expect(screen.getByText(thisSite.introTouch)).toBeTruthy()
    expect(screen.getByText(thisSite.introKeyboard)).toBeTruthy()
  })

  it('shows the measured total with the shared labels, its scope and the origin of the figures', () => {
    render(<ThisSite />)

    expect(screen.getByText(thisSite.totalLabel)).toBeTruthy()
    expect(screen.getByText(thisSite.totalScope)).toBeTruthy()
    expect(screen.getByText(thisSite.durationNote)).toBeTruthy()

    const total = descriptionListOf(sameText(thisSite.total.mel))
    expect(Array.from(total.querySelectorAll('dt')).map((term) => term.textContent)).toEqual([
      thisSite.durationMelLabel,
      thisSite.durationAgentsLabel,
    ])
    expect(Array.from(total.querySelectorAll('dd')).map((value) => value.textContent)).toEqual([
      thisSite.total.mel,
      thisSite.total.agents,
    ])
  })
})
