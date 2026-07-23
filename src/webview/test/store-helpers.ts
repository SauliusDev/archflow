import type { Node, Edge } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '@/features/flowchart'

export function makeNode(
  id: string,
  overrides: Partial<Node<FlowNodeData>> = {},
): Node<FlowNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: `Node ${id}`, shape: 'rectangle' },
    type: 'default',
    ...overrides,
  }
}

export function makeEdge(
  id: string,
  source: string,
  target: string,
  overrides: Partial<Edge<FlowEdgeData>> = {},
): Edge<FlowEdgeData> {
  return {
    id,
    source,
    target,
    data: { style: 'arrow' },
    ...overrides,
  }
}
