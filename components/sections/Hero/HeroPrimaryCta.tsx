import { BookingCta } from '@components/ui/BookingCta'
import { HERO_CTA_ID } from '@/lib/anchors'
import { hero } from '@/locales/fr/hero'

/**
 * Primary hero call to action: the shared booking link with the hero's label, carrying
 * `HERO_CTA_ID` — the header watches that element to reveal its own booking call to action once this
 * one has scrolled out of view.
 */
export const HeroPrimaryCta = () => (
  <BookingCta id={HERO_CTA_ID} size="lg">
    {hero.cta.primary}
  </BookingCta>
)
