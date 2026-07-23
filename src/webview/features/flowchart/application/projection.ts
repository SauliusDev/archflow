import type { Edge, Node } from '@xyflow/react'
import type { DocumentSession } from '../../../lib/documentSession'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import type { FlowchartAdapterModel } from './adapter'
import { flowchartLaneOrder, flowchartTextAlignment } from './commands'

export function projectFlowchartSession(
  session: DocumentSession,
  currentNodes: Node<FlowNodeData>[],
  preserveCurrentGeometry = true,
): { nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] } {
  const model = session.projection.model as FlowchartAdapterModel
  const currentById = new Map(currentNodes.map(node => [node.id, node]))
  const laneIds = new Set(flowchartLaneOrder(session.layout))
  const topLevelSubgraphIds = new Set(model.sourceMap.constructs.filter(construct => construct.kind === 'subgraph' && !construct.parentIdentity).map(construct => construct.identity.slice('subgraph:'.length)))
  const nodes = model.nodes.map(parsedNode => {
    const current = currentById.get(parsedNode.id)
    const geometry = session.layout.elements[`node:${parsedNode.id}`]
    const textAlignment = flowchartTextAlignment(session.layout, parsedNode.id)
    return {
      ...parsedNode,
      position: geometry ? { x: geometry.x, y: geometry.y } : (preserveCurrentGeometry ? (current?.position ?? parsedNode.position) : parsedNode.position),
      ...(geometry?.width !== undefined ? { width: geometry.width } : (current?.width !== undefined ? { width: current.width } : {})),
      ...(geometry?.height !== undefined ? { height: geometry.height } : (current?.height !== undefined ? { height: current.height } : {})),
      selected: session.selection.includes(`node:${parsedNode.id}`),
      zIndex: parsedNode.type === 'subgraphNode' ? 0 : 1,
      data: {
        ...parsedNode.data,
        isHandDrawn: current?.data.isHandDrawn,
        textHorizontalAlign: textAlignment?.horizontal ?? current?.data.textHorizontalAlign,
        textVerticalAlign: textAlignment?.vertical ?? current?.data.textVerticalAlign,
        isLane: laneIds.has(parsedNode.id) && topLevelSubgraphIds.has(parsedNode.id),
      },
    }
  })
  const edges = model.edges.map(edge => {
    const route = session.layout.edges[`edge:${edge.id}`]
    const selected = session.selection.includes(`edge:${edge.id}`)
    return route
      ? {
        ...edge,
        selected,
        data: {
          ...edge.data,
          routeMode: route.routeMode,
          waypoints: route.waypoints,
          ...(route.sourceSide !== undefined ? { sourceSide: route.sourceSide } : {}),
          ...(route.targetSide !== undefined ? { targetSide: route.targetSide } : {}),
        },
      }
      : { ...edge, selected }
  })
  return { nodes, edges }
}
