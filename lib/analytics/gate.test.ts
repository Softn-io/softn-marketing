import { describe, expect, it, vi } from 'vitest'
import { CONSENT_SCHEMA_VERSION, type ConsentRecord } from '@/lib/consent'
import { createConsentGate } from './gate'

const granted: ConsentRecord = {
  version: CONSENT_SCHEMA_VERSION,
  audience: true,
  decidedAt: new Date().toISOString(),
}

const refused: ConsentRecord = {
  version: CONSENT_SCHEMA_VERSION,
  audience: false,
  decidedAt: new Date().toISOString(),
}

describe('createConsentGate', () => {
  it('does not run a loader before a choice is read', () => {
    const gate = createConsentGate(() => null)
    const loader = vi.fn()

    gate.register(loader)

    expect(loader).not.toHaveBeenCalled()
  })

  it('does not run a loader when the audience consent is refused', () => {
    const gate = createConsentGate(() => refused)
    const loader = vi.fn()

    gate.register(loader)

    expect(loader).not.toHaveBeenCalled()
  })

  it('runs a loader registered after the audience consent is granted', () => {
    const gate = createConsentGate(() => granted)
    const loader = vi.fn()

    gate.register(loader)

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('runs a loader registered before the grant when the gate runs with a granted record', () => {
    const gate = createConsentGate(() => null)
    const loader = vi.fn()

    gate.register(loader)
    gate.run(granted)

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('runs each loader at most once', () => {
    const gate = createConsentGate(() => granted)
    const loader = vi.fn()

    gate.register(loader)
    gate.run(granted)
    gate.run(granted)

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('keeps running the next loader when one throws', () => {
    const gate = createConsentGate(() => granted)
    const failing = vi.fn(() => {
      throw new Error('loader failed')
    })
    const next = vi.fn()

    gate.register(failing)
    gate.register(next)

    expect(failing).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('keeps running the next loader when one throws in the same run', () => {
    const gate = createConsentGate(() => null)
    const failing = vi.fn(() => {
      throw new Error('loader failed')
    })
    const next = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    gate.register(failing)
    gate.register(next)
    gate.run(granted)

    expect(failing).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('handles a rejected loader without stopping the next one', async () => {
    const gate = createConsentGate(() => null)
    const rejecting = vi.fn(() => Promise.reject(new Error('loader failed')))
    const next = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    gate.register(rejecting)
    gate.register(next)
    gate.run(granted)
    await Promise.resolve()

    expect(rejecting).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('does not run a loader again after a revoke and a later grant', () => {
    const gate = createConsentGate(() => null)
    const loader = vi.fn()

    gate.register(loader)
    gate.run(granted)
    gate.run(refused)
    gate.run(granted)

    expect(loader).toHaveBeenCalledTimes(1)
  })
})
