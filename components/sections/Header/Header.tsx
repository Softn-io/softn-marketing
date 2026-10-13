import Link from "next/link"
import { ThemeToggle } from "@components/ui/ThemeToggle"
import { SECTION_IDS } from "@/lib/anchors"
import { nav } from "@/locales/fr/hero"
import { BookingCta } from "./BookingCta"
import { MobileMenu } from "./MobileMenu"
import { ScrollRevealCta } from "./ScrollRevealCta"
import { ActiveSectionProvider } from "./ActiveSectionContext"
import { SectionLink } from "./SectionLink"
import { getNavLinks } from "./navLinks"
import styles from "./Header.module.css"

/**
 * Sticky site header: skip link, logo, in-page navigation, theme toggle and booking call to action.
 * Below `lg` the navigation moves into the burger drawer (`MobileMenu`).
 * The navigation highlights the section being read (`ActiveSectionProvider`).
 * The desktop call to action only appears once the hero call to action has scrolled out of view.
 */
export const Header = () => {
  const links = getNavLinks()

  return (
    <ActiveSectionProvider ids={links.map((link) => link.id)}>
      <a href={`#${SECTION_IDS.main}`} className={styles["skip-link"]}>
        {nav.skipLink}
      </a>
      <header className={`${styles.header} sticky top-0 z-sticky flex items-center justify-between gap-6 bg-base`}>
        <Link
          href="/"
          aria-label={nav.logo.ariaLabel}
          className={`${styles.logo} font-display text-title-md text-foreground`}
        >
          {nav.logo.name}
          <span className="text-brand-vivid">{nav.logo.suffix}</span>
        </Link>
        <nav aria-label={nav.ariaLabel} className="hidden min-w-0 lg:block">
          <ul className="flex items-center justify-center gap-4">
            {links.map((link) => (
              <li key={link.id}>
                <SectionLink link={link} className={`${styles["nav-link"]} text-body-sm`} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ScrollRevealCta className="hidden lg:block">
            <BookingCta>
              <span className="xl:hidden">{nav.ctaShort}</span>
              <span className="hidden xl:inline">{nav.cta}</span>
            </BookingCta>
          </ScrollRevealCta>
          <MobileMenu links={links} ctaLabel={nav.cta} menuLabel={nav.menu.ariaLabel} closeLabel={nav.menu.closeAriaLabel} />
        </div>
      </header>
    </ActiveSectionProvider>
  )
}
