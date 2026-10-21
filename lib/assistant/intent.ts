/**
 * Intents a call to action asks the assistant to run. `booking` is the one the hero's primary
 * call to action sends when someone asks for their action plan.
 */
export const ASSISTANT_INTENTS = {
  booking: 'booking',
} as const

/** Every intent the site can ask the assistant to run. */
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[keyof typeof ASSISTANT_INTENTS]

/** Name of the `window` event carrying an assistant intent. */
export const ASSISTANT_INTENT_EVENT = 'assistant-intent'

/** Payload of the `assistant-intent` event. */
export type AssistantIntentDetail = { intent: AssistantIntent }

declare global {
  interface WindowEventMap {
    [ASSISTANT_INTENT_EVENT]: CustomEvent<AssistantIntentDetail>
  }
}

/**
 * Asks the assistant to run an intent, by dispatching an `assistant-intent` event on `window`.
 *
 * The chatbot (not implemented yet) will listen for this event and open the matching flow.
 * Fire-and-forget: the event is lost when no listener is mounted, so a caller must never depend on
 * it to navigate — the hero's primary call to action keeps its default anchor behaviour and the
 * intent only adds to it.
 */
export const dispatchAssistantIntent = (intent: AssistantIntent): void => {
  window.dispatchEvent(new CustomEvent<AssistantIntentDetail>(ASSISTANT_INTENT_EVENT, { detail: { intent } }))
}
