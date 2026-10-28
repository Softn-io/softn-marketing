import { describe, expect, it } from 'vitest'
import { chatbot } from '@/locales/fr/chatbot'
import { resolveAssistantAnswer } from './answer'
import { ASSISTANT_FALLBACK_MARKER } from './systemPrompt'

describe('resolveAssistantAnswer', () => {
  it('returns a grounded answer trimmed', () => {
    expect(resolveAssistantAnswer('  Une réponse ancrée.\n')).toBe('Une réponse ancrée.')
  })

  it('replaces the exact fallback marker with the validated locale fallback', () => {
    expect(resolveAssistantAnswer(ASSISTANT_FALLBACK_MARKER)).toBe(chatbot.fallback)
  })

  it('replaces any answer that still contains the marker, so it never reaches a visitor', () => {
    expect(resolveAssistantAnswer(`Je ne sais pas. ${ASSISTANT_FALLBACK_MARKER}`)).toBe(chatbot.fallback)
  })

  it('replaces an empty answer with the fallback', () => {
    expect(resolveAssistantAnswer('   ')).toBe(chatbot.fallback)
  })
})
