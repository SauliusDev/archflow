import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/state/createStore'
import { useCanvasViewport } from './useCanvasViewport'

describe('useCanvasViewport', () => {
  const initialState = useStore.getState()
  const controls = { setViewport: vi.fn(), fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn() }

  beforeEach(() => { useStore.setState(initialState, true); vi.clearAllMocks() })

  it('restores a saved viewport and consumes a fit request', () => {
    useStore.setState({ viewportToRestore: { x: 2, y: 3, zoom: 1.2 }, fitViewRequested: true })
    renderHook(() => useCanvasViewport(controls))
    expect(controls.setViewport).toHaveBeenCalledWith({ x: 2, y: 3, zoom: 1.2 })
    expect(controls.fitView).toHaveBeenCalledWith({ padding: 0.1, duration: 0, maxZoom: 1 })
    expect(useStore.getState().viewportToRestore).toBeNull()
    expect(useStore.getState().fitViewRequested).toBe(false)
  })

  it('executes and consumes pending zoom actions', () => {
    useStore.setState({ pendingZoomAction: 'in' })

    renderHook(() => useCanvasViewport(controls))

    expect(controls.zoomIn).toHaveBeenCalledWith({ duration: 200 })
    expect(useStore.getState().pendingZoomAction).toBeNull()
  })

  it('owns React Flow viewport changes instead of leaving Canvas to mutate the store', () => {
    const { result } = renderHook(() => useCanvasViewport(controls))

    result.current.handleViewportChange({ x: 12, y: 24, zoom: 1.5 })

    expect(useStore.getState().viewport).toEqual({ x: 12, y: 24, zoom: 1.5 })
  })
})
