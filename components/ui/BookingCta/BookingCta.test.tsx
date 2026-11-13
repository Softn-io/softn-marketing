// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { ASSISTANT_INTENT_EVENT, ASSISTANT_INTENTS, type AssistantIntentDetail } from '@/lib/assistant/intent'
import { BookingCta } from './BookingCta'

/** Label of the fixture call to action; the real labels come from the callers' locales. */
const LABEL = 'Réserver'

/** Adds the assistant section to the page with its own scroll spy, and returns that spy. */
const addAssistantSection = (): Mock<() => void> => {
  const section = document.createElement('section')
  section.id = SECTION_IDS.agent
  const scrollIntoView = vi.fn<() => void>()
  Object.defineProperty(section, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  document.body.appendChild(section)
  return scrollIntoView
}

describe('BookingCta', () => {
  const listeners: Array<(event: Event) => void> = []

  beforeEach(() => {
    window.history.replaceState(null, '', '/preview')
  })

  afterEach(() => {
    cleanup()
    for (const listener of listeners.splice(0)) window.removeEventListener(ASSISTANT_INTENT_EVENT, listener)
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/')
  })

  const listen = (listener: (event: Event) => void): void => {
    listeners.push(listener)
    window.addEventListener(ASSISTANT_INTENT_EVENT, listener)
  }

  it('links to the assistant section so it works without JavaScript', () => {
    render(<BookingCta>{LABEL}</BookingCta>)
    expect(screen.getByRole('link', { name: LABEL }).getAttribute('href')).toBe(`#${SECTION_IDS.agent}`)
  })

  it('asks for the booking flow and puts the assistant fragment in the URL on a plain click', () => {
    const received = vi.fn()
    listen((event) => received((event as CustomEvent<AssistantIntentDetail>).detail))

    render(<BookingCta>{LABEL}</BookingCta>)
    const notCancelled = fireEvent.click(screen.getByRole('link', { name: LABEL }))

    expect(received).toHaveBeenCalledWith({ intent: ASSISTANT_INTENTS.booking })
    // The component replaces the native fragment navigation with its own, which is what stamps the
    // fragment in the URL here and keeps the click from reloading or losing the section.
    expect(notCancelled).toBe(false)
    expect(window.location.hash).toBe(`#${SECTION_IDS.agent}`)
  })

  it('scrolls the assistant section into view when the fragment already names it, without a history entry', () => {
    window.history.replaceState(null, '', `/preview#${SECTION_IDS.agent}`)
    const scrollIntoView = addAssistantSection()
    const received = vi.fn()
    listen((event) => received((event as CustomEvent<AssistantIntentDetail>).detail))
    const historyLength = window.history.length

    render(<BookingCta>{LABEL}</BookingCta>)
    fireEvent.click(screen.getByRole('link', { name: LABEL }))

    // The browser would see no hash change and stay put: the section is scrolled into view instead,
    // and the booking intent still goes out.
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
    expect(received).toHaveBeenCalledWith({ intent: ASSISTANT_INTENTS.booking })
    expect(window.history.length).toBe(historyLength)
  })

  it('carries the id a caller watches, and none when the caller watches nothing', () => {
    render(<BookingCta id="watched-cta">{LABEL}</BookingCta>)
    expect(screen.getByRole('link', { name: LABEL }).getAttribute('id')).toBe('watched-cta')

    cleanup()
    render(<BookingCta>{LABEL}</BookingCta>)
    expect(screen.getByRole('link', { name: LABEL }).hasAttribute('id')).toBe(false)
  })

  it('lets the caller defer the activation', () => {
    const received = vi.fn()
    listen(() => received())
    let deferred: (() => void) | undefined
    render(<BookingCta onBeforeActivate={(activate) => (deferred = activate)}>{LABEL}</BookingCta>)

    fireEvent.click(screen.getByRole('link', { name: LABEL }))
    expect(received).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')

    deferred?.()
    expect(received).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe(`#${SECTION_IDS.agent}`)
  })

  it('leaves a modified click to the browser, whatever the fragment names', () => {
    window.history.replaceState(null, '', `/preview#${SECTION_IDS.agent}`)
    const scrollIntoView = addAssistantSection()
    const received = vi.fn()
    listen(() => received())

    render(<BookingCta>{LABEL}</BookingCta>)
    const notCancelled = fireEvent.click(screen.getByRole('link', { name: LABEL }), { metaKey: true })

    // A new tab keeps the native link: nothing is prevented, scrolled or asked of the assistant.
    expect(notCancelled).toBe(true)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(received).not.toHaveBeenCalled()
  })

  it('leaves a middle click to the browser', () => {
    render(<BookingCta>{LABEL}</BookingCta>)
    const notCancelled = fireEvent.click(screen.getByRole('link', { name: LABEL }), { button: 1 })

    expect(notCancelled).toBe(true)
    expect(window.location.hash).toBe('')
  })
})
