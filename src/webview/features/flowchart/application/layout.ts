import type { Node, Edge } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import type { CanvasDescriptor } from '../../../../shared/diagram-contracts'
import { flowchartDagreStrategy } from '../../../lib/layoutStrategy'

export function applyDagreLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[]
): Node<FlowNodeData>[] {
  if (nodes.length === 0) return nodes
  const nodeIds = new Set(nodes.map(node => node.id))
  const canvas: CanvasDescriptor = {
    elements: nodes.map(node => ({
      id: `node:${node.id}`,
      kind: node.data.isSubgraph ? 'container' : 'element',
      label: node.data.label,
      parentId: node.parentId && nodeIds.has(node.parentId) ? `node:${node.parentId}` : undefined,
      focusable: true,
      selected: Boolean(node.selected),
      disabled: false,
      operations: [],
    })),
    connectors: edges
      .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map(edge => ({ id: `edge:${edge.id}`, source: `node:${edge.source}`, target: `node:${edge.target}` })),
  }
  const geometry = Object.fromEntries(nodes.map(node => [`node:${node.id}`, {
    x: node.position.x,
    y: node.position.y,
    width: node.data.isSubgraph ? (node.width ?? 300) : (node.measured?.width ?? 160),
    height: node.data.isSubgraph ? (node.height ?? 200) : (node.measured?.height ?? 64),
  }]))
  const laidOut = flowchartDagreStrategy.layout({ canvas, constraints: [], geometry, options: { reset: true } })
  return nodes.map(node => {
    const result = laidOut.elements[`node:${node.id}`]
    if (!result) return node
    let position = { x: result.x, y: result.y }
    if (node.parentId) {
      const parent = laidOut.elements[`node:${node.parentId}`]
      if (parent) {
        position = { x: position.x - parent.x, y: position.y - parent.y }
      }
    }

    // Carry the size the layout reserved, not just the position. Without it a
    // laid-out node still sized itself to its label, so a long label rendered
    // wider than the gap dagre left for it and the node overlapped its
    // neighbour. Subgraphs keep their own sizing rules.
    if (node.data.isSubgraph) return { ...node, position }
    return { ...node, position, width: result.width, height: result.height }
  })
}
