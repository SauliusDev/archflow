import React, { useState, useCallback, useRef } from 'react'
import { NodeResizer, Handle, Position } from '@xyflow/react'
import type { NodeProps, Node, ResizeParams } from '@xyflow/react'
import type { FlowNodeData } from '@/features/flowchart'
import { useStore } from '@/state/createStore'

export default function SubgraphNode({
  id,
  data,
  selected,
}: NodeProps<Node<FlowNodeData>>): React.JSX.Element {
  const { label } = data
  const resizeNode = useStore(s => s.resizeNode)
  const updateNodeLabel = useStore(s => s.updateNodeLabel)
  const isCanvasLocked = useStore(s => s.isLocked)
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const isEscapingRef = useRef(false)

  const handleResizeEnd = useCallback((_: unknown, params: ResizeParams) => {
    resizeNode(id, { width: params.width, height: params.height }, { x: params.x, y: params.y })
  }, [id, resizeNode])

  function handleDoubleClick(e: React.MouseEvent): void {
    e.stopPropagation()
    if (isCanvasLocked) return
    isEscapingRef.current = false
    setEditingLabel(label)
  }

  function commitEdit(): void {
    if (editingLabel !== null && !isEscapingRef.current) {
      updateNodeLabel(id, editingLabel)
    }
    isEscapingRef.current = false
    setEditingLabel(null)
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    e.stopPropagation()
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') {
      isEscapingRef.current = true
      setEditingLabel(null)
    }
  }

  return (
    <div className={['subgraph-node', data.isLane ? 'subgraph-node--lane' : '', selected ? 'subgraph-node--selected' : ''].filter(Boolean).join(' ')}>
      <NodeResizer isVisible={selected && !isCanvasLocked} minWidth={120} minHeight={80} onResizeEnd={handleResizeEnd} />
      <div className="subgraph-node__header nodrag">
        {data.isLane && <span className="subgraph-node__lane-badge">Lane</span>}
        {editingLabel !== null && !isCanvasLocked ? (
          <input
            className="subgraph-node__label-input"
            value={editingLabel}
            onChange={e => setEditingLabel(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={commitEdit}
            autoFocus
          />
        ) : (
          <span className="subgraph-node__label" onDoubleClick={handleDoubleClick}>{label}</span>
        )}
      </div>
      <div className="subgraph-node__body" />
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map(side => (
        <Handle
          key={side}
          type="source"
          position={side}
          id={`${id}-${side}`}
          className="flow-node__floating-handle"
          aria-hidden="true"
          isConnectable={!isCanvasLocked}
        />
      ))}
    </div>
  )
}
