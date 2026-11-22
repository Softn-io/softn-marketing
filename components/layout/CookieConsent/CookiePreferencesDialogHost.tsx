'use client'

import { useEffect, useSyncExternalStore, type ComponentProps } from 'react'
import { preferencesPanelHandle } from '@/lib/consent/preferencesPanel'
import {
  consumePreferencesPanelRequest,
  getPreferencesPanelRequestSnapshot,
  getServerPreferencesPanelRequestSnapshot,
  subscribePreferencesPanelRequest,
} from '@/lib/consent/preferencesPanelRequest'
import { CookiePreferencesDialog } from './CookiePreferencesDialog'

/** Props of {@link CookiePreferencesDialogHost}. */
type CookiePreferencesDialogHostProps = ComponentProps<typeof CookiePreferencesDialog>

/**
 * Lazy host of the consent preferences dialog. It is the only module in the consent layer that
 * imports Base UI, so the banner and the layer stay Base UI free until a preferences request is
 * pending. The host opens the shared handle itself and consumes the request, then lets the dialog
 * own the open state and the native focus return. The save, accept and decline callbacks close the
 * handle after the layer stores the choice.
 *
 * @param props The dialog props supplied by the consent layer.
 * @returns The dialog, mounted and driven by the shared handle.
 */
export const CookiePreferencesDialogHost = (props: CookiePreferencesDialogHostProps) => {
  const requested = useSyncExternalStore(
    subscribePreferencesPanelRequest,
    getPreferencesPanelRequestSnapshot,
    getServerPreferencesPanelRequestSnapshot,
  )

  useEffect(() => {
    if (!requested) return
    preferencesPanelHandle.open(null)
    consumePreferencesPanelRequest()
  }, [requested])

  return (
    <CookiePreferencesDialog
      {...props}
      onSave={() => {
        props.onSave()
        preferencesPanelHandle.close()
      }}
      onAccept={() => {
        props.onAccept()
        preferencesPanelHandle.close()
      }}
      onDecline={() => {
        props.onDecline()
        preferencesPanelHandle.close()
      }}
    />
  )
}
