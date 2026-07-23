import { renderHook } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/state/createStore'
import type { FlowNodeData } from '@/features/flowchart'
import { useCanvasFlowChanges } from './useCanvasFlowChanges'

describe('useCanvasFlowChanges', () => {
  const initialState = useStore.getState()

  beforeEach(() => useStore.setState(initialState, true))

  it('commits keyboard position changes without feeding them back through React Flow', () => {
    const node: Node<FlowNodeData> = { id: 'a', type: 'flowNode', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rectangle' } }
    const moveNodes = vi.fn()
    const applyFlowChanges = vi.fn()
    useStore.setState({ moveNodes, applyFlowChanges } as never)
    const dragStartPositionsRef = { current: {} }
    const { result } = renderHook(() => useCanvasFlowChanges([node], [], dragStartPositionsRef))

    result.current.handleNodesChange([{ id: 'a', type: 'position', position: { x: 24, y: 0 }, dragging: false }])

    expect(moveNodes).toHaveBeenCalledWith([{ id: 'a', position: { x: 24, y: 0 } }], { a: { x: 0, y: 0 } })
    expect(applyFlowChanges).not.toHaveBeenCalled()
  })
})
