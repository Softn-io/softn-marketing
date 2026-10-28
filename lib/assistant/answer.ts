import { chatbot } from '@/locales/fr/chatbot'
import { ASSISTANT_FALLBACK_MARKER } from './systemPrompt'

/**
 * Turns a raw model answer into the text returned to the visitor.
 *
 * The model is told to answer with {@link ASSISTANT_FALLBACK_MARKER} alone when the OKF bundle
 * does not hold the answer. Any answer that contains the marker, or that is empty, is replaced by
 * the validated `chatbot.fallback` copy: the marker may never reach a visitor, and the fallback
 * wording is never left to the model.
 *
 * @param content Raw `choices[0].message.content` from the chat completion.
 * @returns The validated fallback template or the model answer, trimmed.
 */
export const resolveAssistantAnswer = (content: string): string => {
  const answer = content.trim()
  return answer === '' || answer.includes(ASSISTANT_FALLBACK_MARKER) ? chatbot.fallback : answer
}
