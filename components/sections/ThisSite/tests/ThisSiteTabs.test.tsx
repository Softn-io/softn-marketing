// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { thisSite } from '@/locales/fr/thisSite'
import { ThisSiteTabs } from '../ThisSiteTabs'
import { ThisSiteTotal } from '../ThisSiteTotal'
import { thisSiteLabels, thisSiteSteps, type ThisSiteStep } from '../data/thisSiteSteps'

/** Id of the heading that names the list; the section owns it and the island only receives it. */
const LABELLED_BY = 'this-site-title'

/** The hover guard the island writes, at the stylesheet's `md` breakpoint. */
const HOVER_SELECTION_QUERY = '(min-width: 48rem) and (hover: hover)'

/** Whether the stub lets the hover guard match: the stacked-layout test turns it off. */
let hoverSelects = true

/** Minimal `matchMedia` stub, in the shape the other islands' tests use: jsdom implements none. */
const stubMatchMedia = (): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === HOVER_SELECTION_QUERY && hoverSelects,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

/** Step at `position`, failing the test rather than the type checker when the copy loses one. */
const stepAt = (position: number): ThisSiteStep => {
  const step = thisSiteSteps[position]
  if (step === undefined) throw new Error(`no step at position ${position}`)
  return step
}

/** Renders the island over the copy's steps. */
const renderTabs = (): void => {
  render(
    <ThisSiteTabs steps={thisSiteSteps} labels={thisSiteLabels} labelledBy={LABELLED_BY} total={<ThisSiteTotal />} />,
  )
}

/** Tab of a step, found by the title that names it (the printed number is decorative). */
const tabOf = (step: ThisSiteStep): HTMLElement => screen.getByRole('tab', { name: step.title })

/** Panels in step order, hidden ones included: every detail stays in the DOM. */
const panels = (): readonly HTMLElement[] => screen.getAllByRole('tabpanel', { hidden: true })

/** Panel of `position`, failing the test when one is missing. */
const panelAt = (position: number): HTMLElement => {
  const panel = panels()[position]
  if (panel === undefined) throw new Error(`no panel at position ${position}`)
  return panel
}

/** Panel of the selected step: the only one Base UI leaves visible. */
const activePanel = (): HTMLElement => screen.getByRole('tabpanel')

/** Description list that holds `value`, failing the test when the rendered detail lost it. */
const descriptionListOf = (value: string): HTMLElement => {
  const list = screen.getByText(value).closest('dl')
  if (list === null) throw new Error(`no description list around "${value}"`)
  return list
}

/**
 * Locale text with its non-breaking spaces turned into regular ones. The text matchers normalize
 * only the element's text, never the string expected of it, so any copy holding `\u00A0` or the
 * narrow `\u202F` is looked up in this normalized form.
 */
const sameText = (value: string): string => value.replace(/[\u00A0\u202F]/g, ' ')

/** Instructions as the detail prints them: the prompt between the locale's quotation marks. */
const quotedPromptOf = (step: ThisSiteStep): string =>
  `${thisSiteLabels.promptQuotes.open}${step.prompt}${thisSiteLabels.promptQuotes.close}`

beforeEach(() => {
  hoverSelects = true
  stubMatchMedia()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ThisSiteTabs', () => {
  it('lists the steps as a vertical tab list, with the first one selected and its detail revealed', () => {
    renderTabs()

    const list = screen.getByRole('tablist')
    expect(list.getAttribute('aria-orientation')).toBe('vertical')
    expect(list.getAttribute('aria-labelledby')).toBe(LABELLED_BY)

    thisSiteSteps.forEach((step) => {
      expect(within(list).getByRole('tab', { name: step.title })).toBeTruthy()
    })

    const first = stepAt(0)
    expect(tabOf(first).getAttribute('aria-selected')).toBe('true')

    const panel = activePanel()
    expect(panel.getAttribute('aria-labelledby')).toBe(tabOf(first).id)
    expect(within(panel).getByRole('heading', { level: 3, name: first.heading })).toBeTruthy()
    expect(within(panel).getByText(sameText(first.body))).toBeTruthy()
    expect(within(panel).getByText(thisSiteLabels.promptLabel)).toBeTruthy()
    expect(within(panel).getByText(sameText(quotedPromptOf(first)))).toBeTruthy()
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((tag) => tag.textContent),
    ).toEqual([...first.tags])
  })

  it('keeps every step detail in the DOM, hidden until its step is selected', () => {
    renderTabs()

    expect(panels().map((panel) => panel.hasAttribute('hidden'))).toEqual([false, true, true, true, true, true])

    // The copy of every step is in the page without any interaction, the last step's technical note
    // included, with its measured values and no placeholder left behind.
    thisSiteSteps.forEach((step, position) => {
      expect(within(panelAt(position)).getByText(sameText(step.body))).toBeTruthy()
    })

    const lastTech = stepAt(5).tech
    expect(within(panelAt(5)).getByText(sameText(lastTech))).toBeTruthy()
    expect(within(panelAt(5)).queryByText(/\{[a-zA-Z]+\}/)).toBeNull()
  })

  it('keeps the total block the section hands over', () => {
    renderTabs()

    expect(screen.getByText(thisSite.totalLabel)).toBeTruthy()
  })

  it('reveals the step a hovering pointer enters, in the two-column layout', () => {
    renderTabs()

    const second = stepAt(1)
    fireEvent.pointerEnter(tabOf(second))

    expect(tabOf(second).getAttribute('aria-selected')).toBe('true')
    expect(within(activePanel()).getByRole('heading', { level: 3, name: second.heading })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 3, name: stepAt(0).heading })).toBeNull()
  })

  it('leaves the selection alone on hover while the list is stacked above the detail', () => {
    hoverSelects = false
    renderTabs()

    const second = stepAt(1)
    fireEvent.pointerEnter(tabOf(second))

    expect(tabOf(second).getAttribute('aria-selected')).toBe('false')
    expect(tabOf(stepAt(0)).getAttribute('aria-selected')).toBe('true')
    expect(within(activePanel()).getByText(sameText(stepAt(0).body))).toBeTruthy()

    // A click selects everywhere, whatever the layout.
    fireEvent.click(tabOf(second))
    expect(tabOf(second).getAttribute('aria-selected')).toBe('true')
  })

  it('keeps exactly one detail exposed after a hover, the five others mounted and hidden', () => {
    renderTabs()

    const third = stepAt(2)
    fireEvent.pointerEnter(tabOf(third))

    expect(tabOf(third).getAttribute('aria-selected')).toBe('true')
    // The panel that was left settles on Base UI's `hidden` in the same task: the stylesheet still
    // reserves its place in the piled-up detail cell, so nothing resizes between the two states.
    expect(panels().map((panel) => panel.hasAttribute('hidden'))).toEqual([true, true, false, true, true, true])
    expect(panelAt(2).hasAttribute('inert')).toBe(false)
  })

  it('reveals the step a tap selects', () => {
    renderTabs()

    const third = stepAt(2)
    fireEvent.click(tabOf(third))

    expect(tabOf(third).getAttribute('aria-selected')).toBe('true')
    expect(within(activePanel()).getByText(sameText(third.body))).toBeTruthy()
  })

  it('moves through the steps with the arrow keys, revealing the one focus lands on', async () => {
    renderTabs()

    const first = tabOf(stepAt(0))
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    const second = stepAt(1)
    // The roving focus moves in a microtask, after the key event has been handled.
    await waitFor(() => {
      expect(document.activeElement).toBe(tabOf(second))
    })

    expect(tabOf(second).getAttribute('aria-selected')).toBe('true')
    expect(within(activePanel()).getByText(sameText(second.body))).toBeTruthy()
  })

  it('writes the measured time as two labelled rows, and nothing when the step has none', () => {
    renderTabs()

    const third = stepAt(2)
    const durations = third.durations
    if (durations === undefined) throw new Error('the third step lost its measured time')
    fireEvent.click(tabOf(third))

    const measured = descriptionListOf(sameText(durations.mel))
    expect(within(measured).getByText(thisSiteLabels.durationMelLabel)).toBeTruthy()
    expect(within(measured).getByText(thisSiteLabels.durationAgentsLabel)).toBeTruthy()
    expect(within(measured).getByText(sameText(durations.agents))).toBeTruthy()

    fireEvent.click(tabOf(stepAt(0)))
    expect(within(activePanel()).queryByText(thisSiteLabels.durationMelLabel)).toBeNull()
    expect(activePanel().querySelector('dl')).toBeNull()
  })

  it('hides the technical block on the steps whose copy has none, and shows it with its slots on the last one', () => {
    renderTabs()

    const third = stepAt(2)
    fireEvent.click(tabOf(third))
    expect(within(activePanel()).getByText(thisSiteLabels.techLabel)).toBeTruthy()
    expect(within(activePanel()).getByText(sameText(third.tech))).toBeTruthy()

    fireEvent.click(tabOf(stepAt(3)))
    expect(within(activePanel()).queryByText(thisSiteLabels.techLabel)).toBeNull()

    const last = stepAt(5)
    fireEvent.click(tabOf(last))
    expect(within(activePanel()).getByText(sameText(last.tech))).toBeTruthy()
    // The measured values are written into the copy: no placeholder reaches the visitor.
    expect(within(activePanel()).queryByText(/\{[a-zA-Z]+\}/)).toBeNull()
  })
})
