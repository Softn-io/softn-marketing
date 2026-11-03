// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nav } from '@/locales/fr/hero'
import { minimalHeader } from '@/locales/fr/minimalHeader'
import { MinimalHeader } from './MinimalHeader'

/** Accessible name of the back link: the arrow of the visible text, then the label. */
const BACK_LINK_NAME = `← ${minimalHeader.backLink.label}`

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  // ThemeToggle reads the system preference on mount: jsdom implements no matchMedia.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MinimalHeader', () => {
  it('renders the header landmark with the logo as a link home', () => {
    render(<MinimalHeader />)

    expect(screen.getByRole('banner')).toBeTruthy()
    const logo = screen.getByRole('link', { name: nav.logo.ariaLabel })
    expect(logo.getAttribute('href')).toBe('/')
    expect(logo.textContent).toBe(`${nav.logo.name}${nav.logo.suffix}`)
  })

  it('names the back link by its visible text, with no aria-label (WCAG 2.5.3)', () => {
    render(<MinimalHeader />)

    const backLink = screen.getByRole('link', { name: BACK_LINK_NAME })
    expect(backLink.getAttribute('href')).toBe('/')
    expect(backLink.hasAttribute('aria-label')).toBe(false)
  })

  it('keeps the theme toggle of the site', () => {
    render(<MinimalHeader />)

    expect(screen.getByRole('button', { name: nav.themeToggle.toLight })).toBeTruthy()
  })
})
