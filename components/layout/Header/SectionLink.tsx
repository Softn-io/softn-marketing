'use client'

import type { MouseEvent, ReactNode } from 'react'
import type { NavLink } from './data/navLinks'
import { useActiveSectionContext } from './context/ActiveSectionContext'

type SectionLinkProps = {
  link: NavLink
  className?: string
  children?: ReactNode
  /**
   * Replaces the default click handling (let the browser follow the hash, then mark the link active).
   * Receives the event; the handler is then responsible for calling `select` when it navigates.
   */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * In-page navigation link. Carries `aria-current="location"` while its section is the active one.
 * "location" rather than "page": the link targets a position inside the current page, which is what
 * `page` (a link to the current document) does not describe; assistive technology announces
 * "current location". Without JavaScript it is a plain anchor.
 */
export const SectionLink = ({ link, className, children, onClick }: SectionLinkProps) => {
  const { activeId, select } = useActiveSectionContext()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onClick) {
      onClick(event)
      return
    }
    const isPlainLeftClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    if (!event.defaultPrevented && isPlainLeftClick) select(link.id)
  }

  return (
    <a
      href={link.href}
      onClick={handleClick}
      aria-label={link.ariaLabel}
      aria-current={activeId === link.id ? 'location' : undefined}
      className={className}
    >
      {children ?? link.label}
    </a>
  )
}
