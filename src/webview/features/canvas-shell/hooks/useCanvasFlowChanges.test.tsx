import { act, renderHook } from '@testing-library/react'
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
    useStore.setState({ nodes: [node], moveNodes, applyFlowChanges } as never)
    const dragStartPositionsRef = { current: {} }
    const { result } = renderHook(() => useCanvasFlowChanges([node], [], dragStartPositionsRef))

    result.current.handleNodesChange([{ id: 'a', type: 'position', position: { x: 24, y: 0 }, dragging: false }])

    expect(moveNodes).toHaveBeenCalledWith([{ id: 'a', position: { x: 24, y: 0 } }], { a: { x: 0, y: 0 } })
    expect(applyFlowChanges).not.toHaveBeenCalled()
  })

  it('preserves every rapid Shift-selection change until the canvas rerenders', () => {
    const nodes = [
      { id: 'a', type: 'flowNode' as const, position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rectangle' } },
      { id: 'b', type: 'flowNode' as const, position: { x: 120, y: 0 }, data: { label: 'B', shape: 'rectangle' } },
    ]
    useStore.setState({ nodes })
    const { result } = renderHook(() => useCanvasFlowChanges(nodes, [], { current: {} }))

    act(() => {
      result.current.handleNodesChange([{ id: 'a', type: 'select', selected: true }])
      result.current.handleNodesChange([{ id: 'b', type: 'select', selected: true }])
    })

    expect(useStore.getState().nodes.filter(node => node.selected).map(node => node.id)).toEqual(['a', 'b'])
  })
})
