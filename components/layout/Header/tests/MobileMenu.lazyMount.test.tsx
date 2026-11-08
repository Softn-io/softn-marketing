// @vitest-environment jsdom
/**
 * Lazy-mount behaviour of the burger and its drawer: the burger is a plain
 * server-rendered button that owns the open state, the Base UI drawer arrives through
 * `next/dynamic`, and the drawer subtree is mounted closed on the first intent (hover, press,
 * focus) so the first open does not pay for the chunk load. The drawer module is mocked here:
 * these tests observe the mount boundary only. The drawer's own behaviour (focus trap, Escape,
 * swipe, close-then-act) stays covered in `MobileMenu.test.tsx`, and the cold open over a real
 * (not yet loaded) chunk is covered end to end in `e2e/lazyMount.spec.ts`.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileMenu } from '../MobileMenu'
import { getNavLinks } from '../data/navLinks'

const MENU_LABEL = 'Menu'
const CLOSE_LABEL = 'Fermer'
const CTA_LABEL = 'Réserver'

vi.mock('../MobileMenuDrawer', () => ({
  MobileMenuDrawer: (props: { open: boolean }) => (
    <div data-testid="drawer-mount" data-open={props.open ? 'true' : 'false'} />
  ),
}))

const renderMenu = () =>
  render(<MobileMenu links={getNavLinks()} ctaLabel={CTA_LABEL} menuLabel={MENU_LABEL} closeLabel={CLOSE_LABEL} />)

/** The page burger: query it with `hidden: true`, the way `MobileMenu.test.tsx` does. */
const burger = (): HTMLElement => {
  const trigger = screen
    .getAllByRole('button', { name: MENU_LABEL, hidden: true })
    .find((button) => button.hasAttribute('aria-expanded'))
  if (trigger === undefined) throw new Error('burger not found')
  return trigger
}

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

/** Waits for the mocked drawer to report the open state (the dynamic import resolves asynchronously). */
const waitForMountedOpen = async (): Promise<void> => {
  await screen.findByTestId('drawer-mount')
  await vi.waitFor(() => {
    expect(screen.getByTestId('drawer-mount').getAttribute('data-open')).toBe('true')
  })
}

describe('MobileMenu lazy mount', () => {
  it('ships a server-rendered burger with the label, dialog popup and collapsed state, and mounts no drawer', () => {
    renderMenu()
    const trigger = burger()
    expect(trigger.getAttribute('aria-label')).toBe(MENU_LABEL)
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('drawer-mount')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mounts the drawer closed on the first hover, without opening anything', async () => {
    renderMenu()
    fireEvent.pointerEnter(burger())
    const mount = await screen.findByTestId('drawer-mount')
    expect(mount.getAttribute('data-open')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(burger().getAttribute('aria-expanded')).toBe('false')
  })

  it('mounts the drawer closed on a touch press', async () => {
    renderMenu()
    fireEvent.pointerDown(burger())
    const mount = await screen.findByTestId('drawer-mount')
    expect(mount.getAttribute('data-open')).toBe('false')
  })

  it('mounts the drawer closed when the burger receives keyboard focus', async () => {
    renderMenu()
    fireEvent.focus(burger())
    const mount = await screen.findByTestId('drawer-mount')
    expect(mount.getAttribute('data-open')).toBe('false')
  })

  it('flips aria-expanded at once on a click that lands before the drawer chunk arrives', () => {
    renderMenu()
    // A programmatic click fires no pointer or focus event: no intent preceded it.
    fireEvent.click(burger())
    // The open state lives in the burger, not in the lazy module, so the collapsed/expanded
    // announcement is correct before the drawer even mounts.
    expect(burger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('still opens on that no-intent click once the drawer arrives', async () => {
    renderMenu()
    fireEvent.click(burger())
    await waitForMountedOpen()
    expect(burger().getAttribute('aria-expanded')).toBe('true')
  })

  it('opens immediately when the click follows a hover (the drawer is already mounted)', async () => {
    renderMenu()
    fireEvent.pointerEnter(burger())
    await screen.findByTestId('drawer-mount')
    fireEvent.click(burger())
    await waitForMountedOpen()
  })
})
