import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import type { FlowNodeData } from '../state/types'
import {
  SUBGRAPH_HEADER_HEIGHT,
  constrainTopLevelNodePositionOutsideGroup,
  findDropTargetSubgraph,
  findTopLevelNodesInGroupBody,
  groupBodyContainsNode,
  isNodeOutsideParent,
  toRelativePosition,
  toAbsolutePosition,
} from './subgraphGeometry'

function makeFlowNode(id: string, pos: { x: number; y: number }, measuredW = 80, measuredH = 40): Node<FlowNodeData> {
  return {
    id,
    position: pos,
    type: 'flowNode',
    data: { label: id, shape: 'rectangle' },
    measured: { width: measuredW, height: measuredH },
  } as Node<FlowNodeData>
}

function makeSubgraphNode(id: string, pos: { x: number; y: number }, w = 300, h = 200): Node<FlowNodeData> {
  return {
    id,
    position: pos,
    type: 'subgraphNode',
    width: w,
    height: h,
    data: { label: id, shape: 'subgraph', isSubgraph: true },
  } as Node<FlowNodeData>
}

describe('findDropTargetSubgraph', () => {
  it('rejects a node that crosses into the group header even when its center is in the body', () => {
    const sg = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    const node = makeFlowNode('A', { x: 100, y: 16 }) // center: (140, 36), but top overlaps the 32px header

    expect(groupBodyContainsNode(node, sg)).toBe(false)
    expect(findDropTargetSubgraph(node, [sg, node])).toBeNull()
  })

  it('rejects a node whose center is in the group header', () => {
    const sg = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    const node = makeFlowNode('A', { x: 100, y: 0 }) // center: (140, 20) — header

    expect(groupBodyContainsNode(node, sg)).toBe(false)
    expect(findDropTargetSubgraph(node, [sg, node])).toBeNull()
  })

  it('accepts a node whose center is in the group body', () => {
    const sg = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    const node = makeFlowNode('A', { x: 100, y: SUBGRAPH_HEADER_HEIGHT }) // center: (140, 52) — body

    expect(groupBodyContainsNode(node, sg)).toBe(true)
    expect(findDropTargetSubgraph(node, [sg, node])).toBe('SG1')
  })

  it('returns subgraph ID when node center is inside', () => {
    const sg = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    const node = makeFlowNode('A', { x: 100, y: 80 })  // center: (140, 100) — inside SG1
    expect(findDropTargetSubgraph(node, [sg, node])).toBe('SG1')
  })

  it('returns null when node center is outside all subgraphs', () => {
    const sg = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    const node = makeFlowNode('A', { x: 400, y: 400 })  // outside
    expect(findDropTargetSubgraph(node, [sg, node])).toBeNull()
  })

  it('returns the smaller subgraph when two overlap (innermost)', () => {
    const large = makeSubgraphNode('LARGE', { x: 0, y: 0 }, 500, 500)
    const small = makeSubgraphNode('SMALL', { x: 100, y: 100 }, 200, 200)
    // Node center at (200, 200) — inside both; small has less area
    const node = makeFlowNode('A', { x: 160, y: 180 })  // center: (200, 200)
    expect(findDropTargetSubgraph(node, [large, small, node])).toBe('SMALL')
  })

  it('returns target subgraph when dragged node is a subgraph positioned over it', () => {
    // SG2 center = (50 + 50, 50 + 50) = (100, 100) — inside SG1 [0-300, 0-200]
    const sg = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    const dragged = makeSubgraphNode('SG2', { x: 50, y: 50 }, 100, 100)
    expect(findDropTargetSubgraph(dragged, [sg, dragged])).toBe('SG1')
  })

  it("skips the node's current parent (no self-reassignment)", () => {
    const sg = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    const child = { ...makeFlowNode('A', { x: 50, y: 50 }), parentId: 'SG1' }
    expect(findDropTargetSubgraph(child, [sg, child])).toBeNull()
  })
})

describe('subgraph-to-subgraph nesting', () => {
  it('dragged subgraph over outer subgraph → returns outer subgraph ID', () => {
    const outer = makeSubgraphNode('OUTER', { x: 0, y: 0 }, 500, 400)
    const dragged = makeSubgraphNode('INNER', { x: 100, y: 100 }, 100, 100)
    // dragged center: (150, 150) — inside OUTER
    expect(findDropTargetSubgraph(dragged, [outer, dragged])).toBe('OUTER')
  })

  it('dragged subgraph over its own direct child subgraph → returns null (circular prevention)', () => {
    const sgA = makeSubgraphNode('SG_A', { x: 0, y: 0 }, 500, 400)
    // SG_B is a direct child of SG_A (parentId = 'SG_A')
    const sgB = { ...makeSubgraphNode('SG_B', { x: 50, y: 50 }, 300, 200), parentId: 'SG_A' }
    // Drag SG_A over SG_B → should return null (can't assign parent into its child)
    expect(findDropTargetSubgraph(sgA, [sgA, sgB])).toBeNull()
  })

  it('dragged subgraph over itself → returns null (self-assignment prevention)', () => {
    const sg = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    expect(findDropTargetSubgraph(sg, [sg])).toBeNull()
  })
})

describe('isNodeOutsideParent', () => {
  const parent = makeSubgraphNode('SG', { x: 0, y: 0 }, 300, 200)

  it('returns false when node center is inside parent', () => {
    const child = makeFlowNode('A', { x: 100, y: 80 })  // center: (140, 100)
    expect(isNodeOutsideParent(child, parent)).toBe(false)
  })

  it('returns true when node center is to the left (x < 0)', () => {
    const child = makeFlowNode('A', { x: -100, y: 80 })  // center: (-60, 100)
    expect(isNodeOutsideParent(child, parent)).toBe(true)
  })

  it('returns true when node center is above (y < 0)', () => {
    const child = makeFlowNode('A', { x: 100, y: -60 })  // center: (140, -40)
    expect(isNodeOutsideParent(child, parent)).toBe(true)
  })

  it('returns false when node center is in the parent header', () => {
    const child = makeFlowNode('A', { x: 100, y: 0 }) // center: (140, 20) — header
    expect(isNodeOutsideParent(child, parent)).toBe(false)
  })
})

describe('constrainTopLevelNodePositionOutsideGroup', () => {
  it('pushes a top-level node out of a group header instead of allowing it to cover the title', () => {
    const group = makeSubgraphNode('SG', { x: 100, y: 100 }, 300, 200)
    const node = makeFlowNode('A', { x: 160, y: 110 })

    expect(constrainTopLevelNodePositionOutsideGroup(node, group, node.position)).toEqual({ x: 160, y: 60 })
  })
})

describe('findTopLevelNodesInGroupBody', () => {
  it('includes only top-level non-group nodes whose centers are in the body', () => {
    const group = makeSubgraphNode('SG1', { x: 100, y: 100 }, 300, 200)
    const eligible = makeFlowNode('TOP_LEVEL', { x: 160, y: 150 }) // center: (200, 170) — body
    const child = { ...makeFlowNode('CHILD', { x: 160, y: 150 }), parentId: 'OTHER_GROUP' }
    const nestedGroup = makeSubgraphNode('NESTED', { x: 160, y: 150 })
    const headerNode = makeFlowNode('HEADER', { x: 160, y: 100 }) // center: (200, 120) — header

    expect(findTopLevelNodesInGroupBody(group, [group, eligible, child, nestedGroup, headerNode])).toEqual([eligible])
  })

  it('excludes a shape-only subgraph when calculating automatic membership', () => {
    const group = makeSubgraphNode('SG1', { x: 100, y: 100 }, 300, 200)
    const eligible = makeFlowNode('TOP_LEVEL', { x: 160, y: 150 })
    const shapeOnlySubgraph = {
      ...makeFlowNode('SHAPE_ONLY_GROUP', { x: 160, y: 150 }),
      data: { label: 'SHAPE_ONLY_GROUP', shape: 'subgraph' },
    } as Node<FlowNodeData>

    expect(findTopLevelNodesInGroupBody(group, [group, eligible, shapeOnlySubgraph])).toEqual([eligible])
  })

  it('uses explicit node dimensions when measured dimensions are unavailable', () => {
    const group = makeSubgraphNode('SG1', { x: 0, y: 0 }, 300, 200)
    const wideNode = {
      ...makeFlowNode('WIDE', { x: 220, y: 80 }),
      width: 200,
      height: 40,
      measured: undefined,
    }

    expect(findTopLevelNodesInGroupBody(group, [group, wideNode])).toEqual([])
  })
})

describe('coordinate conversion', () => {
  it('toRelativePosition subtracts parent position', () => {
    expect(toRelativePosition({ x: 200, y: 150 }, { x: 100, y: 100 })).toEqual({ x: 100, y: 50 })
  })

  it('toAbsolutePosition adds parent position', () => {
    expect(toAbsolutePosition({ x: 100, y: 50 }, { x: 100, y: 100 })).toEqual({ x: 200, y: 150 })
  })

  it('round-trip: absolute → relative → absolute is identity', () => {
    const abs = { x: 234, y: 178 }
    const parentPos = { x: 100, y: 80 }
    const rel = toRelativePosition(abs, parentPos)
    expect(toAbsolutePosition(rel, parentPos)).toEqual(abs)
  })
})
