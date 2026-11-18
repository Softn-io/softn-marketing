// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FOOTER_LINKS } from '@/lib/footerLinks'
import { SITE_ROUTES } from '@/lib/routes'
import { footer } from '@/locales/fr/footer'
import { FooterNav } from '../FooterNav'

afterEach(cleanup)

describe('FooterNav', () => {
  it('renders a navigation landmark named by the locale', () => {
    render(<FooterNav />)

    expect(screen.getByRole('navigation', { name: footer.nav.ariaLabel })).toBeTruthy()
  })

  it('renders one list item per entry, in the copy order, inside a single list', () => {
    render(<FooterNav />)

    const nav = screen.getByRole('navigation', { name: footer.nav.ariaLabel })
    const list = nav.querySelector('ul')
    expect(list).toBeTruthy()
    expect(list?.querySelectorAll('li')).toHaveLength(FOOTER_LINKS.length)
    expect(screen.getAllByRole('link')).toHaveLength(FOOTER_LINKS.length)
  })

  it('renders every entry with its locale label and its href from SITE_ROUTES', () => {
    render(<FooterNav />)

    // The map in lib/footerLinks.ts must read the routes from SITE_ROUTES, not repeat a path.
    expect(FOOTER_LINKS.map((link) => link.href)).toEqual([
      SITE_ROUTES.contact,
      SITE_ROUTES.legalNotice,
      SITE_ROUTES.privacyPolicy,
      SITE_ROUTES.cookiePolicy,
    ])

    const nav = screen.getByRole('navigation', { name: footer.nav.ariaLabel })
    const links = Array.from(nav.querySelectorAll('a'))
    links.forEach((link, index) => {
      const entry = FOOTER_LINKS[index]
      expect(entry).toBeDefined()
      expect(link.getAttribute('href')).toBe(entry?.href)
      expect(link.textContent).toBe(entry?.label)
    })
  })

  it('names every link by its visible text, with no aria-label (WCAG 2.5.3)', () => {
    render(<FooterNav />)

    for (const link of screen.getAllByRole('link')) {
      expect(link.hasAttribute('aria-label')).toBe(false)
      expect(link.textContent?.trim().length ?? 0).toBeGreaterThan(0)
    }
  })

  it('takes the caller class that places it in the footer row', () => {
    render(<FooterNav className="footer-row-nav" />)

    expect(screen.getByRole('navigation', { name: footer.nav.ariaLabel }).className).toContain('footer-row-nav')
  })
})
