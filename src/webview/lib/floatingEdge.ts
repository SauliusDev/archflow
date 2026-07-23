import { Position } from '@xyflow/react'
import type { InternalNode, Node } from '@xyflow/react'

// ── Floating edge geometry ──────────────────────────────────────────────────
// Edges attach to the optimal point on a node's border instead of a fixed
// cardinal handle. The attachment point is where the line connecting the two
// node centers crosses the source node's rectangle, recomputed every render so
// edges re-route automatically as nodes move.

interface Point {
  x: number
  y: number
}

interface EdgeParams {
  sx: number
  sy: number
  tx: number
  ty: number
  sourcePos: Position
  targetPos: Position
}

type AttachmentSide = 'top' | 'right' | 'bottom' | 'left'

type VisualShape = 'rectangle' | 'diamond' | 'ellipse' | 'hexagon' | 'triangle' | 'trapezoid' | 'trapezoid-inverted'

function isAttachmentSide(side: unknown): side is AttachmentSide {
  return side === 'top' || side === 'right' || side === 'bottom' || side === 'left'
}

function visualShape(node: InternalNode<Node>): VisualShape {
  const data = node.data as { shape?: string; mermaidShape?: string } | undefined
  const shape = data?.shape
  const mermaidShape = data?.mermaidShape
  if (shape === 'diamond' || mermaidShape === 'diam' || mermaidShape === 'decision') return 'diamond'
  if (shape === 'circle' || mermaidShape === 'f-circ') return 'ellipse'
  if (shape === 'hexagon' || mermaidShape === 'hex') return 'hexagon'
  if (mermaidShape === 'tri' || mermaidShape === 'triangle') return 'triangle'
  if (mermaidShape === 'trap-t') return 'trapezoid'
  if (mermaidShape === 'trap-b') return 'trapezoid-inverted'
  return 'rectangle'
}

function rectangleIntersection(source: InternalNode<Node>, target: InternalNode<Node>): Point {
  const w = (source.measured.width ?? 0) / 2
  const h = (source.measured.height ?? 0) / 2
  const sx = source.internals.positionAbsolute.x + w
  const sy = source.internals.positionAbsolute.y + h
  const tx = target.internals.positionAbsolute.x + (target.measured.width ?? 0) / 2
  const ty = target.internals.positionAbsolute.y + (target.measured.height ?? 0) / 2

  if (w === 0 || h === 0) return { x: sx, y: sy }

  const xx1 = (tx - sx) / (2 * w) - (ty - sy) / (2 * h)
  const yy1 = (tx - sx) / (2 * w) + (ty - sy) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1)
  const xx3 = a * xx1
  const yy3 = a * yy1
  return {
    x: w * (xx3 + yy3) + sx,
    y: h * (-xx3 + yy3) + sy,
  }
}

function polygonIntersection(center: Point, target: Point, vertices: Point[]): Point | null {
  const direction = { x: target.x - center.x, y: target.y - center.y }
  let nearest: Point | null = null
  let nearestDistance = Infinity
  const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index]
    const end = vertices[(index + 1) % vertices.length]
    const edge = { x: end.x - start.x, y: end.y - start.y }
    const offset = { x: start.x - center.x, y: start.y - center.y }
    const denominator = cross(direction, edge)
    if (Math.abs(denominator) < Number.EPSILON) continue
    const alongRay = cross(offset, edge) / denominator
    const alongEdge = cross(offset, direction) / denominator
    if (alongRay < 0 || alongEdge < 0 || alongEdge > 1) continue
    if (alongRay < nearestDistance) {
      nearestDistance = alongRay
      nearest = { x: center.x + direction.x * alongRay, y: center.y + direction.y * alongRay }
    }
  }
  return nearest
}

function visibleShapeIntersection(source: InternalNode<Node>, target: InternalNode<Node>): Point {
  const width = source.measured.width ?? 0
  const height = source.measured.height ?? 0
  const center = { x: source.internals.positionAbsolute.x + width / 2, y: source.internals.positionAbsolute.y + height / 2 }
  const targetCenter = { x: target.internals.positionAbsolute.x + (target.measured.width ?? 0) / 2, y: target.internals.positionAbsolute.y + (target.measured.height ?? 0) / 2 }
  const shape = visualShape(source)
  if (shape === 'ellipse') {
    const dx = targetCenter.x - center.x
    const dy = targetCenter.y - center.y
    const scale = 1 / Math.sqrt((dx / (width / 2)) ** 2 + (dy / (height / 2)) ** 2)
    return Number.isFinite(scale) ? { x: center.x + dx * scale, y: center.y + dy * scale } : center
  }
  const polygon = shape === 'diamond'
    ? [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]
    : shape === 'hexagon'
      ? [[1 / 6, 0], [5 / 6, 0], [1, 0.5], [5 / 6, 1], [1 / 6, 1], [0, 0.5]]
      : shape === 'triangle'
        ? [[0.5, 0], [1, 1], [0, 1]]
        : shape === 'trapezoid'
          ? [[1 / 6, 0], [5 / 6, 0], [1, 1], [0, 1]]
          : shape === 'trapezoid-inverted'
            ? [[0, 0], [1, 0], [5 / 6, 1], [1 / 6, 1]]
            : undefined
  if (polygon) {
    const vertices = polygon.map(([x, y]) => ({ x: source.internals.positionAbsolute.x + x * width, y: source.internals.positionAbsolute.y + y * height }))
    const intersection = polygonIntersection(center, targetCenter, vertices)
    if (intersection) return intersection
  }
  return rectangleIntersection(source, target)
}

function sideMidpoint(node: InternalNode<Node>, side: AttachmentSide): Point {
  const width = node.measured.width ?? 0
  const height = node.measured.height ?? 0
  const { x, y } = node.internals.positionAbsolute
  switch (side) {
    case 'top': return { x: x + width / 2, y }
    case 'right': return { x: x + width, y: y + height / 2 }
    case 'bottom': return { x: x + width / 2, y: y + height }
    case 'left': return { x, y: y + height / 2 }
  }
}

// Derives which side of the node the intersection point sits on — used to orient
// the bezier tangent and arrowhead. Chosen by the dominant center→point axis,
// scaled by the node's aspect ratio so the diagonal threshold lands on the
// actual corner. Priority-order classification misrotates corner hits.
function getEdgePosition(node: InternalNode<Node>, point: Point): Position {
  const width = node.measured.width ?? 0
  const height = node.measured.height ?? 0
  const cx = node.internals.positionAbsolute.x + width / 2
  const cy = node.internals.positionAbsolute.y + height / 2
  const dx = point.x - cx
  const dy = point.y - cy

  if (Math.abs(dx) * height > Math.abs(dy) * width) {
    return dx > 0 ? Position.Right : Position.Left
  }
  return dy > 0 ? Position.Bottom : Position.Top
}

/** Resolves a requested cardinal attachment side, or the free border intersection. */
export function resolveEdgeAttachment(source: InternalNode<Node>, target: InternalNode<Node>, side?: AttachmentSide): { point: Point; side: Position } {
  if (isAttachmentSide(side)) {
    return { point: sideMidpoint(source, side), side: side as Position }
  }
  const point = visibleShapeIntersection(source, target)
  return { point, side: getEdgePosition(source, point) }
}

// Computes both border attachment points and their facing sides for an edge.
export function getEdgeParams(source: InternalNode<Node>, target: InternalNode<Node>, sourceSide?: AttachmentSide, targetSide?: AttachmentSide): EdgeParams {
  const sourceAttachment = resolveEdgeAttachment(source, target, sourceSide)
  const targetAttachment = resolveEdgeAttachment(target, source, targetSide)
  return {
    sx: sourceAttachment.point.x,
    sy: sourceAttachment.point.y,
    tx: targetAttachment.point.x,
    ty: targetAttachment.point.y,
    sourcePos: sourceAttachment.side,
    targetPos: targetAttachment.side,
  }
}
