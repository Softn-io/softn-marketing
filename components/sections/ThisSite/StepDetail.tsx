import { DurationList } from './DurationList'
import type { ThisSiteLabels, ThisSiteStep } from './data/thisSiteSteps'
import styles from './styles/ThisSite.module.css'

type StepDetailProps = {
  /** Step whose detail is shown. */
  step: ThisSiteStep
  /** Wording of the detail, read from the locale by the section. */
  labels: ThisSiteLabels
}

/** Measured time of a step: the two labelled measures, or nothing at all. */
const StepTime = ({ step, labels }: StepDetailProps) => {
  const durations = step.durations
  if (durations === undefined) {
    return null
  }

  return (
    <DurationList
      mel={durations.mel}
      agents={durations.agents}
      melLabel={labels.durationMelLabel}
      agentsLabel={labels.durationAgentsLabel}
    />
  )
}

/**
 * Detail of one step: its heading and body, the measured time (two labelled measures, or nothing at
 * all), the instructions given to the agents between the locale's quotation marks, the technical
 * note when the step has one, and the tags.
 *
 * Every string arrives through `step` and `labels`: this module holds no copy, so its code can ship
 * to the browser without any locale.
 */
export const StepDetail = ({ step, labels }: StepDetailProps) => (
  <>
    <h3 className="font-display text-display-md text-foreground">{step.heading}</h3>
    <p className="text-body-md text-foreground-secondary">{step.body}</p>
    <div className={styles.detailBlock}>
      <p className="text-caption text-foreground-tertiary uppercase">{labels.promptLabel}</p>
      <p className={`${styles.prompt} text-body-md text-foreground`}>
        {labels.promptQuotes.open}
        {step.prompt}
        {labels.promptQuotes.close}
        <span aria-hidden="true" className={styles.caret} />
      </p>
    </div>
    {step.tech === '' ? null : (
      <div className={styles.detailBlock}>
        <p className="text-caption text-foreground-tertiary uppercase">{labels.techLabel}</p>
        <p className="text-body-sm text-foreground-secondary">{step.tech}</p>
      </div>
    )}
    <StepTime step={step} labels={labels} />
    <ul className={styles.tags}>
      {step.tags.map((tag) => (
        <li key={tag} className={`${styles.tag} text-label text-foreground-tertiary`}>
          {tag}
        </li>
      ))}
    </ul>
  </>
)
