import { hero } from '@/locales/fr/hero'
import { HeroGlow } from './HeroGlow'
import { HeroPrimaryCta } from './HeroPrimaryCta'
import { HeroScrollIndicator } from './HeroScrollIndicator'
import { HeroSecondaryCta } from './HeroSecondaryCta'
import styles from './styles/Hero.module.css'

/**
 * Hero section: eyebrow, the page's single `<h1>` (its three lines revealed in sequence), subtitle,
 * the two calls to action, the reassurance line and the scroll indicator towards the assistant.
 *
 * Every text comes from `locales/fr/hero.ts`. The entrance animations are plain CSS — a rise and a
 * fade starting at a non-zero opacity, so the text is painted from the first frame and stays an LCP
 * candidate — and no base rule hides the content, so the hero is complete and readable without
 * JavaScript. Only the pointer-following glow and the primary call to action are client islands.
 */
export const Hero = () => {
  return (
    <section className={styles.hero}>
      <HeroGlow />
      <div className={styles.content}>
        <p className={`${styles.reveal} text-caption text-brand-foreground uppercase`}>{hero.eyebrow}</p>
        <h1 className="mt-5 font-display text-display-md text-foreground md:text-display-lg">
          <span className={`${styles.reveal} ${styles['reveal-delay-1']} block`}>{hero.title.line1}</span>{' '}
          <span className={`${styles.reveal} ${styles['reveal-delay-2']} block`}>{hero.title.line2}</span>{' '}
          <span className={`${styles.reveal} ${styles['reveal-delay-3']} block`}>{hero.title.line3}</span>
        </h1>
        <p
          className={`${styles.subtitle} ${styles.reveal} ${styles['reveal-delay-4']} text-body-md text-foreground-secondary`}
        >
          {hero.subtitle}
        </p>
        <div className={`${styles.actions} ${styles.reveal} ${styles['reveal-delay-5']}`}>
          <HeroPrimaryCta />
          <HeroSecondaryCta />
        </div>
        <p
          className={`${styles.reassurance} ${styles.reveal} ${styles['reveal-delay-6']} mt-5 text-body-sm text-foreground-tertiary`}
        >
          {hero.reassurance}
        </p>
        <HeroScrollIndicator />
      </div>
    </section>
  )
}
