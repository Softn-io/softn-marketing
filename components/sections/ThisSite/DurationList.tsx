import styles from './styles/ThisSite.module.css'

type DurationListProps = {
  /** Pilot time as measured. */
  mel: string
  /** Agents' working time as measured. */
  agents: string
  /** Label naming the pilot's measure. */
  melLabel: string
  /** Label naming the agents' measure. */
  agentsLabel: string
}

/**
 * The two measures of a step, or of the total, as a description list: the labels name what each
 * figure counts, so the two natures are never confused. Rendered by the detail of a step and by the
 * total block of the section; both pass the wording in, which keeps it out of this module's
 * consumers when they are client code.
 */
export const DurationList = ({ mel, agents, melLabel, agentsLabel }: DurationListProps) => (
  <dl className={styles.durations}>
    <div className={styles.durationRow}>
      <dt className="text-body-sm text-foreground-tertiary">{melLabel}</dt>
      <dd className="text-body-md text-foreground">{mel}</dd>
    </div>
    <div className={styles.durationRow}>
      <dt className="text-body-sm text-foreground-tertiary">{agentsLabel}</dt>
      <dd className="text-body-md text-foreground">{agents}</dd>
    </div>
  </dl>
)
