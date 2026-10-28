import { describe, expect, it } from 'vitest'
import { ASSISTANT_ERROR_CODES, isAssistantErrorResponse, isAssistantSuccessResponse } from './assistantLimits'

describe('isAssistantSuccessResponse', () => {
  it('accepts a non-empty answer', () => {
    expect(isAssistantSuccessResponse({ answer: 'Réponse' })).toBe(true)
  })

  it('rejects an empty answer and every shape the route never returns', () => {
    expect(isAssistantSuccessResponse({ answer: '' })).toBe(false)
    expect(isAssistantSuccessResponse({ answer: 42 })).toBe(false)
    expect(isAssistantSuccessResponse({})).toBe(false)
    expect(isAssistantSuccessResponse(null)).toBe(false)
    expect(isAssistantSuccessResponse('Réponse')).toBe(false)
    expect(isAssistantSuccessResponse(['Réponse'])).toBe(false)
  })
})

describe('isAssistantErrorResponse', () => {
  it('accepts every generic error code of the route', () => {
    for (const code of ASSISTANT_ERROR_CODES) {
      expect(isAssistantErrorResponse({ error: code })).toBe(true)
    }
  })

  it('rejects an unknown code and every non-error shape', () => {
    expect(isAssistantErrorResponse({ error: 'boom' })).toBe(false)
    expect(isAssistantErrorResponse({ error: 503 })).toBe(false)
    expect(isAssistantErrorResponse({})).toBe(false)
    expect(isAssistantErrorResponse(null)).toBe(false)
    expect(isAssistantErrorResponse('rate-limited')).toBe(false)
    expect(isAssistantErrorResponse(['rate-limited'])).toBe(false)
  })
})
