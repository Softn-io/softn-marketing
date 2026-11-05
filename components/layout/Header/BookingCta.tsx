'use client'

import type { MouseEvent, ReactNode } from 'react'
import { Button } from '@components/ui/Button'
import { SECTION_IDS, goToSection } from '@/lib/anchors'
import { ASSISTANT_INTENTS, dispatchAssistantIntent } from '@/lib/assistant/intent'

type BookingCtaProps = {
  children: ReactNode
  /** Layout classes forwarded to the button. */
  className?: string
  size?: 'sm' | 'lg'
  /**
   * Runs instead of the immediate activation. Receives the activation to call once the caller is ready,
   * e.g. after a drawer finished closing.
   */
  onBeforeActivate?: (activate: () => void) => void
}

const isPlainLeftClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/**
 * Booking call to action. Links to the assistant section, where the reservation flow lives, so it
 * works without JavaScript; clicking asks the assistant to open that flow and scrolls the section
 * into view, whether or not its fragment is already in the URL.
 */
export const BookingCta = ({ children, className, size, onBeforeActivate }: BookingCtaProps) => {
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
    <Button href={`#${SECTION_IDS.agent}`} onClick={handleClick} size={size} className={className}>
      {children}
    </Button>
  )
}
