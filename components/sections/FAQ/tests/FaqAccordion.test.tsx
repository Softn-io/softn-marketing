// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { faq } from '@/locales/fr/faq'
import { FaqAccordion } from '../FaqAccordion'

/** Trigger of a question, found by the name its heading gives it. */
const triggerOf = (position: number): HTMLElement => {
  const item = faq.items[position]
  if (item === undefined) throw new Error(`no question at position ${position}`)
  return screen.getByRole('button', { name: item.question })
}

/** Panels in question order, closed ones included: every answer stays mounted. */
const panels = (): readonly HTMLElement[] => screen.getAllByRole('region', { hidden: true })

/** Panel of a question, failing the test rather than the type checker when one is missing. */
const panelAt = (position: number): HTMLElement => {
  const panel = panels()[position]
  if (panel === undefined) throw new Error(`no panel at position ${position}`)
  return panel
}

/** What each trigger announces, in question order. */
const expandedStates = (): readonly boolean[] =>
  faq.items.map((_, position) => triggerOf(position).getAttribute('aria-expanded') === 'true')

/** Whether each panel is out of the layout, in question order. */
const hiddenStates = (): readonly boolean[] => panels().map((panel) => panel.hasAttribute('hidden'))

/** Answers of the whole accordion, in question order. */
const answers = (): readonly string[] => faq.items.map((item) => item.answer)

/** The copy as the server markup writes it: React escapes `&`, `<`, `>` and both quotes in text. */
const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;')

afterEach(cleanup)

describe('FaqAccordion', () => {
  it('writes the answers into the server markup, with only the first panel open', () => {
    const markup = renderToStaticMarkup(<FaqAccordion items={faq.items} />)

    for (const answer of answers()) expect(markup).toContain(escapeHtml(answer))
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1)

    // The closed panels are in the markup, hidden rather than left out. The attribute is
    // matched on its own name: Base UI also marks the collapsed item, heading and trigger `data-hidden`.
    const panelTags = markup.match(/<div\b[^>]*role="region"[^>]*>/g) ?? []
    expect(panelTags).toHaveLength(faq.items.length)
    expect(panelTags.filter((tag) => /(?:^|\s)hidden=/.test(tag))).toHaveLength(faq.items.length - 1)
  })

  it('opens the first panel on load and leaves the others collapsed', () => {
    render(<FaqAccordion items={faq.items} />)

    expect(expandedStates()).toEqual(faq.items.map((_, position) => position === 0))
    expect(hiddenStates()).toEqual(faq.items.map((_, position) => position !== 0))
  })

  it('moves the open panel to the trigger a visitor activates, keeping one panel open', () => {
    render(<FaqAccordion items={faq.items} />)

    fireEvent.click(triggerOf(1))

    expect(expandedStates()).toEqual(faq.items.map((_, position) => position === 1))
    expect(hiddenStates()).toEqual(faq.items.map((_, position) => position !== 1))
    expect(within(panelAt(1)).getByText(answers()[1] ?? '')).toBeTruthy()
  })

  it('closes the open panel when its own trigger is activated again', () => {
    render(<FaqAccordion items={faq.items} />)

    fireEvent.click(triggerOf(0))

    expect(expandedStates()).toEqual(faq.items.map(() => false))
    expect(hiddenStates()).toEqual(faq.items.map(() => true))
  })

  it('keeps the answers in the DOM while their panels are closed', () => {
    render(<FaqAccordion items={faq.items} />)

    for (const answer of answers()) expect(screen.getByText(answer)).toBeTruthy()

    // Closed panels are hidden with `until-found`, the browser-searchable form of `hidden`.
    expect(panels().map((panel) => panel.getAttribute('hidden'))).toEqual(
      faq.items.map((_, position) => (position === 0 ? null : 'until-found')),
    )
  })

  it('names each panel after the trigger that opens it, and points the open trigger at its panel', () => {
    render(<FaqAccordion items={faq.items} />)

    faq.items.forEach((_, position) => {
      expect(panelAt(position).getAttribute('aria-labelledby')).toBe(triggerOf(position).id)
    })

    // Base UI exposes `aria-controls` on a trigger while its panel is open, and drops it once closed.
    expect(triggerOf(0).getAttribute('aria-controls')).toBe(panelAt(0).id)
    expect(triggerOf(1).getAttribute('aria-controls')).toBeNull()
  })

  it('leaves the rows as native buttons and hides the decorative mark from assistive technology', () => {
    const { container } = render(<FaqAccordion items={faq.items} />)

    for (const item of faq.items) {
      const trigger = screen.getByRole('button', { name: item.question })
      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger.getAttribute('type')).toBe('button')
    }

    const marks = Array.from(container.querySelectorAll('svg'))
    expect(marks).toHaveLength(faq.items.length)
    for (const mark of marks) expect(mark.getAttribute('aria-hidden')).toBe('true')
  })
})
