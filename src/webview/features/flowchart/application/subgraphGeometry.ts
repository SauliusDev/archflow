import type { Node, XYPosition } from '@xyflow/react'
import type { FlowNodeData } from '../state/types'

export const SUBGRAPH_HEADER_HEIGHT = 32

function nodeCenter(node: Node<FlowNodeData>): XYPosition {
  const { width, height } = nodeDimensions(node)
  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  }
}

function nodeDimensions(node: Node<FlowNodeData>): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? 80,
    height: node.measured?.height ?? node.height ?? 40,
  }
}

function groupContainsPoint(point: XYPosition, group: Node<FlowNodeData>): boolean {
  const groupW = group.width ?? group.measured?.width ?? 300
  const groupH = group.height ?? group.measured?.height ?? 200
  const { x, y } = group.position

  return point.x >= x && point.x <= x + groupW && point.y >= y && point.y <= y + groupH
}

export function groupBodyContainsNode(
  node: Node<FlowNodeData>,
  group: Node<FlowNodeData>,
  headerHeight = SUBGRAPH_HEADER_HEIGHT,
): boolean {
  const { width: nodeWidth, height: nodeHeight } = nodeDimensions(node)
  const groupWidth = group.width ?? group.measured?.width ?? 300
  const groupHeight = group.height ?? group.measured?.height ?? 200
  return (
    node.position.x >= group.position.x
    && node.position.x + nodeWidth <= group.position.x + groupWidth
    && node.position.y >= group.position.y + headerHeight
    && node.position.y + nodeHeight <= group.position.y + groupHeight
  )
}

export function constrainNodePositionToGroupBody(
  node: Node<FlowNodeData>,
  group: Node<FlowNodeData>,
  position: XYPosition,
  headerHeight = SUBGRAPH_HEADER_HEIGHT,
): XYPosition {
  const { width: nodeWidth, height: nodeHeight } = nodeDimensions(node)
  const groupWidth = group.width ?? group.measured?.width ?? 300
  const groupHeight = group.height ?? group.measured?.height ?? 200
  return {
    x: Math.max(0, Math.min(position.x, Math.max(0, groupWidth - nodeWidth))),
    y: Math.max(headerHeight, Math.min(position.y, Math.max(headerHeight, groupHeight - nodeHeight))),
  }
}

export function constrainTopLevelNodePositionOutsideGroup(
  node: Node<FlowNodeData>,
  group: Node<FlowNodeData>,
  position: XYPosition,
): XYPosition {
  const { width: nodeWidth, height: nodeHeight } = nodeDimensions(node)
  const groupWidth = group.width ?? group.measured?.width ?? 300
  const groupHeight = group.height ?? group.measured?.height ?? 200
  const overlaps = position.x < group.position.x + groupWidth
    && position.x + nodeWidth > group.position.x
    && position.y < group.position.y + groupHeight
    && position.y + nodeHeight > group.position.y
  if (!overlaps) return position

  const candidates = [
    { x: group.position.x - nodeWidth, y: position.y },
    { x: group.position.x + groupWidth, y: position.y },
    { x: position.x, y: group.position.y - nodeHeight },
    { x: position.x, y: group.position.y + groupHeight },
  ]
  return candidates.reduce((nearest, candidate) => (
    Math.abs(candidate.x - position.x) + Math.abs(candidate.y - position.y)
      < Math.abs(nearest.x - position.x) + Math.abs(nearest.y - position.y)
      ? candidate
      : nearest
  ))
}

export function findTopLevelNodesInGroupBody(
  group: Node<FlowNodeData>,
  nodes: Node<FlowNodeData>[],
  headerHeight = SUBGRAPH_HEADER_HEIGHT,
): Node<FlowNodeData>[] {
  return nodes.filter(node => (
    !node.data.isSubgraph
    && node.data.shape !== 'subgraph'
    && !node.parentId
    && groupBodyContainsNode(node, group, headerHeight)
  ))
}

export function findDropTargetSubgraph(
  draggedNode: Node<FlowNodeData>,
  allNodes: Node<FlowNodeData>[]
): string | null {
  let bestId: string | null = null
  let bestArea = Infinity

  for (const sg of allNodes) {
    if (!sg.data.isSubgraph) continue
    if (sg.id === draggedNode.parentId) continue
    if (sg.id === draggedNode.id) continue
    if (sg.parentId === draggedNode.id) continue

    const sgW = sg.width ?? sg.measured?.width ?? 300
    const sgH = sg.height ?? sg.measured?.height ?? 200
    if (groupBodyContainsNode(draggedNode, sg)) {
      const area = sgW * sgH
      if (area < bestArea) {
        bestArea = area
        bestId = sg.id
      }
    }
  }

  return bestId
}

export function isNodeOutsideParent(
  childNode: Node<FlowNodeData>,
  parentNode: Node<FlowNodeData>
): boolean {
  return !groupContainsPoint(nodeCenter(childNode), { ...parentNode, position: { x: 0, y: 0 } })
}

export function toRelativePosition(absolutePos: XYPosition, parentPos: XYPosition): XYPosition {
  return {
    x: absolutePos.x - parentPos.x,
    y: absolutePos.y - parentPos.y,
  }
}

export function toAbsolutePosition(relativePos: XYPosition, parentPos: XYPosition): XYPosition {
  return {
    x: relativePos.x + parentPos.x,
    y: relativePos.y + parentPos.y,
  }
}
