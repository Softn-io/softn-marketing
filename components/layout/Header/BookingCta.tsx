'use client'

import type { MouseEvent, ReactNode } from 'react'
import { Button } from '@components/ui/Button'
import { SECTION_IDS, goToSection } from '@/lib/anchors'
import { dispatchOpenChatbot } from '@/lib/chatbotEvents'

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
 * Booking call to action. Asks the chatbot to open through the `open-chatbot` event; when no
 * listener claims it, scrolls to the booking section. Without JavaScript it is a plain `#reservation` link.
 */
export const BookingCta = ({ children, className, size, onBeforeActivate }: BookingCtaProps) => {
  const activate = (): void => {
    const claimed = dispatchOpenChatbot({ source: 'header' })
    if (!claimed) goToSection(SECTION_IDS.booking)
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
    <Button href={`#${SECTION_IDS.booking}`} onClick={handleClick} size={size} className={className}>
      {children}
    </Button>
  )
}
