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
})
