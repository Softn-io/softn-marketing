import { describe, expect, it } from 'vitest'
import {
  METHOD_BLOCK_COUNT,
  METHOD_FAILING_BLOCK_INDEX,
  methodDiagramGeometry,
  type MethodDiagramLayout,
} from '../data/methodGeometry'

/** Block at an index, with the test failing clearly instead of comparing an undefined value. */
const blockAt = (progress: number, layout: MethodDiagramLayout, index: number) => {
  const block = methodDiagramGeometry(progress, layout).blocks[index]
  if (block === undefined) throw new Error(`missing block ${index}`)
  return block
}

describe('methodDiagramGeometry', () => {
  it('starts with every lane empty, no gate and every block queued in the agents lane', () => {
    const geometry = methodDiagramGeometry(0, 'wide')
    expect(geometry.lanes).toEqual({ live: 0, review: 0, agents: 0 })
    expect(geometry.gateOpacity).toBe(0)
    expect(geometry.status).toBe('producing')
    expect(geometry.blocks).toHaveLength(METHOD_BLOCK_COUNT)
    expect(geometry.blocks.map((block) => block.x)).toEqual([96, 248, 400, 552, 704, 856])
    for (const block of geometry.blocks) {
      expect(block.opacity).toBe(0)
      expect(block.y).toBe(0)
    }
  })

  it('clamps progress outside the track', () => {
    const before = methodDiagramGeometry(-1, 'wide')
    const after = methodDiagramGeometry(2, 'wide')
    expect(before).toEqual(methodDiagramGeometry(0, 'wide'))
    expect(after.lanes).toEqual({ live: 1, review: 1, agents: 1 })
    expect(after.status).toBe('live')
  })

  it('grows the agents lane first, then the review line, while the blocks begin to rise', () => {
    const geometry = methodDiagramGeometry(0.2, 'wide')
    expect(geometry.lanes.agents).toBeCloseTo(0.9, 5)
    expect(geometry.lanes.review).toBeCloseTo(0.2, 5)
    expect(geometry.lanes.live).toBe(0)
    expect(geometry.gateOpacity).toBe(0)
    expect(geometry.status).toBe('rising')
    expect(blockAt(0.2, 'wide', 0).y).toBeCloseTo(-35.9, 1)
    expect(blockAt(0.2, 'wide', 1).y).toBeCloseTo(-17.9, 1)
    expect(blockAt(0.2, 'wide', 0).opacity).toBe(1)
    expect(blockAt(0.2, 'wide', 1).opacity).toBe(1)
    expect(blockAt(0.2, 'wide', 2).opacity).toBe(0)
    expect(blockAt(0.2, 'wide', 3).opacity).toBe(0)
  })

  it('holds the blocks at the review line, then splits the failing one from the others', () => {
    const geometry = methodDiagramGeometry(0.5, 'wide')
    expect(geometry.lanes.live).toBeCloseTo(0.4, 5)
    expect(geometry.gateOpacity).toBe(1)
    expect(geometry.status).toBe('failing')
    expect(blockAt(0.5, 'wide', 0).y).toBeCloseTo(-131.9, 1)
    expect(blockAt(0.5, 'wide', 1).y).toBeCloseTo(-101, 1)
    expect(blockAt(0.5, 'wide', METHOD_FAILING_BLOCK_INDEX).y).toBe(-84)
    expect(blockAt(0.5, 'wide', 3).y).toBe(-84)
    expect(blockAt(0.5, 'wide', 4).y).toBeCloseTo(-71.8, 1)
    expect(blockAt(0.5, 'wide', 5).y).toBeCloseTo(-53.8, 1)
  })

  it('ends complete, with the failing block back in the agents lane', () => {
    const geometry = methodDiagramGeometry(1, 'wide')
    expect(geometry.lanes).toEqual({ live: 1, review: 1, agents: 1 })
    expect(geometry.gateOpacity).toBe(1)
    expect(geometry.status).toBe('live')
    for (const [index, block] of geometry.blocks.entries()) {
      expect(block.y).toBe(index === METHOD_FAILING_BLOCK_INDEX ? 0 : -206)
      expect(block.opacity).toBe(index === METHOD_FAILING_BLOCK_INDEX ? 0.35 : 1)
    }
  })

  it('lays the narrow drawing out on its own grid and hides the two blocks that do not fit', () => {
    const geometry = methodDiagramGeometry(1, 'narrow')
    expect(geometry.blocks.map((block) => block.x)).toEqual([22, 132, 242, 352, 352, 352])
    for (const [index, block] of geometry.blocks.entries()) {
      expect(block.y).toBe(index === METHOD_FAILING_BLOCK_INDEX ? 52 : -195)
      expect(block.opacity).toBe(index > 3 ? 0 : index === METHOD_FAILING_BLOCK_INDEX ? 0.35 : 1)
    }
    expect(blockAt(0.5, 'narrow', 4).opacity).toBe(0)
    expect(blockAt(0.5, 'narrow', METHOD_FAILING_BLOCK_INDEX).y).toBe(-73)
  })

  it('moves the status sentence at the design thresholds', () => {
    const statusAt = (progress: number): string => methodDiagramGeometry(progress, 'wide').status
    expect(statusAt(0.199)).toBe('producing')
    expect(statusAt(0.2)).toBe('rising')
    expect(statusAt(0.459)).toBe('rising')
    expect(statusAt(0.46)).toBe('failing')
    expect(statusAt(0.719)).toBe('failing')
    expect(statusAt(0.72)).toBe('live')
  })

  it('fades the review gate in between the review line and the live lane', () => {
    expect(methodDiagramGeometry(0.26, 'wide').gateOpacity).toBe(0)
    expect(methodDiagramGeometry(0.33, 'wide').gateOpacity).toBeCloseTo(0.5, 5)
    expect(methodDiagramGeometry(0.4, 'wide').gateOpacity).toBe(1)
  })
})
