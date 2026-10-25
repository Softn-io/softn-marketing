// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { interpolate } from '@/lib/interpolate'
import { comingSoon } from '@/locales/fr/comingSoon'
import { footer } from '@/locales/fr/footer'
import { nav } from '@/locales/fr/hero'
import { ComingSoon } from '../ComingSoon'

vi.mock('@/actions/joinWaitlist', () => ({
  joinWaitlist: vi.fn(async () => ({ ok: true })),
}))

// Vitest rewrites `import.meta.url`, so the folder is resolved from the project root instead.
const comingSoonDirectory = join(process.cwd(), 'components', 'sections', 'ComingSoon')

/** Every string the page is allowed to render, as the locales define them. */
const localeStrings = [
  comingSoon.eyebrow,
  comingSoon.title,
  comingSoon.body,
  comingSoon.bodyInvite,
  comingSoon.form.label,
  comingSoon.form.placeholder,
  comingSoon.form.submit,
  comingSoon.form.submitBusy,
  comingSoon.form.reassurance,
  comingSoon.form.errorEmpty,
  comingSoon.form.errorInvalid,
  comingSoon.form.errorServer,
  comingSoon.form.success,
  comingSoon.form.privacyNotice,
  comingSoon.form.honeypotLabel,
  comingSoon.footer.copyright,
  nav.logo.name,
  nav.logo.suffix,
  nav.logo.ariaLabel,
  nav.themeToggle.toLight,
  nav.themeToggle.toDark,
]

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

describe('ComingSoon', () => {
  it('renders the header wordmark as the home link and the shared theme toggle', () => {
    render(<ComingSoon />)

    const logo = screen.getByRole('link', { name: nav.logo.ariaLabel })
    expect(logo.getAttribute('href')).toBe('/')
    expect(logo.textContent).toBe(`${nav.logo.name}${nav.logo.suffix}`)
    expect(screen.getByRole('button', { name: nav.themeToggle.toLight })).toBeTruthy()
  })

  it('renders a single h1 with the approved title from the locale', () => {
    render(<ComingSoon />)
    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe(comingSoon.title)
  })

  it('renders the eyebrow and both body lines from the locale', () => {
    render(<ComingSoon />)

    expect(screen.getByText(comingSoon.eyebrow)).toBeTruthy()
    expect(screen.getByText(comingSoon.body)).toBeTruthy()
    expect(screen.getByText(comingSoon.bodyInvite)).toBeTruthy()
  })

  it('renders the giant wordmark as decorative text between the eyebrow and the h1', () => {
    const { container } = render(<ComingSoon />)
    const content = container.querySelector('main > div')
    const children = content === null ? [] : Array.from(content.children)
    const decorative = children.filter((child) => child.getAttribute('aria-hidden') === 'true')
    const [wordmark] = decorative

    expect(decorative).toHaveLength(1)
    if (wordmark === undefined) throw new Error('decorative wordmark missing')

    expect(wordmark.tagName).toBe('DIV')
    expect(wordmark.textContent).toBe(`${nav.logo.name}${nav.logo.suffix}`)
    expect(screen.queryByRole('heading', { name: `${nav.logo.name}${nav.logo.suffix}` })).toBeNull()

    const eyebrowIndex = children.findIndex((child) => child.textContent?.includes(comingSoon.eyebrow))
    const wordmarkIndex = children.indexOf(wordmark)
    const headingIndex = children.findIndex((child) => child.tagName === 'H1')
    expect(eyebrowIndex).toBeGreaterThanOrEqual(0)
    expect(wordmarkIndex).toBe(eyebrowIndex + 1)
    expect(headingIndex).toBe(wordmarkIndex + 1)
  })

  it('renders the labelled e-mail form with its reassurance and privacy notice', () => {
    const { container } = render(<ComingSoon />)
    const input = screen.getByLabelText(comingSoon.form.label)

    expect(input.getAttribute('type')).toBe('email')
    expect(input.getAttribute('autocomplete')).toBe('email')
    expect(screen.getByRole('button', { name: comingSoon.form.submit })).toBeTruthy()
    expect(screen.getByText(comingSoon.form.reassurance)).toBeTruthy()
    expect(screen.getByText(comingSoon.form.privacyNotice)).toBeTruthy()
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('keeps the honeypot out of the keyboard flow and away from assistive technology', () => {
    const { container } = render(<ComingSoon />)
    const honeypot = container.querySelector<HTMLInputElement>('input[name="reference"]')

    expect(honeypot?.tabIndex).toBe(-1)
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText(comingSoon.form.honeypotLabel)).toBeTruthy()
  })

  it('renders the footer copyright with the computed year and no dead links', () => {
    render(<ComingSoon />)
    const expected = interpolate(comingSoon.footer.copyright, { year: String(new Date().getFullYear()) })

    expect(screen.getByText(expected)).toBeTruthy()
    expect(screen.queryByRole('link', { name: footer.legal.contact })).toBeNull()
    expect(screen.queryByRole('link', { name: footer.legal.mentions })).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('hides the decorative backdrop from assistive technology', () => {
    const { container } = render(<ComingSoon />)
    const backdrop = container.querySelector('div[aria-hidden="true"]')

    expect(backdrop).not.toBeNull()
    expect(backdrop?.textContent).toBe('')
  })

  it('keeps no copy hardcoded in its own sources', () => {
    const files = readdirSync(comingSoonDirectory, { recursive: true, encoding: 'utf8' }).filter(
      (name) => /\.tsx?$/.test(name) && !name.includes('tests'),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const source = readFileSync(join(comingSoonDirectory, name), 'utf8')
      for (const copy of localeStrings) expect(source, `${name} hardcodes "${copy}"`).not.toContain(copy)
    }
  })
})
