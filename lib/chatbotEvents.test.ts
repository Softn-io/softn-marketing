// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OPEN_CHATBOT_EVENT, dispatchOpenChatbot } from './chatbotEvents'

describe('dispatchOpenChatbot', () => {
  const listeners: Array<(event: Event) => void> = []

  afterEach(() => {
    for (const listener of listeners.splice(0)) window.removeEventListener(OPEN_CHATBOT_EVENT, listener)
  })

  const listen = (listener: (event: Event) => void): void => {
    listeners.push(listener)
    window.addEventListener(OPEN_CHATBOT_EVENT, listener)
  }

  it('returns false when no listener claims the event', () => {
    expect(dispatchOpenChatbot({ source: 'header' })).toBe(false)
  })

  it('returns true when a listener calls preventDefault', () => {
    listen((event) => event.preventDefault())
    expect(dispatchOpenChatbot({ source: 'header' })).toBe(true)
  })

  it('passes the source in the event detail', () => {
    const received = vi.fn()
    listen((event) => received((event as CustomEvent).detail))
    dispatchOpenChatbot({ source: 'header' })
    expect(received).toHaveBeenCalledWith({ source: 'header' })
  })
})
