import type { Edge, Node } from '@xyflow/react'
import type { EdgeAttachmentSide, EdgeRouteMode } from '../../../../shared/diagram-contracts'
import type { EdgeStyle, FlowchartOwnership, NodeShape } from '../domain/types'

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  shape: NodeShape
  isSubgraph?: boolean
  mermaidShape?: string
  ownership?: FlowchartOwnership
  direction?: 'TB' | 'TD' | 'BT' | 'RL' | 'LR'
  isLane?: boolean
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  textColor?: string
  textHorizontalAlign?: 'left' | 'center' | 'right'
  textVerticalAlign?: 'top' | 'center' | 'bottom'
  isHandDrawn?: boolean
}

export interface FlowEdgeData extends Record<string, unknown> {
  label?: string
  style?: EdgeStyle
  explicitId?: string
  connector?: string
  directionality?: 'forward' | 'backward' | 'bidirectional' | 'none'
  startEndpoint?: 'arrow' | 'circle' | 'cross'
  endEndpoint?: 'arrow' | 'circle' | 'cross'
  minimumLength?: number
  properties?: Record<string, string>
  ownership?: FlowchartOwnership
  routeMode?: EdgeRouteMode
  waypoints?: Array<{ x: number; y: number }>
  sourceSide?: EdgeAttachmentSide
  targetSide?: EdgeAttachmentSide
}

export interface CanvasSnapshot {
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
}
