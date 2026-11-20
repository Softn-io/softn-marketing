// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_SCHEMA_VERSION, CONSENT_STORAGE_KEY } from './record'
import { createConsentStore } from './store'

/** Creates a memory storage and records every storage listener the store adds. */
const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => {
      values.clear()
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createConsentStore', () => {
  it('returns a stable snapshot when the stored value does not change', () => {
    const storage = createMemoryStorage()
    const store = createConsentStore(() => storage)

    expect(store.getSnapshot()).toBe(store.getSnapshot())

    storage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_SCHEMA_VERSION, audience: true, decidedAt: new Date().toISOString() }),
    )
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('reads a valid stored choice', () => {
    const storage = createMemoryStorage()
    storage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_SCHEMA_VERSION, audience: false, decidedAt: new Date().toISOString() }),
    )
    const store = createConsentStore(() => storage)

    expect(store.getSnapshot()).toMatchObject({ version: CONSENT_SCHEMA_VERSION, audience: false })
  })

  it('treats a malformed record as no choice', () => {
    const storage = createMemoryStorage()
    storage.setItem(CONSENT_STORAGE_KEY, '{not json')
    const store = createConsentStore(() => storage)

    expect(store.getSnapshot()).toBeNull()
  })

  it('treats a record from another schema version as no choice', () => {
    const storage = createMemoryStorage()
    storage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_SCHEMA_VERSION + 1, audience: true, decidedAt: new Date().toISOString() }),
    )
    const store = createConsentStore(() => storage)

    expect(store.getSnapshot()).toBeNull()
  })

  it('treats an expired record as no choice', () => {
    const storage = createMemoryStorage()
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6)
    storage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_SCHEMA_VERSION, audience: true, decidedAt: sixMonthsAgo.toISOString() }),
    )
    const store = createConsentStore(() => storage)

    expect(store.getSnapshot()).toBeNull()
  })

  it('treats a storage that throws as no choice', () => {
    const storage = createMemoryStorage()
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    const store = createConsentStore(() => storage)

    expect(store.getSnapshot()).toBeNull()
  })

  it('saves a choice and notifies subscribers', () => {
    const storage = createMemoryStorage()
    const store = createConsentStore(() => storage)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    const result = store.save({ audience: true })

    expect(result.stored).toBe(true)
    expect(store.getSnapshot()).toEqual(result.record)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(JSON.parse(storage.getItem(CONSENT_STORAGE_KEY) ?? 'null')).toEqual(result.record)

    unsubscribe()
    store.save({ audience: false })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the in-memory choice when the write fails while an older record is stored', () => {
    const storage = createMemoryStorage()
    storage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_SCHEMA_VERSION, audience: false, decidedAt: new Date().toISOString() }),
    )
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const store = createConsentStore(() => storage)

    const result = store.save({ audience: true })

    expect(result.stored).toBe(false)
    expect(store.getSnapshot()).toEqual(result.record)
  })

  it('keeps the in-memory choice when the storage is absent', () => {
    const store = createConsentStore(() => null)

    const result = store.save({ audience: true })

    expect(result.stored).toBe(false)
    expect(store.getSnapshot()).toEqual(result.record)
  })

  it('adds one storage listener with the first subscriber and removes it with the last', () => {
    const storage = createMemoryStorage()
    const store = createConsentStore(() => storage)
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')

    const unsubscribeFirst = store.subscribe(() => undefined)
    const unsubscribeSecond = store.subscribe(() => undefined)

    expect(addListener).toHaveBeenCalledTimes(1)
    expect(addListener).toHaveBeenCalledWith('storage', expect.any(Function))

    unsubscribeFirst()
    expect(removeListener).not.toHaveBeenCalled()

    unsubscribeSecond()
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function))
  })

  it('notifies subscribers when another tab changes the consent key or clears storage', () => {
    const storage = createMemoryStorage()
    const store = createConsentStore(() => storage)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_STORAGE_KEY }))
    expect(listener).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(listener).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
  })
})
