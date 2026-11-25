'use client'

import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { registerUmamiLoader, useConsentGate } from '@/lib/analytics'
import { consentStore } from '@/lib/consent'
import {
  getPreferencesPanelEverRequestedSnapshot,
  getServerPreferencesPanelEverRequestedSnapshot,
  subscribePreferencesPanelRequest,
} from '@/lib/consent/preferencesPanelRequest'
import { cookieBanner } from '@/locales/fr/legal'
import { CookieBanner } from './CookieBanner'

/*
 * The dialog module imports Base UI. It is loaded only after a preferences request, so a first
 * visit with no interaction fetches no Base UI chunk. The banner and this layer import no Base UI.
 */
const CookiePreferencesDialogHost = lazy(() =>
  import('./CookiePreferencesDialogHost').then((module) => ({ default: module.CookiePreferencesDialogHost })),
)

/**
 * Client-only consent layer: the banner when no valid choice is stored, the preferences dialog
 * opened on a request from the banner or the footer, and the polite live region that confirms a
 * saved choice.
 *
 * The store is read through `useSyncExternalStore`, so a choice saved in another tab or the dialog
 * updates the layer. The dialog layer is lazy: it mounts only after the first preferences request,
 * and its own host opens the shared handle and clears the request. The live region announces a save
 * only when the storage kept the choice.
 */
export const CookieConsent = () => {
  const record = useSyncExternalStore(consentStore.subscribe, consentStore.getSnapshot, consentStore.getServerSnapshot)
  const preferencesEverRequested = useSyncExternalStore(
    subscribePreferencesPanelRequest,
    getPreferencesPanelEverRequestedSnapshot,
    getServerPreferencesPanelEverRequestedSnapshot,
  )
  const [announcement, setAnnouncement] = useState('')
  const [draft, setDraft] = useState<boolean | null>(null)

  useConsentGate(record)

  // Registered once: the gate runs the Umami loader when the audience consent is already granted,
  // or on the next grant. A refusal stops future loads only, per the gate contract.
  useEffect(() => {
    registerUmamiLoader()
  }, [])

  const audience = draft ?? record?.audience ?? false

  const save = (audienceChoice: boolean) => {
    const result = consentStore.save({ audience: audienceChoice })
    setDraft(null)
    setAnnouncement(result.stored ? cookieBanner.saved : '')
  }

  return (
    <>
      {record === null ? <CookieBanner onAccept={() => save(true)} onDecline={() => save(false)} /> : null}
      {preferencesEverRequested ? (
        <Suspense fallback={null}>
          <CookiePreferencesDialogHost
            audience={audience}
            onAudienceChange={setDraft}
            onSave={() => save(audience)}
            onAccept={() => save(true)}
            onDecline={() => save(false)}
            onOpenChange={(open) => {
              if (open) {
                setDraft(null)
                setAnnouncement('')
              }
            }}
          />
        </Suspense>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}
