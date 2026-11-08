'use client'

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import { SECTION_IDS, goToSection } from '@/lib/anchors'
import { ASSISTANT_INTENTS, dispatchAssistantIntent } from '@/lib/assistant/intent'
import { offers } from '@/locales/fr/offers'
import { OFFER_TONES, OfferCard, offerActionId, type OfferId } from './OfferCard'
import styles from './styles/Offers.module.css'

/** Offer cards in render order; every id satisfies the union derived from the locale keys. */
const OFFER_IDS = ['create', 'automate'] as const satisfies readonly OfferId[]

/** Id of the visually hidden heading that names the section. */
const HEADING_ID = 'offers-title'

/**
 * The detail sheet, Base UI included, kept out of the initial bundle: the cards ship on their own. The
 * `loading` fallback keeps the chunk load inside this subtree, so a suspending import never reaches a
 * route-level boundary; the sheet is the only thing that would render, and it renders empty. It is
 * mounted closed as soon as a card is hovered, focused or pressed, so the first open does not pay for
 * the chunk load and the first render of the Base UI tree.
 */
const OfferSheet = dynamic(() => import('./OfferSheet').then((module) => module.OfferSheet), { loading: () => null })

/**
 * Offers section: eyebrow and hint, then one card per offer, plus the full-screen detail sheet of
 * the open offer. The section owns the open state: a card activation opens its sheet, Escape or the
 * sheet's close control closes it, and a call to action closes it before scrolling to the assistant.
 * The sheet is mounted closed on the first intent on a card and kept mounted from then on, so the first
 * open is immediate and its exit transition and the navigation waiting on it keep working; a click that
 * lands while its chunk is still loading opens it as soon as it arrives.
 */
export const Offers = () => {
  const [openOfferId, setOpenOfferId] = useState<OfferId | null>(null)
  const [shouldMountSheet, setShouldMountSheet] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)
  const openingCard = useRef<HTMLElement | null>(null)

  const mountSheet = (): void => {
    setShouldMountSheet(true)
  }

  const handleOpen = (offerId: OfferId): void => {
    // The control lives inside OfferCard: resolve it by the id the card exposes, so focus can return
    // there after closing even when the browser did not focus the button on click.
    openingCard.current = document.getElementById(offerActionId(offerId))
    setShouldMountSheet(true)
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
                onIntent={mountSheet}
              />
            )
          })}
        </div>
        {shouldMountSheet ? (
          <OfferSheet
            offerId={openOfferId}
            finalFocus={openingCard}
            onClose={handleClose}
            onFollowCta={handleFollowCta}
            onCloseComplete={handleCloseComplete}
          />
        ) : null}
      </div>
    </section>
  )
}
