import type { CSSProperties } from 'react'
import { method } from '@/locales/fr/method'
import { stepCaption } from './data/methodTimeline'
import { METHOD_TIMELINE_ID } from './data/timelineParallax'
import styles from './styles/MethodTimeline.module.css'

/**
 * Inline style of a step block: the stylesheet multiplies the zero-based index it carries by one
 * `--softn-space-8` step to build the block's sticky offset. `CSSProperties` has no index signature
 * for custom properties, so the intersection adds the one the stylesheet reads.
 */
type MethodStepStyle = CSSProperties & { '--method-step-index': number }

/** Style of the block at `index`: hands the stylesheet the index it derives the offset from. */
const stepStyle = (index: number): MethodStepStyle => ({ '--method-step-index': index })

/**
 * Sticky timeline of the method section: one block per step of `method.steps`, in order, whatever
 * the number of steps.
 *
 * The blocks pin under the sticky site header and pile up as the reader scrolls: each block pins one
 * step lower than the block above it, so the caption lines of the steps already pinned stay readable
 * above the current one, and each block paints over the ones behind it (see `.step` in the
 * stylesheet). The whole pile is pure CSS — the timeline is a server component, ships no JavaScript
 * and stays complete without it.
 *
 * Every string comes from `locales/fr/method.ts`: the caption line is the locale's counter template
 * filled with the step's number and closed by the step label. The parallax the design applies to
 * this block is driven by the agent section's entrance: `MethodTimelineParallax` finds the element
 * through `METHOD_TIMELINE_ID`.
 */
export const MethodTimeline = () => (
  <ol id={METHOD_TIMELINE_ID} className={`${styles.timeline} mx-auto max-w-6xl`}>
    {method.steps.map((step, index) => (
      <li key={`${index}-${step.label}`} className={styles.step} style={stepStyle(index)}>
        <p className={`${styles.caption} text-caption text-foreground-tertiary uppercase`}>
          <span className={styles.dot} aria-hidden="true" />
          {stepCaption(method.stepCounter, index, method.steps.length, step.label)}
        </p>
        <h3 className={`${styles.stepTitle} font-display text-display-sm text-foreground sm:text-display-md`}>
          {step.title}
        </h3>
        <p className={`${styles.stepText} text-body-md text-foreground-secondary`}>{step.text}</p>
      </li>
    ))}
  </ol>
)
