import { method } from '@/locales/fr/method'
import { METHOD_BLOCK_COUNT, METHOD_FAILING_BLOCK_INDEX, type MethodDiagramLayout } from './data/methodGeometry'
import styles from './styles/MethodDiagram.module.css'

/** Id of the clip that reveals the review line as its lane grows. */
const REVIEW_CLIP_ID = 'method-review-lane-clip'

/** Fill of each block, in the order they leave the agents queue. */
const BLOCK_SURFACES = [
  styles.blockPrimary,
  styles.blockAccent,
  styles.blockWarning,
  styles.blockVivid,
  styles.blockAccent,
  styles.blockPrimary,
] as const

/** Static horizontal origin of each block, one layout-dependent class per block. */
const BLOCK_OFFSETS = [
  styles.blockShift0,
  styles.blockShift1,
  styles.blockShift2,
  styles.blockShift3,
  styles.blockShift4,
  styles.blockShift5,
] as const

type MethodDiagramSvgProps = {
  /** Layout the drawing follows; it only changes the viewBox, the stylesheet moves the shapes. */
  layout: MethodDiagramLayout
}

/**
 * Drawing of the review loop: the delivery, human review and agents lanes, the review gate and the
 * six deliverable blocks. Purely presentational — the scroll script writes its custom properties on
 * the stage around it, and the stylesheet owns every position, so this component never re-renders
 * while scrolling.
 *
 * The image is exposed as a single `role="img"` named by the locale: its inner drawing texts are
 * marked `aria-hidden` so assistive technology reads the description once, not the labels twice.
 * Lane labels and the accessible name come from `locales/fr/method.ts`.
 */
export const MethodDiagramSvg = ({ layout }: MethodDiagramSvgProps) => {
  const isNarrow = layout === 'narrow'

  return (
    <svg
      className={`${styles.svg} font-body`}
      viewBox={isNarrow ? '0 0 470 380' : '0 0 960 300'}
      role="img"
      aria-label={method.loop.ariaLabel}
    >
      <defs>
        <clipPath id={REVIEW_CLIP_ID} clipPathUnits="userSpaceOnUse">
          <rect className={styles.reviewClip} x="0" y="0" width="100%" height="100%" data-lane="review" />
        </clipPath>
      </defs>

      <text aria-hidden="true" className={styles.label} x="4" y="22">
        {method.loop.lanes.live}
      </text>
      <rect className={styles.liveLane} x="0" y="34" width="100%" height="52" rx="16" data-lane="live" />

      <g className={styles.reviewShift}>
        <text aria-hidden="true" className={styles.label} x="4" y="120">
          {method.loop.lanes.review}
        </text>
        <line className={styles.reviewLine} x1="0" y1="156" x2="100%" y2="156" clipPath={`url(#${REVIEW_CLIP_ID})`} />
        <g className={styles.gatePulse}>
          <circle className={styles.gate} cx="50%" cy="156" r="10" />
        </g>
      </g>

      <g className={styles.agentsShift}>
        <text aria-hidden="true" className={styles.label} x="4" y="220">
          {method.loop.lanes.agents}
        </text>
        <rect className={styles.agentsLane} x="0" y="228" width="100%" height="56" rx="16" data-lane="agents" />
      </g>

      {Array.from({ length: METHOD_BLOCK_COUNT }, (_, index) => {
        const failing = index === METHOD_FAILING_BLOCK_INDEX
        return (
          <g key={index} className={`${styles.block} ${BLOCK_OFFSETS[index]}`} data-block={index}>
            <rect className={BLOCK_SURFACES[index]} x="0" y="236" width="56" height="38" rx="13" />
            <circle
              className={`${styles.blockDot} ${failing ? styles.blockDotWarning : ''}`}
              cx="13"
              cy="248"
              r="2.6"
            />
            <line
              className={`${styles.blockLine} ${failing ? styles.blockLineWarning : ''}`}
              x1="20"
              y1="248"
              x2="43"
              y2="248"
            />
            <line
              className={`${styles.blockLine} ${styles.blockLineFaint} ${failing ? styles.blockLineWarning : ''}`}
              x1="13"
              y1="260"
              x2="43"
              y2="260"
            />
          </g>
        )
      })}
    </svg>
  )
}
