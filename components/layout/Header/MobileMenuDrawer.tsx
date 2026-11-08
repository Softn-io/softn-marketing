'use client'

import { Drawer } from '@base-ui/react/drawer'
import { ArrowRight, X } from 'lucide-react'
import Link from 'next/link'
import { useRef, type MouseEvent, type RefObject } from 'react'
import { Logo } from '@components/ui/Logo'
import { ThemeToggle } from '@components/ui/ThemeToggle'
import { useHasPaintedOnce } from '@/hooks/useHasPaintedOnce'
import { ringlessFinalFocus } from '@/lib/focus/ringlessFinalFocus'
import { nav } from '@/locales/fr/hero'
import { SectionLink } from './SectionLink'
import { BookingCta } from './BookingCta'
import type { NavLink } from './data/navLinks'
import styles from './styles/Header.module.css'

type MobileMenuDrawerProps = {
  /** Open state, owned by the burger button outside this component. */
  open: boolean
  /** Reports the drawer's own open and close reasons, including the `'swipe'` of a swipe down. */
  onOpenChange: (open: boolean, reason: Drawer.Root.ChangeEventReason) => void
  /** Runs when an open or close transition has finished, so the caller can act after the scroll lock release. */
  onOpenChangeComplete: (open: boolean) => void
  /** Closes the drawer without a follow-up action, for the logo link. */
  onDismiss: () => void
  /** Closes the drawer first, then follows the activated navigation link. */
  onLinkClick: (event: MouseEvent<HTMLAnchorElement>, link: NavLink) => void
  /** Closes the drawer first, then runs the activation the call to action hands over. */
  onBeforeActivate: (activate: () => void) => void
  /** Whether the drawer was dismissed by a swipe down; drives its exit animation. */
  dismissedBySwipe: boolean
  /** Focus target on close: the burger button, which stays in the page. */
  burger: RefObject<HTMLButtonElement | null>
  links: readonly NavLink[]
  ctaLabel: string
  /** Accessible name of the drawer dialog. */
  menuLabel: string
  /** Accessible name of the close control inside the drawer. */
  closeLabel: string
}

/**
 * Modal navigation drawer below the `lg` breakpoint, built on the accessible Base UI drawer: focus is
 * trapped, Escape and a swipe down close it (a swipe can only start from the top row and the handle,
 * the links and CTA are marked swipe-ignore), focus lands on the close control and returns to the
 * burger, with the focus ring following the interaction that closed the drawer (visible for a
 * keyboard close, hidden for a pointer one).
 * The drawer layers sit above the sticky header and cover it; the popup repeats the header's top row
 * (logo, theme toggle, close control in the burger's spot) so the focus trap and the accessibility tree
 * stay correct.
 *
 * Loaded through `next/dynamic` from {@link MobileMenu}: only the burger ships with the page, and this
 * module, Base UI included, arrives on the first intent or open. It holds no open state of its own: the
 * burger owns it, so a click that lands before this module is in the browser still opens the drawer as
 * soon as it arrives, and `useHasPaintedOnce` holds the Root closed for one frame first, so Base UI
 * always sees the closed → open transition that locks the page.
 */
export const MobileMenuDrawer = ({
  open,
  onOpenChange,
  onOpenChangeComplete,
  onDismiss,
  onLinkClick,
  onBeforeActivate,
  dismissedBySwipe,
  burger,
  links,
  ctaLabel,
  menuLabel,
  closeLabel,
}: MobileMenuDrawerProps) => {
  const hasPaintedOnce = useHasPaintedOnce()
  /** Focus target on open: the close control, which sits where the burger was. */
  const closeControl = useRef<HTMLButtonElement | null>(null)
  const handleFinalFocus = ringlessFinalFocus(burger)

  const handleOpenChange = (nextOpen: boolean, details: Drawer.Root.ChangeEventDetails): void => {
    onOpenChange(nextOpen, details.reason)
  }

  return (
    <Drawer.Root
      open={hasPaintedOnce && open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      swipeDirection="down"
      modal
    >
      <Drawer.Portal className={styles.portal}>
        <Drawer.Backdrop className={styles.backdrop} />
        <Drawer.Viewport className={styles.viewport}>
          <Drawer.Popup
            className={styles.popup}
            aria-label={menuLabel}
            initialFocus={closeControl}
            finalFocus={handleFinalFocus}
            data-swipe-dismissed={dismissedBySwipe ? '' : undefined}
          >
            <div className={`${styles.header} ${styles['drawer-bar']} flex items-center justify-between gap-6`}>
              <Link href="/" aria-label={nav.logo.ariaLabel} className={styles.logo} onClick={onDismiss}>
                <Logo />
              </Link>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <Drawer.Close
                  ref={closeControl}
                  aria-label={closeLabel}
                  className={`${styles.burger} inline-flex size-10 items-center justify-center rounded-pill`}
                >
                  <X size={20} aria-hidden="true" focusable="false" />
                </Drawer.Close>
              </div>
            </div>
            <div className={styles['drawer-body']}>
              <div className={styles['drawer-handle']} aria-hidden="true">
                <span className={styles['drawer-handle-pill']} />
              </div>
              <div className={styles['drawer-content']} data-base-ui-swipe-ignore="">
                <nav className={styles['drawer-nav']}>
                  <ul className={styles['drawer-list']}>
                    {links.map((link) => (
                      <li key={link.id}>
                        <SectionLink
                          link={link}
                          onClick={(event) => onLinkClick(event, link)}
                          className={`${styles['drawer-link']} flex items-center justify-between font-display text-title-sm`}
                        >
                          {link.label}
                          <ArrowRight size={16} aria-hidden="true" focusable="false" className="text-brand-vivid" />
                        </SectionLink>
                      </li>
                    ))}
                  </ul>
                </nav>
                <BookingCta onBeforeActivate={onBeforeActivate} size="lg" className="self-start">
                  {ctaLabel}
                </BookingCta>
              </div>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
