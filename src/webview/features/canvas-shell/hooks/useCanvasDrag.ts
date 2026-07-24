import { useRef, useState } from 'react'
import type { Node, XYPosition } from '@xyflow/react'
import { useStore } from '@/state/createStore'
import type { FlowNodeData } from '@/features/flowchart'
import { constrainNodePositionToGroupBody, constrainTopLevelNodePositionOutsideGroup, findDropTargetSubgraph, findEdgeInsertionCandidate, groupBodyContainsNode, isNodeOutsideParent, toAbsolutePosition, toRelativePosition } from '@/features/flowchart'

export function useCanvasDrag() {
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [escapingNodeIds, setEscapingNodeIds] = useState<string[]>([])
  const dragStartPositionsRef = useRef<Record<string, XYPosition>>({})
  const moveNodes = useStore(state => state.moveNodes)
  const assignToSubgraph = useStore(state => state.assignToSubgraph)
  const removeFromSubgraph = useStore(state => state.removeFromSubgraph)
  const insertNodeOnEdge = useStore(state => state.insertNodeOnEdge)
  const [edgeInsertionId, setEdgeInsertionId] = useState<string | null>(null)

  function handleNodeDragStart(_event: React.MouseEvent, draggedNode: Node<FlowNodeData>, draggedNodes: Node<FlowNodeData>[]): void {
    const movingNodes = draggedNodes.length > 0 ? draggedNodes : [draggedNode]
    dragStartPositionsRef.current = Object.fromEntries(movingNodes.map(node => [node.id, { ...node.position }]))
    setEscapingNodeIds(current => current.filter(id => !movingNodes.some(node => node.id === id)))
    useStore.getState().setSyncDirection('canvas')
  }
  function handleNodeDrag(_event: React.MouseEvent, draggedNode: Node<FlowNodeData>): void {
    const state = useStore.getState()
    const nodeCenter = {
      x: draggedNode.position.x + (draggedNode.measured?.width ?? draggedNode.width ?? 160) / 2,
      y: draggedNode.position.y + (draggedNode.measured?.height ?? draggedNode.height ?? 64) / 2,
    }
    const candidate = !draggedNode.parentId
      ? findEdgeInsertionCandidate(nodeCenter, state.nodes, state.edges)
      : null
    setEdgeInsertionId(candidate && candidate.source !== draggedNode.id && candidate.target !== draggedNode.id ? candidate.id : null)
    if (draggedNode.parentId) {
      const parent = useStore.getState().nodes.find(node => node.id === draggedNode.parentId)
      if (parent && isNodeOutsideParent(draggedNode, parent)) {
        setEscapingNodeIds(current => current.includes(draggedNode.id) ? current : [...current, draggedNode.id])
      }
      setDropTargetId(null)
      return
    }
    setDropTargetId(findDropTargetSubgraph(draggedNode, useStore.getState().nodes))
  }
  function handleNodeDragStop(_event: React.MouseEvent, draggedNode: Node<FlowNodeData>, draggedNodes: Node<FlowNodeData>[]): void {
    setDropTargetId(null)
    const edgeId = edgeInsertionId
    setEdgeInsertionId(null)
    const nodes = useStore.getState().nodes
    const movingNodes = draggedNodes.length > 0 ? draggedNodes : [draggedNode]
    if (edgeId && movingNodes.length === 1 && !draggedNode.data.isSubgraph && !draggedNode.data.isLane) {
      if (insertNodeOnEdge(edgeId, { ...draggedNode, position: draggedNode.position }, false)) {
        dragStartPositionsRef.current = {}
        setEscapingNodeIds(current => current.filter(id => id !== draggedNode.id))
        useStore.getState().setSyncDirection(null)
        return
      }
    }
    const toMove: Array<{ id: string; position: XYPosition }> = []
    for (const draggedNode of movingNodes) {
      if (draggedNode.parentId) {
        const parent = nodes.find(node => node.id === draggedNode.parentId)
        if (parent && isNodeOutsideParent(draggedNode, parent)) removeFromSubgraph(draggedNode.id, toAbsolutePosition(draggedNode.position, parent.position))
        else if (parent) toMove.push({ id: draggedNode.id, position: constrainNodePositionToGroupBody(draggedNode, parent, draggedNode.position) })
      } else {
        const targetId = findDropTargetSubgraph(draggedNode, nodes)
        if (targetId) {
          const subgraph = nodes.find(node => node.id === targetId)!
          assignToSubgraph(draggedNode.id, targetId, constrainNodePositionToGroupBody(draggedNode, subgraph, toRelativePosition(draggedNode.position, subgraph.position)))
        } else if (draggedNode.data.isSubgraph) {
          // Groups are containers, not obstacles. Running a group through the
          // top-level-node guard makes it collide with its own header and jumps
          // it above its just-dropped position.
          toMove.push({ id: draggedNode.id, position: draggedNode.position })
        } else {
          let position = draggedNode.position
          for (const group of nodes) {
            if (!group.data.isSubgraph || groupBodyContainsNode({ ...draggedNode, position }, group)) continue
            position = constrainTopLevelNodePositionOutsideGroup(draggedNode, group, position)
          }
          toMove.push({ id: draggedNode.id, position })
        }
      }
    }
    if (toMove.length > 0) moveNodes(toMove, dragStartPositionsRef.current)
    dragStartPositionsRef.current = {}
    setEscapingNodeIds(current => current.filter(id => !movingNodes.some(node => node.id === id)))
    useStore.getState().setSyncDirection(null)
  }
  return { dropTargetId, edgeInsertionId, escapingNodeIds, dragStartPositionsRef, handleNodeDragStart, handleNodeDrag, handleNodeDragStop }
}
