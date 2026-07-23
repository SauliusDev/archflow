import type { Node, Edge } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '@/features/flowchart'

/**
 * Returns the set of node IDs that should be dimmed.
 * Dimming applies ONLY for single-node selection (not multi-select).
 * Connected nodes (those sharing an edge with the selected node) are NOT dimmed.
 */
export function computeDimmedNodeIds(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[]
): Set<string> {
  const selectedIds = nodes.filter(n => n.selected).map(n => n.id)
  if (selectedIds.length !== 1) return new Set<string>()

  const [selectedId] = selectedIds
  const connected = new Set<string>()
  for (const e of edges) {
    if (e.source === selectedId) connected.add(e.target)
    if (e.target === selectedId) connected.add(e.source)
  }

  return new Set(
    nodes
      .filter(n => n.id !== selectedId && !connected.has(n.id))
      .map(n => n.id)
  )
}
