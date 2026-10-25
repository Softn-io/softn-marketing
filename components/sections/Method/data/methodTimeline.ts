import { interpolate } from '@/lib/interpolate'

/**
 * Separator between a step's counter and its label in the caption line. Punctuation rather than copy:
 * both locales print the design's spaced em dash the same way, so it stays out of the locale's
 * counter template.
 */
export const STEP_CAPTION_SEPARATOR = ' — '

/**
 * Step number as the design prints it: two digits, zero-padded (`01`, not `1`).
 *
 * @param value Step number, counted from one.
 * @returns The number padded to two digits.
 */
export const formatStepNumber = (value: number): string => String(value).padStart(2, '0')

/**
 * Caption line of one step: the locale's counter template with its `{current}` and `{total}`
 * placeholders replaced by two-digit numbers, then the separator and the step label.
 *
 * The label keeps its locale casing — the caption's uppercase look comes from the stylesheet, so
 * translations are never uppercased in the strings themselves.
 *
 * @param template Counter template from the locale, holding `{current}` and `{total}`.
 * @param index Zero-based position of the step in the timeline.
 * @param total Number of steps in the timeline.
 * @param label Step label from the locale.
 * @returns The complete caption line, e.g. `07 / 12 — étape`.
 */
export const stepCaption = (template: string, index: number, total: number, label: string): string =>
  `${interpolate(template, { current: formatStepNumber(index + 1), total: formatStepNumber(total) })}` +
  `${STEP_CAPTION_SEPARATOR}${label}`
