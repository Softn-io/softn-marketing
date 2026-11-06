// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { ASSISTANT_INTENTS, ASSISTANT_INTENT_EVENT, type AssistantIntentDetail } from '@/lib/assistant/intent'
import { BookingCta } from '../BookingCta'

describe('BookingCta', () => {
  const listeners: Array<(event: Event) => void> = []

  beforeEach(() => {
    window.history.replaceState(null, '', '/preview')
  })

  afterEach(() => {
    cleanup()
    for (const listener of listeners.splice(0)) window.removeEventListener(ASSISTANT_INTENT_EVENT, listener)
  })

  const listen = (listener: (event: Event) => void): void => {
    listeners.push(listener)
    window.addEventListener(ASSISTANT_INTENT_EVENT, listener)
  }

  it('links to the assistant section so it works without JavaScript', () => {
    render(<BookingCta>Réserver</BookingCta>)
    expect(screen.getByRole('link', { name: 'Réserver' }).getAttribute('href')).toBe(`#${SECTION_IDS.agent}`)
  })

  it('dispatches the booking intent on click', () => {
    const received = vi.fn()
    listen((event) => received((event as CustomEvent<AssistantIntentDetail>).detail))
    render(<BookingCta>Réserver</BookingCta>)
    fireEvent.click(screen.getByRole('link', { name: 'Réserver' }))
    expect(received).toHaveBeenCalledWith({ intent: ASSISTANT_INTENTS.booking })
  })

  it('sets the fragment to the assistant section on click', () => {
    render(<BookingCta>Réserver</BookingCta>)
    fireEvent.click(screen.getByRole('link', { name: 'Réserver' }))
    expect(window.location.hash).toBe(`#${SECTION_IDS.agent}`)
  })

  it('scrolls the section into view when the fragment already names it', () => {
    window.history.replaceState(null, '', `/preview#${SECTION_IDS.agent}`)
    const section = document.createElement('section')
    section.id = SECTION_IDS.agent
    const scrollIntoView = vi.fn<() => void>()
    Object.defineProperty(section, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    document.body.appendChild(section)
    const historyLength = window.history.length
    render(<BookingCta>Réserver</BookingCta>)
    fireEvent.click(screen.getByRole('link', { name: 'Réserver' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
    expect(window.history.length).toBe(historyLength)
  })

  it('lets the caller defer the activation', () => {
    const received = vi.fn()
    listen(() => received())
    let deferred: (() => void) | undefined
    render(<BookingCta onBeforeActivate={(activate) => (deferred = activate)}>Réserver</BookingCta>)
    fireEvent.click(screen.getByRole('link', { name: 'Réserver' }))
    expect(received).not.toHaveBeenCalled()
    deferred?.()
    expect(received).toHaveBeenCalledTimes(1)
  })
})
