/** The mouse-event fields a plain left click depends on: shared by buttons and links, whatever element they sit on. */
export type PlainLeftClickEvent = {
  readonly button: number
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

/**
 * True when the event is a plain left click: the primary button, with no modifier key held.
 *
 * Modifier keys and non-primary buttons keep the native link behaviour (new tab, download, context
 * menu), so a caller that intercepts an activation must let those events through unchanged.
 */
export const isPlainLeftClick = (event: PlainLeftClickEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
