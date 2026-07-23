import React, { useState } from 'react'
import { NodeToolbar as RFNodeToolbar, Position, useViewport } from '@xyflow/react'
import { useStore } from '@/state/createStore'
import { useShallow } from 'zustand/react/shallow'
import type { NodeShape } from '@/features/flowchart'
import { ScratchpadAddIcon } from '@/components/icons'
import { getShapeDefinitionForNode } from '../domain/shapeCatalog'
import { addScratchpadShape } from '../state/scratchpadShapes'

interface NodeToolbarProps {
  isVisible?: boolean
  nodeId: string
  // Retained for FlowNode's existing call site while formatting moves to CanvasNodeInspector.
  shape: NodeShape
  positionAbsoluteY: number
  onEditLabel: () => void
}

export default function NodeToolbar({ isVisible, nodeId, positionAbsoluteY }: NodeToolbarProps): React.JSX.Element {
  const [clickedTooltip, setClickedTooltip] = useState<string | null>(null)
  const { zoom, y: viewportY } = useViewport()
  const screenY = positionAbsoluteY * zoom + viewportY
  const toolbarPosition = screenY < 100 ? Position.Bottom : Position.Top

  const { removeNodes, duplicateNode, toggleNodeLock } = useStore(useShallow(s => ({
    removeNodes: s.removeNodes,
    duplicateNode: s.duplicateNode,
    toggleNodeLock: s.toggleNodeLock,
  })))
  const isNodeLocked = useStore(s => s.nodes.find(n => n.id === nodeId)?.draggable === false)
  const isCanvasLocked = useStore(s => s.isLocked)
  const scratchpadShape = useStore(s => {
    const node = s.nodes.find(candidate => candidate.id === nodeId)
    return node ? getShapeDefinitionForNode(node.data.shape, node.data.mermaidShape) : undefined
  })

  function handleAddToScratchpad(): void {
    if (!scratchpadShape) return
    addScratchpadShape(scratchpadShape.id)
    useStore.getState().announce(`${scratchpadShape.label} added to Scratchpad`)
  }

  function tooltipProps(label: string): { title?: string; onPointerDown: () => void; onPointerLeave: () => void } {
    return {
      title: clickedTooltip === label ? undefined : label,
      onPointerDown: () => setClickedTooltip(label),
      onPointerLeave: () => setClickedTooltip(null),
    }
  }

  return (
    <RFNodeToolbar isVisible={isVisible} position={toolbarPosition} offset={44}>
      <div className="node-toolbar">
        <button
          className="node-toolbar__btn"
          aria-label="Add to scratchpad"
          {...tooltipProps('Add to scratchpad')}
          disabled={!scratchpadShape || isCanvasLocked}
          onClick={handleAddToScratchpad}
        >
          <ScratchpadAddIcon aria-hidden="true" className="node-toolbar__scratchpad-icon" />
        </button>

        <button
          className="node-toolbar__btn"
          aria-label="Duplicate node"
          {...tooltipProps('Duplicate')}
          onClick={() => duplicateNode(nodeId)}
        >⧉</button>

        <button
          className={`node-toolbar__btn${isNodeLocked ? ' node-toolbar__btn--active' : ''}`}
          aria-label={isNodeLocked ? 'Unlock node' : 'Lock node'}
          {...tooltipProps(isNodeLocked ? 'Unlock' : 'Lock')}
          onClick={() => toggleNodeLock(nodeId)}
        >{isNodeLocked ? '⊠' : '⊟'}</button>

        <div className="node-toolbar__divider" aria-hidden="true" />

        <button
          className="node-toolbar__btn node-toolbar__btn--danger"
          aria-label="Delete node"
          {...tooltipProps('Delete')}
          onClick={() => removeNodes([nodeId])}
        >✕</button>
      </div>
    </RFNodeToolbar>
  )
}
