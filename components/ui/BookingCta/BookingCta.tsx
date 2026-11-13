'use client'

import type { MouseEvent, ReactNode } from 'react'
import { Button } from '@components/ui/Button'
import { SECTION_IDS, goToSection } from '@/lib/anchors'
import { ASSISTANT_INTENTS, dispatchAssistantIntent } from '@/lib/assistant/intent'
import { isPlainLeftClick } from '@/lib/pointer'

type BookingCtaProps = {
  children: ReactNode
  /** Element id, for the callers that watch this exact link (the header follows the hero's). */
  id?: string | undefined
  /** Layout classes forwarded to the button. */
  className?: string | undefined
  size?: 'sm' | 'lg' | undefined
  /**
   * Runs instead of the immediate activation. Receives the activation to call once the caller is ready,
   * e.g. after a drawer finished closing.
   */
  onBeforeActivate?: (activate: () => void) => void
}

/**
 * Booking call to action, shared by the desktop header, the mobile drawer, the hero and the sections
 * that offer the booking. Always a plain in-page link to the assistant section, where the reservation
 * flow lives, so it works without JavaScript.
 *
 * A plain left click additionally asks the assistant to open that flow — a fire-and-forget event: the
 * link keeps working, and keeps `#assistant` in the URL, whether or not the conversation island is
 * loaded — and scrolls the section into view, whether or not the fragment is already in the URL.
 * Modifier and non-primary clicks keep the native link behaviour (new tab, download, context menu)
 * and do nothing extra.
 *
 * `onBeforeActivate` hands the activation over instead of running it: the caller calls it once it is
 * ready, e.g. after the mobile drawer has finished closing.
 *
 * `id` is forwarded to the button for the callers that watch this exact element (the header watches
 * the hero's `HERO_CTA_ID`); the other callers leave it out.
 */
export const BookingCta = ({ children, id, className, size, onBeforeActivate }: BookingCtaProps) => {
  const activate = (): void => {
    goToSection(SECTION_IDS.agent)
    dispatchAssistantIntent(ASSISTANT_INTENTS.booking)
  }

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.defaultPrevented || !isPlainLeftClick(event)) return
    event.preventDefault()
    if (onBeforeActivate) {
      onBeforeActivate(activate)
    } else {
      activate()
    }
  }

  return (
    <Button href={`#${SECTION_IDS.agent}`} id={id} onClick={handleClick} size={size} className={className}>
      {children}
    </Button>
  )
}
