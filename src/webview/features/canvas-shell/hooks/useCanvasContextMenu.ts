import { useCallback, useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import { useStore } from '@/state/createStore'
import type { FlowNodeData } from '@/features/flowchart'
import { toAbsolutePosition } from '@/features/flowchart'

interface CanvasContextMenu {
  id: string
  x: number
  y: number
}

export function useCanvasContextMenu() {
  const nodes = useStore(state => state.nodes)
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu | null>(null)
  const contextNode = useMemo(() => contextMenu ? nodes.find(node => node.id === contextMenu.id) ?? null : null, [contextMenu, nodes])
  const containers = useMemo(() => contextNode ? nodes.filter(node => node.data.isSubgraph && node.id !== contextNode.id) : [], [contextNode, nodes])
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node<FlowNodeData>): void => {
    event.preventDefault()
    setContextMenu({ id: node.id, x: event.clientX, y: event.clientY })
  }, [])

  const duplicateNode = useCallback((): void => {
    if (contextNode) useStore.getState().duplicateNode(contextNode.id)
    closeContextMenu()
  }, [closeContextMenu, contextNode])

  const moveToSubgraph = useCallback((subgraphId: string): void => {
    if (!contextNode) return
    const container = nodes.find(node => node.id === subgraphId)
    if (!container) return
    const parent = contextNode.parentId ? nodes.find(node => node.id === contextNode.parentId) : undefined
    const absolute = parent ? toAbsolutePosition(contextNode.position, parent.position) : contextNode.position
    useStore.getState().assignToSubgraph(contextNode.id, container.id, {
      x: absolute.x - container.position.x,
      y: absolute.y - container.position.y,
    })
    closeContextMenu()
  }, [closeContextMenu, contextNode, nodes])

  const moveToTopLevel = useCallback((): void => {
    if (!contextNode?.parentId) return
    const parent = nodes.find(node => node.id === contextNode.parentId)
    if (parent) useStore.getState().removeFromSubgraph(contextNode.id, toAbsolutePosition(contextNode.position, parent.position))
    closeContextMenu()
  }, [closeContextMenu, contextNode, nodes])

  const deleteNode = useCallback((): void => {
    if (contextNode) useStore.getState().removeNode(contextNode.id)
    closeContextMenu()
  }, [closeContextMenu, contextNode])

  const deleteLane = useCallback((disposition: 'promote' | 'delete-contents'): void => {
    if (contextNode) useStore.getState().deleteLane(contextNode.id, disposition)
    closeContextMenu()
  }, [closeContextMenu, contextNode])

  return {
    contextMenu,
    contextNode,
    containers,
    handleNodeContextMenu,
    closeContextMenu,
    duplicateNode,
    moveToSubgraph,
    moveToTopLevel,
    deleteNode,
    deleteLane,
  }
}
