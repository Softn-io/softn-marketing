/**
 * Preferences panel handle: the shared state that opens the consent dialog.
 *
 * The banner's "Personnaliser" control is a detached Base UI trigger. The footer's "Gérer mes
 * cookies" control lives in the initial bundle and only records a request in
 * `preferencesPanelRequest.ts`; the lazily loaded consent layer consumes that request and opens the
 * dialog through this handle. Base UI owns the open state and the focus return, and this module must
 * stay out of the initial bundle.
 */

import { Dialog } from '@base-ui/react/dialog'

/** Shared handle that connects the preferences dialog with its detached triggers. */
export const preferencesPanelHandle = Dialog.createHandle()
