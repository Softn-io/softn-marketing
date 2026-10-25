// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { method } from '@/locales/fr/method'
import { MethodTimeline } from '../MethodTimeline'

/** Caption line of a step, as the design prints it: zero-padded counter, separator, locale label. */
const captionOf = (index: number): string => {
  const label = method.steps[index]?.label
  if (label === undefined) throw new Error(`missing step ${index}`)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(index + 1)} / ${pad(method.steps.length)} — ${label}`
}

/** Step block at an index, with the test failing clearly instead of reading an undefined element. */
const itemAt = (index: number): HTMLElement => {
  const item = screen.getAllByRole('listitem')[index]
  if (item === undefined) throw new Error(`missing step block ${index}`)
  return item
}

afterEach(cleanup)

describe('MethodTimeline', () => {
  it('renders the five steps, in the locale order, as one ordered list', () => {
    render(<MethodTimeline />)
    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(within(list).getAllByRole('listitem')).toHaveLength(method.steps.length)
    method.steps.forEach((step, index) => {
      const text = itemAt(index).textContent ?? ''
      expect(text).toContain(captionOf(index))
      expect(text).toContain(step.title)
      expect(text).toContain(step.text)
    })
  })

  it('numbers every step with a two-digit counter out of five', () => {
    render(<MethodTimeline />)
    expect(itemAt(0).textContent).toContain('01 / 05')
    expect(itemAt(method.steps.length - 1).textContent).toContain('05 / 05')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(
      method.steps.map((_step, index) => captionOf(index)).map((caption) => expect.stringContaining(caption)),
    )
  })

  it('gives every step an h3 with its locale title, between the caption and the text', () => {
    render(<MethodTimeline />)
    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings).toHaveLength(method.steps.length)
    method.steps.forEach((step, index) => {
      expect(itemAt(index).querySelector('h3')?.textContent).toBe(step.title)
    })
    expect(Array.from(itemAt(0).children).map((child) => child.tagName)).toEqual(['P', 'H3', 'P'])
  })

  it('keeps every step text in the paragraph below its title', () => {
    render(<MethodTimeline />)
    method.steps.forEach((step, index) => {
      const text = itemAt(index).querySelector('h3 + p')
      expect(text?.textContent).toBe(step.text)
    })
  })

  it('gives every step the zero-based index the stylesheet turns into a sticky offset', () => {
    render(<MethodTimeline />)
    const indexes = screen.getAllByRole('listitem').map((item) => item.style.getPropertyValue('--method-step-index'))
    expect(indexes).toEqual(method.steps.map((_step, index) => String(index)))
  })

  it('hides the decorative brand dot of every caption from assistive technology', () => {
    const { container } = render(<MethodTimeline />)
    const dots = container.querySelectorAll('li > p > span[aria-hidden="true"]')
    expect(dots).toHaveLength(method.steps.length)
    for (const dot of dots) expect(dot.textContent).toBe('')
  })

  it('holds nothing focusable: the stacking is read-only', () => {
    const { container } = render(<MethodTimeline />)
    expect(container.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)
  })
})
