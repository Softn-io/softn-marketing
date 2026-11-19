import Link from 'next/link'
import { FOOTER_LINKS } from '@/lib/footerLinks'
import { footer } from '@/locales/fr/footer'
import styles from './styles/Footer.module.css'

/** Props of {@link FooterNav}. */
type FooterNavProps = {
  /** Classes that place the navigation in the caller's layout (alignment, order). */
  className?: string | undefined
}

/**
 * Footer navigation: the contact page and the three legal pages, inside a labelled landmark.
 *
 * Owns the list semantics, the labels, the routes and the focus ring — the parts a second footer
 * would otherwise copy — and no placement of its own: the site footer and the coming-soon footer
 * both render it, each passing the class that fits it in its own row.
 *
 * @param props Optional class that places the navigation in the caller's row.
 * @returns The navigation landmark of a footer.
 */
export const FooterNav = ({ className }: FooterNavProps) => {
  return (
    <nav aria-label={footer.nav.ariaLabel} className={className}>
      <ul className={styles.list}>
        {FOOTER_LINKS.map((link) => (
          <li key={link.href}>
            {/* No aria-label: the visible label is the accessible name (WCAG 2.5.3, label in name). */}
            <Link href={link.href} className={`${styles.link} text-body-sm`}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
