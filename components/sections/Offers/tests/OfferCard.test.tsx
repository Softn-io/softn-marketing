// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { offers } from '@/locales/fr/offers'
import { OfferCard, type OfferId } from '../OfferCard'

const createCard = {
  offerId: 'create',
  tone: 'brand',
  kicker: offers.create.kicker,
  title: offers.create.cardTitle,
  text: offers.create.cardText,
  audiences: offers.create.audiences,
  detailLink: offers.detailLink,
} as const

const automationCard = {
  offerId: 'automate',
  tone: 'warning',
  kicker: offers.automate.kicker,
  title: offers.automate.cardTitle,
  text: offers.automate.cardText,
  audiences: offers.automate.audiences,
  detailLink: offers.detailLink,
} as const

afterEach(cleanup)

describe('OfferCard', () => {
  it.each([createCard, automationCard])('calls onOpen with $offerId on click, Enter and Space', (card) => {
    const onOpen = vi.fn<(offerId: OfferId) => void>()
    render(<OfferCard {...card} onOpen={onOpen} />)
    const button = screen.getByRole('button', { name: card.title })
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(3)
    for (const [received] of onOpen.mock.calls) expect(received).toBe(card.offerId)
  })

  it('does nothing when activated without an onOpen handler', () => {
    render(<OfferCard {...createCard} />)
    const button = screen.getByRole('button', { name: createCard.title })
    expect(() => {
      fireEvent.click(button)
      fireEvent.keyDown(button, { key: 'Enter' })
    }).not.toThrow()
  })

  it('writes the normalized pointer position for the CSS tilt and clears it on leave', () => {
    const { container } = render(<OfferCard {...createCard} />)
    const card = container.querySelector('article')
    if (card === null) throw new Error('card not found')
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    })
    fireEvent.pointerMove(card, { clientX: 50, clientY: 75, pointerType: 'mouse' })
    expect(card.style.getPropertyValue('--offer-pointer-x')).toBe('0.25')
    expect(card.style.getPropertyValue('--offer-pointer-y')).toBe('0.75')
    expect(card.getAttribute('data-tilted')).toBe('true')
    fireEvent.pointerLeave(card)
    expect(card.hasAttribute('data-tilted')).toBe(false)
  })

  it('ignores touch pointers, which scroll the page instead of tilting', () => {
    const { container } = render(<OfferCard {...createCard} />)
    const card = container.querySelector('article')
    if (card === null) throw new Error('card not found')
    fireEvent.pointerMove(card, { clientX: 50, clientY: 75, pointerType: 'touch' })
    expect(card.hasAttribute('data-tilted')).toBe(false)
  })
})
