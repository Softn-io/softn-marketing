'use client'

import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { MouseEvent, RefObject } from 'react'
import { Button } from '@components/ui/Button'
import { SECTION_IDS } from '@/lib/anchors'
import { interpolate } from '@/lib/interpolate'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { offers } from '@/locales/fr/offers'
import { OFFER_TONES, type OfferId, type OfferTone } from './OfferCard'
import styles from './styles/OfferSheet.module.css'

/** Which call to action a visitor followed from the sheet. */
type OfferSheetCta = 'primary' | 'secondary'

type OfferSheetProps = {
  /** Offer whose sheet is open, or `null` while the dialog is closed. */
  offerId: OfferId | null
  /** Card control that opened the sheet; focus returns there on close, including with a mouse. */
  finalFocus: RefObject<HTMLElement | null>
  /** Closes the sheet without following a call to action. */
  onClose: () => void
  /** Asks the section to close the sheet, then run the matching navigation once scrolling is unlocked. */
  onFollowCta: (cta: OfferSheetCta) => void
  /** Relays the dialog's close completion to the section, which owns the pending navigation. */
  onCloseComplete: (open: boolean) => void
}

/** Text accent shared by the sheet's kicker and its step numbers. */
const TONE_TEXT: Record<OfferTone, string> = {
  brand: 'text-brand-foreground',
  warning: 'text-warning',
}

const GAINS_HEADING_ID = 'offer-sheet-gains'
const PHASES_HEADING_ID = 'offer-sheet-phases'
const WHO_HEADING_ID = 'offer-sheet-who'

/** Modifier keys and non-primary buttons keep the native link behaviour (new tab, download, context menu). */
const isPlainLeftClick = (event: MouseEvent<HTMLElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

type OfferSheetContentProps = {
  offerId: OfferId
  tone: OfferTone
  onFollowCta: (cta: OfferSheetCta) => void
}

/**
 * Sheet body for one offer: sticky header with the offer kicker and the close control, then the
 * title, the intro, the gains, the numbered phases and the audience, ending with the two calls to
 * action. Everything comes from `offers[offerId]`; the phase numbers are generated from the list
 * order, so the copy never carries them.
 */
const OfferSheetContent = ({ offerId, tone, onFollowCta }: OfferSheetContentProps) => {
  const offer = offers[offerId]
  const sheet = offer.sheet
  const toneText = TONE_TEXT[tone]
  const secondaryLabel = interpolate(sheet.cta.secondary, { assistantName: ASSISTANT_NAME })

  const handleCtaClick =
    (cta: OfferSheetCta) =>
    (event: MouseEvent<HTMLAnchorElement>): void => {
      if (event.defaultPrevented || !isPlainLeftClick(event)) return
      event.preventDefault()
      onFollowCta(cta)
    }

  return (
    <>
      <header className={styles.header}>
        <div className={`${styles.headerInner} mx-auto flex w-full max-w-4xl items-center justify-between gap-5`}>
          <span className={`${toneText} text-caption uppercase`}>{offer.kicker}</span>
          <Dialog.Close aria-label={offers.sheetCloseLabel} className={styles.close}>
            <X aria-hidden="true" focusable="false" className={styles.closeIcon} />
          </Dialog.Close>
        </div>
      </header>
      <div className={`${styles.content} mx-auto w-full max-w-4xl`}>
        <div className="flex flex-col gap-5">
          <Dialog.Title
            className={`${styles.title} font-display text-display-md font-bold text-foreground md:text-display-lg`}
          >
            {sheet.title}
          </Dialog.Title>
          <Dialog.Description className={`${styles.intro} text-body-lg text-foreground-secondary`}>
            {sheet.intro}
          </Dialog.Description>
        </div>
        <section className={styles.section} aria-labelledby={GAINS_HEADING_ID}>
          <h3 id={GAINS_HEADING_ID} className="text-caption text-foreground-tertiary uppercase">
            {sheet.gainsLabel}
          </h3>
          <ul className={`${styles.sectionBody} ${styles.items}`}>
            {sheet.items.map((item) => (
              <li key={item.title} className={styles.item}>
                <p className="font-display text-title-sm font-bold text-foreground">{item.title}</p>
                <p className="text-body-md text-foreground-secondary">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.section} aria-labelledby={PHASES_HEADING_ID}>
          <h3 id={PHASES_HEADING_ID} className="text-caption text-foreground-tertiary uppercase">
            {sheet.phasesLabel}
          </h3>
          <ol className={`${styles.sectionBody} ${styles.phases}`}>
            {sheet.phases.map((phase, index) => (
              <li key={phase} className={styles.phase}>
                <span aria-hidden="true" className={`${styles.phaseNumber} ${toneText} text-caption`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-body-md text-foreground-secondary">{phase}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.section} aria-labelledby={WHO_HEADING_ID}>
          <h3 id={WHO_HEADING_ID} className="text-caption text-foreground-tertiary uppercase">
            {sheet.whoLabel}
          </h3>
          <div className={`${styles.sectionBody} ${styles.who}`}>
            <p className="text-body-md text-foreground-secondary">{sheet.who}</p>
            <div className={styles.actions}>
              <Button href={`#${SECTION_IDS.agent}`} size="lg" onClick={handleCtaClick('primary')}>
                {sheet.cta.primary}
              </Button>
              <a
                href={`#${SECTION_IDS.agent}`}
                className={`${styles.secondary} text-body-md`}
                onClick={handleCtaClick('secondary')}
              >
                {secondaryLabel}
              </a>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

/**
 * Full-screen offer detail sheet, built on the accessible Base UI dialog: the modal locks page
 * scroll and outside interaction, traps focus, closes on Escape or on the icon-only close control,
 * and returns focus to the card that opened it. The dialog root stays mounted between openings so
 * the section can run a pending call-to-action navigation after the close completes.
 */
export const OfferSheet = ({ offerId, finalFocus, onClose, onFollowCta, onCloseComplete }: OfferSheetProps) => {
  const handleOpenChange = (open: boolean): void => {
    if (!open) onClose()
  }

  return (
    <Dialog.Root open={offerId !== null} onOpenChange={handleOpenChange} onOpenChangeComplete={onCloseComplete}>
      <Dialog.Portal>
        <Dialog.Popup className={styles.popup} aria-modal="true" finalFocus={finalFocus}>
          {offerId === null ? null : (
            <OfferSheetContent offerId={offerId} tone={OFFER_TONES[offerId]} onFollowCta={onFollowCta} />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
