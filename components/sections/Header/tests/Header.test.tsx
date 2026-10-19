// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { nav } from '@/locales/fr/hero'
import { interpolate } from '@/lib/interpolate'
import { Header } from '../Header'

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Header', () => {
  it('renders the skip link to #main as the first focusable element', () => {
    render(<Header />)
    const skipLink = screen.getByRole('link', { name: nav.skipLink })
    expect(skipLink.getAttribute('href')).toBe('#main')
    const firstFocusable = document.body.querySelector('a[href], button')
    expect(firstFocusable).toBe(skipLink)
  })

  it('renders the logo link with its accessible name, pointing to the home page', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: nav.logo.ariaLabel }).getAttribute('href')).toBe('/')
  })

  it('renders the five section links with French topic anchors and the assistant name interpolated', () => {
    render(<Header />)
    const navigation = screen.getByRole('navigation', { name: nav.ariaLabel })
    const links = within(navigation).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#services',
      '#methode',
      '#assistant',
      '#coulisses',
      '#faq',
    ])
    expect(links.map((link) => link.textContent)).toEqual([
      nav.items.offers,
      nav.items.method,
      interpolate(nav.items.agent, { assistantName: ASSISTANT_NAME }),
      nav.items.thisSite,
      nav.items.faq,
    ])
  })

  it('gives each link an accessible name starting with its visible text', () => {
    render(<Header />)
    const navigation = screen.getByRole('navigation', { name: nav.ariaLabel })
    const links = within(navigation).getAllByRole('link')
    const assistantName = { assistantName: ASSISTANT_NAME }
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      nav.itemsAria.offers,
      nav.itemsAria.method,
      interpolate(nav.itemsAria.agent, assistantName),
      nav.itemsAria.thisSite,
      nav.itemsAria.faq,
    ])
    links.forEach((link) => {
      expect(link.getAttribute('aria-label')?.startsWith(link.textContent ?? '')).toBe(true)
    })
    expect(document.querySelector(`header a[href="#reservation"]`)?.hasAttribute('aria-label')).toBe(false)
  })

  it('keeps the navigation landmark name distinct from the burger menu name', () => {
    expect(nav.ariaLabel).not.toBe(nav.menu.ariaLabel)
  })

  it('switches between burger and desktop navigation at the lg breakpoint', () => {
    render(<Header />)
    const navigation = screen.getByRole('navigation', { name: nav.ariaLabel })
    expect(navigation.className).toContain('lg:block')
    expect(navigation.className).not.toContain('md:')
    expect(screen.getByRole('button', { name: nav.menu.ariaLabel }).className).toContain('lg:hidden')
  })

  it('renders the booking call to action as a #reservation link', () => {
    render(<Header />)
    const cta = document.querySelector(`header a[href="#reservation"]`)
    expect(cta).not.toBeNull()
  })

  it('renders a short and a full CTA wording toggled at the xl breakpoint', () => {
    render(<Header />)
    const cta = document.querySelector(`header a[href="#reservation"]`)
    const spans = Array.from(cta?.querySelectorAll('span') ?? [])
    expect(spans.map((span) => span.textContent)).toEqual([nav.ctaShort, nav.cta])
    expect(spans[0]?.className).toContain('xl:hidden')
    expect(spans[1]?.className).toContain('hidden')
    expect(spans[1]?.className).toContain('xl:inline')
  })

  it('renders the theme toggle and the burger button', () => {
    render(<Header />)
    expect(screen.getByRole('button', { name: nav.themeToggle.toLight })).toBeTruthy()
    expect(screen.getByRole('button', { name: nav.menu.ariaLabel }).getAttribute('aria-expanded')).toBe('false')
  })
})
