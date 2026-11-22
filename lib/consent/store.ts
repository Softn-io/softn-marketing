/**
 * Consent store: the single source of truth for the stored choice.
 *
 * The store is a module-level singleton so the banner, the dialog and the gate read one record
 * without prop drilling. It exposes a `subscribe`/`getSnapshot` pair for `useSyncExternalStore`,
 * keeps the parsed record referentially stable between reads and never throws when storage is
 * unavailable. The `subscribe` pair also listens to the `storage` event, so a choice saved in
 * another tab updates the banner without a page reload.
 *
 * A cached record is re-validated only when the stored raw value changes. A record that expires
 * while the tab stays open is therefore treated as valid until the next read of a changed value or
 * the next page load; the six-month lifetime makes that acceptable.
 */

import {
  CONSENT_STORAGE_KEY,
  parseStoredConsent,
  writeConsentRecord,
  type ConsentChoice,
  type ConsentRecord,
  type ConsentSaveResult,
} from './record'

/** Read the browser's local storage, or `null` when the access itself throws. */
const getDefaultStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Public API of the consent store. Every function is stable and safe to pass to `useSyncExternalStore`. */
export type ConsentStore = {
  /** Current validated record, or `null` when no valid choice is stored. */
  readonly getSnapshot: () => ConsentRecord | null
  /** Server snapshot: the server never reads storage, so it reports no choice. */
  readonly getServerSnapshot: () => ConsentRecord | null
  /** Subscribe to record changes. Returns the unsubscribe function. */
  readonly subscribe: (listener: () => void) => () => void
  /** Store a choice and return the record plus whether the storage kept it. */
  readonly save: (choice: ConsentChoice) => ConsentSaveResult
}

const getServerSnapshot = (): ConsentRecord | null => null

/**
 * Builds a consent store around a storage accessor. Exported for tests: the application uses the
 * module-level {@link consentStore} singleton.
 *
 * @param getStorage Returns the storage to read and write, or `null` when unavailable. Called on each access.
 * @returns The store API.
 */
export const createConsentStore = (getStorage: () => Storage | null = getDefaultStorage): ConsentStore => {
  let cachedRaw: string | null = null
  let cachedRecord: ConsentRecord | null = null
  let hasCached = false
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const handleStorage = (event: StorageEvent): void => {
    if (event.key === CONSENT_STORAGE_KEY || event.key === null) notify()
  }

  const getSnapshot = (): ConsentRecord | null => {
    let storage: Storage | null
    try {
      storage = getStorage()
    } catch {
      return cachedRecord
    }

    if (storage === null) return cachedRecord

    let raw: string | null
    try {
      raw = storage.getItem(CONSENT_STORAGE_KEY)
    } catch {
      return cachedRecord
    }

    if (hasCached && raw === cachedRaw) return cachedRecord

    cachedRaw = raw
    hasCached = true
    cachedRecord = parseStoredConsent(raw)
    return cachedRecord
  }

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    if (typeof window !== 'undefined' && listeners.size === 1) {
      window.addEventListener('storage', handleStorage)
    }

    return () => {
      listeners.delete(listener)
      if (typeof window !== 'undefined' && listeners.size === 0) {
        window.removeEventListener('storage', handleStorage)
      }
    }
  }

  const save = (choice: ConsentChoice): ConsentSaveResult => {
    let storage: Storage | null
    try {
      storage = getStorage()
    } catch {
      storage = null
    }

    let previousRaw: string | null = null
    if (storage !== null) {
      try {
        previousRaw = storage.getItem(CONSENT_STORAGE_KEY)
      } catch {
        previousRaw = null
      }
    }

    const result = writeConsentRecord(storage, choice)
    cachedRecord = result.record
    // When the write fails, keep the in-memory record authoritative by matching the raw value that
    // is still stored. Otherwise the next snapshot would re-read the older record and replace it.
    cachedRaw = result.stored ? JSON.stringify(result.record) : previousRaw
    hasCached = true
    notify()
    return result
  }

  return {
    getSnapshot,
    getServerSnapshot,
    subscribe,
    save,
  }
}

/** Shared consent store used by the banner, the preferences dialog and the gate. */
export const consentStore = createConsentStore()
