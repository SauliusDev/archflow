import { act, renderHook } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/state/createStore'
import type { FlowNodeData } from '@/features/flowchart'
import { useCanvasContextMenu } from './useCanvasContextMenu'

describe('useCanvasContextMenu', () => {
  const initialState = useStore.getState()

  beforeEach(() => useStore.setState(initialState, true))

  it('moves a node into a subgraph from the context menu using relative coordinates', () => {
    const assignToSubgraph = vi.fn()
    const group: Node<FlowNodeData> = { id: 'group', type: 'subgraphNode', position: { x: 100, y: 100 }, data: { label: 'Group', shape: 'subgraph', isSubgraph: true } }
    const child: Node<FlowNodeData> = { id: 'child', type: 'flowNode', position: { x: 160, y: 150 }, data: { label: 'Child', shape: 'rectangle' } }
    useStore.setState({ nodes: [group, child], assignToSubgraph } as never)
    const { result } = renderHook(() => useCanvasContextMenu())

    act(() => result.current.handleNodeContextMenu({ preventDefault: vi.fn(), clientX: 12, clientY: 24 } as unknown as React.MouseEvent, child))
    act(() => result.current.moveToSubgraph('group'))

    expect(assignToSubgraph).toHaveBeenCalledWith('child', 'group', { x: 60, y: 50 })
    expect(result.current.contextMenu).toBeNull()
  })
})
