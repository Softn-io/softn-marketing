'use client'

import { Tabs } from '@base-ui/react/tabs'
import { useState, type PointerEvent, type ReactNode } from 'react'
import { StepDetail } from './StepDetail'
import type { ThisSiteLabels, ThisSiteStep } from './data/thisSiteSteps'
import styles from './styles/ThisSite.module.css'

/**
 * The two columns of the stylesheet, at the `md` breakpoint, on a pointer that really hovers: the
 * only layout where a hover can safely reveal a step. Below it the list stacks above the detail, and
 * a pointer travelling from a step down to its detail crosses the steps in between.
 *
 * Exported so the unit test stubs `matchMedia` on the very query the island matches, rather than on
 * a copy of that string which could drift from it.
 */
export const HOVER_SELECTION_QUERY = '(min-width: 48rem) and (hover: hover)'

type ThisSiteTabsProps = {
  /** Steps to show, in order: each one becomes a tab and the panel that holds its detail. */
  steps: readonly ThisSiteStep[]
  /** Wording of the details, read from the locale by the section. */
  labels: ThisSiteLabels
  /** Id of the heading that also names the tab list. */
  labelledBy: string
  /** The total block, rendered by the section: it belongs to the left column, under the steps. */
  total: ReactNode
}

/**
 * Interactive part of the "Ce site" section: the vertical tab list of the six steps, the panel that
 * holds the detail of the selected one, and the total block the section passes as `total` — the
 * section renders them on the server, so its own code stays out of the bundle.
 *
 * Base UI Tabs carries the ARIA wiring, the roving focus and the keyboard support; `activateOnFocus`
 * reveals a step as soon as the arrow keys land on it. In the two-column layout a hovering pointer
 * selects the step under it, like the design; a tap and a keyboard focus select the same way, so the
 * detail never depends on a pointer. Every panel stays mounted: the six details are in the server
 * HTML, where Base UI hides the inactive ones with its `hidden` attribute and keeps them inert.
 *
 * No string is held here: the copy arrives through `steps`, `labels` and `total`, so neither the
 * locale nor the copy of the other sections reaches this module's chunk.
 */
export const ThisSiteTabs = ({ steps, labels, labelledBy, total }: ThisSiteTabsProps) => {
  const [activeStep, setActiveStep] = useState(steps[0]?.id ?? '')

  const handleValueChange = (value: Tabs.Tab.Value): void => {
    if (typeof value === 'string') {
      setActiveStep(value)
    }
  }

  /*
   * A touch that lands on a step to scroll the page would select it on the way in, and so would a
   * pointer crossing the list on its way to the detail it just opened in the stacked layout: hover
   * selects only where the stylesheet shows the two columns side by side, and a tap keeps selecting
   * through the tab's own click.
   */
  const handleHover = (event: PointerEvent<HTMLButtonElement>, stepId: string): void => {
    if (event.pointerType === 'touch' || !window.matchMedia(HOVER_SELECTION_QUERY).matches) {
      return
    }

    setActiveStep(stepId)
  }

  return (
    <Tabs.Root orientation="vertical" value={activeStep} onValueChange={handleValueChange} className={styles.layout}>
      <Tabs.List activateOnFocus aria-labelledby={labelledBy} className={styles.list}>
        {steps.map((step) => (
          <Tabs.Tab
            key={step.id}
            value={step.id}
            className={styles.step}
            onPointerEnter={(event) => handleHover(event, step.id)}
          >
            <span aria-hidden="true" className={`${styles.stepNumber} text-caption uppercase`}>
              {step.number}
            </span>
            <span className={`${styles.stepTitle} font-display text-title-md`}>{step.title}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <div className={styles.details}>
        {steps.map((step) => (
          <Tabs.Panel key={step.id} value={step.id} keepMounted className={styles.detail}>
            <StepDetail step={step} labels={labels} />
          </Tabs.Panel>
        ))}
      </div>
      {total}
    </Tabs.Root>
  )
}
