/**
 * Pending request for the consent preferences panel, and the control that asked for it.
 *
 * The footer control lives in the initial bundle and must not pull Base UI there, so it only records
 * a request here. The lazily loaded consent layer subscribes to this module, opens the dialog
 * through the public handle, then clears the request. The opener is kept only so the dialog can
 * choose its focus fallback; Base UI performs the focus itself, this module never calls `focus()`.
 * No Base UI import belongs here. This module is a module-level singleton shared by the footer
 * control and the lazy consent layer.
 */

let requestPending = false
let requestedEver = false
let opener: HTMLElement | null = null
const listeners = new Set<() => void>()

const notify = (): void => {
  for (const listener of [...listeners]) listener()
}

/**
 * Records a request to open the preferences panel, and the control that asked for it.
 *
 * @param trigger The control that received the click, or `null` when there is none.
 */
export const requestPreferencesPanel = (trigger: HTMLElement | null): void => {
  requestPending = true
  requestedEver = true
  opener = trigger
  notify()
}

/**
 * Records the control that opened the panel by itself (the banner trigger), without asking the lazy
 * layer to open it: Base UI already does.
 *
 * @param trigger The control that received the click, or `null` when there is none.
 */
export const rememberPreferencesPanelOpener = (trigger: HTMLElement | null): void => {
  opener = trigger
}

/** Whether a request is waiting. Stable for `useSyncExternalStore`. */
export const getPreferencesPanelRequestSnapshot = (): boolean => requestPending

/** Server snapshot: the server never holds a request. */
export const getServerPreferencesPanelRequestSnapshot = (): boolean => false

/** Whether a preferences request has ever been made. Stable for `useSyncExternalStore`. */
export const getPreferencesPanelEverRequestedSnapshot = (): boolean => requestedEver

/** Server snapshot: the server never holds a request. */
export const getServerPreferencesPanelEverRequestedSnapshot = (): boolean => false

/**
 * Subscribes to request changes.
 *
 * @param listener Callback fired when the request is set or cleared.
 * @returns The unsubscribe function.
 */
export const subscribePreferencesPanelRequest = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Clears a pending request. Safe to call when none is pending. */
export const consumePreferencesPanelRequest = (): void => {
  if (!requestPending) return
  requestPending = false
  notify()
}

/** Clears the request, the opener and the "ever requested" flag. Exported for tests. */
export const resetPreferencesPanelRequest = (): void => {
  requestPending = false
  requestedEver = false
  opener = null
  notify()
}

/** The control that last asked for the panel, or `null`. */
export const getPreferencesPanelRequestOpener = (): HTMLElement | null => opener
