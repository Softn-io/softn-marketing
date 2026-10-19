/** Name of the window event asking the chatbot to open. */
export const OPEN_CHATBOT_EVENT = 'open-chatbot'

/** Where the request to open the chatbot comes from. */
export type OpenChatbotSource = 'header'

export type OpenChatbotDetail = { source: OpenChatbotSource }

declare global {
  interface WindowEventMap {
    'open-chatbot': CustomEvent<OpenChatbotDetail>
  }
}

/**
 * Asks the chatbot to open by dispatching a cancelable `open-chatbot` event on `window`.
 * The chatbot claims the request by calling `preventDefault()` in its listener.
 *
 * @returns `true` when a listener claimed the request, `false` when nobody handled it
 * (the caller then falls back to another action, e.g. scrolling to the booking section).
 */
export const dispatchOpenChatbot = (detail: OpenChatbotDetail): boolean => {
  const event = new CustomEvent(OPEN_CHATBOT_EVENT, { detail, cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
