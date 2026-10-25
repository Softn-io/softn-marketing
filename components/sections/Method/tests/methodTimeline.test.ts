import { describe, expect, it } from 'vitest'
import { formatStepNumber, STEP_CAPTION_SEPARATOR, stepCaption } from '../data/methodTimeline'

describe('formatStepNumber', () => {
  it('pads a step number to two digits', () => {
    expect(formatStepNumber(1)).toBe('01')
    expect(formatStepNumber(5)).toBe('05')
  })

  it('leaves numbers that already fill two digits alone', () => {
    expect(formatStepNumber(10)).toBe('10')
  })
})

describe('stepCaption', () => {
  const TEMPLATE = '{current} / {total}'

  it('fills the counter template and appends the label', () => {
    expect(stepCaption(TEMPLATE, 0, 5, 'Cadrage')).toBe('01 / 05 — Cadrage')
  })

  it('counts the steps from one, up to the total', () => {
    expect(stepCaption(TEMPLATE, 4, 5, 'Prise en main')).toBe(`05 / 05${STEP_CAPTION_SEPARATOR}Prise en main`)
  })

  it('keeps the label casing: the uppercase look belongs to the stylesheet', () => {
    expect(stepCaption(TEMPLATE, 1, 5, 'Découpage')).toBe('02 / 05 — Découpage')
  })

  it('follows the template order, whatever the locale arranges', () => {
    expect(stepCaption('{total} sur {current}', 2, 5, 'Relecture')).toBe('05 sur 03 — Relecture')
  })

  it('throws when the template asks for a placeholder it was not given', () => {
    expect(() => stepCaption('{step} / {total}', 0, 5, 'Cadrage')).toThrow(/step/)
  })
})
