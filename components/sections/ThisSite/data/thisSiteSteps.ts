import { interpolate } from '@/lib/interpolate'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { thisSite, type ThisSiteStepCopy } from '@/locales/fr/thisSite'

/** One step of the section, as the tab list and the detail panel render it: the locale's step, plus where it sits. */
export type ThisSiteStep = ThisSiteStepCopy & {
  /** Tab value (`step-1` … `step-6`) and React key, derived from the position in the locale's list. */
  readonly id: string
  /** Two-digit step number printed before the title: `01`, not `1`. */
  readonly number: string
}

/**
 * Wording a detail needs beyond its step: the four labels and the quotation marks around the prompt.
 * The section reads them from the locale and passes them down, so the client island ships neither
 * `locales/fr/thisSite.ts` nor, through it, the assistant section's copy.
 */
export type ThisSiteLabels = {
  /** Names the instructions given to the agents. */
  readonly promptLabel: string
  /** Names the technical note. */
  readonly techLabel: string
  /** Names the pilot's measure. */
  readonly durationMelLabel: string
  /** Names the agents' measure. */
  readonly durationAgentsLabel: string
  /** Quotation marks around the prompt: language-specific punctuation, not copy to translate. */
  readonly promptQuotes: { readonly open: string; readonly close: string }
}

/** Two-digit step number, as the design prints it in the list. */
const formatStepNumber = (position: number): string => String(position).padStart(2, '0')

/** Fills the templates that address the assistant by name (its single source is `locales/fr/chatbot.ts`). */
const withAssistantName = (template: string): string => interpolate(template, { assistantName: ASSISTANT_NAME })

/**
 * Steps of the section ready to render: the copy of `locales/fr/thisSite.ts` with the assistant name
 * filled, plus the tab value and the printed number derived from the position in the list.
 *
 * `tech` is kept verbatim rather than interpolated: the copy writes the measured values of that
 * sentence itself, so it must carry no `{name}` placeholder — nothing would fill it.
 */
export const thisSiteSteps: readonly ThisSiteStep[] = thisSite.steps.map((step, position) => ({
  ...step,
  id: `step-${position + 1}`,
  number: formatStepNumber(position + 1),
  title: withAssistantName(step.title),
  heading: withAssistantName(step.heading),
  body: withAssistantName(step.body),
  prompt: withAssistantName(step.prompt),
  tech: step.tech,
  tags: step.tags.map(withAssistantName),
}))

/** The wording the island renders, taken from the locale in this one place. */
export const thisSiteLabels: ThisSiteLabels = {
  promptLabel: thisSite.promptLabel,
  techLabel: thisSite.techLabel,
  durationMelLabel: thisSite.durationMelLabel,
  durationAgentsLabel: thisSite.durationAgentsLabel,
  promptQuotes: thisSite.promptQuotes,
}
