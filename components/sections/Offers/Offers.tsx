import { SECTION_IDS } from '@/lib/anchors'
import { offers } from '@/locales/fr/offers'
import { OfferCard, type OfferId, type OfferTone } from './OfferCard'
import styles from './styles/Offers.module.css'

/** Offer cards in render order; every id satisfies the union derived from the locale keys. */
const OFFER_IDS = ['create', 'automate'] as const satisfies readonly OfferId[]

/** Accent of each card, from the design: brand violet on the first, warning amber on the second. */
const OFFER_TONES = { create: 'brand', automate: 'warning' } as const satisfies Record<OfferId, OfferTone>

/** Id of the visually hidden heading that names the section. */
const HEADING_ID = 'offers-title'

/**
 * Offers section: eyebrow and hint, then one card per offer. Each card announces its detail dialog
 * and calls its own optional `onOpen`; the section itself stays a server component, and the design's
 * pointer tilt lives inside the card island.
 */
export const Offers = () => {
  return (
    <section id={SECTION_IDS.offers} aria-labelledby={HEADING_ID}>
      <div className={`${styles.content} mx-auto max-w-6xl`}>
        <h2 id={HEADING_ID} className="sr-only">
          {offers.srTitle}
        </h2>
        <div className="flex flex-wrap items-baseline gap-4">
          <p className="text-caption text-foreground-tertiary uppercase">{offers.eyebrow}</p>
          <p className="text-body-sm text-foreground-tertiary">{offers.hint}</p>
        </div>
        <div className={styles.grid}>
          {OFFER_IDS.map((offerId) => {
            const offer = offers[offerId]
            return (
              <OfferCard
                key={offerId}
                offerId={offerId}
                tone={OFFER_TONES[offerId]}
                kicker={offer.kicker}
                title={offer.cardTitle}
                text={offer.cardText}
                audiences={offer.audiences}
                detailLink={offers.detailLink}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
