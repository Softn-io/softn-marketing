import { nav } from '@/locales/fr/hero'
import styles from './Logo.module.css'

/**
 * Size steps of the wordmark: the page chrome's type-scale step and the large decorative one.
 * `md` is `text-title-md` (family, size, weight and tracking from the type scale), `hero` the fluid
 * display size no token covers yet (see the stylesheet).
 */
const SIZE_CLASSES = {
  md: 'text-title-md',
  hero: styles.hero,
} as const

type LogoSize = keyof typeof SIZE_CLASSES

type LogoProps = {
  /** Size step of the wordmark: `md` in the page chrome, `hero` for the large decorative one. */
  size?: LogoSize | undefined
  /** Classes that place the wordmark in the caller's layout (margins, alignment). */
  className?: string | undefined
}

/**
 * softn.io wordmark: the site name, then its suffix in the brand vivid colour, both from `nav.logo`.
 *
 * Owns the whole typography — display face, size step, weight, tracking, name colour, suffix
 * colour — so no caller sizes it. A single block-level `<span>` holds the two pieces: a block box
 * takes its own line box, so the font of the element the wordmark sits in cannot move it.
 *
 * Renders no link and no interactive element: the caller keeps its own `<Link>`, its `href`,
 * `aria-label`, `onClick`, focus ring and whatever positions the wordmark in its layout.
 *
 * @returns The wordmark, ready to sit in a link or in a decorative block.
 */
export const Logo = ({ size = 'md', className }: LogoProps) => {
  const classes = [styles.wordmark, 'font-display text-foreground', SIZE_CLASSES[size], className]
    .filter((value): value is string => value !== undefined && value !== '')
    .join(' ')

  return (
    <span className={classes}>
      {nav.logo.name}
      <span className="text-brand-vivid">{nav.logo.suffix}</span>
    </span>
  )
}
