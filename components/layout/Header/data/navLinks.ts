import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { nav } from '@/locales/fr/hero'
import { SECTION_IDS, type SectionId } from '@/lib/anchors'
import { interpolate } from '@/lib/interpolate'

export type NavLink = {
  id: SectionId
  href: `#${SectionId}`
  label: string
  /** Accessible name; starts with `label`. */
  ariaLabel: string
}

/** Header navigation entries in display order, with the assistant name already interpolated. */
export const getNavLinks = (): readonly NavLink[] => {
  const assistantName = { assistantName: ASSISTANT_NAME }
  const entries: ReadonlyArray<readonly [SectionId, string, string]> = [
    [SECTION_IDS.offers, nav.items.offers, nav.itemsAria.offers],
    [SECTION_IDS.method, nav.items.method, nav.itemsAria.method],
    [SECTION_IDS.agent, interpolate(nav.items.agent, assistantName), interpolate(nav.itemsAria.agent, assistantName)],
    [SECTION_IDS.thisSite, nav.items.thisSite, nav.itemsAria.thisSite],
    [SECTION_IDS.faq, nav.items.faq, nav.itemsAria.faq],
  ]
  return entries.map(([id, label, ariaLabel]) => ({ id, href: `#${id}`, label, ariaLabel }))
}
