import React, { useCallback, useRef, useState } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import type { NodeProps, Node, ResizeParams } from '@xyflow/react'
import type { FlowNodeData } from '../state/types'
import { useStore } from '@/state/createStore'
import FlowforgeToolbar from './NodeToolbar'
import ConnectArrows from '@/components/ConnectArrows'
import { ShapeGraphic } from './ShapeGraphic'
import { flowchartNodeConnections } from '../../../../shared/diagram-contracts'

const ATTACHMENT_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const

function useSideConnectionMode(): boolean {
  return useStore(state => {
    const session = state.documentSession
    return session?.family === 'flowchart' && flowchartNodeConnections(session.layout).mode === 'side'
  })
}

// ── FlowNode component ────────────────────────────────────────────────────────

export default function FlowNode({
  id,
  data,
  selected,
  positionAbsoluteY,
}: NodeProps<Node<FlowNodeData>>): React.JSX.Element {
  const { label, shape, fillColor, strokeColor, strokeWidth = 2, textColor, textHorizontalAlign = 'center', textVerticalAlign = 'center', isHandDrawn } = data

  const colorStyle: Record<string, string> = {}
  if (fillColor !== undefined) colorStyle['--mv-node-fill'] = fillColor
  if (strokeColor !== undefined) colorStyle['--mv-node-stroke'] = strokeColor
  colorStyle['--flow-node-stroke-width'] = `${strokeWidth}px`
  if (textColor !== undefined) colorStyle['--mv-node-text'] = textColor
  const resizeNode = useStore(s => s.resizeNode)
  const updateNodeLabel = useStore(s => s.updateNodeLabel)
  const selectedCount = useStore(s => s.nodes.filter(n => n.selected).length)
  const isCanvasLocked = useStore(s => s.isLocked)
  const isSideConnectionMode = useSideConnectionMode()
  const pendingConnect = useStore(s => s.pendingConnect)
  const pendingConnectTargetId = useStore(s => s.pendingConnectTargetId)
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const isEscapingRef = useRef(false)

  const handleResizeEnd = useCallback((_: unknown, params: ResizeParams) => {
    resizeNode(id, { width: params.width, height: params.height }, { x: params.x, y: params.y })
  }, [id, resizeNode])

  function handleStartEdit(): void {
    if (isCanvasLocked) return
    isEscapingRef.current = false
    setEditingLabel(label)
  }

  function handleDoubleClick(e: React.MouseEvent): void {
    e.stopPropagation()
    handleStartEdit()
  }

  function commitEdit(): void {
    if (editingLabel !== null && !isEscapingRef.current) {
      updateNodeLabel(id, editingLabel)
    }
    isEscapingRef.current = false
    setEditingLabel(null)
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      isEscapingRef.current = true
      setEditingLabel(null)
    }
  }

  function preventNodeDrag(event: React.PointerEvent): void {
    event.stopPropagation()
  }

  const showSideAttachmentTargets = !isCanvasLocked && isSideConnectionMode && (
    (Boolean(selected) && selectedCount === 1) ||
    (pendingConnect !== null && (pendingConnect.kind === 'reassign' ? pendingConnect.fixedNodeId : pendingConnect.sourceId) !== id && pendingConnectTargetId === id)
  )
  const isConnectionTarget = !isCanvasLocked && pendingConnect !== null
    && (pendingConnect.kind === 'reassign' ? pendingConnect.fixedNodeId : pendingConnect.sourceId) !== id
    && pendingConnectTargetId === id

  return (
    <div
      className={[
        'flow-node',
        `flow-node--${shape}`,
        `flow-node--text-horizontal-${textHorizontalAlign}`,
        `flow-node--text-vertical-${textVerticalAlign}`,
        selected ? 'flow-node--selected' : '',
        isConnectionTarget ? 'flow-node--connection-target' : '',
        showSideAttachmentTargets ? 'flow-node--side-attachment-targets' : '',
        isHandDrawn ? 'flow-node--hand-drawn' : '',
      ].filter(Boolean).join(' ')}
      style={Object.keys(colorStyle).length > 0 ? colorStyle as React.CSSProperties : undefined}
    >
      <NodeResizer isVisible={selected && !isCanvasLocked} minWidth={60} minHeight={30} onResizeEnd={handleResizeEnd} />
      <FlowforgeToolbar
        isVisible={selected && selectedCount === 1 && !isCanvasLocked}
        nodeId={id}
        shape={shape}
        positionAbsoluteY={positionAbsoluteY}
        onEditLabel={handleStartEdit}
      />
      <ConnectArrows isVisible={Boolean(selected) && !isCanvasLocked} nodeId={id} />
      <ShapeGraphic shape={shape} mermaidShape={data.mermaidShape} />
      {editingLabel !== null && !isCanvasLocked ? (
        <textarea
          className="flow-node__label-input flow-node__label-input--plain nodrag"
          aria-label="Node text"
          value={editingLabel}
          onChange={e => setEditingLabel(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
          autoFocus
        />
      ) : (
        <div
          className={`flow-node__label flow-node__label--horizontal-${textHorizontalAlign} flow-node__label--vertical-${textVerticalAlign}`}
          onDoubleClick={handleDoubleClick}
        >
          {data.imageUrl && <img className="flow-node__media" src={data.imageUrl} alt="" />}
          {data.icon && <span className="flow-node__icon" aria-hidden="true">{String(data.icon)}</span>}
          {label}
        </div>
      )}
      {ATTACHMENT_SIDES.map(side => (
        <Handle
          key={`floating-${side}`}
          type="source"
          position={side}
          id={`${id}-${side}`}
          className="flow-node__floating-handle"
          aria-hidden="true"
          isConnectable={!isCanvasLocked}
        />
      ))}
      {showSideAttachmentTargets && ATTACHMENT_SIDES.map(side => (
        <Handle
          key={side}
          type="target"
          position={side}
          id={`${id}-${side}`}
          aria-label={`Assign edge endpoint to ${side} side`}
          className="flow-node__handle nodrag"
          role="button"
          tabIndex={0}
          onPointerDown={preventNodeDrag}
        />
      ))}
    </div>
  )
}
