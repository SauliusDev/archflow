import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import { applyDagreLayout } from './layout'

function makeFlowNode(id: string, pos = { x: 0, y: 0 }): Node<FlowNodeData> {
  return {
    id,
    position: pos,
    type: 'flowNode',
    data: { label: id, shape: 'rectangle' },
    measured: { width: 80, height: 40 },
  } as Node<FlowNodeData>
}

function makeSubgraphNode(id: string, pos = { x: 0, y: 0 }): Node<FlowNodeData> {
  return {
    id,
    position: pos,
    type: 'subgraphNode',
    width: 300,
    height: 200,
    data: { label: id, shape: 'subgraph', isSubgraph: true },
  } as Node<FlowNodeData>
}

function makeEdge(source: string, target: string): Edge<FlowEdgeData> {
  return { id: `e-${source}-${target}`, source, target, data: { style: 'arrow' } }
}

describe('applyDagreLayout', () => {
  it('flat graph — all nodes get repositioned (non-zero layout applied)', () => {
    const nodes = [makeFlowNode('A'), makeFlowNode('B'), makeFlowNode('C')]
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')]
    const result = applyDagreLayout(nodes, edges)
    // Dagre should produce different positions for A, B, C along TD layout
    const positions = result.map(n => n.position)
    expect(positions.length).toBe(3)
    // At least one node should have a different y (TD layout distributes vertically)
    const yValues = positions.map(p => p.y)
    const uniqueY = new Set(yValues)
    expect(uniqueY.size).toBeGreaterThan(1)
  })

  it('child node position is parent-relative after layout', () => {
    const sg = makeSubgraphNode('SG')
    const child = { ...makeFlowNode('N'), parentId: 'SG' }
    const result = applyDagreLayout([sg, child], [])
    const childResult = result.find(n => n.id === 'N')!
    const sgResult = result.find(n => n.id === 'SG')!
    // Child position should be relative to parent, so it should be smaller than parent dimensions
    expect(childResult.position.x).toBeLessThan(sgResult.width ?? 300)
    expect(childResult.position.y).toBeLessThan(sgResult.height ?? 200)
  })

  it('returns same number of nodes as input', () => {
    const nodes = [makeFlowNode('A'), makeFlowNode('B')]
    const result = applyDagreLayout(nodes, [makeEdge('A', 'B')])
    expect(result.length).toBe(nodes.length)
  })

  it('subgraph nodes are included in output', () => {
    const sg = makeSubgraphNode('SG')
    const node = makeFlowNode('N')
    const result = applyDagreLayout([sg, node], [])
    expect(result.find(n => n.id === 'SG')).toBeDefined()
  })

  it('empty nodes array returns empty array', () => {
    const result = applyDagreLayout([], [])
    expect(result).toEqual([])
  })

  it('result is immutable — original array not mutated', () => {
    const nodes = [makeFlowNode('A', { x: 10, y: 20 }), makeFlowNode('B', { x: 30, y: 40 })]
    const originalPositions = nodes.map(n => ({ ...n.position }))
    applyDagreLayout(nodes, [makeEdge('A', 'B')])
    // Original nodes should be untouched
    expect(nodes[0].position).toEqual(originalPositions[0])
    expect(nodes[1].position).toEqual(originalPositions[1])
  })
})
