'use client'

import { Button } from '@components/ui/Button'
import { HERO_CTA_ID, SECTION_IDS } from '@/lib/anchors'
import { ASSISTANT_INTENTS, dispatchAssistantIntent } from '@/lib/assistant/intent'
import { hero } from '@/locales/fr/hero'

/**
 * Primary hero call to action. Always a plain in-page link to the assistant section, so it works
 * without JavaScript, and it carries `HERO_CTA_ID`: the header watches that element to reveal its
 * own booking call to action once this one has scrolled out of view.
 *
 * Clicking additionally asks the assistant to start the booking flow (fire-and-forget event: the
 * chatbot is not implemented yet, and the browser keeps following the anchor).
 */
export const HeroPrimaryCta = () => {
  const handleClick = (): void => {
    dispatchAssistantIntent(ASSISTANT_INTENTS.booking)
  }

  return (
    <Button href={`#${SECTION_IDS.agent}`} id={HERO_CTA_ID} size="lg" onClick={handleClick}>
      {hero.cta.primary}
    </Button>
  )
}
