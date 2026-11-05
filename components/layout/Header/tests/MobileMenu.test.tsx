// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT_INTENTS, ASSISTANT_INTENT_EVENT, type AssistantIntentDetail } from '@/lib/assistant/intent'
import { MobileMenu } from '../MobileMenu'
import { getNavLinks } from '../data/navLinks'

const MENU_LABEL = 'Menu'
const CLOSE_LABEL = 'Fermer'
const CTA_LABEL = 'Réserver'

const renderMenu = () =>
  render(<MobileMenu links={getNavLinks()} ctaLabel={CTA_LABEL} menuLabel={MENU_LABEL} closeLabel={CLOSE_LABEL} />)

/** The page burger: while the modal drawer is open it is inert, so query it with `hidden: true`. */
const burger = (): HTMLElement =>
  screen
    .getAllByRole('button', { name: MENU_LABEL, hidden: true })
    .find((button) => button.hasAttribute('aria-expanded')) as HTMLElement

const closeButton = (dialog: HTMLElement): HTMLElement => {
  const button = dialog.querySelector<HTMLElement>(`button[aria-label="${CLOSE_LABEL}"]`)
  if (button === null) throw new Error('close control not found')
  return button
}

beforeEach(() => {
  window.location.hash = ''
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

describe('MobileMenu', () => {
  it('closes the drawer when the lg media query starts matching', async () => {
    document.documentElement.style.setProperty('--softn-breakpoint-lg', '64rem')
    let onChange: (() => void) | undefined
    const media = {
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const matchMedia = vi.fn().mockImplementation((query: string) => {
      if (query !== '(min-width: 64rem)') return { ...media, matches: false }
      return {
        ...media,
        get matches() {
          return media.matches
        },
        addEventListener: (_type: string, listener: () => void) => {
          onChange = listener
        },
      }
    })
    vi.stubGlobal('matchMedia', matchMedia)
    renderMenu()
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 64rem)')
    fireEvent.click(burger())
    await screen.findByRole('dialog', { name: MENU_LABEL })
    media.matches = true
    act(() => onChange?.())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    document.documentElement.style.removeProperty('--softn-breakpoint-lg')
  })

  it('starts closed with a collapsed burger and no dialog', () => {
    renderMenu()
    expect(burger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the labelled drawer with the five links and the CTA', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog', { name: MENU_LABEL })
    expect(burger().getAttribute('aria-expanded')).toBe('true')
    const hrefs = Array.from(dialog.querySelectorAll('nav a')).map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(['#services', '#methode', '#assistant', '#coulisses', '#faq'])
    dialog.querySelectorAll('nav a').forEach((link) => {
      const label = link.getAttribute('aria-label')
      expect(label).not.toBeNull()
      expect(label?.startsWith(link.textContent ?? '')).toBe(true)
    })
    const cta = within(dialog).getByRole('link', { name: CTA_LABEL })
    expect(cta.getAttribute('href')).toBe('#assistant')
    expect(cta.hasAttribute('aria-label')).toBe(false)
    expect(cta.textContent).toBe(CTA_LABEL)
  })

  it('puts the close control, logo and theme toggle inside the dialog and focuses the close control', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog', { name: MENU_LABEL })
    expect(dialog.querySelector(`a[href="/"]`)).not.toBeNull()
    expect(closeButton(dialog).getAttribute('aria-label')).toBe(CLOSE_LABEL)
    await waitFor(() => expect(document.activeElement).toBe(closeButton(dialog)))
  })

  it('closes when the in-popup close control is pressed', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(closeButton(dialog))
    await waitFor(() => expect(burger().getAttribute('aria-expanded')).toBe('false'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on Escape', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(burger().getAttribute('aria-expanded')).toBe('false'))
  })

  it('returns focus to the burger after Escape', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(burger()))
  })

  it('closes the drawer then scrolls to the section when a link is activated', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog')
    const link = dialog.querySelector(`a[href="#methode"]`)
    expect(link).not.toBeNull()
    fireEvent.click(link as Element)
    await waitFor(() => expect(burger().getAttribute('aria-expanded')).toBe('false'))
    await waitFor(() => expect(window.location.hash).toBe('#methode'))
  })

  it('closes the drawer then dispatches the booking intent from the CTA', async () => {
    const received = vi.fn()
    const listener = (event: Event) => received((event as CustomEvent<AssistantIntentDetail>).detail)
    window.addEventListener(ASSISTANT_INTENT_EVENT, listener)
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('link', { name: CTA_LABEL }))
    await waitFor(() => expect(received).toHaveBeenCalledWith({ intent: ASSISTANT_INTENTS.booking }))
    expect(burger().getAttribute('aria-expanded')).toBe('false')
    expect(window.location.hash).toBe('#assistant')
    window.removeEventListener(ASSISTANT_INTENT_EVENT, listener)
  })

  it('closes the drawer then sets the fragment to the assistant section from the CTA', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('link', { name: CTA_LABEL }))
    await waitFor(() => expect(window.location.hash).toBe('#assistant'))
    expect(burger().getAttribute('aria-expanded')).toBe('false')
  })

  it('renders a decorative handle with no text and no accessible role', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog', { name: MENU_LABEL })
    const handle = dialog.querySelector<HTMLElement>('[aria-hidden="true"] > span')?.parentElement
    expect(handle).not.toBeNull()
    expect(handle?.getAttribute('aria-hidden')).toBe('true')
    expect(handle?.textContent).toBe('')
    expect(handle?.querySelector('a, button, [tabindex]')).toBeNull()
  })

  it('marks the links and the CTA as swipe-ignored but not the top row or the handle', async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole('dialog', { name: MENU_LABEL })
    const ignore = (element: Element | null): boolean => element?.closest('[data-base-ui-swipe-ignore]') != null
    expect(ignore(dialog.querySelector(`nav a[href="#services"]`))).toBe(true)
    expect(ignore(within(dialog).getByRole('link', { name: CTA_LABEL }))).toBe(true)
    expect(ignore(closeButton(dialog))).toBe(false)
    expect(ignore(dialog.querySelector(`a[href="/"]`))).toBe(false)
    expect(ignore(dialog.querySelector('[aria-hidden="true"] > span'))).toBe(false)
  })
})
