'use client'

import { Drawer } from '@base-ui/react/drawer'
import { ArrowRight, X } from 'lucide-react'
import Link from 'next/link'
import type { MouseEvent, RefObject } from 'react'
import { Logo } from '@components/ui/Logo'
import { ThemeToggle } from '@components/ui/ThemeToggle'
import { nav } from '@/locales/fr/hero'
import { SectionLink } from './SectionLink'
import { BookingCta } from './BookingCta'
import type { NavLink } from './data/navLinks'
import styles from './styles/Header.module.css'

type MobileMenuDrawerProps = {
  /** Open state, owned by the burger button outside this component. */
  open: boolean
  /** Reports the drawer's own open and close; `reason` is Base UI's, and `'swipe'` is the swipe down. */
  onOpenChange: (open: boolean, reason: string) => void
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
  /** Focus target on open: the close control, which sits where the burger was. */
  closeControl: RefObject<HTMLButtonElement | null>
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
 * the links and CTA are marked swipe-ignore), focus lands on the close control and returns to the burger.
 * The drawer layers sit above the sticky header and cover it; the popup repeats the header's top row
 * (logo, theme toggle, close control in the burger's spot) so the focus trap and the accessibility tree
 * stay correct.
 *
 * Loaded through `next/dynamic` from {@link MobileMenu}: only the burger ships with the page, and this
 * module, Base UI included, arrives on the first intent or open. It holds no open state of its own: the
 * burger owns it, so a click that lands before this module is in the browser still opens the drawer as
 * soon as it arrives.
 */
export const MobileMenuDrawer = ({
  open,
  onOpenChange,
  onOpenChangeComplete,
  onDismiss,
  onLinkClick,
  onBeforeActivate,
  dismissedBySwipe,
  closeControl,
  burger,
  links,
  ctaLabel,
  menuLabel,
  closeLabel,
}: MobileMenuDrawerProps) => {
  const handleOpenChange = (nextOpen: boolean, details: Drawer.Root.ChangeEventDetails): void => {
    onOpenChange(nextOpen, details.reason)
  }

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>, link: NavLink): void => {
    onLinkClick(event, link)
  }

  return (
    <Drawer.Root
      open={open}
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
            finalFocus={burger}
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
                          onClick={(event) => handleLinkClick(event, link)}
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
