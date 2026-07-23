import { useCallback, useEffect } from 'react'
import type { Connection, NodeMouseHandler } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/state/createStore'
import type { NewEdgeRouteMode } from '../../../../shared/protocol'
import type { EdgeAttachmentSide } from '../../../../shared/diagram-contracts'

function attachmentSideAtPosition(clientX: number, clientY: number): EdgeAttachmentSide | undefined {
  const target = document.elementFromPoint?.(clientX, clientY)
  const handle = target?.closest<HTMLElement>('[data-attachment-side]')
  const side = handle?.dataset.attachmentSide
  if (side === 'top' || side === 'right' || side === 'bottom' || side === 'left') return side

  const node = target?.closest<HTMLElement>('.react-flow__node')
  if (!node) return undefined
  const bounds = node.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) return undefined
  const candidates: Array<[EdgeAttachmentSide, number, number]> = [
    ['top', bounds.left + bounds.width / 2, bounds.top],
    ['right', bounds.right, bounds.top + bounds.height / 2],
    ['bottom', bounds.left + bounds.width / 2, bounds.bottom],
    ['left', bounds.left, bounds.top + bounds.height / 2],
  ]
  return candidates.reduce((closest, candidate) => (
    Math.hypot(candidate[1] - clientX, candidate[2] - clientY) < Math.hypot(closest[1] - clientX, closest[2] - clientY)
      ? candidate
      : closest
  ))[0]
}

function attachmentSideFromHandle(handle: string | null | undefined): EdgeAttachmentSide | undefined {
  const side = handle?.split('-').at(-1)
  return side === 'top' || side === 'right' || side === 'bottom' || side === 'left' ? side : undefined
}

export function usePendingConnect(screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }, newEdgeRouteMode: NewEdgeRouteMode = 'curved') {
  const { pendingConnect, setPendingConnect, spawnConnectedNode, addEdge, retargetEdgeEndpoint } = useStore(useShallow(state => ({
    pendingConnect: state.pendingConnect, setPendingConnect: state.setPendingConnect,
    spawnConnectedNode: state.spawnConnectedNode, addEdge: state.addEdge, retargetEdgeEndpoint: state.retargetEdgeEndpoint,
  })))
  const handleConnect = useCallback((connection: Connection): void => {
    if (!connection.source || !connection.target) return
    addEdge({
      ...connection,
      sourceSide: attachmentSideFromHandle(connection.sourceHandle),
      targetSide: attachmentSideFromHandle(connection.targetHandle),
    } as { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; sourceSide?: EdgeAttachmentSide; targetSide?: EdgeAttachmentSide }, newEdgeRouteMode)
  }, [addEdge, newEdgeRouteMode])
  const handleNodeClick: NodeMouseHandler = useCallback((event, node) => {
    if (!pendingConnect) return
    const fixedNodeId = pendingConnect.kind === 'reassign' ? pendingConnect.fixedNodeId : pendingConnect.sourceId
    if (node.id === fixedNodeId) { setPendingConnect(null); return }
    const targetSide = attachmentSideAtPosition(event.clientX, event.clientY)
    if (pendingConnect.kind === 'reassign') retargetEdgeEndpoint(pendingConnect.edgeId, pendingConnect.endpoint, node.id, targetSide)
    else addEdge({ source: pendingConnect.sourceId, target: node.id, sourceSide: pendingConnect.sourceSide, targetSide }, newEdgeRouteMode)
    setPendingConnect(null)
  }, [addEdge, newEdgeRouteMode, pendingConnect, setPendingConnect])
  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    if (!pendingConnect) return
    if (pendingConnect.kind !== 'reassign') spawnConnectedNode(pendingConnect.sourceId, screenToFlowPosition({ x: event.clientX, y: event.clientY }), newEdgeRouteMode, pendingConnect.sourceSide)
    setPendingConnect(null)
  }, [newEdgeRouteMode, pendingConnect, screenToFlowPosition, setPendingConnect, spawnConnectedNode])

  useEffect(() => {
    if (!pendingConnect) return
    const onPointerUp = (event: PointerEvent): void => {
      const node = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.react-flow__node')
      const targetId = node?.dataset.id
      const fixedNodeId = pendingConnect.kind === 'reassign' ? pendingConnect.fixedNodeId : pendingConnect.sourceId
      if (targetId && targetId !== fixedNodeId) {
        const targetSide = attachmentSideAtPosition(event.clientX, event.clientY)
        if (pendingConnect.kind === 'reassign') retargetEdgeEndpoint(pendingConnect.edgeId, pendingConnect.endpoint, targetId, targetSide)
        else addEdge({
          source: pendingConnect.sourceId,
          target: targetId,
          sourceSide: pendingConnect.sourceSide,
          targetSide,
        }, newEdgeRouteMode)
        setPendingConnect(null)
        return
      }
      if (!targetId && pendingConnect.kind !== 'reassign') {
        spawnConnectedNode(pendingConnect.sourceId, screenToFlowPosition({ x: event.clientX, y: event.clientY }), newEdgeRouteMode, pendingConnect.sourceSide)
        setPendingConnect(null)
      }
    }
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [addEdge, newEdgeRouteMode, pendingConnect, retargetEdgeEndpoint, screenToFlowPosition, setPendingConnect, spawnConnectedNode])

  return { pendingConnect, handleConnect, handleNodeClick, handlePaneClick }
}
