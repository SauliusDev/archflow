import { describe, expect, it } from 'vitest'
import {
  applyDagreLayout,
  findDropTargetSubgraph,
  flowchartCompatibilityAdapter,
  isNodeOutsideParent,
  parseMermaidFlowchart,
  serialize,
  toAbsolutePosition,
  toRelativePosition,
  useNewEdgeRouteMode,
  type CanvasSnapshot,
  type EdgeStyle,
  type FlowchartSemanticOperation,
  type FlowEdgeData,
  type FlowNodeData,
  type NodeShape,
} from './index'

describe('flowchart feature public API', () => {
  it('exposes flowchart contracts and operations from one boundary', () => {
    const shape: NodeShape = 'rectangle'
    const style: EdgeStyle = 'arrow'
    const operation: FlowchartSemanticOperation = { kind: 'rename-node', id: 'A', label: 'Alpha' }
    const node: FlowNodeData = { label: 'Alpha', shape }
    const edge: FlowEdgeData = { style }
    const snapshot: CanvasSnapshot = { nodes: [], edges: [] }

    expect(typeof parseMermaidFlowchart).toBe('function')
    expect(typeof serialize).toBe('function')
    expect(typeof flowchartCompatibilityAdapter.parse).toBe('function')
    expect(typeof applyDagreLayout).toBe('function')
    expect(typeof findDropTargetSubgraph).toBe('function')
    expect(typeof isNodeOutsideParent).toBe('function')
    expect(typeof toAbsolutePosition).toBe('function')
    expect(typeof toRelativePosition).toBe('function')
    expect(typeof useNewEdgeRouteMode).toBe('function')
    expect([operation.kind, node.shape, edge.style, snapshot.nodes.length]).toEqual(['rename-node', 'rectangle', 'arrow', 0])
  })
})
