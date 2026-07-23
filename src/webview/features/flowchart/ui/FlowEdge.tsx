import React, { useState, useCallback, useRef } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, useInternalNode, useReactFlow } from '@xyflow/react'
import type { Edge, EdgeProps, Node } from '@xyflow/react'
import type { FlowEdgeData, EdgeStyle, FlowNodeData } from '@/features/flowchart'
import { useStore } from '@/state/createStore'
import { getEdgeParams } from '@/lib/floatingEdge'
import { flowchartNodeConnections, type EdgeAttachmentSide } from '../../../../shared/diagram-contracts'
import { deriveSmartRoute, isSmartRouteClear, sampleRoutingPath, type RoutingEdgeObstacle, type RoutingRect } from '../application/routing'
import { useSmartRouting } from './SmartRoutingContext'

const STYLE_META: Record<EdgeStyle, { label: string; title: string }> = {
  arrow:  { label: '→',  title: 'Solid arrow'  },
  dotted: { label: '⇢',  title: 'Dotted arrow' },
  thick:  { label: '⇒',  title: 'Thick arrow'  },
  open:   { label: '—',  title: 'Open link'    },
}

const ROUTE_META = {
  straight: { label: 'Straight', path: 'M2 12H22' },
  orthogonal: { label: 'Orthogonal', path: 'M2 5H12V19H22' },
  curved: { label: 'Curved', path: 'M2 19C8 3 16 3 22 19' },
} as const

interface AbsoluteBounds extends RoutingRect {
  id: string
}

type Side = 'left' | 'right' | 'top' | 'bottom'

function supportsSideAssignment(node: Node<FlowNodeData>): boolean {
  return !node.data?.isSubgraph && !node.data?.isLane
}

function resolveRouteMode(data: FlowEdgeData | undefined): 'straight' | 'orthogonal' | 'curved' {
  if (data?.routeMode === 'manual') return 'orthogonal'
  return data?.routeMode === 'orthogonal' || data?.routeMode === 'curved' || data?.routeMode === 'straight' ? data.routeMode : 'straight'
}

function nodeSize(node: Node<FlowNodeData>): { width: number; height: number } {
  return { width: node.measured?.width ?? node.width ?? 160, height: node.measured?.height ?? node.height ?? 64 }
}

function absolutePosition(node: Node<FlowNodeData>, nodeById: ReadonlyMap<string, Node<FlowNodeData>>, livePositions: ReadonlyMap<string, { x: number; y: number }>, seen = new Set<string>()): { x: number; y: number } {
  const live = livePositions.get(node.id)
  if (live) return live
  if (!node.parentId || seen.has(node.id)) return node.position
  const parent = nodeById.get(node.parentId)
  if (!parent) return node.position
  seen.add(node.id)
  const parentPosition = absolutePosition(parent, nodeById, livePositions, seen)
  return { x: parentPosition.x + node.position.x, y: parentPosition.y + node.position.y }
}

function absoluteBounds(node: Node<FlowNodeData>, nodeById: ReadonlyMap<string, Node<FlowNodeData>>, livePositions: ReadonlyMap<string, { x: number; y: number }>): AbsoluteBounds {
  const position = absolutePosition(node, nodeById, livePositions)
  const { width, height } = nodeSize(node)
  return { id: node.id, x: position.x, y: position.y, width, height }
}

function endpointAndAncestorIds(source: string, target: string, nodeById: ReadonlyMap<string, Node<FlowNodeData>>): Set<string> {
  const excluded = new Set([source, target])
  for (const endpoint of [source, target]) {
    let parentId = nodeById.get(endpoint)?.parentId
    while (parentId && !excluded.has(parentId)) {
      excluded.add(parentId)
      parentId = nodeById.get(parentId)?.parentId
    }
  }
  return excluded
}

function routingNodeObstacles(nodes: readonly Node<FlowNodeData>[], source: string, target: string, nodeById: ReadonlyMap<string, Node<FlowNodeData>>, livePositions: ReadonlyMap<string, { x: number; y: number }>): RoutingRect[] {
  const excluded = endpointAndAncestorIds(source, target, nodeById)
  return nodes.filter(node => !excluded.has(node.id)).map(node => absoluteBounds(node, nodeById, livePositions))
}

function edgeGeometry(source: AbsoluteBounds, target: AbsoluteBounds, sourceSide?: EdgeAttachmentSide, targetSide?: EdgeAttachmentSide) {
  const toInternalNode = (bounds: AbsoluteBounds) => ({ measured: { width: bounds.width, height: bounds.height }, internals: { positionAbsolute: { x: bounds.x, y: bounds.y } } })
  return getEdgeParams(toInternalNode(source) as never, toInternalNode(target) as never, sourceSide, targetSide)
}

/** In Side mode, every edge endpoint must land on a cardinal handle midpoint.
 * Older edges do not have persisted sides, so derive their nearest side once
 * and then resolve it again as a true midpoint rather than a free intersection. */
function sideHandleGeometry(
  sourceNode: Parameters<typeof getEdgeParams>[0],
  targetNode: Parameters<typeof getEdgeParams>[1],
  sourceSide?: EdgeAttachmentSide,
  targetSide?: EdgeAttachmentSide,
) {
  const free = getEdgeParams(sourceNode, targetNode)
  return getEdgeParams(
    sourceNode,
    targetNode,
    sourceSide ?? free.sourcePos as EdgeAttachmentSide,
    targetSide ?? free.targetPos as EdgeAttachmentSide,
  )
}

function simplifyBaseline(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
}

function curvedBaseline(start: { x: number; y: number }, end: { x: number; y: number }, sourceSide: Side, targetSide: Side): Array<{ x: number; y: number }> {
  const vectors: Record<Side, { x: number; y: number }> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } }
  const offset = Math.max(25, Math.min(100, Math.hypot(end.x - start.x, end.y - start.y) / 2))
  const controlA = { x: start.x + vectors[sourceSide].x * offset, y: start.y + vectors[sourceSide].y * offset }
  const controlB = { x: end.x + vectors[targetSide].x * offset, y: end.y + vectors[targetSide].y * offset }
  return Array.from({ length: 9 }, (_, index) => {
    const t = index / 8
    return {
      x: (1 - t) ** 3 * start.x + 3 * (1 - t) ** 2 * t * controlA.x + 3 * (1 - t) * t ** 2 * controlB.x + t ** 3 * end.x,
      y: (1 - t) ** 3 * start.y + 3 * (1 - t) ** 2 * t * controlA.y + 3 * (1 - t) * t ** 2 * controlB.y + t ** 3 * end.y,
    }
  })
}

function reciprocalCurve(start: { x: number; y: number }, end: { x: number; y: number }, direction: 1 | -1): { path: string; label: { x: number; y: number } } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.hypot(dx, dy)
  // Short, unequal bends keep each direction distinct without creating a
  // capsule shape between closely stacked nodes.
  const offset = Math.min(36, Math.max(direction > 0 ? 22 : 14, distance * (direction > 0 ? 0.24 : 0.16)))
  const labelOffset = Math.max(28, offset * 0.8)
  const normal = Math.abs(dx) >= Math.abs(dy)
    ? { x: 0, y: direction }
    : { x: direction, y: 0 }
  const controlA = { x: start.x + normal.x * offset + dx * 0.2, y: start.y + normal.y * offset + dy * 0.2 }
  const controlB = { x: end.x + normal.x * offset - dx * 0.2, y: end.y + normal.y * offset - dy * 0.2 }
  return {
    path: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y} ${controlB.x} ${controlB.y} ${end.x} ${end.y}`,
    label: { x: (start.x + end.x) / 2 + normal.x * labelOffset, y: (start.y + end.y) / 2 + normal.y * labelOffset },
  }
}

function stableEdgeBaseline(edge: Edge<FlowEdgeData>, nodes: readonly Node<FlowNodeData>[], nodeById: ReadonlyMap<string, Node<FlowNodeData>>, livePositions: ReadonlyMap<string, { x: number; y: number }>, earlierEdges: readonly RoutingEdgeObstacle[], sideMode: boolean): RoutingEdgeObstacle | null {
  const sourceNode = nodeById.get(edge.source)
  const targetNode = nodeById.get(edge.target)
  if (!sourceNode || !targetNode) return null
  const sourceBounds = absoluteBounds(sourceNode, nodeById, livePositions)
  const targetBounds = absoluteBounds(targetNode, nodeById, livePositions)
  const geometry = sideMode
    ? sideHandleGeometry(
      ({ measured: { width: sourceBounds.width, height: sourceBounds.height }, internals: { positionAbsolute: { x: sourceBounds.x, y: sourceBounds.y } } }) as never,
      ({ measured: { width: targetBounds.width, height: targetBounds.height }, internals: { positionAbsolute: { x: targetBounds.x, y: targetBounds.y } } }) as never,
      edge.data?.sourceSide,
      edge.data?.targetSide,
    )
    : edgeGeometry(sourceBounds, targetBounds)
  const sourceAttachment = { point: { x: geometry.sx, y: geometry.sy }, side: geometry.sourcePos as Side }
  const targetAttachment = { point: { x: geometry.tx, y: geometry.ty }, side: geometry.targetPos as Side }
  const mode = resolveRouteMode(edge.data)
  const waypoints = mode === 'orthogonal' ? edge.data?.waypoints ?? [] : []
  if (waypoints.length > 0) return { points: [sourceAttachment.point, ...waypoints, targetAttachment.point] }
  const route = deriveSmartRoute({
    source: sourceAttachment.point,
    target: targetAttachment.point,
    mode,
    nodeObstacles: routingNodeObstacles(nodes, edge.source, edge.target, nodeById, livePositions),
    edgeObstacles: earlierEdges,
  })
  if (route.detoured) return { points: route.points }
  if (mode === 'orthogonal') return { points: simplifyBaseline([sourceAttachment.point, { x: targetAttachment.point.x, y: sourceAttachment.point.y }, targetAttachment.point]) }
  if (mode === 'curved') return { points: curvedBaseline(sourceAttachment.point, targetAttachment.point, sourceAttachment.side, targetAttachment.side) }
  return { points: [sourceAttachment.point, targetAttachment.point] }
}

export default function FlowEdge({
  id, source, target,
  data, selected,
}: EdgeProps<Edge<FlowEdgeData>>): React.JSX.Element | null {
  const setEdgeStyle = useStore(s => s.setEdgeStyle)
  const updateEdgeLabel = useStore(s => s.updateEdgeLabel)
  const setEdgeRouteMode = useStore(s => s.setEdgeRouteMode)
  const addEdgeWaypoint = useStore(s => s.addEdgeWaypoint)
  const moveEdgeWaypoint = useStore(s => s.moveEdgeWaypoint)
  const removeEdgeWaypoint = useStore(s => s.removeEdgeWaypoint)
  const setPendingConnect = useStore(s => s.setPendingConnect)
  const isLocked = useStore(s => s.isLocked)
  const nodes = useStore(s => s.nodes)
  const edges = useStore(s => s.edges)
  const sideMode = useStore(s => {
    const session = s.documentSession
    return session?.family === 'flowchart' && flowchartNodeConnections(session.layout).mode === 'side'
  })
  const smartRouting = useSmartRouting()
  const { screenToFlowPosition } = useReactFlow()
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const style = data?.style ?? 'arrow'
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const isEscapingRef = useRef(false)

  const startEndpointAssignment = useCallback((endpoint: 'source' | 'target', event?: React.PointerEvent<HTMLButtonElement>) => {
    const movingSource = endpoint === 'source'
    setPendingConnect({
      kind: 'reassign',
      edgeId: String(id),
      endpoint,
      fixedNodeId: movingSource ? target : source,
      fixedSide: movingSource ? data?.targetSide : data?.sourceSide,
      ...(event ? {
        cursor: { x: event.clientX, y: event.clientY },
        awaitingInitialRelease: true,
      } : {}),
    })
  }, [data?.sourceSide, data?.targetSide, id, setPendingConnect, source, target])

  // Floating attachment points — recomputed from live node positions so the
  // edge always connects at the optimal border point and re-routes on move.
  // Straight path so the arrowhead (orient="auto") rotates to the true approach
  // angle at any layout — no perpendicular-entry snap on corner connections.
  const { sx, sy, tx, ty, sourcePos, targetPos } =
    sourceNode && targetNode
      ? sideMode
        ? sideHandleGeometry(sourceNode, targetNode, data?.sourceSide, data?.targetSide)
        : getEdgeParams(sourceNode, targetNode)
      : { sx: 0, sy: 0, tx: 0, ty: 0, sourcePos: undefined, targetPos: undefined }

  const routeMode = resolveRouteMode(data)
  const waypoints = routeMode === 'orthogonal' ? (data?.waypoints ?? []) : []
  const reciprocalEdge = smartRouting && waypoints.length === 0
    ? edges.find(edge => edge.id !== id && edge.source === target && edge.target === source)
    : undefined
  let edgePath: string
  let labelX: number
  let labelY: number
  if (reciprocalEdge) {
    const curve = reciprocalCurve(
      { x: sx, y: sy }, { x: tx, y: ty },
      String(id).localeCompare(reciprocalEdge.id) > 0 ? 1 : -1,
    )
    edgePath = curve.path
    labelX = curve.label.x
    labelY = curve.label.y
  } else if (waypoints.length > 0) {
    edgePath = `M ${sx} ${sy} ${waypoints.map(point => `L ${point.x} ${point.y}`).join(' ')} L ${tx} ${ty}`
    const middle = waypoints[Math.floor(waypoints.length / 2)]
    labelX = middle.x
    labelY = middle.y
  } else if (routeMode === 'orthogonal') {
    [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: sourcePos, targetPosition: targetPos })
  } else if (routeMode === 'curved') {
    [edgePath, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: sourcePos, targetPosition: targetPos })
  } else {
    [edgePath, labelX, labelY] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty })
  }

  if (smartRouting && !reciprocalEdge && waypoints.length === 0 && sourceNode && targetNode) {
    const nodeById = new Map(nodes.map(node => [node.id, node]))
    const livePositions = new Map<string, { x: number; y: number }>([
      [source, sourceNode.internals.positionAbsolute], [target, targetNode.internals.positionAbsolute],
    ])
    const nodeObstacles = routingNodeObstacles(nodes, source, target, nodeById, livePositions)
    const edgeObstacles: RoutingEdgeObstacle[] = []
    for (const edge of edges.filter(edge => edge.id.localeCompare(String(id)) < 0).sort((left, right) => left.id.localeCompare(right.id))) {
      const baseline = stableEdgeBaseline(edge, nodes, nodeById, livePositions, edgeObstacles, sideMode)
      if (baseline) edgeObstacles.push(baseline)
    }
    const routingInput = {
      source: { x: sx, y: sy }, target: { x: tx, y: ty }, mode: routeMode,
      nodeObstacles, edgeObstacles,
    }
    const normalPathPoints = sampleRoutingPath(edgePath)
    if (!isSmartRouteClear(routingInput, normalPathPoints)) {
      const route = deriveSmartRoute({ ...routingInput, forceDetour: true })
      edgePath = route.path
      labelX = route.label.x
      labelY = route.label.y
    }
  }

  const markerId = `mv-arrow-${id}`
  const hasMarker = style !== 'open'

  const commitEdit = useCallback(() => {
    if (!isEscapingRef.current) {
      updateEdgeLabel(id, editValue)
    }
    isEscapingRef.current = false
    setEditing(false)
  }, [id, editValue, updateEdgeLabel])

  const handleLabelDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLocked) return
    isEscapingRef.current = false
    setEditValue(data?.label ?? '')
    setEditing(true)
  }, [data?.label, isLocked])

  if (!sourceNode || !targetNode) return null

  return (
    <>
      {hasMarker && (
        <defs>
          <marker
            id={markerId}
            markerWidth="12"
            markerHeight="8"
            refX="12"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon
              points="0 0, 12 4, 0 8"
              className={
                selected
                  ? 'flow-edge__arrowhead flow-edge__arrowhead--selected'
                  : 'flow-edge__arrowhead'
              }
            />
          </marker>
        </defs>
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        className={[
          'flow-edge__path',
          `flow-edge__path--${style}`,
          selected ? 'flow-edge__path--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        markerEnd={hasMarker ? `url(#${markerId})` : undefined}
        onDoubleClick={handleLabelDoubleClick}
      />

      {selected && !isLocked && ([
        ['source', source, sx, sy, supportsSideAssignment(sourceNode)],
        ['target', target, tx, ty, supportsSideAssignment(targetNode)],
      ] as const).filter(([, , , , supported]) => supported).map(([endpoint, _nodeId, x, y]) => (
        <EdgeLabelRenderer key={`${id}-${endpoint}-endpoint`}>
          <button
            className={`flow-edge__endpoint flow-edge__endpoint--${endpoint} nodrag nopan`}
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${x}px,${y}px)`, pointerEvents: 'all' }}
            type="button"
            aria-label={`Drag ${endpoint} endpoint`}
            onPointerDown={event => {
              event.preventDefault()
              event.stopPropagation()
              startEndpointAssignment(endpoint, event)
            }}
            onKeyDown={event => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              startEndpointAssignment(endpoint)
            }}
          />
        </EdgeLabelRenderer>
      ))}

      {/* Always-visible label area — not inside {selected && ...} */}
      <EdgeLabelRenderer>
        <div
          className="flow-edge__label-area nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          onDoubleClick={handleLabelDoubleClick}
        >
          {editing ? (
            <input
              className="flow-edge__label-input"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                if (e.key === 'Escape') { e.stopPropagation(); isEscapingRef.current = true; setEditing(false) }
              }}
              onBlur={commitEdit}
              autoFocus
            />
          ) : (
            <span
              className={
                data?.label
                  ? 'flow-edge__label'
                  : selected
                  ? 'flow-edge__label-affordance'
                  : undefined
              }
            >
              {data?.label ?? (selected ? '✎' : '')}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>

      {/* Style toolbar — only when selected, positioned above the label */}
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="flow-edge__toolbar nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, calc(-50% - 28px)) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {(Object.keys(STYLE_META) as EdgeStyle[]).map(s => (
              <button
                key={s}
                className={[
                  'flow-edge__style-btn',
                  s === style ? 'flow-edge__style-btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={STYLE_META[s].title}
                disabled={isLocked}
                onClick={() => { if (!isLocked) setEdgeStyle(id, s) }}
              >
                {STYLE_META[s].label}
              </button>
            ))}
            <span className="flow-edge__toolbar-separator" aria-hidden="true" />
            {(Object.keys(ROUTE_META) as Array<keyof typeof ROUTE_META>).map(mode => (
              <button
                key={mode}
                className={['flow-edge__style-btn', mode === routeMode ? 'flow-edge__style-btn--active' : ''].filter(Boolean).join(' ')}
                title={`${ROUTE_META[mode].label} routing`}
                aria-label={`${ROUTE_META[mode].label} edge routing`}
                aria-pressed={mode === routeMode}
                disabled={isLocked}
                onClick={() => { if (!isLocked) setEdgeRouteMode(String(id), mode) }}
              >
                <svg className="flow-edge__route-preview" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d={ROUTE_META[mode].path} />
                </svg>
              </button>
            ))}
            {routeMode === 'orthogonal' && (
              <button
                className="flow-edge__style-btn"
                title="Add waypoint"
                aria-label="Add edge waypoint"
                disabled={isLocked}
                onClick={() => { if (!isLocked) addEdgeWaypoint(String(id), { x: labelX, y: labelY }) }}
              >+
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
      {selected && routeMode === 'orthogonal' && waypoints.map((point, index) => (
        <EdgeLabelRenderer key={`${id}-waypoint-${index}`}>
          <button
            className="flow-edge__waypoint nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${point.x}px,${point.y}px)`,
              pointerEvents: 'all',
            }}
            aria-label={`Waypoint ${index + 1} of ${waypoints.length}`}
            disabled={isLocked}
            title="Drag to move. Arrow keys nudge. Delete removes."
            onPointerDown={event => {
              if (isLocked) return
              event.preventDefault()
              event.stopPropagation()
              const waypointElement = event.currentTarget
              const move = (pointerEvent: PointerEvent) => {
                const next = screenToFlowPosition({ x: pointerEvent.clientX, y: pointerEvent.clientY })
                waypointElement.style.transform = `translate(-50%, -50%) translate(${next.x}px,${next.y}px)`
              }
              const up = (pointerEvent: PointerEvent) => {
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
                moveEdgeWaypoint(String(id), index, screenToFlowPosition({ x: pointerEvent.clientX, y: pointerEvent.clientY }))
              }
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
            }}
            onKeyDown={event => {
              if (isLocked) return
              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault()
                event.stopPropagation()
                removeEdgeWaypoint(String(id), index)
                return
              }
              const delta = event.shiftKey ? 10 : 1
              const offsets: Record<string, { x: number; y: number }> = {
                ArrowLeft: { x: -delta, y: 0 }, ArrowRight: { x: delta, y: 0 },
                ArrowUp: { x: 0, y: -delta }, ArrowDown: { x: 0, y: delta },
              }
              const offset = offsets[event.key]
              if (!offset) return
              event.preventDefault()
              event.stopPropagation()
              moveEdgeWaypoint(String(id), index, { x: point.x + offset.x, y: point.y + offset.y })
            }}
          />
        </EdgeLabelRenderer>
      ))}
    </>
  )
}
