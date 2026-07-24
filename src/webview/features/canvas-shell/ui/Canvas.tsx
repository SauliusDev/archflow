import React, { useCallback, useMemo } from 'react'
import {
  Background, BackgroundVariant, ConnectionMode, ReactFlow, ReactFlowProvider,
  SelectionMode, useReactFlow,
} from '@xyflow/react'
import { useStore } from '@/state/createStore'
import { GRID_SNAP } from '@/state/types'
import type { LayoutStyle } from '../../../../shared/protocol'
import { computeDimmedNodeIds } from '@/lib/selection'
import { useColorMode } from '@/lib/useColorMode'
import { ClassDiagramCanvas } from '@/features/class-diagram'
import { constrainNodePositionToGroupBody, constrainTopLevelNodePositionOutsideGroup, FlowEdge, FlowNode, groupBodyContainsNode, SubgraphNode, useNewEdgeRouteMode } from '@/features/flowchart'
import CanvasSidebar from './CanvasSidebar'
import CanvasNodeInspector from './CanvasNodeInspector'
import ZoomBar from './ZoomBar'
import { useCanvasDrag } from '../hooks/useCanvasDrag'
import { useCanvasDrop } from '../hooks/useCanvasDrop'
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard'
import { useCanvasViewport } from '../hooks/useCanvasViewport'
import { usePendingConnect } from '../hooks/usePendingConnect'
import { useCanvasFlowChanges } from '../hooks/useCanvasFlowChanges'
import { useCanvasContextMenu } from '../hooks/useCanvasContextMenu'
import { FlowMiniMapOverlay } from './FlowMiniMap'
import { PendingConnectionPreview } from './pendingConnectionPreview'

// React Flow compares these references on each render. Keep them module-scoped
// so extracting interactions never remounts nodes or edges.
const nodeTypes = { flowNode: FlowNode, subgraphNode: SubgraphNode }
const edgeTypes = { default: FlowEdge }
const CLASSIC_FIT_VIEW_OPTIONS = { padding: 0.1, duration: 200, maxZoom: 1 }
const PAPER_GRID_FIT_VIEW_OPTIONS = { padding: 0.2, duration: 360, maxZoom: 1 }
const PAPER_GRID_INITIAL_FIT_OPTIONS = { padding: 0.2, minZoom: 0.22, maxZoom: 1 }
const PAPER_GRID_COLORS = {
  dark: {
    minor: 'rgba(255, 255, 255, 0.018)',
    major: 'rgba(255, 255, 255, 0.035)',
  },
  light: {
    minor: 'rgba(36, 36, 36, 0.04)',
    major: 'rgba(36, 36, 36, 0.05)',
  },
} as const

function CanvasFlow({ snapToGrid, layoutStyle }: { snapToGrid: boolean; layoutStyle: LayoutStyle }): React.JSX.Element {
  const { screenToFlowPosition, setViewport: setReactFlowViewport, fitView, zoomIn, zoomOut, zoomTo } = useReactFlow()
  const colorMode = useColorMode()
  const nodes = useStore(state => state.nodes)
  const edges = useStore(state => state.edges)
  const minimapOpen = useStore(state => state.minimapOpen)
  const isLocked = useStore(state => state.isLocked)
  const inspectorVisible = useStore(state => state.documentSession?.layout.inspectorVisible !== false)
  const setPendingConnectTargetId = useStore(state => state.setPendingConnectTargetId)
  const newEdgeRouteMode = useNewEdgeRouteMode()
  const paperGrid = layoutStyle === 'modern'
  const paperGridColors = PAPER_GRID_COLORS[colorMode]
  const fitViewOptions = paperGrid ? PAPER_GRID_FIT_VIEW_OPTIONS : CLASSIC_FIT_VIEW_OPTIONS

  const { dropTargetId, edgeInsertionId, escapingNodeIds, dragStartPositionsRef, handleNodeDragStart, handleNodeDrag, handleNodeDragStop } = useCanvasDrag()
  const { handleNodesChange, handleEdgesChange } = useCanvasFlowChanges(nodes, edges, dragStartPositionsRef)
  const { contextMenu, contextNode, containers, handleNodeContextMenu, closeContextMenu, duplicateNode, moveToSubgraph, moveToTopLevel, deleteNode, deleteLane } = useCanvasContextMenu()
  const { handleCanvasDragOver, handleCanvasDrop, edgeInsertionId: paletteEdgeInsertionId } = useCanvasDrop(screenToFlowPosition, snapToGrid)
  const { pendingConnect, handleNodeClick, handlePaneClick } = usePendingConnect(screenToFlowPosition, newEdgeRouteMode)
  const displayEdges = useMemo(() => pendingConnect?.kind === 'reassign'
    ? edges.filter(edge => edge.id !== pendingConnect.edgeId)
    : edges, [edges, pendingConnect])
  const handleNodeMouseEnter = useCallback((_event: React.MouseEvent, node: { id: string }) => {
    const fixedNodeId = pendingConnect?.kind === 'reassign' ? pendingConnect.fixedNodeId : pendingConnect?.sourceId
    if (pendingConnect && node.id !== fixedNodeId) setPendingConnectTargetId(node.id)
  }, [pendingConnect, setPendingConnectTargetId])
  const handleNodeMouseLeave = useCallback((_event: React.MouseEvent, node: { id: string }) => {
    const fixedNodeId = pendingConnect?.kind === 'reassign' ? pendingConnect.fixedNodeId : pendingConnect?.sourceId
    if (pendingConnect && node.id !== fixedNodeId) setPendingConnectTargetId(null)
  }, [pendingConnect, setPendingConnectTargetId])
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || !event.target.closest('.react-flow__pane')) return
    handlePaneClick(event)
  }, [handlePaneClick])
  const { handleViewportChange } = useCanvasViewport({ setViewport: setReactFlowViewport, fitView, zoomIn, zoomOut, zoomTo, fitViewOptions })
  useCanvasKeyboard({ zoomIn, zoomOut, zoomTo, fitView, fitViewOptions })

  const dimmedNodeIds = useMemo(() => computeDimmedNodeIds(nodes, edges), [nodes, edges])
  const displayNodes = useMemo(() => {
    const escapingNodeIdSet = new Set(escapingNodeIds)
    let result = nodes.map(node => {
      const parent = node.parentId ? nodes.find(candidate => candidate.id === node.parentId) : undefined
      const { extent: _extent, ...unboundedNode } = node
      let position = node.position
      if (parent && !escapingNodeIdSet.has(node.id)) position = constrainNodePositionToGroupBody(node, parent, position)
      if (!parent && !node.data.isSubgraph) {
        for (const group of nodes) {
          if (!group.data.isSubgraph || groupBodyContainsNode({ ...node, position }, group)) continue
          position = constrainTopLevelNodePositionOutsideGroup(node, group, position)
        }
      }
      const constrainedNode = { ...unboundedNode, position }
      return dimmedNodeIds.has(node.id) ? { ...constrainedNode, className: 'dimmed' } : constrainedNode
    })
    if (dropTargetId) result = result.map(node => node.id === dropTargetId ? { ...node, className: [node.className, 'drop-target'].filter(Boolean).join(' ') } : node)
    return result
  }, [dimmedNodeIds, dropTargetId, escapingNodeIds, nodes])
  return <div className={`canvas-container canvas-container--${layoutStyle}${pendingConnect ? ' canvas--pending-connect' : ''}${isLocked ? ' canvas--locked' : ''}`} onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}>
    <CanvasSidebar />
    {inspectorVisible && <CanvasNodeInspector />}
    <ZoomBar layoutStyle={layoutStyle} />
    <div className="canvas-workarea" onClickCapture={handleCanvasClick}>
      {(edgeInsertionId || paletteEdgeInsertionId) && <div className="canvas-edge-insertion-hint" role="status">Insert between nodes</div>}
      <ReactFlow
        nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
        onNodeDragStart={handleNodeDragStart} onNodeDrag={handleNodeDrag} onNodeDragStop={handleNodeDragStop}
        onNodeClick={isLocked ? undefined : handleNodeClick}
        onNodeMouseEnter={isLocked ? undefined : handleNodeMouseEnter}
        onNodeMouseLeave={isLocked ? undefined : handleNodeMouseLeave}
        onNodeContextMenu={isLocked ? undefined : handleNodeContextMenu}
        onViewportChange={handleViewportChange}
        connectionMode={ConnectionMode.Loose} snapToGrid={snapToGrid} snapGrid={[GRID_SNAP, GRID_SNAP] as [number, number]}
        colorMode={colorMode} multiSelectionKeyCode="Shift" selectionOnDrag={false}
        panOnDrag nodesDraggable={!isLocked} nodesConnectable={false} elementsSelectable={!isLocked}
        panOnScroll zoomOnScroll zoomOnPinch zoomActivationKeyCode={null}
        fitView={paperGrid} fitViewOptions={paperGrid ? PAPER_GRID_INITIAL_FIT_OPTIONS : undefined}
        minZoom={paperGrid ? 0.08 : 0.1} maxZoom={paperGrid ? 1.6 : 4} selectionMode={SelectionMode.Partial}
      >
        {layoutStyle === 'modern' ? <>
          <Background id="workflow-paper-minor-grid" className="workflow-paper-grid" patternClassName="workflow-paper-grid-minor" variant={BackgroundVariant.Lines} gap={44} lineWidth={1} color={paperGridColors.minor} bgColor="transparent" />
          <Background id="workflow-paper-major-grid" className="workflow-paper-grid" patternClassName="workflow-paper-grid-major" variant={BackgroundVariant.Lines} gap={220} lineWidth={1} color={paperGridColors.major} bgColor="transparent" />
        </> : <Background variant={BackgroundVariant.Dots} gap={GRID_SNAP} size={1} color="var(--mv-dot-color)" />}
        {minimapOpen && <FlowMiniMapOverlay nodes={nodes} edges={edges} />}
      </ReactFlow>
      <PendingConnectionPreview pending={pendingConnect} />
      {contextMenu && contextNode && <div className="canvas-context-menu" role="menu" aria-label={`Actions for ${contextNode.data.label}`} style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 50 }} onMouseLeave={closeContextMenu}>
        {!contextNode.data.isSubgraph && <button role="menuitem" onClick={duplicateNode}>Duplicate</button>}
        {!contextNode.data.isSubgraph && containers.map(container => <button key={container.id} role="menuitem" onClick={() => moveToSubgraph(container.id)}>Move to {container.data.label}</button>)}
        {!contextNode.data.isSubgraph && contextNode.parentId && <button role="menuitem" onClick={moveToTopLevel}>Move to top level</button>}
        {contextNode.data.isLane ? <><button role="menuitem" onClick={() => deleteLane('promote')}>Delete lane, keep nodes</button><button role="menuitem" onClick={() => deleteLane('delete-contents')}>Delete lane and nodes</button></> : <button role="menuitem" onClick={deleteNode}>Delete</button>}
      </div>}
    </div>
  </div>
}

export default function Canvas({ snapToGrid = false, layoutStyle = 'modern' }: { snapToGrid?: boolean; layoutStyle?: LayoutStyle }): React.JSX.Element {
  const family = useStore(state => state.documentSession?.family)
  if (family === 'class') return <ClassDiagramCanvas />
  return <ReactFlowProvider><CanvasFlow snapToGrid={snapToGrid} layoutStyle={layoutStyle} /></ReactFlowProvider>
}
