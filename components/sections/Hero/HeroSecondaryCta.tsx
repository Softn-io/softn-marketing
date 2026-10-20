import { SECTION_IDS } from '@/lib/anchors'
import { hero } from '@/locales/fr/hero'
import styles from './styles/Hero.module.css'

/**
 * Secondary hero call to action: an in-page link to the method section, underlined with the default
 * border color and switching to the brand color on hover, as in the design.
 */
export const HeroSecondaryCta = () => {
  return (
    <a href={`#${SECTION_IDS.method}`} className={`${styles.secondary} text-body-md`}>
      {hero.cta.secondary}
    </a>
  )
}
