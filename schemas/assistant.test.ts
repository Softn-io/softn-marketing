import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_HISTORY_MAX_MESSAGES,
  ASSISTANT_QUESTION_MAX_LENGTH,
  AssistantRequestSchema,
  AssistantSuccessResponseSchema,
} from './assistant'

describe('AssistantRequestSchema', () => {
  it('trims the question and defaults the history to empty', () => {
    const result = AssistantRequestSchema.safeParse({ question: '  Une question  ' })
    expect(result.success && result.data).toEqual({ question: 'Une question', history: [] })
  })

  it('accepts a bounded history of user and assistant turns', () => {
    const result = AssistantRequestSchema.safeParse({
      question: 'Question',
      history: [
        { role: 'user', content: 'Première' },
        { role: 'assistant', content: 'Réponse' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty, too long or non-text question', () => {
    expect(AssistantRequestSchema.safeParse({ question: '   ' }).success).toBe(false)
    expect(AssistantRequestSchema.safeParse({ question: 'a'.repeat(ASSISTANT_QUESTION_MAX_LENGTH + 1) }).success).toBe(
      false,
    )
    expect(AssistantRequestSchema.safeParse({ question: 42 }).success).toBe(false)
  })

  it('rejects more than the bounded number of turns and an empty turn', () => {
    const turns = Array.from({ length: ASSISTANT_HISTORY_MAX_MESSAGES + 1 }, () => ({
      role: 'user',
      content: 'Tour',
    }))
    expect(AssistantRequestSchema.safeParse({ question: 'Question', history: turns }).success).toBe(false)
    expect(
      AssistantRequestSchema.safeParse({ question: 'Question', history: [{ role: 'user', content: ' ' }] }).success,
    ).toBe(false)
  })

  it('rejects an unknown role', () => {
    expect(
      AssistantRequestSchema.safeParse({ question: 'Question', history: [{ role: 'system', content: 'Non' }] }).success,
    ).toBe(false)
  })
})

describe('AssistantSuccessResponseSchema', () => {
  it('accepts a non-empty answer and rejects an empty one', () => {
    expect(AssistantSuccessResponseSchema.safeParse({ answer: 'Réponse' }).success).toBe(true)
    expect(AssistantSuccessResponseSchema.safeParse({ answer: '' }).success).toBe(false)
  })
})
