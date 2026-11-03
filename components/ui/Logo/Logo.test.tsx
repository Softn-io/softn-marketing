// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { nav } from '@/locales/fr/hero'
import { Logo } from './Logo'
import styles from './Logo.module.css'

afterEach(cleanup)

/** The wordmark element: the one span whose own text is the site name. */
const wordmark = (): HTMLElement => screen.getByText(nav.logo.name)

describe('Logo', () => {
  it('renders the site name, then its suffix, from the locale', () => {
    const { container } = render(<Logo />)
    const element = container.firstElementChild

    expect(element?.textContent).toBe(`${nav.logo.name}${nav.logo.suffix}`)
    expect(element?.firstChild?.textContent).toBe(nav.logo.name)
  })

  it('paints the suffix in the brand vivid colour', () => {
    const { container } = render(<Logo />)
    const suffix = container.querySelector('span > span')

    expect(suffix?.textContent).toBe(nav.logo.suffix)
    expect(suffix?.className).toBe('text-brand-vivid')
  })

  it('owns the typography of the default `md` size: display face, type step and name colour', () => {
    render(<Logo />)
    const classes = wordmark().className

    expect(classes).toContain(styles.wordmark)
    expect(classes).toContain('font-display')
    expect(classes).toContain('text-title-md')
    expect(classes).toContain('text-foreground')
  })

  it('takes the `hero` size for the large decorative wordmark', () => {
    render(<Logo size="hero" />)
    const classes = wordmark().className

    expect(classes).toContain(styles.hero)
    expect(classes).not.toContain('text-title-md')
  })

  it('adds the caller classes that place it in the layout', () => {
    render(<Logo className="mt-4 self-start" />)

    expect(wordmark().className).toContain('mt-4')
    expect(wordmark().className).toContain('self-start')
  })

  it('renders one block-level span, so the font of the element it sits in cannot move it', () => {
    const { container } = render(<Logo />)

    expect(container.children).toHaveLength(1)
    const element = container.firstElementChild
    expect(element?.tagName).toBe('SPAN')
    expect(element?.className).toContain(styles.wordmark)
  })

  it('renders no link and no other control: the caller owns the interaction', () => {
    render(<Logo />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
