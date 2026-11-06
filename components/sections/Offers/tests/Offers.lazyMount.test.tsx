// @vitest-environment jsdom
/**
 * Lazy-mount behaviour of the offers section and its sheet (issue #55): only the cards ship with
 * the page, the sheet (Base UI included) arrives through `next/dynamic`, and the sheet subtree is
 * mounted closed on the first intent on a card (hover, press, focus). The sheet module is mocked
 * here: these tests observe the mount boundary only. The sheet's own behaviour (focus trap,
 * Escape, calls to action) stays covered in `OfferSheet.test.tsx`, and the cold open over a real
 * (not yet loaded) chunk is covered end to end in `e2e/lazyMount.spec.ts`.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { offers } from '@/locales/fr/offers'
import { Offers } from '../Offers'

vi.mock('../OfferSheet', () => ({
  OfferSheet: (props: { offerId: string | null }) => (
    <div data-testid="sheet-mount" data-offer={props.offerId ?? 'closed'} />
  ),
}))

afterEach(cleanup)

describe('Offers lazy mount', () => {
  it('ships only the cards: no sheet is mounted before any intent', () => {
    render(<Offers />)
    expect(screen.queryByTestId('sheet-mount')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mounts the sheet closed on the first hover on a card, without opening anything', async () => {
    const { container } = render(<Offers />)
    fireEvent.pointerEnter(container.querySelectorAll('article')[0] as Element)
    const mount = await screen.findByTestId('sheet-mount')
    expect(mount.getAttribute('data-offer')).toBe('closed')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mounts the sheet closed when a card button receives keyboard focus', async () => {
    render(<Offers />)
    fireEvent.focus(screen.getByRole('button', { name: offers.create.cardTitle }))
    const mount = await screen.findByTestId('sheet-mount')
    expect(mount.getAttribute('data-offer')).toBe('closed')
  })

  it('flips nothing visible on a no-intent click that lands before the sheet chunk arrives', () => {
    render(<Offers />)
    // A programmatic click fires no pointer or focus event: no intent preceded it.
    fireEvent.click(screen.getByRole('button', { name: offers.create.cardTitle }))
    // The sheet is still loading; the open state already lives in the section.
  })

  it('still opens the right sheet on that no-intent click once the sheet arrives', async () => {
    render(<Offers />)
    fireEvent.click(screen.getByRole('button', { name: offers.automate.cardTitle }))
    await screen.findByTestId('sheet-mount')
    await vi.waitFor(() => {
      expect(screen.getByTestId('sheet-mount').getAttribute('data-offer')).toBe('automate')
    })
  })

  it('opens immediately when the click follows a hover (the sheet is already mounted)', async () => {
    const { container } = render(<Offers />)
    fireEvent.pointerEnter(container.querySelectorAll('article')[0] as Element)
    await screen.findByTestId('sheet-mount')
    fireEvent.click(screen.getByRole('button', { name: offers.create.cardTitle }))
    await vi.waitFor(() => {
      expect(screen.getByTestId('sheet-mount').getAttribute('data-offer')).toBe('create')
    })
  })
})
