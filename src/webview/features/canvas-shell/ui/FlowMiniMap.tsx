import React, { useId, useMemo } from 'react'
import { useStore as useReactFlowStore } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData, NodeShape } from '@/features/flowchart'

const VIEW_WIDTH = 200
const VIEW_HEIGHT = 120
const PADDING = 12
const DEFAULT_NODE_WIDTH = 120
const DEFAULT_NODE_HEIGHT = 48

interface CanvasSize {
  width: number
  height: number
}

interface FlowMiniMapProps {
  nodes: readonly Node<FlowNodeData>[]
  edges: readonly Edge<FlowEdgeData>[]
  viewport: { x: number; y: number; zoom: number }
  canvasSize: CanvasSize
}

interface DiagramBounds {
  x: number
  y: number
  width: number
  height: number
}

interface NodeGeometry {
  node: Node<FlowNodeData>
  x: number
  y: number
  width: number
  height: number
}

type EndpointMarker = NonNullable<FlowEdgeData['startEndpoint']>

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function dimensions(node: Node<FlowNodeData>): { width: number; height: number } {
  return {
    width: Math.max(1, finite(node.width ?? node.measured?.width ?? DEFAULT_NODE_WIDTH, DEFAULT_NODE_WIDTH)),
    height: Math.max(1, finite(node.height ?? node.measured?.height ?? DEFAULT_NODE_HEIGHT, DEFAULT_NODE_HEIGHT)),
  }
}

function createGeometry(nodes: readonly Node<FlowNodeData>[]): Map<string, NodeGeometry> {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const result = new Map<string, NodeGeometry>()
  const resolving = new Set<string>()
  const resolve = (node: Node<FlowNodeData>): NodeGeometry => {
    const cached = result.get(node.id)
    if (cached) return cached
    const { width, height } = dimensions(node)
    const local = { x: finite(node.position.x), y: finite(node.position.y) }
    if (resolving.has(node.id)) return { node, ...local, width, height }
    resolving.add(node.id)
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    const parentGeometry = parent ? resolve(parent) : undefined
    resolving.delete(node.id)
    const geometry = {
      node,
      x: local.x + (parentGeometry?.x ?? 0),
      y: local.y + (parentGeometry?.y ?? 0),
      width,
      height,
    }
    result.set(node.id, geometry)
    return geometry
  }
  for (const node of nodes) resolve(node)
  return result
}

function boundsFor(geometry: ReadonlyMap<string, NodeGeometry>): DiagramBounds {
  const nodes = [...geometry.values()]
  if (nodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 }
  const minX = Math.min(...nodes.map(item => item.x))
  const minY = Math.min(...nodes.map(item => item.y))
  const maxX = Math.max(...nodes.map(item => item.x + item.width))
  const maxY = Math.max(...nodes.map(item => item.y + item.height))
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

function intersect(first: DiagramBounds, second: DiagramBounds): DiagramBounds | null {
  const x = Math.max(first.x, second.x)
  const y = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

function edgeEndpoints(source: NodeGeometry, target: NodeGeometry): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 }
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
  const delta = { x: targetCenter.x - sourceCenter.x, y: targetCenter.y - sourceCenter.y }
  const sourceScale = 1 / Math.max(Math.abs(delta.x) / (source.width / 2), Math.abs(delta.y) / (source.height / 2), 1)
  const targetScale = 1 / Math.max(Math.abs(delta.x) / (target.width / 2), Math.abs(delta.y) / (target.height / 2), 1)
  return {
    from: { x: sourceCenter.x + delta.x * sourceScale, y: sourceCenter.y + delta.y * sourceScale },
    to: { x: targetCenter.x - delta.x * targetScale, y: targetCenter.y - delta.y * targetScale },
  }
}

function endpointMarkers(data: FlowEdgeData | undefined): { start?: EndpointMarker; end?: EndpointMarker } {
  const directionality = data?.directionality ?? (data?.style === 'open' ? 'none' : 'forward')
  return {
    start: data?.startEndpoint ?? (directionality === 'backward' || directionality === 'bidirectional' ? 'arrow' : undefined),
    end: data?.endEndpoint ?? (directionality === 'forward' || directionality === 'bidirectional' ? 'arrow' : undefined),
  }
}

function markerUrl(markerId: string, endpoint: EndpointMarker | undefined): string | undefined {
  return endpoint ? `url(#${markerId}-${endpoint})` : undefined
}

function nodeClass(shape: NodeShape): string {
  return `flow-minimap__node flow-minimap__node--${shape}`
}

function renderNode(geometry: NodeGeometry, project: (point: { x: number; y: number }) => { x: number; y: number }, scale: number): React.JSX.Element {
  const { node, x, y, width, height } = geometry
  const position = project({ x, y })
  const projectedWidth = width * scale
  const projectedHeight = height * scale
  const shape = node.data.shape
  const common = {
    className: nodeClass(shape),
    'data-node-id': node.id,
    'data-world-x': String(x),
    'data-world-y': String(y),
    fill: node.data.fillColor ?? 'var(--mv-node-fill)',
    stroke: node.data.strokeColor ?? 'var(--mv-node-stroke)',
  }
  if (shape === 'circle') return <ellipse key={node.id} {...common} cx={position.x + projectedWidth / 2} cy={position.y + projectedHeight / 2} rx={projectedWidth / 2} ry={projectedHeight / 2} />
  if (shape === 'diamond') return <path key={node.id} {...common} d={`M ${position.x + projectedWidth / 2} ${position.y} L ${position.x + projectedWidth} ${position.y + projectedHeight / 2} L ${position.x + projectedWidth / 2} ${position.y + projectedHeight} L ${position.x} ${position.y + projectedHeight / 2} Z`} />
  if (shape === 'hexagon') return <path key={node.id} {...common} d={`M ${position.x + projectedWidth * 0.2} ${position.y} L ${position.x + projectedWidth * 0.8} ${position.y} L ${position.x + projectedWidth} ${position.y + projectedHeight / 2} L ${position.x + projectedWidth * 0.8} ${position.y + projectedHeight} L ${position.x + projectedWidth * 0.2} ${position.y + projectedHeight} L ${position.x} ${position.y + projectedHeight / 2} Z`} />
  if (shape === 'cylinder') return <path key={node.id} {...common} d={`M ${position.x} ${position.y + projectedHeight * 0.16} C ${position.x} ${position.y - projectedHeight * 0.06}, ${position.x + projectedWidth} ${position.y - projectedHeight * 0.06}, ${position.x + projectedWidth} ${position.y + projectedHeight * 0.16} L ${position.x + projectedWidth} ${position.y + projectedHeight * 0.84} C ${position.x + projectedWidth} ${position.y + projectedHeight * 1.06}, ${position.x} ${position.y + projectedHeight * 1.06}, ${position.x} ${position.y + projectedHeight * 0.84} Z`} />
  return <rect key={node.id} {...common} x={position.x} y={position.y} width={projectedWidth} height={projectedHeight} rx={shape === 'pill' ? projectedHeight / 2 : shape === 'rounded' ? Math.min(projectedWidth, projectedHeight) / 5 : 1} strokeDasharray={shape === 'subgraph' ? '3 2' : undefined} />
}

export function FlowMiniMap({ nodes, edges, viewport, canvasSize }: FlowMiniMapProps): React.JSX.Element {
  const markerId = `flow-minimap-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const geometry = useMemo(() => createGeometry(nodes), [nodes])
  const bounds = useMemo(() => boundsFor(geometry), [geometry])
  const scale = Math.min((VIEW_WIDTH - PADDING * 2) / bounds.width, (VIEW_HEIGHT - PADDING * 2) / bounds.height)
  const offsetX = (VIEW_WIDTH - bounds.width * scale) / 2 - bounds.x * scale
  const offsetY = (VIEW_HEIGHT - bounds.height * scale) / 2 - bounds.y * scale
  const project = (point: { x: number; y: number }) => ({ x: finite(point.x) * scale + offsetX, y: finite(point.y) * scale + offsetY })
  const zoom = Math.max(0.1, finite(viewport.zoom, 1))
  const worldViewport = {
    x: -finite(viewport.x) / zoom,
    y: -finite(viewport.y) / zoom,
    width: Math.max(0, finite(canvasSize.width) / zoom),
    height: Math.max(0, finite(canvasSize.height) / zoom),
  }
  const visibleViewport = worldViewport.width > 0 && worldViewport.height > 0 ? intersect(bounds, worldViewport) : null

  return (
    <svg className="flow-minimap" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} role="img" aria-label="Diagram minimap">
      <title>Diagram minimap</title>
      <defs>
        <marker id={`${markerId}-arrow`} className="flow-minimap__arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 6 3 L 0 6 z" /></marker>
        <marker id={`${markerId}-circle`} className="flow-minimap__endpoint" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto" markerUnits="strokeWidth"><circle cx="3" cy="3" r="2" /></marker>
        <marker id={`${markerId}-cross`} className="flow-minimap__endpoint" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M 1 1 L 5 5 M 5 1 L 1 5" /></marker>
      </defs>
      {edges.map(edge => {
        const source = geometry.get(edge.source)
        const target = geometry.get(edge.target)
        if (!source || !target) return null
        const markers = endpointMarkers(edge.data)
        const common = {
          className: 'flow-minimap__edge',
          'data-edge-id': edge.id,
          markerStart: markerUrl(markerId, markers.start),
          markerEnd: markerUrl(markerId, markers.end),
        }
        if (source.node.id === target.node.id) {
          const start = project({ x: source.x + source.width / 2, y: source.y })
          const end = project({ x: source.x + source.width, y: source.y + source.height / 2 })
          const loop = Math.max(8, Math.min(20, Math.max(source.width, source.height) * scale / 2))
          return <path key={edge.id} {...common} d={`M ${start.x} ${start.y} C ${start.x + loop} ${start.y - loop}, ${end.x + loop} ${end.y - loop}, ${end.x} ${end.y}`} />
        }
        const { from, to } = edgeEndpoints(source, target)
        const start = project(from)
        const end = project(to)
        return <line key={edge.id} {...common} x1={start.x} y1={start.y} x2={end.x} y2={end.y} data-world-x1={from.x} data-world-y1={from.y} data-world-x2={to.x} data-world-y2={to.y} />
      })}
      {[...geometry.values()].map(node => renderNode(node, project, scale))}
      {visibleViewport && (() => {
        const topLeft = project(visibleViewport)
        return <rect className="flow-minimap__viewport" x={topLeft.x} y={topLeft.y} width={visibleViewport.width * scale} height={visibleViewport.height * scale} data-world-x={visibleViewport.x} data-world-y={visibleViewport.y} data-world-width={visibleViewport.width} data-world-height={visibleViewport.height} />
      })()}
    </svg>
  )
}

export function FlowMiniMapOverlay({ nodes, edges }: Pick<FlowMiniMapProps, 'nodes' | 'edges'>): React.JSX.Element {
  const width = useReactFlowStore(state => state.width)
  const height = useReactFlowStore(state => state.height)
  const transform = useReactFlowStore(state => state.transform)
  return <FlowMiniMap nodes={nodes} edges={edges} viewport={{ x: transform[0], y: transform[1], zoom: transform[2] }} canvasSize={{ width, height }} />
}
