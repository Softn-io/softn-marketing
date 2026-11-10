import { thisSite } from '@/locales/fr/thisSite'
import { DurationList } from './DurationList'
import styles from './styles/ThisSite.module.css'

/**
 * Measured total of the section: its label, the two measures, then what the count covers and where
 * the figures come from. Rendered by the section, so it stays a server component and reads the
 * locale directly.
 */
export const ThisSiteTotal = () => (
  <div className={styles.total}>
    <p className="text-caption text-foreground-tertiary uppercase">{thisSite.totalLabel}</p>
    <DurationList
      mel={thisSite.total.mel}
      agents={thisSite.total.agents}
      melLabel={thisSite.durationMelLabel}
      agentsLabel={thisSite.durationAgentsLabel}
    />
    <p className={`${styles.totalNote} text-body-sm text-foreground-tertiary`}>{thisSite.totalScope}</p>
    <p className={`${styles.totalNote} text-body-sm text-foreground-tertiary`}>{thisSite.durationNote}</p>
  </div>
)
