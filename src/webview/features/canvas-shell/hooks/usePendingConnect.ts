import { useCallback, useEffect } from 'react'
import type { Connection, NodeMouseHandler } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/state/createStore'
import type { NewEdgeRouteMode } from '../../../../shared/protocol'

export function usePendingConnect(screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }, newEdgeRouteMode: NewEdgeRouteMode = 'curved') {
  const { pendingConnect, setPendingConnect, spawnConnectedNode, addEdge, retargetEdgeEndpoint } = useStore(useShallow(state => ({
    pendingConnect: state.pendingConnect, setPendingConnect: state.setPendingConnect,
    spawnConnectedNode: state.spawnConnectedNode, addEdge: state.addEdge, retargetEdgeEndpoint: state.retargetEdgeEndpoint,
  })))
  const handleConnect = useCallback((connection: Connection): void => {
    if (!connection.source || !connection.target) return
    addEdge(connection as { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }, newEdgeRouteMode)
  }, [addEdge, newEdgeRouteMode])
  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (!pendingConnect) return
    const fixedNodeId = pendingConnect.kind === 'reassign' ? pendingConnect.fixedNodeId : pendingConnect.sourceId
    if (node.id === fixedNodeId) { setPendingConnect(null); return }
    if (pendingConnect.kind === 'reassign') retargetEdgeEndpoint(pendingConnect.edgeId, pendingConnect.endpoint, node.id)
    else addEdge({ source: pendingConnect.sourceId, target: node.id, sourceSide: pendingConnect.sourceSide }, newEdgeRouteMode)
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
      // Starting a reassignment is a two-stage gesture: release the old end to
      // leave it rubber-banded to the cursor, then choose its new target.
      if (pendingConnect.kind === 'reassign' && pendingConnect.awaitingInitialRelease) {
        setPendingConnect({ ...pendingConnect, awaitingInitialRelease: false, cursor: { x: event.clientX, y: event.clientY } })
        return
      }
      const node = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.react-flow__node')
      const targetId = node?.dataset.id
      const fixedNodeId = pendingConnect.kind === 'reassign' ? pendingConnect.fixedNodeId : pendingConnect.sourceId
      if (targetId && targetId !== fixedNodeId) {
        if (pendingConnect.kind === 'reassign') retargetEdgeEndpoint(pendingConnect.edgeId, pendingConnect.endpoint, targetId)
        else addEdge({ source: pendingConnect.sourceId, target: targetId, sourceSide: pendingConnect.sourceSide }, newEdgeRouteMode)
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
