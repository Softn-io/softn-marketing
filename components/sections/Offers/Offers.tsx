'use client'

import { useRef, useState } from 'react'
import { SECTION_IDS, goToSection } from '@/lib/anchors'
import { ASSISTANT_INTENTS, dispatchAssistantIntent } from '@/lib/assistant/intent'
import { offers } from '@/locales/fr/offers'
import { OFFER_TONES, OfferCard, offerActionId, type OfferId } from './OfferCard'
import { OfferSheet } from './OfferSheet'
import styles from './styles/Offers.module.css'

/** Offer cards in render order; every id satisfies the union derived from the locale keys. */
const OFFER_IDS = ['create', 'automate'] as const satisfies readonly OfferId[]

/** Id of the visually hidden heading that names the section. */
const HEADING_ID = 'offers-title'

/**
 * Offers section: eyebrow and hint, then one card per offer, plus the full-screen detail sheet of
 * the open offer. The section owns the open state: a card activation opens its sheet, Escape or the
 * sheet's close control closes it, and a call to action closes it before scrolling to the assistant.
 */
export const Offers = () => {
  const [openOfferId, setOpenOfferId] = useState<OfferId | null>(null)
  const pendingAction = useRef<(() => void) | null>(null)
  const openingCard = useRef<HTMLElement | null>(null)

  const handleOpen = (offerId: OfferId): void => {
    // The control lives inside OfferCard: resolve it by the id the card exposes, so focus can return
    // there after closing even when the browser did not focus the button on click.
    openingCard.current = document.getElementById(offerActionId(offerId))
    setOpenOfferId(offerId)
  }

  const handleClose = (): void => {
    setOpenOfferId(null)
  }

  const handleFollowCta = (cta: 'primary' | 'secondary'): void => {
    pendingAction.current = () => {
      goToSection(SECTION_IDS.agent)
      if (cta === 'primary') dispatchAssistantIntent(ASSISTANT_INTENTS.booking)
    }
    setOpenOfferId(null)
  }

  // The section must wait for the dialog's scroll lock to be released before changing the hash, so
  // the browser can scroll to the target; the dialog reports the end of its closing here.
  const handleCloseComplete = (isOpen: boolean): void => {
    if (isOpen) return
    const action = pendingAction.current
    pendingAction.current = null
    action?.()
  }

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
                onOpen={handleOpen}
              />
            )
          })}
        </div>
        <OfferSheet
          offerId={openOfferId}
          finalFocus={openingCard}
          onClose={handleClose}
          onFollowCta={handleFollowCta}
          onCloseComplete={handleCloseComplete}
        />
      </div>
    </section>
  )
}
