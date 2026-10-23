// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { comingSoon } from '@/locales/fr/comingSoon'
import { nav } from '@/locales/fr/hero'
import { ComingSoon } from './ComingSoon'

afterEach(cleanup)

describe('ComingSoon', () => {
  it('renders the shared wordmark, not as a link', () => {
    const { container } = render(<ComingSoon />)
    const logo = screen.getByText(new RegExp(`^${nav.logo.name}`))

    expect(logo.textContent).toBe(`${nav.logo.name}${nav.logo.suffix}`)
    expect(logo.querySelector('span')?.textContent).toBe(nav.logo.suffix)
    expect(container.querySelector('a')).toBeNull()
  })

  it('renders a single h1 with the approved title from the locale', () => {
    render(<ComingSoon />)
    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe(comingSoon.title)
  })

  it('renders the eyebrow and the body copy from the locale', () => {
    render(<ComingSoon />)

    expect(screen.getByText(comingSoon.eyebrow)).toBeTruthy()
    expect(screen.getByText(comingSoon.body)).toBeTruthy()
  })

  it('has no call to action, form or interactive control', () => {
    const { container } = render(<ComingSoon />)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(container.querySelector('form')).toBeNull()
  })

  it('hides the decorative glow from assistive technology', () => {
    const { container } = render(<ComingSoon />)
    const decorative = container.querySelector('[aria-hidden="true"]')

    expect(decorative).not.toBeNull()
    expect(decorative?.textContent).toBe('')
  })
})
