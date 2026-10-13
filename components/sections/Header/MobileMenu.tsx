"use client"

import { Drawer } from "@base-ui/react/drawer"
import { ArrowRight, Menu, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, type MouseEvent } from "react"
import { ThemeToggle } from "@components/ui/ThemeToggle"
import { nav } from "@/locales/fr/hero"
import { goToSection } from "@/lib/anchors"
import { useActiveSectionContext } from "./ActiveSectionContext"
import { SectionLink } from "./SectionLink"
import { BookingCta } from "./BookingCta"
import type { NavLink } from "./navLinks"
import styles from "./Header.module.css"

type MobileMenuProps = {
  links: readonly NavLink[]
  ctaLabel: string
  /** Accessible name of the burger button and of the drawer dialog. */
  menuLabel: string
}

/** Reads the `lg` breakpoint from the published token so the drawer never outlives the burger. */
const readDesktopMediaQuery = (): string | undefined => {
  const minWidth = getComputedStyle(document.documentElement).getPropertyValue("--softn-breakpoint-lg").trim()
  return minWidth === "" ? undefined : `(min-width: ${minWidth})`
}

const isPlainLeftClick = (event: MouseEvent<HTMLElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/**
 * Burger button and full-screen navigation drawer shown below the `lg` breakpoint.
 * The drawer is modal: focus is trapped, Escape and a swipe down close it, focus returns to the burger.
 * The drawer layers sit above the sticky header and cover it; the popup repeats the header's top row
 * (logo, theme toggle, close control in the burger's spot) so the focus trap and the accessibility tree stay correct.
 * Focus lands on the close control on open, which is where the burger was.
 * Activating a link or the CTA closes the drawer first, then performs the action once the scroll lock is released;
 * a link also becomes the active section at that moment.
 */
export const MobileMenu = ({ links, ctaLabel, menuLabel }: MobileMenuProps) => {
  const [open, setOpen] = useState(false)
  const { select } = useActiveSectionContext()
  const pendingAction = useRef<(() => void) | null>(null)
  const closeControl = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const query = readDesktopMediaQuery()
    if (query === undefined) return undefined
    const media = window.matchMedia(query)
    const closeOnDesktop = (): void => {
      if (media.matches) setOpen(false)
    }
    media.addEventListener("change", closeOnDesktop)
    return () => media.removeEventListener("change", closeOnDesktop)
  }, [])

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
    <Drawer.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={handleOpenChangeComplete}
      swipeDirection="down"
      modal
    >
      <Drawer.Trigger
        aria-label={menuLabel}
        aria-expanded={open}
        className={`${styles.burger} inline-flex size-10 items-center justify-center rounded-pill lg:hidden`}
      >
        <Menu size={20} aria-hidden="true" focusable="false" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className={styles.backdrop} />
        <Drawer.Viewport className={styles.viewport}>
          <Drawer.Popup className={styles.popup} aria-label={menuLabel} initialFocus={closeControl}>
            <div className={`${styles.header} ${styles["drawer-bar"]} flex items-center justify-between gap-6`}>
              <Link
                href="/"
                aria-label={nav.logo.ariaLabel}
                className={`${styles.logo} font-display text-title-md text-foreground`}
                onClick={() => setOpen(false)}
              >
                {nav.logo.name}
                <span className="text-brand-vivid">{nav.logo.suffix}</span>
              </Link>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <Drawer.Close
                  ref={closeControl}
                  aria-label={menuLabel}
                  className={`${styles.burger} inline-flex size-10 items-center justify-center rounded-pill`}
                >
                  <X size={20} aria-hidden="true" focusable="false" />
                </Drawer.Close>
              </div>
            </div>
            <div className={styles["drawer-body"]}>
            <nav>
              <ul className={styles["drawer-list"]}>
                {links.map((link) => (
                  <li key={link.id}>
                    <SectionLink
                      link={link}
                      onClick={(event) => handleLinkClick(event, link)}
                      className={`${styles["drawer-link"]} flex items-center justify-between font-display text-title-sm`}
                    >
                      {link.label}
                      <ArrowRight size={16} aria-hidden="true" focusable="false" className="text-brand-vivid" />
                    </SectionLink>
                  </li>
                ))}
              </ul>
            </nav>
            <BookingCta onBeforeActivate={closeThen} size="lg" className="self-start">
              {ctaLabel}
            </BookingCta>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
