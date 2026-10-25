/**
 * Viewport query below which the diagram switches to its narrow drawing. The stylesheet uses the
 * same query, so the layout the script measures is always the layout the CSS paints.
 */
export const METHOD_NARROW_QUERY = '(width < 47.5rem)'

/** Number of deliverable blocks the diagram moves through the review loop. */
export const METHOD_BLOCK_COUNT = 6

/** Index of the block that fails review and falls back into the agents queue. */
export const METHOD_FAILING_BLOCK_INDEX = 2

/** Drawing the diagram follows: the desktop viewBox or the taller, narrower one. */
export type MethodDiagramLayout = 'wide' | 'narrow'

/** Step of the review loop the status label announces. */
export type MethodDiagramStatus = 'producing' | 'rising' | 'failing' | 'live'

/** Position and visibility of one deliverable block, in SVG user units from its own origin. */
export type MethodDiagramBlock = {
  x: number
  y: number
  opacity: number
}

/** Everything the diagram paints for a given scroll progress. */
export type MethodDiagramGeometry = {
  /** Fraction of each lane already built, from 0 to 1. */
  lanes: {
    live: number
    review: number
    agents: number
  }
  /** Opacity of the review gate circle, from 0 to 1. */
  gateOpacity: number
  blocks: readonly MethodDiagramBlock[]
  status: MethodDiagramStatus
}

/** Scroll progress at which each lane starts growing. Agents build first, delivery last. */
const LANE_STARTS = { live: 0.42, review: 0.16, agents: 0.02 } as const
/** Share of the scroll a lane takes to reach its full width. */
const LANE_GROWTH = 0.2
/** Fade window of the review gate, in scroll progress. */
const GATE_START = 0.26
const GATE_SPAN = 0.14
/** Block choreography: stagger at which each block leaves, its travel span, then its review dwell. */
const BLOCK_START = 0.1
const BLOCK_STAGGER = 0.05
const BLOCK_TRAVEL = 0.52
const BLOCK_DWELL_START = 0.45
const BLOCK_DWELL_END = 0.62
/** Opacity of the failing block once it has fallen back, so it reads as failed without vanishing. */
const BLOCK_FAILED_OPACITY = 0.35
/** Failure is only flagged once the block has almost finished its fall. */
const BLOCK_FAILED_FROM = 0.96
/** Ascent to the review line, per layout, then from the review line to the live lane. */
const REVIEW_RISE = { wide: 84, narrow: 125 } as const
const LIVE_RISE = 122
/** The narrow drawing shifts its lower lanes down, and the blocks follow them. */
const LOWER_LANE_SHIFT = { wide: 0, narrow: 52 } as const
/** Scroll progress at which the status label moves to its next sentence. */
const STATUS_RISING = 0.2
const STATUS_FAILING = 0.46
const STATUS_LIVE = 0.72
/** Horizontal origin of each block: five across on wide, a four-column grid on narrow. */
const WIDE_BLOCK_X = [96, 248, 400, 552, 704, 856] as const
const NARROW_BLOCK_X = [22, 132, 242, 352, 352, 352] as const

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/**
 * Diagram geometry for a scroll progress, following the design's choreography: the agents lane grows
 * first, then the review line with its gate, then the live lane. Blocks rise in sequence, wait at the
 * review line, and either continue to the live lane or — for the failing block — drop back into the
 * agents queue.
 *
 * @param progress Scroll progress over the pinned track, 0 at the start and 1 when it releases.
 * @param layout Layout whose drawing, spacing and visible block count the geometry follows.
 * @returns Lane widths, gate opacity, block transforms and the status sentence to announce.
 */
export const methodDiagramGeometry = (progress: number, layout: MethodDiagramLayout): MethodDiagramGeometry => {
  const scrolled = clamp(progress, 0, 1)
  const narrow = layout === 'narrow'
  const reviewRise = REVIEW_RISE[layout]
  const laneShift = LOWER_LANE_SHIFT[layout]

  const lane = (start: number): number => clamp((scrolled - start) / LANE_GROWTH, 0, 1)

  const blocks = WIDE_BLOCK_X.map((wideX, index): MethodDiagramBlock => {
    const travel = clamp((scrolled - BLOCK_START - index * BLOCK_STAGGER) / BLOCK_TRAVEL, 0, 1)
    const failing = index === METHOD_FAILING_BLOCK_INDEX
    const fallen = failing && travel > BLOCK_FAILED_FROM

    let rise: number
    if (travel < BLOCK_DWELL_START) rise = -reviewRise * (travel / BLOCK_DWELL_START)
    else if (travel < BLOCK_DWELL_END) rise = -reviewRise
    else if (failing) rise = -reviewRise + reviewRise * ((travel - BLOCK_DWELL_END) / (1 - BLOCK_DWELL_END))
    else rise = -reviewRise - LIVE_RISE * ((travel - BLOCK_DWELL_END) / (1 - BLOCK_DWELL_END))

    // The narrow drawing only has room for four blocks: the last two stay out of it.
    const hidden = narrow && index > 3
    const opacity = hidden ? 0 : travel <= 0 ? 0 : fallen ? BLOCK_FAILED_OPACITY : 1

    return {
      x: (narrow ? NARROW_BLOCK_X[index] : wideX) ?? wideX,
      y: rise + laneShift,
      opacity,
    }
  })

  const status: MethodDiagramStatus =
    scrolled < STATUS_RISING
      ? 'producing'
      : scrolled < STATUS_FAILING
        ? 'rising'
        : scrolled < STATUS_LIVE
          ? 'failing'
          : 'live'

  return {
    lanes: {
      live: lane(LANE_STARTS.live),
      review: lane(LANE_STARTS.review),
      agents: lane(LANE_STARTS.agents),
    },
    gateOpacity: clamp((scrolled - GATE_START) / GATE_SPAN, 0, 1),
    blocks,
    status,
  }
}
