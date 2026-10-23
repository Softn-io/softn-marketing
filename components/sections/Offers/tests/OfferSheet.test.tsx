// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ASSISTANT_INTENT_EVENT } from '@/lib/assistant/intent'
import { SECTION_IDS } from '@/lib/anchors'
import { interpolate } from '@/lib/interpolate'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { offers } from '@/locales/fr/offers'
import { Offers } from '../Offers'

const OFFERS = [offers.create, offers.automate] as const

const renderOffers = () => render(<Offers />)

const openSheet = async (offer: (typeof OFFERS)[number]) => {
  const card = screen.getByRole('button', { name: offer.cardTitle })
  fireEvent.click(card)
  const dialog = await screen.findByRole('dialog', { name: offer.sheet.title })
  return { card, dialog }
}

beforeEach(() => {
  window.location.hash = ''
})

afterEach(cleanup)

describe('Offer sheet', () => {
  it.each(OFFERS)('opens the $cardTitle sheet from its card with every section', async (offer) => {
    renderOffers()
    const { dialog } = await openSheet(offer)
    const sheet = offer.sheet
    const scope = within(dialog)

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe(scope.getByRole('heading', { level: 2 }).id)
    expect(dialog.getAttribute('aria-describedby')).toBe(scope.getByText(sheet.intro).id)

    const title = scope.getByRole('heading', { level: 2, name: sheet.title })
    expect(title.tagName).toBe('H2')
    expect(scope.getByText(sheet.intro)).toBeTruthy()

    expect(scope.getByRole('heading', { level: 3, name: sheet.gainsLabel })).toBeTruthy()
    for (const item of sheet.items) {
      expect(scope.getByText(item.title)).toBeTruthy()
      expect(scope.getByText(item.text)).toBeTruthy()
    }

    expect(scope.getByRole('heading', { level: 3, name: sheet.phasesLabel })).toBeTruthy()
    const phases = scope.getAllByRole('listitem').filter((item) => item.closest('ol') !== null)
    expect(phases).toHaveLength(sheet.phases.length)
    sheet.phases.forEach((phase, index) => {
      expect(scope.getByText(phase)).toBeTruthy()
      expect(phases[index]?.textContent).toContain(String(index + 1).padStart(2, '0'))
    })

    expect(scope.getByRole('heading', { level: 3, name: sheet.whoLabel })).toBeTruthy()
    expect(scope.getByText(sheet.who)).toBeTruthy()

    const primary = scope.getByRole('link', { name: sheet.cta.primary })
    const secondaryLabel = interpolate(sheet.cta.secondary, { assistantName: ASSISTANT_NAME })
    const secondary = scope.getByRole('link', { name: secondaryLabel })
    expect(primary.getAttribute('href')).toBe(`#${SECTION_IDS.agent}`)
    expect(secondary.getAttribute('href')).toBe(`#${SECTION_IDS.agent}`)
    expect(scope.getByRole('button', { name: offers.sheetCloseLabel })).toBeTruthy()
  })

  it('closes on Escape', async () => {
    renderOffers()
    const { dialog } = await openSheet(offers.create)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on the icon-only close control named by the locale', async () => {
    renderOffers()
    const { dialog } = await openSheet(offers.create)
    fireEvent.click(within(dialog).getByRole('button', { name: offers.sheetCloseLabel }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('returns focus to the card that opened the sheet, even when the click did not focus it', async () => {
    renderOffers()
    const card = screen.getByRole('button', { name: offers.automate.cardTitle })
    fireEvent.click(card)
    const dialog = await screen.findByRole('dialog', { name: offers.automate.sheet.title })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(card))
  })

  it('keeps focus inside the sheet when tabbing past its last control', async () => {
    renderOffers()
    const { dialog } = await openSheet(offers.create)
    const guards = Array.from(document.querySelectorAll<HTMLElement>('[data-type="inside"]'))
    expect(guards.length).toBeGreaterThan(0)
    const afterGuard = guards[guards.length - 1]
    if (afterGuard === undefined) throw new Error('focus guard not found')
    afterGuard.focus()
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })

  it('closes the sheet and follows a call to action to the assistant section', async () => {
    renderOffers()
    const { dialog } = await openSheet(offers.create)
    fireEvent.click(within(dialog).getByRole('link', { name: offers.create.sheet.cta.primary }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(window.location.hash).toBe(`#${SECTION_IDS.agent}`))
  })

  it('the primary call to action dispatches the booking intent for the assistant', async () => {
    renderOffers()
    const intents: string[] = []
    window.addEventListener(ASSISTANT_INTENT_EVENT, (event) => {
      intents.push(event.detail.intent)
    })
    const { dialog } = await openSheet(offers.create)
    fireEvent.click(within(dialog).getByRole('link', { name: offers.create.sheet.cta.primary }))
    await waitFor(() => expect(window.location.hash).toBe(`#${SECTION_IDS.agent}`))
    expect(intents).toEqual(['booking'])
  })

  it('the secondary call to action navigates without dispatching any intent', async () => {
    renderOffers()
    const intents: string[] = []
    window.addEventListener(ASSISTANT_INTENT_EVENT, (event) => {
      intents.push(event.detail.intent)
    })
    const { dialog } = await openSheet(offers.automate)
    const secondaryLabel = interpolate(offers.automate.sheet.cta.secondary, { assistantName: ASSISTANT_NAME })
    fireEvent.click(within(dialog).getByRole('link', { name: secondaryLabel }))
    await waitFor(() => expect(window.location.hash).toBe(`#${SECTION_IDS.agent}`))
    expect(intents).toEqual([])
  })
})
