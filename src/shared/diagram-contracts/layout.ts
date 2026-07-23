import {
  isDiagramFamily,
  type CanvasDescriptor,
  type DiagramFamily,
  type SemanticHandle,
  type ValidationResult,
} from './diagram'

export interface LayoutState {
  version: 1
  nodes: Record<string, { x: number; y: number; width?: number; height?: number }>
  viewport: { x: number; y: number; zoom: number }
}

export interface LayoutGeometry { x: number; y: number; width?: number; height?: number }
export type EdgeRouteMode = 'automatic' | 'straight' | 'orthogonal' | 'curved' | 'manual'
export type EdgeAttachmentSide = 'top' | 'right' | 'bottom' | 'left'
export interface LayoutEdgeState {
  routeMode: EdgeRouteMode
  waypoints?: Array<{ x: number; y: number }>
  sourceSide?: EdgeAttachmentSide
  targetSide?: EdgeAttachmentSide
}
export interface FlowchartNodeConnections {
  mode: 'free' | 'side'
  autoReassign: boolean
}
export interface LayoutConstraint {
  id: string
  kind: 'align' | 'contain'
  handles: SemanticHandle[]
  axis?: 'x' | 'y'
}

export interface LayoutStateV2 {
  version: 2
  diagramFamily: DiagramFamily
  viewport: { x: number; y: number; zoom: number }
  /**
   * Whether the node-properties inspector is shown. Absent values originate
   * from documents saved before this preference was introduced and mean shown.
   */
  inspectorVisible?: boolean
  elements: Record<SemanticHandle, LayoutGeometry>
  edges: Record<SemanticHandle, LayoutEdgeState>
  constraints: LayoutConstraint[]
  adapterMetadata?: Record<string, unknown>
}

export function isInspectorVisible(layout: Pick<LayoutStateV2, 'inspectorVisible'>): boolean {
  return layout.inspectorVisible !== false
}

export interface LayoutStrategyInput {
  canvas: Readonly<CanvasDescriptor>
  constraints: readonly LayoutConstraint[]
  geometry: Readonly<Record<SemanticHandle, LayoutGeometry>>
  options: Readonly<{ reset?: boolean }>
}
export interface LayoutStrategyResult {
  elements: Record<SemanticHandle, LayoutGeometry>
  edges?: Record<SemanticHandle, LayoutEdgeState>
}
export interface LayoutStrategy {
  id: string
  layout(input: LayoutStrategyInput): LayoutStrategyResult
}

export const LAYOUT_LIMITS = Object.freeze({
  blockBytes: 1_048_576,
  elements: 10_000,
  edges: 20_000,
  constraints: 20_000,
  waypointsPerEdge: 256,
  totalWaypoints: 100_000,
  adapterMetadataBytes: 262_144,
  adapterMetadataDepth: 16,
  coordinate: 1_000_000,
  zoomMin: 0.01,
  zoomMax: 16,
})

function validCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= LAYOUT_LIMITS.coordinate
}

function isEdgeAttachmentSide(value: unknown): value is EdgeAttachmentSide {
  return value === 'top' || value === 'right' || value === 'bottom' || value === 'left'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function flowchartNodeConnections(layout: LayoutStateV2): FlowchartNodeConnections {
  const flowchart = layout.adapterMetadata?.flowchart
  if (!isRecord(flowchart)) return { mode: 'free', autoReassign: false }
  const nodeConnections = flowchart.nodeConnections
  if (!isRecord(nodeConnections)
      || (nodeConnections.mode !== 'free' && nodeConnections.mode !== 'side')
      || typeof nodeConnections.autoReassign !== 'boolean') {
    return { mode: 'free', autoReassign: false }
  }
  return { mode: nodeConnections.mode, autoReassign: nodeConnections.autoReassign }
}

function metadataExceedsDepthLimit(value: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number; exit?: true }> = [{ value, depth: 0 }]
  const ancestors = new WeakSet<object>()

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.value === null || typeof current.value !== 'object') {
      if (current.depth > LAYOUT_LIMITS.adapterMetadataDepth) return true
      continue
    }
    if (current.exit) {
      ancestors.delete(current.value)
      continue
    }
    if (current.depth > LAYOUT_LIMITS.adapterMetadataDepth) return true
    if (ancestors.has(current.value)) throw new TypeError('Adapter metadata is not serializable')

    ancestors.add(current.value)
    stack.push({ ...current, exit: true })
    for (const child of Object.values(current.value as Record<string, unknown>)) {
      stack.push({ value: child, depth: current.depth + 1 })
    }
  }

  return false
}

export function validateLayoutStateV2(value: unknown): ValidationResult<LayoutStateV2> {
  if (!value || typeof value !== 'object') return { valid: false, error: 'Layout must be an object' }
  const layout = value as Partial<LayoutStateV2>
  if (layout.version !== 2 || !isDiagramFamily(layout.diagramFamily)) return { valid: false, error: 'Unsupported layout version or family' }
  const viewport = layout.viewport
  if (!viewport || !validCoordinate(viewport.x) || !validCoordinate(viewport.y)
      || typeof viewport.zoom !== 'number' || !Number.isFinite(viewport.zoom)
      || viewport.zoom < LAYOUT_LIMITS.zoomMin || viewport.zoom > LAYOUT_LIMITS.zoomMax) {
    return { valid: false, error: 'Invalid viewport' }
  }
  if (layout.inspectorVisible !== undefined && typeof layout.inspectorVisible !== 'boolean') {
    return { valid: false, error: 'Invalid inspector visibility' }
  }
  if (!layout.elements || typeof layout.elements !== 'object' || Array.isArray(layout.elements)) return { valid: false, error: 'Invalid elements' }
  const elements = Object.values(layout.elements)
  if (elements.length > LAYOUT_LIMITS.elements) return { valid: false, error: 'Too many element entries' }
  for (const geometry of elements) {
    if (!geometry || !validCoordinate(geometry.x) || !validCoordinate(geometry.y)
        || (geometry.width !== undefined && (!validCoordinate(geometry.width) || geometry.width <= 0))
        || (geometry.height !== undefined && (!validCoordinate(geometry.height) || geometry.height <= 0))) {
      return { valid: false, error: 'Invalid element geometry' }
    }
  }
  if (!layout.edges || typeof layout.edges !== 'object' || Array.isArray(layout.edges)) return { valid: false, error: 'Invalid edges' }
  const edges = Object.values(layout.edges)
  if (edges.length > LAYOUT_LIMITS.edges) return { valid: false, error: 'Too many edge entries' }
  let waypointCount = 0
  for (const edge of edges) {
    if (!edge || !['automatic', 'straight', 'orthogonal', 'curved', 'manual'].includes(edge.routeMode)) return { valid: false, error: 'Invalid route mode' }
    if ((edge.sourceSide !== undefined && !isEdgeAttachmentSide(edge.sourceSide))
        || (edge.targetSide !== undefined && !isEdgeAttachmentSide(edge.targetSide))) {
      return { valid: false, error: 'Invalid edge attachment side' }
    }
    const waypoints = edge.waypoints ?? []
    if (waypoints.length > LAYOUT_LIMITS.waypointsPerEdge) return { valid: false, error: 'Too many waypoints on edge' }
    waypointCount += waypoints.length
    if (waypoints.some(point => !validCoordinate(point.x) || !validCoordinate(point.y))) return { valid: false, error: 'Invalid waypoint' }
  }
  if (waypointCount > LAYOUT_LIMITS.totalWaypoints) return { valid: false, error: 'Too many total waypoints' }
  if (!Array.isArray(layout.constraints) || layout.constraints.length > LAYOUT_LIMITS.constraints) return { valid: false, error: 'Invalid constraints' }
  const constraintIds = new Set<string>()
  for (const constraint of layout.constraints) {
    if (!constraint || typeof constraint.id !== 'string' || constraint.id.length === 0
        || constraintIds.has(constraint.id)
        || !['align', 'contain'].includes(constraint.kind)
        || !Array.isArray(constraint.handles) || constraint.handles.length === 0
        || constraint.handles.some(handle => typeof handle !== 'string' || handle.length === 0)
        || (constraint.axis !== undefined && !['x', 'y'].includes(constraint.axis))) {
      return { valid: false, error: 'Invalid constraint entry' }
    }
    constraintIds.add(constraint.id)
  }
  const metadata = layout.adapterMetadata ?? {}
  if (isRecord(metadata)) {
    const flowchart = metadata.flowchart
    if (isRecord(flowchart) && flowchart.nodeConnections !== undefined) {
      const nodeConnections = flowchart.nodeConnections
      if (!isRecord(nodeConnections)
          || (nodeConnections.mode !== 'free' && nodeConnections.mode !== 'side')
          || typeof nodeConnections.autoReassign !== 'boolean') {
        return { valid: false, error: 'Invalid flowchart node connections' }
      }
    }
  }
  try {
    if (metadataExceedsDepthLimit(metadata)) return { valid: false, error: 'Adapter metadata is too deep' }
    if (new TextEncoder().encode(JSON.stringify(metadata)).byteLength > LAYOUT_LIMITS.adapterMetadataBytes) return { valid: false, error: 'Adapter metadata is too large' }
  } catch {
    return { valid: false, error: 'Adapter metadata is not serializable' }
  }
  return { valid: true, value: layout as LayoutStateV2 }
}
