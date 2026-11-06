'use client'

import { Menu } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { goToSection } from '@/lib/anchors'
import { isPlainLeftClick } from '@/lib/pointer'
import { useActiveSectionContext } from './context/ActiveSectionContext'
import type { NavLink } from './data/navLinks'
import styles from './styles/Header.module.css'

type MobileMenuProps = {
  links: readonly NavLink[]
  ctaLabel: string
  /** Accessible name of the burger button and of the drawer dialog. */
  menuLabel: string
  /** Accessible name of the close control inside the drawer. */
  closeLabel: string
}

/**
 * The drawer itself, Base UI included, kept out of the initial bundle: only the burger ships with the
 * page. The `loading` fallback keeps the chunk load inside this subtree, so a suspending import never
 * reaches a route-level boundary; the drawer is the only thing that would render, and it renders empty.
 * It is mounted closed as soon as the burger is hovered, focused or pressed, so the first open does not
 * pay for the chunk load and the first render of the Base UI tree.
 */
const MobileMenuDrawer = dynamic(() => import('./MobileMenuDrawer').then((module) => module.MobileMenuDrawer), {
  loading: () => null,
})

/** Reads the `lg` breakpoint from the published token so the drawer never outlives the burger. */
const readDesktopMediaQuery = (): string | undefined => {
  const minWidth = getComputedStyle(document.documentElement).getPropertyValue('--softn-breakpoint-lg').trim()
  return minWidth === '' ? undefined : `(min-width: ${minWidth})`
}

/**
 * Burger button and full-screen navigation drawer shown below the `lg` breakpoint.
 * The burger is a plain button, server-rendered with the header: it owns the open state, so it stays
 * interactive and announces `aria-expanded` before any drawer code is in the browser.
 * Activating a link or the CTA closes the drawer first, then performs the action once the scroll lock
 * is released; a link also becomes the active section at that moment.
 *
 * The drawer (see {@link MobileMenuDrawer}) is loaded on demand, mounted closed on the first intent on
 * the burger and kept mounted from then on, so the first open is immediate and its exit transition and
 * the actions waiting on it keep working. A click that lands while the chunk is still loading opens the
 * drawer as soon as it arrives: the open state is already `true`.
 */
export const MobileMenu = ({ links, ctaLabel, menuLabel, closeLabel }: MobileMenuProps) => {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [dismissedBySwipe, setDismissedBySwipe] = useState(false)
  const { select } = useActiveSectionContext()
  const pendingAction = useRef<(() => void) | null>(null)
  const closeControl = useRef<HTMLButtonElement | null>(null)
  const burger = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const query = readDesktopMediaQuery()
    if (query === undefined) return undefined
    const media = window.matchMedia(query)
    const closeOnDesktop = (): void => {
      if (media.matches) setOpen(false)
    }
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])

  const mountDrawer = (): void => {
    setMounted(true)
  }

  const handleTriggerClick = (): void => {
    setMounted(true)
    setOpen((isOpen) => !isOpen)
  }

  const handleOpenChange = (nextOpen: boolean, reason: string): void => {
    setDismissedBySwipe(!nextOpen && reason === 'swipe')
    setOpen(nextOpen)
  }

  const closeThen = (action: () => void): void => {
    pendingAction.current = action
    setOpen(false)
  }

  const handleOpenChangeComplete = (isOpen: boolean): void => {
    if (isOpen) return
    const action = pendingAction.current
    pendingAction.current = null
    action?.()
  }

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>, link: NavLink): void => {
    if (event.defaultPrevented || !isPlainLeftClick(event)) return
    event.preventDefault()
    closeThen(() => {
      select(link.id)
      goToSection(link.id)
    })
  }

  return (
    <>
      <button
        ref={burger}
        type="button"
        aria-label={menuLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleTriggerClick}
        onPointerEnter={mountDrawer}
        onPointerDown={mountDrawer}
        onFocus={mountDrawer}
        className={`${styles.burger} inline-flex size-10 items-center justify-center rounded-pill lg:hidden`}
      >
        <Menu size={20} aria-hidden="true" focusable="false" />
      </button>
      {mounted ? (
        <MobileMenuDrawer
          open={open}
          onOpenChange={handleOpenChange}
          onOpenChangeComplete={handleOpenChangeComplete}
          onDismiss={() => setOpen(false)}
          onLinkClick={handleLinkClick}
          onBeforeActivate={closeThen}
          dismissedBySwipe={dismissedBySwipe}
          closeControl={closeControl}
          burger={burger}
          links={links}
          ctaLabel={ctaLabel}
          menuLabel={menuLabel}
          closeLabel={closeLabel}
        />
      ) : null}
    </>
  )
}
