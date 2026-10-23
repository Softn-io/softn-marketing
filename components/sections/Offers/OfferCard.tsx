'use client'

import { ArrowRight } from 'lucide-react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Offers } from '@/locales/fr/offers'
import styles from './styles/Offers.module.css'

/**
 * Ids of the offer cards: the keys of the offers locale whose value carries a card. The locale stays
 * the single source, so the union follows the copy without a parallel hand-written type.
 */
export type OfferId = {
  [Key in keyof Offers]: Offers[Key] extends { readonly cardTitle: string } ? Key : never
}[keyof Offers]

/** Accent of an offer card, as the design assigns it: brand on the first card, warning on the second. */
export type OfferTone = 'brand' | 'warning'

/** Accent shared by each offer card and its detail sheet, from the design. */
export const OFFER_TONES = { create: 'brand', automate: 'warning' } as const satisfies Record<OfferId, OfferTone>

/** DOM id of a card's invisible action button, used to restore focus after its sheet closes. */
export const offerActionId = (offerId: OfferId): string => `offer-${offerId}-action`

/** Handlers shared by both cards: the accent does not change the interaction. */
const TONE_STYLES: Record<OfferTone, { readonly kicker: string; readonly card: string }> = {
  brand: { kicker: 'text-brand-foreground', card: styles['tone-brand'] ?? '' },
  warning: { kicker: 'text-warning', card: styles['tone-warning'] ?? '' },
}

type OfferCardProps = {
  /** Locale key of the offer; passed back to `onOpen`. */
  offerId: OfferId
  /** Accent used by the kicker, the hover border and the focus border. */
  tone: OfferTone
  /** Small uppercase label above the title. */
  kicker: string
  /** Card title, rendered as the third heading level under the section's hidden h2. */
  title: string
  /** Description of the offer. */
  text: string
  /** Audience labels, pushed to the bottom of the card as pills. */
  audiences: readonly string[]
  /** Label of the detail affordance, shared by both cards. */
  detailLink: string
  /** Called with this card's id when the card is activated; without it the card does nothing. */
  onOpen?: ((offerId: OfferId) => void) | undefined
}

/**
 * One offer: a card whose whole surface is a native button. The button is an invisible overlay named
 * by the card title, so the heading, the text and the audience pills keep their own semantics while
 * the card stays clickable and keyboard operable.
 *
 * Pointer moves write the normalized position to two custom properties of the card; the stylesheet
 * computes the tilt from them, so no pointer move re-renders the component. Touch pointers are
 * ignored, and the stylesheet only applies the tilt to hovering fine pointers with motion allowed.
 */
export const OfferCard = ({ offerId, tone, kicker, title, text, audiences, detailLink, onOpen }: OfferCardProps) => {
  const titleId = `offer-${offerId}-title`
  const toneStyles = TONE_STYLES[tone]

  const handleClick = (): void => {
    onOpen?.(offerId)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    // Cancel the native activation so the callback runs once instead of twice.
    event.preventDefault()
    onOpen?.(offerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLElement>): void => {
    // A finger drags the page instead of pointing at it.
    if (event.pointerType === 'touch') return
    const card = event.currentTarget
    const box = card.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    card.style.setProperty('--offer-pointer-x', `${(event.clientX - box.left) / box.width}`)
    card.style.setProperty('--offer-pointer-y', `${(event.clientY - box.top) / box.height}`)
    card.dataset.tilted = 'true'
  }

  const handlePointerLeave = (event: PointerEvent<HTMLElement>): void => {
    event.currentTarget.removeAttribute('data-tilted')
  }

  return (
    <article
      className={`${styles.card} ${toneStyles.card}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <span className={`${toneStyles.kicker} text-caption uppercase`}>{kicker}</span>
        <span className="inline-flex items-center gap-1 text-body-sm text-foreground-tertiary">
          {detailLink}
          <ArrowRight aria-hidden="true" className={styles.arrow} />
        </span>
      </div>
      <h3
        id={titleId}
        className={`${styles.title} font-display text-display-sm font-bold text-foreground lg:text-display-md`}
      >
        {title}
      </h3>
      <p className={`${styles.text} text-body-md text-foreground-secondary`}>{text}</p>
      <ul className="mt-auto flex flex-wrap gap-2 pt-2">
        {audiences.map((audience) => (
          <li key={audience} className={`${styles.pill} text-label font-normal text-foreground-tertiary`}>
            {audience}
          </li>
        ))}
      </ul>
      <button
        id={offerActionId(offerId)}
        type="button"
        aria-haspopup="dialog"
        aria-labelledby={titleId}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={styles.action}
      />
    </article>
  )
}
