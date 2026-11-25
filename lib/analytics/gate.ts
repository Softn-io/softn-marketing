/**
 * Consent gate: the only path a third-party loader takes to the page.
 *
 * Loaders register here and run only after the stored consent grants the audience category. The
 * Umami loader is the registry's only entry today; the gate itself stays generic, and no environment
 * variable, CSP origin or script is added here.
 *
 * Revocation contract: a refusal stops future loads. A third party that already ran stays loaded
 * for the rest of the page's life and is not re-run if consent is granted again; only a page load
 * removes it. A loader may also honour the record at send time — the Umami loader does, through its
 * `before-send` hook and its session guard — so a refusal can stop its activity immediately without
 * a teardown. Loader failures are logged with the loader name only, never with personal data.
 */

import { useEffect } from 'react'
import { consentStore, type ConsentRecord } from '@/lib/consent'

/** A third-party loader the gate runs once the audience consent is granted. */
export type ConsentGatedLoader = () => void | Promise<void>

/** Public API of a consent gate. */
export type ConsentGate = {
  /** Register a loader. It runs immediately when the audience consent is already granted. */
  readonly register: (loader: ConsentGatedLoader) => void
  /** Run every registered loader when the record grants the audience consent. Idempotent per loader. */
  readonly run: (record: ConsentRecord | null) => void
}

/**
 * Builds a consent gate around a record getter. Exported for tests: the application uses the
 * module-level {@link consentGate} singleton.
 *
 * @param getRecord Reads the current consent record, used when a loader registers.
 * @returns The gate API.
 */
export const createConsentGate = (getRecord: () => ConsentRecord | null): ConsentGate => {
  const loaders = new Set<ConsentGatedLoader>()
  const ranLoaders = new Set<ConsentGatedLoader>()

  const reportFailure = (loader: ConsentGatedLoader): void => {
    console.warn(`[consent-gate] loader failed: ${loader.name || 'anonymous'}`)
  }

  const run = (record: ConsentRecord | null): void => {
    if (record === null || !record.audience) return

    for (const loader of loaders) {
      if (ranLoaders.has(loader)) continue
      ranLoaders.add(loader)
      try {
        Promise.resolve(loader()).catch(() => reportFailure(loader))
      } catch {
        reportFailure(loader)
      }
    }
  }

  const register = (loader: ConsentGatedLoader): void => {
    loaders.add(loader)
    run(getRecord())
  }

  return { register, run }
}

/** Shared consent gate used by the consent layer. */
export const consentGate = createConsentGate(() => consentStore.getSnapshot())

/**
 * Runs the gate for a consent record. Call it from a client component with the record read through
 * `useSyncExternalStore`: loaders run only when the audience category is granted.
 *
 * @param record The consent record the component read, or `null` when no choice is stored.
 */
export const useConsentGate = (record: ConsentRecord | null): void => {
  useEffect(() => {
    consentGate.run(record)
  }, [record])
}
