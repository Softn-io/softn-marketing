// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT_INTENTS, ASSISTANT_INTENT_EVENT, dispatchAssistantIntent } from './intent'

describe('dispatchAssistantIntent', () => {
  const listeners: Array<(event: Event) => void> = []

  afterEach(() => {
    for (const listener of listeners.splice(0)) window.removeEventListener(ASSISTANT_INTENT_EVENT, listener)
  })

  const listen = (listener: (event: Event) => void): void => {
    listeners.push(listener)
    window.addEventListener(ASSISTANT_INTENT_EVENT, listener)
  }

  it('is named assistant-intent', () => {
    expect(ASSISTANT_INTENT_EVENT).toBe('assistant-intent')
  })

  it('passes the intent in the event detail', () => {
    const received = vi.fn()
    listen((event) => received((event as CustomEvent).detail))
    dispatchAssistantIntent(ASSISTANT_INTENTS.booking)
    expect(received).toHaveBeenCalledWith({ intent: 'booking' })
  })

  it('is fire-and-forget: nothing is thrown when no listener is mounted', () => {
    expect(() => dispatchAssistantIntent(ASSISTANT_INTENTS.booking)).not.toThrow()
  })
})
