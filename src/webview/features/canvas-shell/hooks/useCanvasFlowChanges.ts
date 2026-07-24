import { useCallback } from 'react'
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import type { Edge, EdgeChange, Node, NodeChange, XYPosition } from '@xyflow/react'
import { useStore } from '@/state/createStore'
import type { FlowEdgeData, FlowNodeData } from '@/features/flowchart'

export function useCanvasFlowChanges(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
  dragStartPositionsRef: React.MutableRefObject<Record<string, XYPosition>>,
) {
  const applyFlowChanges = useStore(state => state.applyFlowChanges)
  const applyEdgeFlowChanges = useStore(state => state.applyEdgeFlowChanges)

  const handleNodesChange = useCallback((changes: NodeChange[]): void => {
    // React Flow can emit consecutive Shift-selection changes before React
    // rerenders this controlled canvas. Start from the store's latest state so
    // a later change cannot overwrite an earlier selected node.
    const currentNodes = useStore.getState().nodes
    const safeChanges = changes.filter(change => change.type !== 'remove')
    if (safeChanges.length === 0) return
    const keyboardMoves = Object.keys(dragStartPositionsRef.current).length === 0
      ? safeChanges.flatMap(change => change.type === 'position' && change.dragging === false && change.position ? [{ id: change.id, position: change.position }] : [])
      : []
    if (keyboardMoves.length > 0) useStore.getState().moveNodes(keyboardMoves, Object.fromEntries(currentNodes.map(node => [node.id, { ...node.position }])))
    const keyboardMoveIds = new Set(keyboardMoves.map(move => move.id))
    const changesToApply = safeChanges.filter(change => !(change.type === 'position' && keyboardMoveIds.has(change.id)))
    if (changesToApply.length > 0) applyFlowChanges(applyNodeChanges(changesToApply, currentNodes) as never)
  }, [applyFlowChanges, dragStartPositionsRef])

  const handleEdgesChange = useCallback((changes: EdgeChange[]): void => {
    const safeChanges = changes.filter(change => change.type !== 'remove')
    if (safeChanges.length > 0) applyEdgeFlowChanges(applyEdgeChanges(safeChanges, edges) as never)
  }, [applyEdgeFlowChanges, edges])

  return { handleNodesChange, handleEdgesChange }
}
