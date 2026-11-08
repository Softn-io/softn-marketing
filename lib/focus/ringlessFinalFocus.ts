import type { DialogPopupProps } from '@base-ui/react/dialog'
import type { RefObject } from 'react'

/** Function form of Base UI's `finalFocus` prop, read from its own declaration so a renamed or added interaction cannot drift. */
type FinalFocusCallback = Extract<DialogPopupProps['finalFocus'], (...args: never[]) => unknown>

/** Interaction type Base UI reports when it closes a popup: empty while the popup is still open, `'keyboard'` for a keyboard close. */
type PopupCloseType = Parameters<FinalFocusCallback>[0]

/**
 * Builds the `finalFocus` handler of a Base UI popup: it returns `target` and makes the focus ring
 * explicit before the library focuses that element.
 *
 * Base UI marks a keyboard close as `:focus-visible` and leaves a pointer close to the browser
 * heuristic; that heuristic keeps the ring on an element focused by script when the focus chain
 * started visible (a keyboard or programmatic open), so a tap or a click would leave a ring on the
 * control that opened the layer. Clearing it before Base UI focuses the target makes the pointer
 * path deterministic: only a non-`keyboard`, non-empty close clears it, and the library's own focus
 * call on the returned element then follows.
 *
 * `closeType` is empty while the popup is still open, when Base UI also calls this function, so only
 * a real close clears the ring.
 */
export const ringlessFinalFocus =
  (target: RefObject<HTMLElement | null>) =>
  (closeType: PopupCloseType): HTMLElement | null => {
    const element = target.current
    if (element === null) return null
    if (closeType !== '' && closeType !== 'keyboard') {
      // `focusVisible` ships in browsers but not yet in the TypeScript DOM lib.
      const options: FocusOptions & { focusVisible?: boolean } = { preventScroll: true, focusVisible: false }
      element.focus(options)
    }
    return element
  }
