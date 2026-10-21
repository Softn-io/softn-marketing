import { ArrowDown } from 'lucide-react'
import { SECTION_IDS } from '@/lib/anchors'
import { interpolate } from '@/lib/interpolate'
import { ASSISTANT_NAME } from '@/locales/fr/chatbot'
import { hero } from '@/locales/fr/hero'
import styles from './styles/Hero.module.css'

/**
 * Bottom of the hero: an in-page link to the assistant section, announced by the assistant prompt
 * with the assistant name interpolated. The round badge and its arrow are decorative (hidden from
 * assistive technology), so the link keeps the prompt as its only accessible name.
 */
export const HeroScrollIndicator = () => {
  const label = interpolate(hero.agentPrompt, { assistantName: ASSISTANT_NAME })

  return (
    <a
      href={`#${SECTION_IDS.agent}`}
      className={`${styles.indicator} ${styles.reveal} ${styles['reveal-delay-8']} text-body-sm`}
    >
      <span aria-hidden="true" className={`${styles['indicator-badge']} ${styles.drift}`}>
        <ArrowDown />
      </span>
      {label}
    </a>
  )
}
