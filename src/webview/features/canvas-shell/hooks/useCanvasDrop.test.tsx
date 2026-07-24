import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/state/createStore'
import { useCanvasDrop } from './useCanvasDrop'

describe('useCanvasDrop', () => {
  const initialState = useStore.getState()
  beforeEach(() => useStore.setState(initialState, true))

  it('ignores invalid palette payloads', () => {
    const { result } = renderHook(() => useCanvasDrop(position => position))
    const preventDefault = () => undefined
    act(() => result.current.handleCanvasDrop({
      preventDefault,
      clientX: 10,
      clientY: 10,
      dataTransfer: { getData: () => 'unsupported-shape' },
    } as unknown as React.DragEvent))
    expect(useStore.getState().nodes).toEqual([])
  })

  it('does not consume pending viewport actions owned by useCanvasViewport', () => {
    useStore.setState({ pendingZoomAction: 'in' })

    renderHook(() => useCanvasDrop(position => position))

    expect(useStore.getState().pendingZoomAction).toBe('in')
  })

  it('keeps the drop position free when grid snapping is disabled', () => {
    const { result } = renderHook(() => useCanvasDrop(position => position, false))

    act(() => result.current.handleCanvasDrop({
      preventDefault: () => undefined,
      clientX: 31,
      clientY: 49,
      dataTransfer: { getData: () => 'rectangle' },
    } as unknown as React.DragEvent))

    expect(useStore.getState().nodes[0]?.position).toEqual({ x: 31, y: 49 })
  })

  it('offers and inserts a palette node when it is dropped on one eligible edge', () => {
    useStore.setState({
      nodes: [
        { id: 'A', type: 'flowNode', position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: 'A', shape: 'rectangle' } },
        { id: 'B', type: 'flowNode', position: { x: 300, y: 0 }, width: 100, height: 60, data: { label: 'B', shape: 'rectangle' } },
      ],
      edges: [{ id: 'e1', source: 'A', target: 'B', data: { style: 'arrow' } }],
      documentSession: null, isLocked: false, history: { past: [], future: [] },
    })
    const { result } = renderHook(() => useCanvasDrop(position => position, false))
    const event = {
      preventDefault: () => undefined, clientX: 200, clientY: 30,
      dataTransfer: { getData: () => 'rectangle', dropEffect: '' },
    } as unknown as React.DragEvent

    act(() => result.current.handleCanvasDragOver(event))
    expect(result.current.edgeInsertionId).toBe('e1')
    act(() => result.current.handleCanvasDrop(event))

    expect(useStore.getState().nodes).toHaveLength(3)
    expect(useStore.getState().edges).toEqual([
      expect.objectContaining({ id: 'e1', source: 'A' }),
      expect.objectContaining({ source: useStore.getState().edges[0]?.target, target: 'B' }),
    ])
    expect(useStore.getState().history.past).toHaveLength(1)
  })

  it('blocks both drop and pending palette additions while locked', () => {
    useStore.setState({ isLocked: true, nodes: [], edges: [], history: { past: [], future: [] } })
    useStore.getState().requestAddNode('circle')
    const { result } = renderHook(() => useCanvasDrop(position => position))

    act(() => result.current.handleCanvasDrop({
      preventDefault: () => undefined,
      clientX: 10,
      clientY: 10,
      dataTransfer: { getData: () => 'diamond' },
    } as unknown as React.DragEvent))

    expect(useStore.getState().nodes).toEqual([])
    expect(useStore.getState().history).toEqual({ past: [], future: [] })
  })

  it('clears the insertion hint safely when drag data is unavailable or locked', () => {
    const { result } = renderHook(() => useCanvasDrop(position => position))
    act(() => result.current.handleCanvasDragOver({ preventDefault: () => undefined, dataTransfer: {} } as unknown as React.DragEvent))
    expect(result.current.edgeInsertionId).toBeNull()
    act(() => useStore.setState({ isLocked: true }))
    act(() => result.current.handleCanvasDragOver({ preventDefault: () => undefined, dataTransfer: { getData: () => 'rectangle', dropEffect: 'none' } } as unknown as React.DragEvent))
    expect(result.current.edgeInsertionId).toBeNull()
  })
})
