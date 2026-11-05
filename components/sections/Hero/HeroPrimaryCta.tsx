'use client'

import type { MouseEvent } from 'react'
import { Button } from '@components/ui/Button'
import { HERO_CTA_ID, SECTION_IDS, goToSection } from '@/lib/anchors'
import { ASSISTANT_INTENTS, dispatchAssistantIntent } from '@/lib/assistant/intent'
import { hero } from '@/locales/fr/hero'

/**
 * Primary hero call to action. Always a plain in-page link to the assistant section, so it works
 * without JavaScript, and it carries `HERO_CTA_ID`: the header watches that element to reveal its
 * own booking call to action once this one has scrolled out of view.
 *
 * Clicking additionally asks the assistant to start the booking flow (fire-and-forget event: the
 * chatbot is not implemented yet, and the browser keeps following the anchor). When the fragment
 * already names the assistant section, the browser has nothing left to navigate to: the section is
 * scrolled into view explicitly instead.
 */
export const HeroPrimaryCta = () => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    dispatchAssistantIntent(ASSISTANT_INTENTS.booking)
    const isPlainLeftClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    if (!event.defaultPrevented && isPlainLeftClick && window.location.hash === `#${SECTION_IDS.agent}`) {
      goToSection(SECTION_IDS.agent)
    }
  }

  return (
    <Button href={`#${SECTION_IDS.agent}`} id={HERO_CTA_ID} size="lg" onClick={handleClick}>
      {hero.cta.primary}
    </Button>
  )
}
