import { getBezierPath, getSmoothStepPath, Position } from '@xyflow/react'
import type { Edge, Node, XYPosition } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import { getEdgeParams } from '@/lib/floatingEdge'

export const EDGE_INSERTION_TOLERANCE = 28

function absolutePosition(node: Node<FlowNodeData>, byId: ReadonlyMap<string, Node<FlowNodeData>>): XYPosition {
  if (!node.parentId) return node.position
  const parent = byId.get(node.parentId)
  if (!parent) return node.position
  const parentPosition = absolutePosition(parent, byId)
  return { x: parentPosition.x + node.position.x, y: parentPosition.y + node.position.y }
}

function distanceToSegment(point: XYPosition, start: XYPosition, end: XYPosition): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

function distanceToPolyline(point: XYPosition, points: readonly XYPosition[]): number {
  return points.slice(1).reduce((closest, end, index) => Math.min(closest, distanceToSegment(point, points[index], end)), Infinity)
}

function parsePathPoints(path: string): XYPosition[] {
  const values = path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? []
  return Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }))
}

function sampleCubic(points: readonly XYPosition[]): XYPosition[] {
  if (points.length !== 4) return points
  const [start, controlA, controlB, end] = points
  return Array.from({ length: 13 }, (_, index) => {
    const t = index / 12
    return {
      x: (1 - t) ** 3 * start.x + 3 * (1 - t) ** 2 * t * controlA.x + 3 * (1 - t) * t ** 2 * controlB.x + t ** 3 * end.x,
      y: (1 - t) ** 3 * start.y + 3 * (1 - t) ** 2 * t * controlA.y + 3 * (1 - t) * t ** 2 * controlB.y + t ** 3 * end.y,
    }
  })
}

function routePoints(edge: Edge<FlowEdgeData>, source: Node<FlowNodeData>, target: Node<FlowNodeData>, byId: ReadonlyMap<string, Node<FlowNodeData>>): XYPosition[] {
  const sourcePosition = absolutePosition(source, byId)
  const targetPosition = absolutePosition(target, byId)
  const toInternalNode = (node: Node<FlowNodeData>, position: XYPosition) => ({
    measured: { width: node.measured?.width ?? node.width ?? 160, height: node.measured?.height ?? node.height ?? 64 },
    internals: { positionAbsolute: position },
  })
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    toInternalNode(source, sourcePosition) as never,
    toInternalNode(target, targetPosition) as never,
    edge.data?.sourceSide,
    edge.data?.targetSide,
  )
  const start = { x: sx, y: sy }
  const end = { x: tx, y: ty }
  const mode = edge.data?.routeMode === 'manual' ? 'orthogonal' : edge.data?.routeMode ?? 'straight'
  if (mode === 'orthogonal' && edge.data?.waypoints?.length) return [start, ...edge.data.waypoints, end]
  if (mode === 'orthogonal') return parsePathPoints(getSmoothStepPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: sourcePos, targetPosition: targetPos })[0])
  if (mode === 'curved') return sampleCubic(parsePathPoints(getBezierPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: sourcePos ?? Position.Right, targetPosition: targetPos ?? Position.Left })[0]))
  return [start, end]
}

export function isEligibleInsertionEdge(edge: Edge<FlowEdgeData>, nodes: readonly Node<FlowNodeData>[]): boolean {
  const byId = new Map(nodes.map(node => [node.id, node] as const))
  const source = byId.get(edge.source)
  const target = byId.get(edge.target)
  return Boolean(
    source && target && source.id !== target.id
      && !source.data.isSubgraph && !source.data.isLane
      && !target.data.isSubgraph && !target.data.isLane
      && edge.data?.ownership !== 'represented' && edge.data?.ownership !== 'preserved-only',
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
    return source && target && distanceToPolyline(position, routePoints(edge, source, target, byId)) <= tolerance
  })
  return candidates.length === 1 ? candidates[0] : null
}
