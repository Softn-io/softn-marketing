// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { footer } from '@/locales/fr/footer'
import { interpolate } from '@/lib/interpolate'
import { nav } from '@/locales/fr/hero'
import { Footer } from '../Footer'

afterEach(cleanup)

describe('Footer', () => {
  it('renders the footer landmark with the wordmark as a link home', () => {
    render(<Footer />)

    expect(screen.getByRole('contentinfo')).toBeTruthy()
    const wordmark = screen.getByRole('link', { name: nav.logo.ariaLabel })
    expect(wordmark.getAttribute('href')).toBe('/')
    expect(wordmark.textContent).toBe(`${nav.logo.name}${nav.logo.suffix}`)
  })

  it('renders the copyright with the year interpolated at render time', () => {
    render(<Footer />)
    const expected = interpolate(footer.copyright, { year: String(new Date().getFullYear()) })

    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('renders the shared footer navigation inside the landmark', () => {
    render(<Footer />)

    const nav = screen.getByRole('navigation', { name: footer.nav.ariaLabel })
    expect(nav.closest('footer')).toBeTruthy()
    // One link per footer entry, plus the wordmark: the cookie-settings control is a button.
    expect(nav.querySelectorAll('a')).toHaveLength(4)
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('renders the cookie-settings control as a button next to the footer links', () => {
    render(<Footer />)

    const nav = screen.getByRole('navigation', { name: footer.nav.ariaLabel })
    const button = screen.getByRole('button', { name: footer.cookieSettings })
    expect(button.getAttribute('type')).toBe('button')
    expect(nav.contains(button)).toBe(true)
  })
})
