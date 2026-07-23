import { act, renderHook } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/state/createStore'
import type { FlowNodeData } from '@/features/flowchart'
import { useCanvasDrag } from './useCanvasDrag'

describe('useCanvasDrag', () => {
  const initialState = useStore.getState()
  beforeEach(() => useStore.setState(initialState, true))

  it('marks canvas sync while a drag starts and clears it when it stops', () => {
    const node: Node<FlowNodeData> = { id: 'a', type: 'flowNode', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rectangle' } }
    useStore.setState({ nodes: [node] })
    const { result } = renderHook(() => useCanvasDrag())
    act(() => result.current.handleNodeDragStart({} as React.MouseEvent, node, [node]))
    expect(useStore.getState().syncDirection).toBe('canvas')
    act(() => result.current.handleNodeDragStop({} as React.MouseEvent, node, [node]))
    expect(useStore.getState().syncDirection).toBeNull()
  })

  it('persists the primary dragged group when React Flow provides no selection list', () => {
    const moveNodes = vi.fn()
    const group: Node<FlowNodeData> = {
      id: 'group', type: 'subgraphNode', position: { x: 100, y: 160 }, width: 300, height: 200,
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    }
    useStore.setState({ nodes: [group], moveNodes } as never)
    const { result } = renderHook(() => useCanvasDrag())

    act(() => result.current.handleNodeDragStart({} as React.MouseEvent, group, [group]))
    act(() => result.current.handleNodeDragStop({} as React.MouseEvent, group, []))

    expect(moveNodes).toHaveBeenCalledWith([{ id: 'group', position: { x: 100, y: 160 } }], { group: { x: 100, y: 160 } })
  })

  it('assigns a top-level node dropped in a subgraph body using relative coordinates', () => {
    const assignToSubgraph = vi.fn()
    const subgraph: Node<FlowNodeData> = {
      id: 'group', type: 'subgraphNode', position: { x: 100, y: 100 }, width: 300, height: 200,
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    }
    const node: Node<FlowNodeData> = {
      id: 'child', type: 'flowNode', position: { x: 160, y: 150 }, measured: { width: 80, height: 40 },
      data: { label: 'Child', shape: 'rectangle' },
    }
    useStore.setState({ nodes: [subgraph, node], assignToSubgraph } as never)
    const { result } = renderHook(() => useCanvasDrag())

    act(() => result.current.handleNodeDragStart({} as React.MouseEvent, node, [node]))
    act(() => result.current.handleNodeDrag({} as React.MouseEvent, node))
    expect(result.current.dropTargetId).toBe('group')
    act(() => result.current.handleNodeDragStop({} as React.MouseEvent, node, [node]))

    expect(assignToSubgraph).toHaveBeenCalledWith('child', 'group', { x: 60, y: 50 })
  })

  it('removes a child dragged outside its subgraph using absolute coordinates', () => {
    const removeFromSubgraph = vi.fn()
    const subgraph: Node<FlowNodeData> = {
      id: 'group', type: 'subgraphNode', position: { x: 100, y: 100 }, width: 300, height: 200,
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    }
    const child: Node<FlowNodeData> = {
      id: 'child', type: 'flowNode', parentId: 'group', position: { x: 320, y: 40 }, measured: { width: 80, height: 40 },
      data: { label: 'Child', shape: 'rectangle' },
    }
    useStore.setState({ nodes: [subgraph, child], removeFromSubgraph } as never)
    const { result } = renderHook(() => useCanvasDrag())

    act(() => result.current.handleNodeDragStop({} as React.MouseEvent, child, [child]))

    expect(removeFromSubgraph).toHaveBeenCalledWith('child', { x: 420, y: 140 })
  })

  it('keeps a child released over the group header below the title', () => {
    const moveNodes = vi.fn()
    const subgraph: Node<FlowNodeData> = {
      id: 'group', type: 'subgraphNode', position: { x: 100, y: 100 }, width: 300, height: 200,
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    }
    const child: Node<FlowNodeData> = {
      id: 'child', type: 'flowNode', parentId: 'group', position: { x: 120, y: 8 }, measured: { width: 80, height: 40 },
      data: { label: 'Child', shape: 'rectangle' },
    }
    useStore.setState({ nodes: [subgraph, child], moveNodes } as never)
    const { result } = renderHook(() => useCanvasDrag())

    act(() => result.current.handleNodeDragStop({} as React.MouseEvent, child, [child]))

    expect(moveNodes).toHaveBeenCalledWith([{ id: 'child', position: { x: 120, y: 32 } }], {})
  })

  it('moves a top-level node back outside a group when it overlaps the header', () => {
    const moveNodes = vi.fn()
    const subgraph: Node<FlowNodeData> = {
      id: 'group', type: 'subgraphNode', position: { x: 100, y: 100 }, width: 300, height: 200,
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    }
    const node: Node<FlowNodeData> = {
      id: 'node', type: 'flowNode', position: { x: 160, y: 110 }, measured: { width: 80, height: 40 },
      data: { label: 'Node', shape: 'rectangle' },
    }
    useStore.setState({ nodes: [subgraph, node], moveNodes } as never)
    const { result } = renderHook(() => useCanvasDrag())

    act(() => result.current.handleNodeDragStop({} as React.MouseEvent, node, [node]))

    expect(moveNodes).toHaveBeenCalledWith([{ id: 'node', position: { x: 160, y: 60 } }], {})
  })
})
