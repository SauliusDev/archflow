import type { Edge, Node, XYPosition } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '../state/types'

export const EDGE_INSERTION_TOLERANCE = 28

function absolutePosition(node: Node<FlowNodeData>, byId: ReadonlyMap<string, Node<FlowNodeData>>): XYPosition {
  if (!node.parentId) return node.position
  const parent = byId.get(node.parentId)
  if (!parent) return node.position
  const parentPosition = absolutePosition(parent, byId)
  return { x: parentPosition.x + node.position.x, y: parentPosition.y + node.position.y }
}

function center(node: Node<FlowNodeData>, byId: ReadonlyMap<string, Node<FlowNodeData>>): XYPosition {
  const position = absolutePosition(node, byId)
  return {
    x: position.x + (node.measured?.width ?? node.width ?? 160) / 2,
    y: position.y + (node.measured?.height ?? node.height ?? 64) / 2,
  }
}

function distanceToSegment(point: XYPosition, start: XYPosition, end: XYPosition): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

export function isEligibleInsertionEdge(edge: Edge<FlowEdgeData>, nodes: readonly Node<FlowNodeData>[]): boolean {
  const byId = new Map(nodes.map(node => [node.id, node] as const))
  const source = byId.get(edge.source)
  const target = byId.get(edge.target)
  return Boolean(
    source && target && source.id !== target.id
      && !source.data.isSubgraph && !source.data.isLane
      && !target.data.isSubgraph && !target.data.isLane
      && edge.data?.ownership !== 'represented' && edge.data?.ownership !== 'preserved-only'
      // v1 geometry follows visible straight edges only. Curves and manual
      // routes need path-aware hit testing before they can be safely split.
      && (!edge.data?.routeMode || edge.data.routeMode === 'straight')
      && !edge.data?.waypoints?.length,
  )
}

/** Returns one candidate only. Overlapping hit areas intentionally suppress insertion. */
export function findEdgeInsertionCandidate(
  position: XYPosition,
  nodes: readonly Node<FlowNodeData>[],
  edges: readonly Edge<FlowEdgeData>[],
  tolerance = EDGE_INSERTION_TOLERANCE,
): Edge<FlowEdgeData> | null {
  const byId = new Map(nodes.map(node => [node.id, node] as const))
  const candidates = edges.filter(edge => {
    if (!isEligibleInsertionEdge(edge, nodes)) return false
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    return source && target && distanceToSegment(position, center(source, byId), center(target, byId)) <= tolerance
  })
  return candidates.length === 1 ? candidates[0] : null
}
