import { describe, expect, it } from 'vitest'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { thisSite } from '@/locales/fr/thisSite'
import { thisSiteLabels, thisSiteSteps, type ThisSiteStep } from '../data/thisSiteSteps'

/** Step at `position`, failing the test rather than the type checker when the copy loses one. */
const stepAt = (position: number): ThisSiteStep => {
  const step = thisSiteSteps[position]
  if (step === undefined) throw new Error(`no step at position ${position}`)
  return step
}

/** Every string the copy holds, at any depth. */
const collectStrings = (value: unknown, collected: readonly string[]): readonly string[] => {
  if (typeof value === 'string') return [...collected, value]
  if (Array.isArray(value)) return value.reduce<readonly string[]>((all, item) => collectStrings(item, all), collected)
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).reduce<readonly string[]>((all, child) => collectStrings(child, all), collected)
  }

  return collected
}

/** A measured value as the copy writes it: a rounded hour count, its unit bound by a non-breaking space. */
const MEASURED_HOURS = /^environ \d+\u00A0h$/

describe('thisSiteSteps', () => {
  it('maps one step per copy step, numbered in order, each with its own tab value', () => {
    expect(thisSiteSteps).toHaveLength(thisSite.steps.length)
    expect(thisSiteSteps.map((step) => step.number)).toEqual(['01', '02', '03', '04', '05', '06'])
    expect(thisSiteSteps.map((step) => step.id)).toEqual(['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6'])
    expect(new Set(thisSiteSteps.map((step) => step.id)).size).toBe(thisSiteSteps.length)
  })

  it('fills the assistant name in the templates and keeps the rest of the copy verbatim', () => {
    const filled = (template: string): string => template.replaceAll('{assistantName}', ASSISTANT_NAME)

    thisSiteSteps.forEach((step, position) => {
      const copy = thisSite.steps[position]
      if (copy === undefined) throw new Error(`no copy at position ${position}`)

      expect(step.title).toBe(filled(copy.title))
      expect(step.heading).toBe(filled(copy.heading))
      expect(step.body).toBe(filled(copy.body))
      expect(step.prompt).toBe(filled(copy.prompt))
      expect(step.tags).toEqual(copy.tags.map(filled))
      expect(step.tech).toBe(copy.tech)
    })
  })

  it('carries the measured time on the three tracked steps, each figure bound to its unit by a non-breaking space', () => {
    expect(thisSiteSteps.map((step) => step.durations !== undefined)).toEqual([false, false, true, true, true, false])

    for (const position of [2, 3, 4]) {
      const durations = stepAt(position).durations
      if (durations === undefined) throw new Error(`no measured time at position ${position}`)

      expect(durations).toEqual(thisSite.steps[position]?.durations)
      expect(durations.mel).toMatch(MEASURED_HOURS)
      expect(durations.agents).toMatch(MEASURED_HOURS)
    }

    expect(stepAt(5).durations).toBeUndefined()
    expect(thisSite.total.mel).toMatch(MEASURED_HOURS)
    expect(thisSite.total.agents).toMatch(MEASURED_HOURS)
  })

  it('hands the island the locale wording, quotation marks included', () => {
    expect(thisSiteLabels).toEqual({
      promptLabel: thisSite.promptLabel,
      techLabel: thisSite.techLabel,
      durationMelLabel: thisSite.durationMelLabel,
      durationAgentsLabel: thisSite.durationAgentsLabel,
      promptQuotes: thisSite.promptQuotes,
    })
  })

  it('binds the prompt quotation marks with a narrow no-break space', () => {
    expect(thisSite.promptQuotes.open).toBe('«\u202F')
    expect(thisSite.promptQuotes.close).toBe('\u202F»')
  })

  it('ships no copy marker left to fill, and derives every string without a placeholder', () => {
    expect(collectStrings(thisSite, []).filter((text) => text.includes('[À COMPLÉTER'))).toEqual([])

    // The copy's own templates are the assistant name, filled by the mapper; a `{name}` reaching the
    // derived strings would be a slot nobody fills — the technical notes included, kept verbatim.
    const derived = thisSiteSteps.flatMap((step) => [
      step.title,
      step.heading,
      step.body,
      step.prompt,
      step.tech,
      ...step.tags,
    ])
    expect(derived.filter((text) => /\{[a-zA-Z]+\}/.test(text))).toEqual([])
  })
})
