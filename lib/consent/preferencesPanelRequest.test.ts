// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumePreferencesPanelRequest,
  getPreferencesPanelEverRequestedSnapshot,
  getPreferencesPanelRequestOpener,
  getPreferencesPanelRequestSnapshot,
  rememberPreferencesPanelOpener,
  requestPreferencesPanel,
  resetPreferencesPanelRequest,
  subscribePreferencesPanelRequest,
} from './preferencesPanelRequest'

const createOpener = (): HTMLButtonElement => {
  const opener = document.createElement('button')
  opener.type = 'button'
  document.body.append(opener)
  return opener
}

beforeEach(() => {
  resetPreferencesPanelRequest()
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('preferencesPanelRequest', () => {
  it('starts with no pending request and no opener', () => {
    expect(getPreferencesPanelRequestSnapshot()).toBe(false)
    expect(getPreferencesPanelEverRequestedSnapshot()).toBe(false)
    expect(getPreferencesPanelRequestOpener()).toBeNull()
  })

  it('keeps the "ever requested" flag after the request is consumed', () => {
    requestPreferencesPanel(createOpener())

    consumePreferencesPanelRequest()

    expect(getPreferencesPanelRequestSnapshot()).toBe(false)
    expect(getPreferencesPanelEverRequestedSnapshot()).toBe(true)
  })

  it('records a request and its opener, then notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePreferencesPanelRequest(listener)
    const opener = createOpener()

    requestPreferencesPanel(opener)

    expect(getPreferencesPanelRequestSnapshot()).toBe(true)
    expect(getPreferencesPanelRequestOpener()).toBe(opener)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('clears the request and notifies subscribers once', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePreferencesPanelRequest(listener)
    requestPreferencesPanel(createOpener())

    consumePreferencesPanelRequest()

    expect(getPreferencesPanelRequestSnapshot()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('does not notify when there is no pending request to clear', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePreferencesPanelRequest(listener)

    consumePreferencesPanelRequest()

    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('remembers an opener without notifying subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePreferencesPanelRequest(listener)
    const opener = createOpener()

    rememberPreferencesPanelOpener(opener)

    expect(getPreferencesPanelRequestOpener()).toBe(opener)
    expect(getPreferencesPanelRequestSnapshot()).toBe(false)
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('clears the opener without changing the pending request', () => {
    const opener = createOpener()
    requestPreferencesPanel(opener)

    rememberPreferencesPanelOpener(null)

    expect(getPreferencesPanelRequestOpener()).toBeNull()
    expect(getPreferencesPanelRequestSnapshot()).toBe(true)
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePreferencesPanelRequest(listener)
    unsubscribe()

    requestPreferencesPanel(createOpener())

    expect(listener).not.toHaveBeenCalled()
  })
})
