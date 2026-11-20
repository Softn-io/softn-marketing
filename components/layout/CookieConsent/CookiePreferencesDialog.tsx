import { Dialog } from '@base-ui/react/dialog'
import type { DialogPopupProps } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@components/ui/Button'
import { Switch } from '@components/ui/Switch'
import { preferencesPanelHandle } from '@/lib/consent/preferencesPanel'
import { getPreferencesPanelRequestOpener, rememberPreferencesPanelOpener } from '@/lib/consent/preferencesPanelRequest'
import { SITE_ROUTES } from '@/lib/routes'
import { cookieBanner } from '@/locales/fr/legal'
import styles from './styles/CookieConsent.module.css'

/** Function form of Base UI's `finalFocus` prop, read from its own declaration so the type cannot drift. */
type FinalFocusCallback = Extract<DialogPopupProps['finalFocus'], (...args: never[]) => unknown>

/** Interaction type Base UI reports when it calls `finalFocus`: empty while the popup is open. */
type PopupCloseType = Parameters<FinalFocusCallback>[0]

/**
 * Final focus for the preferences dialog, decided with public APIs only. The recorded opener is
 * returned directly while it is still in the document, so the browser's focus-on-click behaviour
 * cannot change the target. When the opener is gone, which happens when the banner unmounts after a
 * save, the main landmark is the fallback. Every `main` in the site currently contains controls, so
 * Base UI finds a tabbable child there; a future page whose main has none must set `tabIndex={-1}`
 * on it, or the focus call would be a no-op. Base UI also calls this function with an empty close
 * type while the popup is open, so the record is cleared only on a real close and never outlives
 * the dialog.
 */
export const getFinalFocus = (closeType: PopupCloseType): HTMLElement | null => {
  const opener = getPreferencesPanelRequestOpener()
  if (closeType !== '') rememberPreferencesPanelOpener(null)
  if (opener !== null && opener.isConnected) return opener
  return document.querySelector<HTMLElement>('main')
}

/** Props of {@link CookiePreferencesDialog}. */
type CookiePreferencesDialogProps = {
  /** Current audience choice shown by the switch. */
  audience: boolean
  /** Update the audience choice shown by the switch. */
  onAudienceChange: (audience: boolean) => void
  /** Save the switch choice. */
  onSave: () => void
  /** Store the acceptance and close the dialog. */
  onAccept: () => void
  /** Store the refusal and close the dialog. */
  onDecline: () => void
  /** Relay the dialog's open-state changes. */
  onOpenChange: (open: boolean) => void
}

/**
 * Modal consent preferences dialog, built on the accessible Base UI dialog: focus trap, Escape to
 * close and focus back to the trigger. The audience switch is off unless a stored choice exists.
 * The dialog is uncontrolled: the shared handle owns its open state, and the banner trigger and the
 * footer control's request open it.
 *
 * @param props The dialog state, the three actions and the open-state relay.
 * @returns The preferences dialog.
 */
export const CookiePreferencesDialog = ({
  audience,
  onAudienceChange,
  onSave,
  onAccept,
  onDecline,
  onOpenChange,
}: CookiePreferencesDialogProps) => {
  const { preferences } = cookieBanner

  return (
    <Dialog.Root handle={preferencesPanelHandle} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Viewport className={styles.viewport}>
          <Dialog.Popup className={styles.dialog} finalFocus={getFinalFocus}>
            <div className={styles.dialogHeader}>
              <Dialog.Title className={`${styles.dialogTitle} font-display text-title-md`}>
                {preferences.title}
              </Dialog.Title>
              <Dialog.Close className={styles.close} aria-label={preferences.closeAriaLabel}>
                <X aria-hidden="true" focusable="false" className={styles.closeIcon} />
              </Dialog.Close>
            </div>
            <Dialog.Description className={`${styles.intro} text-body-sm`}>{preferences.intro}</Dialog.Description>
            <ul className={styles.categories}>
              <li className={styles.category}>
                <div className={styles.categoryCopy}>
                  <h3 className={`${styles.categoryTitle} text-title-sm`}>{preferences.necessary.title}</h3>
                  <p className={`${styles.categoryDescription} text-body-sm`}>{preferences.necessary.description}</p>
                </div>
                <span className={`${styles.necessaryStatus} text-label`}>{preferences.necessary.status}</span>
              </li>
              <li className={styles.category}>
                <div className={styles.categoryCopy}>
                  <h3 className={`${styles.categoryTitle} text-title-sm`}>{preferences.audience.title}</h3>
                  <p className={`${styles.categoryDescription} text-body-sm`}>{preferences.audience.description}</p>
                </div>
                <div className={styles.audienceControl}>
                  <Switch
                    checked={audience}
                    onCheckedChange={onAudienceChange}
                    aria-label={preferences.audience.toggleAriaLabel}
                  />
                  <span className={`${styles.switchState} text-label`}>
                    {audience ? preferences.audience.stateOn : preferences.audience.stateOff}
                  </span>
                </div>
              </li>
            </ul>
            <p className={`${styles.retention} text-body-sm`}>{preferences.retention}</p>
            <Link href={SITE_ROUTES.cookiePolicy} className={`${styles.link} text-body-sm`}>
              {cookieBanner.learnMore}
            </Link>
            <div className={styles.dialogActions}>
              <Button size="lg" onClick={onSave}>
                {preferences.save}
              </Button>
              <Button size="lg" onClick={onAccept}>
                {cookieBanner.accept}
              </Button>
              <Button size="lg" onClick={onDecline}>
                {cookieBanner.decline}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
